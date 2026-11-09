// Adapted from the user-provided Booroljuut reference; concept geometry, not surveyed assets.
import {Model,modelRenderer} from './renewable-models';

/** Reference-shaped distribution pole; dimensions are concept inputs, not a certified pole series. */
export const DISTRIBUTION_POLE_SHAPE={
 heightM:14,
 voltageKV:35,
 baseDiameterM:.42,
 topDiameterM:.20,
 crossarmHalfWidthM:1.6,
 insulatorM:.55,
 phases:[{level:1,armHeightM:9.4},{level:2,armHeightM:11.2},{level:3,armHeightM:13}],
} as const;
export type DistributionAttachment={id:string;rightM:number;upM:number};
type V3=[number,number,number];

function scaleFor(heightM:number){
 if(!Number.isFinite(heightM)||heightM<8||heightM>24)throw new Error('Бетон шонгийн дүрслэлийн өндөр 8–24 м байна.');
 return heightM/DISTRIBUTION_POLE_SHAPE.heightM;
}

/** Local X points across the line; Y is up. Wires meet the pin-insulator clamp, not the concrete shaft. */
export function distributionAttachmentOffsets(heightM:number=DISTRIBUTION_POLE_SHAPE.heightM):DistributionAttachment[]{
 const scale=scaleFor(heightM);
 return DISTRIBUTION_POLE_SHAPE.phases.flatMap(phase=>([-1,1] as const).map(side=>({
  id:`${side<0?'L':'R'}${phase.level}`,
  rightM:side*DISTRIBUTION_POLE_SHAPE.crossarmHalfWidthM,
  upM:(phase.armHeightM+DISTRIBUTION_POLE_SHAPE.insulatorM)*scale,
 })));
}

const cache=new Map<number,string>();
/** Shared metre-scale concrete mesh; origin is the terrain contact, without a billboard or remote asset. */
export function concretePoleModel(heightM:number=DISTRIBUTION_POLE_SHAPE.heightM):string{
 const scale=scaleFor(heightM),cached=cache.get(heightM);if(cached)return cached;
 const m=new Model(),concrete=m.part([.66,.67,.64],0,.95),base=m.part([.53,.55,.53],0,.98),steel=m.part([.37,.42,.44],.65,.52),dark=m.part([.15,.19,.20],.55,.62),ceramic=m.part([.30,.36,.33],.1,.29);
 const at=(p:V3):V3=>[p[0],p[1]*scale,p[2]],box=(part:ReturnType<Model['part']>,center:V3,size:V3)=>m.box(part,at(center),[size[0],size[1]*scale,size[2]]);
 const beam=(part:ReturnType<Model['part']>,a:V3,b:V3,r=.025,segments=6)=>m.pipe(part,at(a),at(b),r,segments);
 m.cone(concrete,0,heightM,DISTRIBUTION_POLE_SHAPE.baseDiameterM/2,DISTRIBUTION_POLE_SHAPE.topDiameterM/2);
 m.cone(base,0,.16*scale,.34,.30);
 // A subtle inspection cover and fixing bands provide close-range detail without altering the silhouette.
 box(dark,[0,1.15,-.207],[.12,.30,.014]);
 for(const y of [.96,1.34])box(steel,[0,y,-.215],[.16,.025,.012]);
 for(const phase of DISTRIBUTION_POLE_SHAPE.phases){
  const y=phase.armHeightM;
  // Twin steel channels, collar bolts and diagonal knee braces support each crossarm.
  for(const z of [-.075,.075])box(steel,[0,y,z],[3.4,.11,.065]);
  box(dark,[0,y,.0],[.36,.18,.30]);
  for(const side of [-1,1]){
   beam(steel,[side*.17,y-.56,0],[side*1.42,y-.04,0],.026,4);
   for(const z of [-.16,.16])box(steel,[side*.20,y,z],[.07,.07,.04]);
   const x=side*DISTRIBUTION_POLE_SHAPE.crossarmHalfWidthM,anchor=y+DISTRIBUTION_POLE_SHAPE.insulatorM;
   beam(dark,[x,y,0],[x,anchor,0],.027);
   // Six porcelain sheds. Every ring is an actual mesh, with a metal conductor clamp at its top.
   for(let level=0;level<6;level++){
    const h=y+.07+level*.075;
    for(let k=0;k<10;k++){
     const a=k*2*Math.PI/10,b=(k+1)*2*Math.PI/10;
     const p=(angle:number,r:number,dy:number):V3=>at([x+r*Math.cos(angle),h+dy,r*Math.sin(angle)]);
     m.quad(ceramic,p(a,.035,.035),p(a,.105,0),p(b,.105,0),p(b,.035,.035));
     m.quad(ceramic,p(a,.105,0),p(a,.035,-.022),p(b,.035,-.022),p(b,.105,0));
    }
   }
   // The pipe end-cap includes the exact anchor centre used by distributionAttachmentOffsets.
   beam(dark,[x,anchor,0],[x,anchor,.12],.035);
   box(steel,[x,anchor+.025,.06],[.10,.05,.15]);
  }
 }
 const href=m.export();if(cache.size>=20)cache.delete(cache.keys().next().value!);cache.set(heightM,href);return href;
}

export function concretePoleRenderer(heightM:number=DISTRIBUTION_POLE_SHAPE.heightM,headingDeg=0){
 return modelRenderer({href:concretePoleModel(heightM),height:heightM},headingDeg);
}
