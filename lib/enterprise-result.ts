import {rewind} from '@turf/turf';
import type {Feature,Geometry} from 'geojson';
import type {Collection} from './types';
import type {SiteRun} from './siting';
// 6 decimal places of a degree is ~0.1 m: ample for the map item and it keeps Portal requests small.
const deg=(v:number)=>Math.round(v*1e6)/1e6;
// Per-point bookkeeping repeated on every screening point; the full run (attached separately) keeps it.
const omit=new Set(['stage','stepM']);
const colors={high:[44,128,89,210],moderate:[181,184,94,210],low:[228,177,102,210],excluded:[173,124,123,130]};
export function enterpriseResult(run:SiteRun){
 const candidates:Collection={type:'FeatureCollection',features:run.candidates.map(c=>({type:'Feature',geometry:c.geometry,properties:{site:c.properties.id,score:c.properties.score,status:c.properties.status,area_ha:c.properties.areaKm2*100,capacity_mw:c.layout.capacityMw,net_gwh:c.metrics.netGwh,grid_km:c.properties.gridKm,road_km:c.properties.roadKm,centre_km:c.metrics.settlementKm,equipment:c.metrics.equipmentCount,other_land_m2:c.metrics.parcelOverlap?.status==='checked'?c.metrics.parcelOverlap.otherM2:null,other_land_pct:c.metrics.parcelOverlap?.status==='checked'?c.metrics.parcelOverlap.otherPct:null}}))};
 const equipment:Collection={type:'FeatureCollection',features:run.candidates.flatMap(c=>c.layout.assets.map(a=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[a.longitude,a.latitude]},properties:{site:c.properties.id,asset_id:a.id,technology:a.technology,capacity_mw:a.capacityMw,module_count:a.moduleCount??null,hub_m:run.request.technology==='wind'?run.request.hubM:null,rotor_m:run.request.technology==='wind'?run.request.rotorM:null}})))};
 const layer=(id:number,name:string,data:Collection,point:boolean,scored=false)=>{
  const keys=[...new Set(data.features.flatMap(f=>Object.keys(f.properties??{})))].filter(k=>k!=='OBJECTID'&&!omit.has(k));
  const fields=[{name:'OBJECTID',alias:'OBJECTID',type:'esriFieldTypeOID'},...keys.map(name=>({name,alias:name,type:data.features.some(f=>typeof f.properties?.[name]==='number')?'esriFieldTypeDouble':'esriFieldTypeString',length:512}))];
  const symbol=(color:number[])=>point?{type:'esriSMS',style:'esriSMSCircle',color,size:4,outline:{color:[255,255,255,80],width:.2}}:{type:'esriSFS',style:'esriSFSSolid',color,outline:{type:'esriSLS',style:'esriSLSSolid',color:[30,80,60,230],width:1}};
  const renderer=id===4?{type:'uniqueValue',field1:'category',uniqueValueInfos:[{value:'other',label:'Бусдын / тодорхойгүй эрх',symbol:symbol([220,90,82,180])},{value:'dsedn',label:'ДСЦТС-ийн газар',symbol:symbol([38,155,104,180])}]}:scored?{type:'uniqueValue',field1:'status',uniqueValueInfos:Object.entries(colors).map(([value,color])=>({value,label:value,symbol:symbol(color)})),defaultSymbol:symbol([130,150,155,170])}:{type:'simple',symbol:symbol([41,148,181,180])};
  return {layerDefinition:{id,name,type:'Feature Layer',geometryType:point?'esriGeometryPoint':'esriGeometryPolygon',objectIdField:'OBJECTID',fields,spatialReference:{wkid:4326},drawingInfo:{renderer}},featureSet:{geometryType:point?'esriGeometryPoint':'esriGeometryPolygon',spatialReference:{wkid:4326},features:data.features.map((f,i)=>{
   const g=(rewind(f,{reverse:true}) as Feature<Geometry>).geometry;// The featureSet already declares WGS84, so geometries do not repeat it.
   const geometry=g.type==='Point'?{x:deg(g.coordinates[0]),y:deg(g.coordinates[1])}:{rings:(g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[]).map(ring=>ring.map(p=>[deg(p[0]),deg(p[1])]))};
   return {geometry,attributes:{OBJECTID:i+1,...Object.fromEntries(Object.entries(f.properties??{}).filter(([k])=>!omit.has(k)).map(([k,v])=>[k,typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1e4)/1e4:v]))} as Record<string,unknown>};
  })},popupInfo:{title:name,fieldInfos:fields.map(f=>({fieldName:f.name,label:f.alias,visible:true}))}};
 };
 return {layers:[layer(0,'Тохиромжийн үнэлгээ · хайлтын төвүүд',run.screening??{type:'FeatureCollection',features:[]},true,true),layer(1,'Боломжит талбайнууд',candidates,false,true),layer(2,'Тоноглолын байршил',equipment,true),layer(3,'Тооцооллын хил',run.layers.study??{type:'FeatureCollection',features:[]},false),...(run.layers.parcelOverlap?[layer(4,'Газрын давхцал',run.layers.parcelOverlap,false)]:[])],dsednAnalysis:{schemaVersion:1,runId:run.id,createdAt:run.createdAt,request:run.request,climate:run.climate,climates:run.climates,coverage:run.coverage,sources:run.sources,warnings:run.warnings,examined:run.examined,rejected:run.rejected,searchStepM:run.searchStepM,candidateDetails:run.candidates.map(c=>({id:c.properties.id,climateTile:c.climateTile,metrics:c.metrics,assumptions:c.layout.assumptions}))}};
}
