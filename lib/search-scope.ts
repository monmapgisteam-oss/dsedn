import {area,bbox,bboxPolygon,booleanIntersects,distance} from '@turf/turf';
import type {Bounds,Collection} from './types';
import {studyMask,type AreaFeature} from './study-area';

export const scopeName=(layer:5|6)=>layer===6?'Дархан':'Нийт талбай';
export type SearchTile={id:string;bounds:Bounds};
/** Bounds are derived from ALL source polygons. They are never supplied by the user. */
export function wholeStudy(regions:Collection){
 const bounds=bbox(regions) as Bounds;
 const mask=studyMask(regions,bounds);
 return {bounds,mask,areaKm2:area(mask)/1e6};
}
export function searchTiles(mask:AreaFeature,sideM=10000):SearchTile[]{
 const b=bbox(mask) as Bounds,my=111195,mx=my*Math.cos((b[1]+b[3])/2*Math.PI/180);
 const nx=Math.ceil((b[2]-b[0])*mx/sideM),ny=Math.ceil((b[3]-b[1])*my/sideM),tiles:SearchTile[]=[];
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const bounds:Bounds=[b[0]+(b[2]-b[0])*x/nx,b[1]+(b[3]-b[1])*y/ny,b[0]+(b[2]-b[0])*(x+1)/nx,b[1]+(b[3]-b[1])*(y+1)/ny];
  if(booleanIntersects(bboxPolygon(bounds),mask))tiles.push({id:`T${y*nx+x+1}`,bounds});
 }
 return tiles;
}
/** Conservative rejection: even the nearest possible point in this tile is too far from every supplied centre. */
export function canReachCentre(b:Bounds,centres:Collection,maxKm:number){
 const centre:[number,number]=[(b[0]+b[2])/2,(b[1]+b[3])/2];
 const radius=Math.max(...[[b[0],b[1]],[b[0],b[3]],[b[2],b[1]],[b[2],b[3]]].map(p=>distance(centre,p)));
 return centres.features.some(f=>f.geometry.type==='Point'&&distance(centre,f.geometry.coordinates)<=maxKm+radius+.05);
}
/** A necessary (deliberately generous) envelope test, never a positive suitability decision. */
export function canReachInfrastructure(b:Bounds,lines:Collection,maxKm:number){
 const dy=(maxKm*1000*1.01+10)/111195,dx=dy/Math.cos((b[3]+dy)*Math.PI/180);
 const window:Bounds=[b[0]-dx,b[1]-dy,b[2]+dx,b[3]+dy],poly=bboxPolygon(window);
 return lines.features.some(f=>{
  const a=bbox(f);
  return a[0]<=window[2]&&a[2]>=window[0]&&a[1]<=window[3]&&a[3]>=window[1]&&booleanIntersects(poly,f);
 });
}
export function expandForFootprint(b:Bounds,width:number,height:number,direction:number):Bounds{
 const th=direction*Math.PI/180,c=Math.abs(Math.cos(th)),s=Math.abs(Math.sin(th));
 // Northernmost latitude gives the largest longitude padding across the entire tile.
 const mx=111195*Math.cos(b[3]*Math.PI/180),my=111195;
 const dx=((c*width+s*height)/2+60)/mx,dy=((s*width+c*height)/2+60)/my;
 return [b[0]-dx,b[1]-dy,b[2]+dx,b[3]+dy];
}
