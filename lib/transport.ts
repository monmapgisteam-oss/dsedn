import {booleanPointInPolygon,distance,point} from '@turf/turf';
import type {Feature,Point,Polygon,MultiPolygon} from 'geojson';
import type {Collection,LayerData} from './types';

export const transportService='https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/ZTHT_ALL_Data/FeatureServer';
export type TransportData={centres:LayerData;roads:LayerData;soums:LayerData;projects:LayerData};
export type CentreMatch={name:string;kind:string;distanceKm:number;id:string;source:string;nameDerived:boolean};
export type SoumInfo={name:string;id:string;population:number|null;density:number|null};
const label=(value:unknown)=>typeof value==='string'?value.trim():'';
export const centreKindName=(kind:string)=>kind==='aimag'?'Аймгийн төв':kind==='UB'?'Нийслэл':'Сумын төв';

export function soumsAt(coordinate:number[],soums:Collection):SoumInfo[]{
  return soums.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry.type)&&booleanPointInPolygon(point(coordinate),f as Feature<Polygon|MultiPolygon>)).map(f=>({
    name:label(f.properties?.name)||'Нэргүй сум',id:String(f.properties?.sourceId??f.id??''),
    population:typeof f.properties?.population==='number'&&f.properties.population>=0?f.properties.population:null,
    density:typeof f.properties?.density==='number'&&f.properties.density>0?f.properties.density:null,
  }));
}
export function centreDisplayName(f:Feature<Point>,soums:Collection):{name:string;nameDerived:boolean}{
  const name=label(f.properties?.name);if(name)return {name,nameDerived:false};
  const admin=soumsAt(f.geometry.coordinates,soums)[0];
  return {name:admin?`${admin.name} · ${centreKindName(String(f.properties?.centreKind))}`:`Нэргүй ${centreKindName(String(f.properties?.centreKind)).toLowerCase()}`,nameDerived:!!admin};
}
export function nearestCentre(coordinate:[number,number],centres:Collection,maxKm:number):CentreMatch|null{
  let found:CentreMatch|null=null;
  for(const f of centres.features){if(f.geometry.type!=='Point')continue;
    const km=distance(coordinate,f.geometry.coordinates);
    if(km<=maxKm&&(!found||km<found.distanceKm))found={name:label(f.properties?.displayName)||label(f.properties?.name)||'Нэргүй төв',kind:String(f.properties?.centreKind??''),distanceKm:km,id:String(f.properties?.sourceId??f.id??''),source:String(f.properties?.source??''),nameDerived:f.properties?.nameDerived===true};
  }return found;
}
export function roadAccessEligible(status:unknown):boolean{
  // Explicitly closed/unopened records are context only. Unknown status is retained
  // as a mapped access proxy, never represented as verified heavy-haul access.
  return !/хаасан|хаагдсан|ороогүй|төлөвлө/i.test(label(status));
}
export function normalizeTransportFeature(layer:number,f:Collection['features'][number]):Collection['features'][number]{
  const p=f.properties??{},source=`${transportService}/${layer}`,sourceId=p[layer===2?'OBJECTID':'FID']??f.id;
  const common={source,sourceId,sourceKey:'ztht',sourceLayer:layer};
  if(layer===8)return {...f,properties:{...common,kind:'centre',name:label(p.NAME),centreKind:label(p.CODE)}};
  if(layer===12)return {...f,properties:{...common,kind:'soum',name:label(p.name),code:label(p.code),population:p.hvn_am_too??null,density:p.density??null}};
  if(layer===2)return {...f,properties:{...common,kind:'road_project',name:label(p.Poin_name),project:label(p.Project_name),pointType:label(p.Point_torol)}};
  if(layer===9)return {...f,properties:{...common,kind:'national_road',name:label(p.ROADNAME)||label(p.RoadDName),code:label(p.ROADCODE),pavement:label(p.PAVEMENT_T),status:label(p.Roadstatus),accessEligible:roadAccessEligible(p.Roadstatus)}};
  throw new Error('Unsupported transport layer.');
}
