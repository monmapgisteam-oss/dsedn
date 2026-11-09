import {bboxClip} from '@turf/turf';
import type {Feature,LineString,MultiLineString} from 'geojson';
import type {Bounds,Collection} from './types';
export type ConceptPole={longitude:number;latitude:number;heading:number;role:'corner'|'junction'|'end'|'intermediate'|'clip';turnDeg:number;sourceIds:string[];lineNames:string[];voltageTexts:string[]};
export type ConceptSpan={a:number;b:number;lengthM:number;lineId:string;lineName:string;voltageText:string};
/** Illustrative geometry along supplied overhead lines, never a survey of actual support locations. */
export function conceptualSpans(grid:Collection,bounds:Bounds,spacingM=100,limit=600){
 const poles:ConceptPole[]=[],spans:ConceptSpan[]=[];let truncated=false;
 if(!Number.isFinite(spacingM)||spacingM<=0||!Number.isInteger(limit)||limit<1)throw new Error('Invalid pole spacing or display limit.');
 const my=111195,mx=my*Math.cos((bounds[1]+bounds[3])/2*Math.PI/180);
 const nodes=new Map<string,number>(),edges=new Set<string>(),adjacent:Set<number>[]=[],clipped=new Set<number>();
 const key=(p:number[])=>`${p[0].toFixed(7)},${p[1].toFixed(7)}`;
 features:for(const f of grid.features){
  if(f.properties?.sourceLayer!==0||!['LineString','MultiLineString'].includes(f.geometry.type))continue;
  const source=f as Feature<LineString|MultiLineString>,original=new Set((source.geometry.type==='LineString'?source.geometry.coordinates:source.geometry.coordinates.flat()).map(key));
  const geometry=bboxClip(source,bounds).geometry as LineString|MultiLineString,paths=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;
  const p=f.properties??{},lineId=String(p.objectid??''),lineName=String(p.air_line_name??''),voltageText=String(p.display?.voltage_level?.value??(p.voltage_level===undefined||p.voltage_level===null?'':`${p.voltage_level} · эх утга`));
  for(const path of paths){let previous=-1;
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my,length=Math.hypot(dx,dy);if(length<.1)continue;
    const n=Math.ceil(length/spacingM),heading=Math.atan2(dx,dy)*180/Math.PI;
    for(let j=previous<0?0:1;j<=n;j++){
     const t=j/n,position=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],k=key(position);let index=nodes.get(k);
     if(index===undefined){
      if(poles.length>=limit){truncated=true;break features;}
      index=poles.length;nodes.set(k,index);adjacent.push(new Set());
      poles.push({longitude:position[0],latitude:position[1],heading,role:'intermediate',turnDeg:0,sourceIds:[],lineNames:[],voltageTexts:[]});
      if((j===0||j===n)&&!original.has(k))clipped.add(index);
     }
     const pole=poles[index];for(const [items,value] of [[pole.sourceIds,lineId],[pole.lineNames,lineName],[pole.voltageTexts,voltageText]] as [string[],string][])if(value&&!items.includes(value))items.push(value);
     if(previous>=0&&previous!==index){const edge=[previous,index].sort((a,b)=>a-b).join(':');if(!edges.has(edge)){edges.add(edge);const other=poles[previous];spans.push({a:previous,b:index,lengthM:Math.hypot((pole.longitude-other.longitude)*mx,(pole.latitude-other.latitude)*my),lineId,lineName,voltageText});adjacent[previous].add(index);adjacent[index].add(previous);}}
     previous=index;
    }
   }
  }
 }
 for(let i=0;i<poles.length;i++){
  const p=poles[i],neighbors=[...adjacent[i]].map(index=>{const q=poles[index],dx=(q.longitude-p.longitude)*mx,dy=(q.latitude-p.latitude)*my,d=Math.hypot(dx,dy);return [dx/d,dy/d];});
  if(neighbors.length===1)p.role=clipped.has(i)?'clip':'end';
  else if(neighbors.length>2)p.role='junction';
  else if(neighbors.length===2){
   const [a,b]=neighbors;p.turnDeg=180-Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;
   p.role=p.turnDeg>.5?'corner':'intermediate';
   // Crossarms follow the bisector of incoming/outgoing directions at a bend.
   if(Math.hypot(b[0]-a[0],b[1]-a[1])>1e-6)p.heading=Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI;
  }
 }
 return {poles,spans,truncated};
}
export function conductorPath(a:number[],b:number[],offsetRightM:number,attachmentHeight:number,sagM:number,headingA?:number,headingB?:number){
 const mx=111195*Math.cos((a[1]+b[1])/2*Math.PI/180),my=111195,dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my;
 const angle=Math.atan2(dx,dy),align=(heading:number|undefined)=>{const a=heading===undefined?angle:heading*Math.PI/180;return Math.cos(a-angle)<0?a+Math.PI:a;},aa=align(headingA),ab=align(headingB);
 const start=[a[0]+Math.cos(aa)*offsetRightM/mx,a[1]-Math.sin(aa)*offsetRightM/my],end=[b[0]+Math.cos(ab)*offsetRightM/mx,b[1]-Math.sin(ab)*offsetRightM/my];
 return Array.from({length:17},(_,i)=>{const t=i/16;return [start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t,a[2]+(b[2]-a[2])*t+attachmentHeight-4*sagM*t*(1-t)];});
}
