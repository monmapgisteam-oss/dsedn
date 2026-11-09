import {bbox,bboxClip,booleanIntersects} from '@turf/turf';
import type {Feature,LineString,MultiLineString} from 'geojson';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import type {Bounds,Collection,LayerData} from '../types';
import type {SiteRequest,SiteRun,Candidate,ScopeCoverage} from '../siting';
import {searchTiles,canReachCentre,canReachInfrastructure,expandForFootprint,scopeName} from '../search-scope';
import {studyMask} from '../study-area';
import {loadWholeStudy,loadRivers} from './study-layers';
import {loadArcGISLayer} from './arcgis';
import {GRID_LAYER_IDS} from '../renewable-catalog';
import {loadLogistics} from './providers';
import {loadTransport} from './transport';
import {loadContext,loadDEM,loadERA5} from './site-data';
import {findSites,siteDesign} from './site-engine';

const fc=(features:Collection['features']=[]):Collection=>({type:'FeatureCollection',features});
function localLayer(layer:LayerData,bounds:Bounds):LayerData{
 const dy=13/111.195,dx=dy/Math.cos(bounds[3]*Math.PI/180),b:Bounds=[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy];
 return {...layer,data:fc(layer.data.features.filter(f=>{const a=bbox(f);return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}).map(f=>f.geometry.type==='LineString'||f.geometry.type==='MultiLineString'?bboxClip(f as Feature<LineString|MultiLineString>,b):f))};
}
const merge=(a:LayerData,b:LayerData,name:string):LayerData=>({data:fc([...a.data.features,...b.data.features]),provenance:{...a.provenance,name,detail:a.provenance.detail+' | '+b.provenance.source+' | '+b.provenance.detail}});
export function retainBest(candidates:Candidate[],limit=12){
 const best:Candidate[]=[];
 for(const c of candidates.sort((a,b)=>b.properties.score!-a.properties.score!)){
  if(!best.some(other=>booleanIntersects(other,c)))best.push(c);
  if(best.length===limit)break;
 }
 return best;
}
export async function searchWholeArea(input:SiteRequest,progress:(s:string)=>void,signal?:AbortSignal):Promise<SiteRun>{
 progress(`${scopeName(input.regionLayer)} · давхаргын бүх хилийг уншиж байна…`);
 const scope=await loadWholeStudy(input.regionLayer),regions=scope.regions;
 const request={...input,regionId:0,bounds:scope.bounds}; // Legacy rectangles and individual IDs cannot restrict this route.
 const study:LayerData={...regions,data:fc([{...scope.mask,properties:{layer:input.regionLayer,regionId:0,name:scopeName(input.regionLayer)}}])};
 const tiles=searchTiles(scope.mask),stepM=Math.max(80,Math.sqrt(scope.areaKm2*1e6/60000));
 const [transport,allLines,allCables]=await Promise.all([loadTransport(scope.bounds),...GRID_LAYER_IDS.map(id=>loadArcGISLayer(id,scope.bounds))]);
 const allGrid=merge(allLines,allCables,'Цахилгаан шугам · 0 + 4');
 const nearCentre=tiles.filter(t=>canReachCentre(t.bounds,transport.centres.data,request.maxSettlementKm));
 const accessRoads=fc(transport.roads.data.features.filter(f=>f.properties?.accessEligible!==false));
 const eligible=nearCentre.filter(t=>canReachInfrastructure(t.bounds,allGrid.data,request.maxGridKm)&&canReachInfrastructure(t.bounds,accessRoads,request.maxRoadKm));
 const coverage:ScopeCoverage={mode:'whole-layer',regionLayer:request.regionLayer,sourceFeatures:regions.data.features.length,areaKm2:scope.areaKm2,tiles:tiles.length,assessed:0,excludedByCentre:tiles.length-nearCentre.length,excludedByInfrastructure:nearCentre.length-eligible.length,failed:[],complete:false};
 progress(`${scope.areaKm2.toFixed(1)} км² · ${tiles.length} хэсэг. Төвөөс хол ${coverage.excludedByCentre}, шугам / замаас хол ${coverage.excludedByInfrastructure} хэсгийг хасав; ${eligible.length} хэсгийг нарийвчилна.`);
 let result:SiteRun|undefined,consecutiveFailures=0;
 const layers=new Map<string,Map<string,Collection['features'][number]>>();
 const sources=new Map<string,SiteRun['sources'][number]>(),climates:NonNullable<SiteRun['climates']>={};
 const climateCache=new Map<string,Awaited<ReturnType<typeof loadERA5>>>();
 for(const [index,tile] of eligible.entries()){
  signal?.throwIfAborted();await yieldLoop();
  const report=(s:string)=>progress(`${index+1}/${eligible.length} · ${tile.id} · ${s}`);
  try{
   report('ERA5, газрын гадарга ба дэд бүтцийн шалгалт');
   // Reuse regional climate samples on a declared 0.25° lattice; actual returned coordinates are retained.
   const lat=Math.round((tile.bounds[1]+tile.bounds[3])/2*4)/4,lon=Math.round((tile.bounds[0]+tile.bounds[2])/2*4)/4,key=`${lat}:${lon}`;
   let climate=climateCache.get(key);
   if(!climate){climate=await loadERA5([lon-.001,lat-.001,lon+.001,lat+.001],report,request.era5Start,request.era5End);if(climateCache.size>=8)climateCache.delete(climateCache.keys().next().value!);climateCache.set(key,climate);}
   const {design}=siteDesign({...request,bounds:tile.bounds},climate);
   const bounds=expandForFootprint(tile.bounds,design.width,design.height,design.direction);
   const localStudy:LayerData={...study,data:fc([studyMask(study.data,bounds)])};
   const noParcels:LayerData={data:fc(),provenance:{name:'/6 · кадастрын хамрах хүрээ баталгаажаагүй',source:regions.provenance.source,retrievedAt:new Date().toISOString(),detail:'Cadastral query skipped in the designated no-cadastre mode. Land rights unknown.'}};
   const [river,ownership,possession,roads,context,dem]=await Promise.all([
    loadRivers(bounds,request.riverSetbackM),
    request.regionLayer===5?loadArcGISLayer(7,bounds):noParcels,request.regionLayer===5?loadArcGISLayer(8,bounds):noParcels,
    loadLogistics(bounds),loadContext(bounds),loadDEM(bounds,report,false),
   ]);
   signal?.throwIfAborted();
   const localTransport={centres:localLayer(transport.centres,bounds),roads:localLayer(transport.roads,bounds),soums:localLayer(transport.soums,bounds),projects:localLayer(transport.projects,bounds)};
   const part=findSites({...request,bounds},{study:localStudy,rivers:river.rivers,riverProtection:river.protection,grid:localLayer(allGrid,bounds),parcels:merge(ownership,possession,'Кадастр · өмчлөл + эзэмшил'),roads,context,transport:localTransport,dem,climate},report,{bounds:tile.bounds,stepM});
   climates[tile.id]=part.climate;
   for(const c of part.candidates){const id=`${tile.id}-${c.properties.id}`;for(const f of part.layers.parcelOverlap?.features??[])if(f.properties?.siteId===c.properties.id)f.properties.siteId=id;c.properties.id=id;c.layout.assets.forEach(a=>a.cellId=id);c.climateTile=tile.id;}
   part.screening?.features.forEach(f=>{if(f.properties)f.properties={...f.properties,id:`${tile.id}-${f.properties.id}`,tile:tile.id};});
   for(const [name,data] of Object.entries(part.layers)){
    if(!data||name==='study'||['centres','nationalRoads','soums','roadProjects'].includes(name))continue;
    let bucket=layers.get(name);if(!bucket){bucket=new Map();layers.set(name,bucket);}
    for(const f of data.features){const k=JSON.stringify(f);if(!bucket.has(k))bucket.set(k,f);}
   }
   for(const p of part.sources)sources.set(JSON.stringify(p),p);
   if(!result)result={...part,request,candidates:[],examined:0,rejected:{},screening:fc(),sources:[]};
   result.candidates=retainBest([...result.candidates,...part.candidates]);
   result.screening!.features.push(...part.screening!.features);
   result.examined+=part.examined;result.searchStepM=Math.max(result.searchStepM,part.searchStepM);
   for(const [reason,n] of Object.entries(part.rejected))result.rejected[reason]=(result.rejected[reason]??0)+n;
   coverage.assessed++;consecutiveFailures=0;
  }catch(e){
   signal?.throwIfAborted();const message=e instanceof Error?e.message:'Өгөгдөл шалгагдаагүй.';
   coverage.failed.push({tile:tile.id,message});report(`Шалгагдаагүй: ${message}`);
   // Do not hammer unavailable services, and never label the remaining area as assessed.
   if(++consecutiveFailures>=3){coverage.failed.push(...eligible.slice(index+1).map(t=>({tile:t.id,message:'Дараалсан 3 алдааны дараа тооцоолоогүй. Дахин хайна уу.'})));break;}
  }
 }
 if(!result)throw new Error(coverage.failed.length?`Тооцоолол дуусаагүй. ${coverage.failed[0].tile}: ${coverage.failed[0].message}`:'Сонгосон бүх хил дотор төвд ойр байх нөхцөлийг хангах байршилгүй.');
 coverage.complete=coverage.failed.length===0&&coverage.assessed+coverage.excludedByCentre+coverage.excludedByInfrastructure===coverage.tiles;
 result.layers={...result.layers,...Object.fromEntries([...layers].map(([key,records])=>[key,fc([...records.values()])])),study:study.data,centres:transport.centres.data,nationalRoads:transport.roads.data,soums:transport.soums.data,roadProjects:transport.projects.data};
 const selected=new Set(result.candidates.map(c=>c.properties.id));
 result.layers.parcelOverlap=fc(result.layers.parcelOverlap?.features.filter(f=>selected.has(f.properties?.siteId))??[]);
 result.coverage=coverage;result.climates=climates;result.sources=[regions.provenance,...sources.values()];
 if(result.candidates[0]?.climateTile)result.climate=climates[result.candidates[0].climateTile];
 result.warnings=[
  `${scopeName(request.regionLayer)}: ${coverage.sourceFeatures} эх полигон, ${scope.areaKm2.toFixed(1)} км². Хэсэг ${coverage.assessed}/${coverage.tiles} нарийвчилсан; ${coverage.excludedByCentre} хэсэг бүхэлдээ төвийн дээд зайн гадна; ${coverage.excludedByInfrastructure} хэсэг зурагласан шугам / замын дээд зайн гадна. ${coverage.failed.length} хэсэг шалгагдаагүй.`,
  `Давхаргын бүх хилд дээжлэн хайв; суурь алхам ${stepM.toFixed(0)} м, тоноглолын хэмжээнээс шалтгаалан хэсэгт томорч болно (ихдээ ${result.searchStepM.toFixed(0)} м). Хэсэг бүрээс 12 хүртэл хувилбарыг нарийвчилж, нийлбэрээс давхцаагүй 12 хүртэл талбай санал болгоно. Бүх боломжит байрлалын бүрэн оновчлол биш.`,
  'ERA5-ийг 0.25° хүсэлтийн тороор хэсэг тус бүрт авсан; буцсан бодит координатыг хадгалсан. Нэг хэсгийн дотор бүсийн нөөц ижил, 30 м нөөцийн зураг биш.',
  ...result.warnings.filter(w=>!w.startsWith('Хайлтын төвийн алхам')),
 ];
 return result;
}
