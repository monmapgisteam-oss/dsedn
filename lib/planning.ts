import { bbox, booleanPointInPolygon, point } from '@turf/turf';
import type { CellResult, Technology } from './types';

export type PlannedAsset={id:number;cellId:string;longitude:number;latitude:number;capacityMw:number;technology:Technology;moduleCount?:number};
export type Layout={assets:PlannedAsset[];capacityMw:number;targetMw:number;technology:Technology;assumptions:{tableWidthM:number;tableLengthM:number;tiltDeg:number;rowPitchM:number;modulesPerTable:number;moduleWp:number;rotorM:number;hubM:number;turbineMw:number;alongD:number;crossD:number;directionDeg:number};warning:string};
export function generateLayout(cells:CellResult[],ids:string[],technology:Technology,targetMw=20):Layout {
  if(!Number.isFinite(targetMw)||targetMw<=0||targetMw>100)throw new Error('Concept target must be above zero and at most 100 MW.');
  const assumptions={tableWidthM:24,tableLengthM:4,tiltDeg:35,rowPitchM:12,modulesPerTable:40,moduleWp:550,rotorM:140,hubM:100,turbineMw:3,alongD:7,crossD:4,directionDeg:0};
  const assets:PlannedAsset[]=[],solar=technology==='solar',rated=solar?.022:3;
  // Floor avoids exceeding the requested installed-capacity target.
  const wanted=Math.min(solar?5000:100,Math.floor((targetMw+1e-9)/rated));
  const selected=cells.filter(c=>ids.includes(c.properties.id)&&c.properties.score!==null).sort((a,b)=>b.properties.score!-a.properties.score!);
  for(const c of selected){
    if(assets.length>=wanted)break;
    const [w,s,e,n]=bbox(c),lat=(s+n)/2,metersLat=111195,metersLon=metersLat*Math.cos(lat*Math.PI/180);
    const margin=solar?25:assumptions.rotorM/2+25,stepX=solar?27:assumptions.crossD*assumptions.rotorM,stepY=solar?assumptions.rowPitchM:assumptions.alongD*assumptions.rotorM;
    const width=(e-w)*metersLon,height=(n-s)*metersLat;
    for(let y=margin;y<=height-margin&&assets.length<wanted;y+=stepY)for(let x=margin;x<=width-margin&&assets.length<wanted;x+=stepX){
      const longitude=w+x/metersLon,latitude=s+y/metersLat;
      const halfX=solar?assumptions.tableWidthM/2:assumptions.rotorM/2;
      const halfY=solar?assumptions.tableLengthM*Math.cos(assumptions.tiltDeg*Math.PI/180)/2:assumptions.rotorM/2;
      if(![[-halfX,-halfY],[halfX,-halfY],[halfX,halfY],[-halfX,halfY]].every(([dx,dy])=>booleanPointInPolygon(point([longitude+dx/metersLon,latitude+dy/metersLat]),c)))continue;
      if(!solar&&assets.some(a=>{const dx=(longitude-a.longitude)*metersLon,dy=(latitude-a.latitude)*metersLat;return (dx/stepX)**2+(dy/stepY)**2<1-1e-9;}))continue;
      assets.push({id:assets.length+1,cellId:c.properties.id,longitude,latitude,capacityMw:rated,technology});
    }
  }
  return {assets,capacityMw:assets.length*rated,targetMw,technology,assumptions,warning:'Illustrative equipment layout, adapted from Booroljuut visualization patterns. Cell-center screening does not clear each equipment footprint. Spacing is assumed, wind direction is assumed north, and shading, wakes, grading, cabling, roads, setbacks, foundation design and grid connection have not been engineered.'};
}
