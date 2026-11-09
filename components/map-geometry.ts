import {rewind} from '@turf/turf';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import Point from '@arcgis/core/geometry/Point.js';
import type {Feature,Geometry} from 'geojson';
export function mapGeometry(f:Feature<Geometry>){
 const g=f.geometry;
 if(g.type==='Polygon'||g.type==='MultiPolygon'){
  const r=(rewind(f,{reverse:true}) as Feature<Geometry>).geometry;
  return new Polygon({rings:r.type==='Polygon'?r.coordinates:r.type==='MultiPolygon'?r.coordinates.flat():[],spatialReference:{wkid:4326}});
 }
 if(g.type==='LineString'||g.type==='MultiLineString')return new Polyline({paths:g.type==='LineString'?[g.coordinates]:g.coordinates,spatialReference:{wkid:4326}});
 if(g.type==='Point')return new Point({longitude:g.coordinates[0],latitude:g.coordinates[1]});
 return null;
}
export const rgba=(hex:string,alpha:number)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),alpha];
