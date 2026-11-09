import {coordEach} from '@turf/turf';
import type {Feature,Point} from 'geojson';
import type {Bounds,Collection,LayerData} from '../types';
import {centreDisplayName,normalizeTransportFeature,transportService,type TransportData} from '../transport';
import {cached} from './providers';

const configs:Record<number,{name:string;fields:string;geometry:string[]}>= {
  2:{name:'ЗТХТ · Замын төслийн эхлэл, төгсгөлийн цэг',fields:'OBJECTID,Project_name,Point_torol,Poin_name',geometry:['Point']},
  8:{name:'ЗТХТ · Нийслэл, аймаг, сумын төв',fields:'FID,NAME,CODE',geometry:['Point']},
  9:{name:'ЗТХТ · Улсын чанартай авто зам',fields:'FID,ROADNAME,RoadDName,ROADCODE,PAVEMENT_T,Roadstatus',geometry:['LineString','MultiLineString']},
  12:{name:'ЗТХТ · Сумын мэдээлэл',fields:'FID,code,name,hvn_am_too,density',geometry:['Polygon','MultiPolygon']},
};
type Reply={error?:{code:number};name?:string;fields?:{name:string}[];editingInfo?:{dataLastEditDate?:number};objectIds?:number[];features?:Collection['features'];type?:string;exceededTransferLimit?:boolean};
async function query(layer:number,path:string,values:Record<string,string>={}):Promise<Reply>{
  // Public read-only service. Never forward the private network/cadastre credential.
  const response=await fetch(`${transportService}/${layer}${path}`,{method:'POST',body:new URLSearchParams({f:'json',...values}),signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
  if(!response.ok)throw new Error(`ЗТХТ давхарга ${layer}: HTTP ${response.status}.`);
  const data=await response.json() as Reply;
  if(data.error)throw new Error(`ЗТХТ давхарга ${layer}: ArcGIS ${data.error.code}.`);
  return data;
}
export async function loadTransportLayer(layer:number,bounds:Bounds):Promise<LayerData>{
  const config=configs[layer];if(!config)throw new Error('Unsupported transport layer.');
  const meta=await query(layer,'');
  if(!config.fields.split(',').every(name=>meta.fields?.some(f=>f.name===name)))throw new Error(`ЗТХТ давхарга ${layer}: өгөгдлийн бүтэц өөрчлөгдсөн.`);
  // Covers every permitted 12 km centre/5 km road threshold, including study edges.
  const dy=13/111.195,dx=dy/Math.cos((bounds[1]+bounds[3])/2*Math.PI/180);
  const ids=await query(layer,'/query',{where:'1=1',geometry:[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy].join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true'});
  if(!Array.isArray(ids.objectIds)||ids.objectIds.some(id=>!Number.isSafeInteger(id))||new Set(ids.objectIds).size!==ids.objectIds.length||ids.objectIds.length>30000||ids.exceededTransferLimit)throw new Error(`ЗТХТ давхарга ${layer}: бүрэн ID жагсаалт ирсэнгүй.`);
  const features:Collection['features']=[],oid=layer===2?'OBJECTID':'FID';
  for(let i=0;i<ids.objectIds.length;i+=500){
    const batch=ids.objectIds.slice(i,i+500),page=await query(layer,'/query',{f:'geojson',objectIds:batch.join(','),outFields:config.fields,outSR:'4326',returnGeometry:'true',returnZ:'false',returnM:'false'});
    if(page.type!=='FeatureCollection'||!Array.isArray(page.features)||page.features.length!==batch.length||page.exceededTransferLimit)throw new Error(`ЗТХТ давхарга ${layer}: дутуу хуудас ирсэн. Тооцоонд ашиглаагүй.`);
    const seen=new Set<number>();
    for(const f of page.features){
      const id=Number(f.properties?.[oid]??f.id);
      if(!batch.includes(id)||seen.has(id)||!f.geometry||!config.geometry.includes(f.geometry.type))throw new Error(`ЗТХТ давхарга ${layer}: ID эсвэл геометр зөрүүтэй.`);
      seen.add(id);let count=0;
      coordEach(f,c=>{count++;if(!Number.isFinite(c[0]+c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90)throw new Error(`ЗТХТ давхарга ${layer}: WGS84 координат буруу.`);});
      if(!count)throw new Error(`ЗТХТ давхарга ${layer}: хоосон геометр.`);
      features.push(normalizeTransportFeature(layer,f));
    }
  }
  const edited=meta.editingInfo?.dataLastEditDate;
  return {data:{type:'FeatureCollection',features},provenance:{name:meta.name?`ЗТХТ · ${meta.name}`:config.name,source:`${transportService}/${layer}`,retrievedAt:new Date().toISOString(),detail:`Complete object-ID spatial query: ${features.length} features, 13 km buffer, EPSG:4326. Service data last edited: ${edited?new Date(edited).toISOString():'not supplied'}; this is not a population reference year or a current road inspection. ${layer===8?'Centre points are settlement proximity proxies, not residential boundaries.':layer===9?'Closed/unopened roads are excluded from access scoring; all mapped corridors remain constraints. Road condition/haulage suitability not verified.':layer===12?'Administrative polygons and population context only; never residential exclusion areas or electricity-demand estimates.':'Road-project endpoints are context only, not an operational road or a settlement.'}`}};
}
export async function loadTransport(bounds:Bounds):Promise<TransportData>{
  return cached(`ztht-v1:${bounds.join(',')}`,async()=>{
    const [projects,centres,roads,soums]=await Promise.all([2,8,9,12].map(id=>loadTransportLayer(id,bounds)));
    centres.data.features=centres.data.features.map(f=>{
      const name=centreDisplayName(f as Feature<Point>,soums.data);
      return {...f,properties:{...f.properties,displayName:name.name,nameDerived:name.nameDerived}};
    });
    return {projects,centres,roads,soums};
  });
}
