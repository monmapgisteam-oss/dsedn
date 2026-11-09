import {area,difference,featureCollection,intersect,union} from '@turf/turf';
import type {Feature,Polygon,MultiPolygon} from 'geojson';
import type {Collection} from './types';

type LandPolygon=Feature<Polygon|MultiPolygon>;
export type ParcelOverlap={status:'unavailable'}|{status:'checked';siteM2:number;otherM2:number;otherPct:number;dsednM2:number;dsednPct:number;unmappedM2:number;unmappedPct:number};
const merge=(parts:LandPolygon[])=>parts.length>1?union(featureCollection(parts)):parts[0]??null;

/** Unique covered area, not the sum of ownership/possession records. Conflicting other claims take precedence. */
export function measureParcelOverlap(site:LandPolygon,parcels:Collection,available:boolean,siteId:string):{summary:ParcelOverlap;features:Collection['features']}{
 if(!available)return {summary:{status:'unavailable'},features:[]};
 const siteM2=area(site);if(!Number.isFinite(siteM2)||siteM2<=0)throw new Error('Газрын давхцал: талбайн геометр буруу.');
 const groups:{other:LandPolygon[];dsedn:LandPolygon[]}={other:[],dsedn:[]};
 for(const f of parcels.features){
  if(!['Polygon','MultiPolygon'].includes(f.geometry.type))throw new Error('Кадастрын полигон геометр шаардлагатай.');
  const clipped=intersect(featureCollection([site,f as LandPolygon]));
  if(clipped&&area(clipped)>0)groups[f.properties?.dsedn===true?'dsedn':'other'].push(clipped);
 }
 const other=merge(groups.other),owned=merge(groups.dsedn);
 // A company record never overrides an overlapping other/unknown ownership claim.
 const dsedn=other&&owned?difference(featureCollection([owned,other])):owned;
 const otherM2=Math.min(siteM2,other?area(other):0),dsednM2=Math.min(Math.max(0,siteM2-otherM2),dsedn?area(dsedn):0),unmappedM2=Math.max(0,siteM2-otherM2-dsednM2);
 const summary:ParcelOverlap={status:'checked',siteM2,otherM2,otherPct:otherM2/siteM2*100,dsednM2,dsednPct:dsednM2/siteM2*100,unmappedM2,unmappedPct:unmappedM2/siteM2*100};
 const features:Collection['features']=[];
 if(other&&otherM2>0)features.push({...other,properties:{siteId,category:'other',areaM2:otherM2,percent:summary.otherPct}});
 if(dsedn&&dsednM2>0)features.push({...dsedn,properties:{siteId,category:'dsedn',areaM2:dsednM2,percent:summary.dsednPct}});
 return {summary,features};
}
