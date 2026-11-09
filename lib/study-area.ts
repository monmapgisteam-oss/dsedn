import {area,bbox,bboxPolygon,booleanPointInPolygon,buffer,difference,featureCollection,intersect,union} from '@turf/turf';
import type {Feature,Polygon,MultiPolygon} from 'geojson';
import type {Bounds,Collection} from './types';
export type AreaFeature=Feature<Polygon|MultiPolygon>;
export function studyMask(regions:Collection,bounds:Bounds):AreaFeature {
 const parts=regions.features.filter((f):f is AreaFeature=>f.geometry.type==='Polygon'||f.geometry.type==='MultiPolygon');
 if(!parts.length)throw new Error('Сонгосон хилийн өгөгдөл ирсэнгүй.');
 const merged=parts.length===1?parts[0]:union(featureCollection(parts));
 const clipped=merged&&intersect(featureCollection([merged,bboxPolygon(bounds)]));
 if(!clipped||area(clipped)<1)throw new Error('Хайлтын хүрээ сонгосон /5 эсвэл /6 хилтэй огтлолцохгүй байна.');
 return clipped;
}
// Difference handles concave boundaries, holes and adjacent parts; checking corners alone does not.
export function insideStudy(site:AreaFeature,mask:AreaFeature){const outside=difference(featureCollection([site,mask]));return !outside||area(outside)<.01;}
/** Exact fast path for sites away from all mask edges; retains exact polygon difference near edges/holes. */
export function prepareStudy(mask:AreaFeature){
 const rings=mask.geometry.type==='Polygon'?mask.geometry.coordinates:mask.geometry.coordinates.flat();
 const edges=rings.flatMap(r=>r.slice(1).map((p,i)=>[Math.min(p[0],r[i][0]),Math.min(p[1],r[i][1]),Math.max(p[0],r[i][0]),Math.max(p[1],r[i][1])]));
 return (site:AreaFeature)=>{const b=bbox(site);if(!edges.some(e=>e[0]<=b[2]&&e[2]>=b[0]&&e[1]<=b[3]&&e[3]>=b[1])){const p=site.geometry.type==='Polygon'?site.geometry.coordinates[0][0]:site.geometry.coordinates[0][0][0];return booleanPointInPolygon(p,mask);}return insideStudy(site,mask);};
}
export function riverProtection(rivers:Collection,metres:number):Collection {
 if(!Number.isFinite(metres)||metres<1||metres>3000)throw new Error('Голын хамгаалах зай 1–3000 м байна.');
 return featureCollection(rivers.features.map(f=>{const p=buffer(f,metres,{units:'meters',steps:8});if(!p)throw new Error('Голын хамгаалах зурвасын геометр үүссэнгүй.');p.properties={sourceId:f.properties?.sourceId,setbackM:metres};return p;}));
}
