import {arcgis} from './arcgis';
import {bboxClip} from '@turf/turf';
import type {Feature,LineString,MultiLineString} from 'geojson';
import {cached} from './providers';
import {studyMask,riverProtection} from '../study-area';
import type {Bounds,Collection,LayerData} from '../types';
import {wholeStudy} from '../search-scope';

export async function loadWholeStudy(layer:5|6){return cached(`whole-study:${layer}`,async()=>{const regions=await loadRegions(layer);return {...wholeStudy(regions.data),regions};});}

export const renewableService='https://gis.selbecity.mn/map/rest/services/Hosted/Renewable/FeatureServer';
export const riverService='https://gis.selbecity.mn/map/rest/services/Hosted/'+encodeURIComponent('Гол_')+'/FeatureServer';
export async function loadRegions(layer:5|6):Promise<LayerData>{
 return cached(`study-regions:${layer}`,async()=>{
  const ids=await arcgis(`/${layer}/query`,{where:'1=1',returnIdsOnly:'true'});
  if(!Array.isArray(ids.objectIds)||!ids.objectIds.length||ids.objectIds.length>1000)throw new Error('Хилийн ID жагсаалт бүрэн ирсэнгүй.');
  const features:Collection['features']=[];
  for(let i=0;i<ids.objectIds.length;i+=100){const batch=ids.objectIds.slice(i,i+100);const page=await arcgis(`/${layer}/query`,{objectIds:batch.join(','),outFields:'objectid_1,name,code',outSR:'4326',returnGeometry:'true',returnZ:'false',returnM:'false',f:'geojson'});
   if(page.type!=='FeatureCollection'||page.features?.length!==batch.length||page.exceededTransferLimit||new Set(page.features.map(f=>f.properties?.objectid_1)).size!==batch.length||page.features.some(f=>!batch.includes(f.properties?.objectid_1)||!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw new Error('Хилийн геометр / ID бүрэн ирсэнгүй.');features.push(...page.features);
  }
  return {data:{type:'FeatureCollection',features},provenance:{name:`Хайлтын хил · Renewable /${layer}`,source:`${renewableService}/${layer}`,retrievedAt:new Date().toISOString(),detail:`Complete polygon layer, ${features.length} features. Parcel coverage mode follows the project owner's layer selection; administrative geometry alone does not prove cadastral coverage.`}};
 });
}
export async function loadStudy(layer:5|6,id:number,bounds:Bounds):Promise<LayerData>{
 const all=await loadRegions(layer),features=all.data.features.filter(f=>id===0||f.properties?.objectid_1===id);
 const mask=studyMask({type:'FeatureCollection',features},bounds);mask.properties={layer,regionId:id,name:features.length===1?features[0].properties?.name:`Renewable /${layer}`};
 return {...all,data:{type:'FeatureCollection',features:[mask]}};
}
async function riverQuery(path:string,values:Record<string,string>={}){
 const token=process.env.ARCGIS_RIVER_TOKEN||process.env.ARCGIS_API_KEY;
 const response=await fetch(riverService+path,{method:'POST',body:new URLSearchParams({f:'json',...values,...(token?{token}:{})}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Голын сервер HTTP ${response.status}.`);
 const json=await response.json();
 if(json.error)throw new Error(`Голын үйлчилгээ хандалт өгөөгүй (${json.error.code}). Гол_ үйлчилгээний унших эрхийг нээнэ үү. Голын хамгаалах зайг шалгаагүй үр дүн гаргахгүй.`);
 return json;
}
export async function loadRivers(bounds:Bounds,metres:number):Promise<{rivers:LayerData;protection:Collection}>{
 const rivers=await cached(`rivers:${bounds.join(',')}:${metres}`,async()=>{
  const service=await riverQuery('');if(!Array.isArray(service.layers)||!service.layers.length)throw new Error('Голын үйлчилгээний давхарга олдсонгүй.');
  const lat=(bounds[1]+bounds[3])/2,dy=(metres+100)/111195,dx=dy/Math.cos(lat*Math.PI/180);
  const features:Collection['features']=[];let supported=0;
  for(const layer of service.layers){
   const meta=await riverQuery(`/${layer.id}`);if(!['esriGeometryPolyline','esriGeometryPolygon'].includes(meta.geometryType))continue;supported++;
   const oid=meta.objectIdField||meta.fields?.find((f:{type:string})=>f.type==='esriFieldTypeOID')?.name;if(!oid)throw new Error('Голын ID талбар олдсонгүй.');
   const ids=await riverQuery(`/${layer.id}/query`,{where:'1=1',geometry:[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy].join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true'});
   if(!Array.isArray(ids.objectIds)||ids.objectIds.length>50000)throw new Error('Голын ID жагсаалт бүрэн ирсэнгүй.');
   const allIds=ids.objectIds as number[];
   for(let i=0;i<allIds.length;i+=500){const batch=allIds.slice(i,i+500);const page=await riverQuery(`/${layer.id}/query`,{objectIds:batch.join(','),outFields:oid,returnGeometry:'true',returnZ:'false',returnM:'false',outSR:'4326',f:'geojson'});
    const fs=page.features as Collection['features'];
    if(page.type!=='FeatureCollection'||!fs||fs.length!==batch.length||page.exceededTransferLimit||new Set(fs.map(f=>f.properties?.[oid])).size!==batch.length||fs.some(f=>!batch.includes(f.properties?.[oid])||!['LineString','MultiLineString','Polygon','MultiPolygon'].includes(f.geometry?.type)))throw new Error('Голын өгөгдөл дутуу. Хэсэгчилсэн хариуг ашиглаагүй.');
    // Keep geometry only within the query envelope, which already exceeds the safety buffer.
    // No remote portions of a long river are needed for local intersection or drawing.
    features.push(...fs.flatMap(f=>{
     const clipped=f.geometry.type==='LineString'||f.geometry.type==='MultiLineString'?bboxClip(f as Feature<LineString|MultiLineString>,[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy]):f;
     if('coordinates' in clipped.geometry&&!clipped.geometry.coordinates.length)return [];
     return [{...clipped,properties:{sourceId:f.properties?.[oid],sourceLayer:layer.id,kind:'river'}}];
    }));
   }
  }
  if(!supported)throw new Error('Голын шугам / полигон давхарга олдсонгүй.');
  return {data:{type:'FeatureCollection' as const,features},provenance:{name:'Гол · ArcGIS Enterprise',source:riverService,retrievedAt:new Date().toISOString(),detail:`Complete ID-paged query; ${features.length} features. Buffer ${metres} m from supplied geometry (centreline if line, mapped bank if polygon). Planning assumption, not a surveyed floodplain or legal determination.`}};
 });
 return {rivers,protection:riverProtection(rivers.data,metres)};
}
