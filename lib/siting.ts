import { polygon, area } from '@turf/turf';
import type { Bounds, CellResult, Collection, Provenance, Technology } from './types';
import type { Layout, PlannedAsset } from './planning';
import type { CentreMatch, SoumInfo } from './transport';

import {defaultWeights,validatePeriod,type SiteWeights} from './siting-controls';
import type {ParcelOverlap} from './parcel-overlap';
export type DemandMode='area'|'capacity'|'count';
export type SiteRequest={regionLayer:5|6;regionId:number;riverSetbackM:number;era5Start:string;era5End:string;weights:SiteWeights;bounds:Bounds;technology:Technology;mode:DemandMode;value:number;parcels:boolean;maxSlope:number;maxGridKm:number;maxRoadKm:number;maxSettlementKm:number;settlementSetbackM:number;lineSetbackM:number;moduleWp:number;turbineMw:number;rotorM:number;hubM:number;pvPr:number;windLoss:number};
export const initialRequest:SiteRequest={regionLayer:6,regionId:0,riverSetbackM:100,era5Start:'2021-01-01',era5End:'2025-12-31',weights:{...defaultWeights},bounds:[105.82708627528001,49.122333333990184,106.82416666712372,49.922696918935095],technology:'solar',mode:'area',value:20,parcels:false,maxSlope:5,maxGridKm:10,maxRoadKm:5,maxSettlementKm:12,settlementSetbackM:100,lineSetbackM:30,moduleWp:580,turbineMw:6,rotorM:170,hubM:120,pvPr:.8,windLoss:.1};
export type SiteMetrics={parcelOverlap?:ParcelOverlap;meanSlope:number;maxSlope:number;terrainSamples:number;settlementKm:number;nearestCentre:CentreMatch;residentialKm:number|null;nationalRoadKm:number|null;soums:SoumInfo[];parcelConflicts:number;dsednParcels:number;poaKwhM2:number|null;windHubMs:number|null;grossGwh:number;netGwh:number;wakeLoss:number;horizonLoss:number;monthlyGwh:number[];equipmentCount:number;criteria:Record<string,number>;weights:SiteWeights;sensitivity:[number,number];energyScenario:[number,number]};
export type Candidate=CellResult & {climateTile?:string;metrics:SiteMetrics;layout:Layout};
export type ScopeCoverage={mode:'whole-layer';regionLayer:5|6;sourceFeatures:number;areaKm2:number;tiles:number;assessed:number;excludedByCentre:number;excludedByInfrastructure:number;failed:{tile:string;message:string}[];complete:boolean};
export type SiteRun={coverage?:ScopeCoverage;climates?:Record<string,SiteRun['climate']>;id?:string;screening?:Collection;request:SiteRequest;createdAt:string;candidates:Candidate[];examined:number;rejected:Record<string,number>;searchStepM:number;sources:Provenance[];layers:{parcelOverlap?:Collection;study?:Collection;rivers?:Collection;riverProtection?:Collection;grid:Collection;roads:Collection;parcels:Collection;context:Collection;centres:Collection;nationalRoads:Collection;soums:Collection;roadProjects:Collection};climate:{model:string;start:string;end:string;lat:number;lon:number;hours:number;mean100:number;ghi:number;alpha:number;direction:number;monthlyWind:number[];monthlySolar:number[];windRose:{f:number;e:number;mean:number}[]};warnings:string[]};
export type PhysicalDesign={width:number;height:number;columns:number;rows:number;pitch:number;tilt:number;direction:number;wanted:number;stepX:number;stepY:number;margin:number;tableWidth:number;tableLength:number};

export function validateRequest(r:SiteRequest) {
  if(!r||!['solar','wind'].includes(r.technology)||!['area','capacity','count'].includes(r.mode)||typeof r.parcels!=='boolean')throw new Error('Хүсэлтийн горим буруу байна.');
  if(![5,6].includes(r.regionLayer)||!Number.isInteger(r.regionId)||r.regionId<0)throw new Error('Хайлтын хил /5 эсвэл /6 байна.');
  if(r.regionLayer===6&&r.parcels)throw new Error('/6 бүсэд кадастрын өгөгдөлгүй горимоор хайна.');
  if(!r.weights||Object.keys(r.weights).length!==5||Object.keys(defaultWeights).some(k=>typeof r.weights[k as keyof SiteWeights]!=='number'||!Number.isFinite(r.weights[k as keyof SiteWeights])||r.weights[k as keyof SiteWeights]<0||r.weights[k as keyof SiteWeights]>100)||Object.values(r.weights).reduce((s,v)=>s+v,0)<=0)throw new Error('Үнэлгээний жин 0–100; дор хаяж нэг жин эерэг байна.');
  validatePeriod(r.era5Start,r.era5End);
  const limits:Record<string,[number,number]>={riverSetbackM:[1,3000],value:[.001,r.mode==='area'?10000:r.mode==='capacity'?1000:r.technology==='solar'?2000000:200],maxSlope:[.1,25],maxGridKm:[.1,10],maxRoadKm:[.1,5],maxSettlementKm:[1,12],settlementSetbackM:[0,3000],lineSetbackM:[0,300],moduleWp:[100,1000],turbineMw:[.1,15],rotorM:[20,250],hubM:[20,200],pvPr:[.5,.95],windLoss:[0,.4]};
  for(const [name,[lo,hi]] of Object.entries(limits)){const v=r[name as keyof SiteRequest];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw new Error(`${name}: ${lo}–${hi} хооронд утга оруулна уу.`);}
  if(r.mode==='count'&&!Number.isInteger(r.value))throw new Error('Тоноглолын тоо бүхэл тоо байна.');
  if(r.settlementSetbackM>=r.maxSettlementKm*1000)throw new Error('Суурьшлын хамгаалах зай нь хайлтын зайнаас бага байна.');
  if(r.technology==='wind'&&r.hubM<=r.rotorM/2+10)throw new Error('Роторын доод ирмэг газраас 10 м-ээс өндөр байна.');
}

export function designFootprint(r:SiteRequest,pitch:number,tilt:number,direction:number):PhysicalDesign {
  const solar=r.technology==='solar',tableWidth=26*1.134+25*.02,tableLength=2*2.278+.02;
  const stepX=solar?tableWidth+3:4*r.rotorM,stepY=solar?pitch:7*r.rotorM,margin=solar?12:r.rotorM/2+40;
  const unitMw=solar?r.moduleWp/1e6:r.turbineMw;
  const wanted=r.mode==='area'?Infinity:r.mode==='count'?r.value:Math.ceil((r.value-1e-10)/unitMw);
  const units=solar?Math.ceil(wanted/52):wanted;
  let columns:number,rows:number,width:number,height:number;
  if(r.mode==='area') {
    width=height=Math.sqrt(r.value*10000);
    const equipmentX=solar?tableWidth:r.rotorM,equipmentY=solar?tableLength*Math.cos(tilt*Math.PI/180):r.rotorM;
    columns=Math.max(0,Math.floor((width-2*margin-equipmentX)/stepX)+1);
    rows=Math.max(0,Math.floor((height-2*margin-equipmentY)/stepY)+1);
  } else {
    columns=Math.max(1,Math.ceil(Math.sqrt(units*stepY/stepX)));rows=Math.ceil(units/columns);
    width=2*margin+(columns-1)*stepX+(solar?tableWidth:r.rotorM);
    height=2*margin+(rows-1)*stepY+(solar?tableLength*Math.cos(tilt*Math.PI/180):r.rotorM);
  }
  if(columns*rows>(solar?20000:200))throw new Error('Тоноглолын дэлгэрэнгүй байршуулалтын хязгаар хэтэрсэн. Зорилтот хэмжээг багасгана уу.');
  return {width,height,columns,rows,pitch,tilt,direction:solar?0:direction,wanted,stepX,stepY,margin,tableWidth,tableLength};
}

export function sitePolygon(lon:number,lat:number,d:PhysicalDesign,id:string) {
  const mx=111195*Math.cos(lat*Math.PI/180),my=111195,th=d.direction*Math.PI/180,c=Math.cos(th),s=Math.sin(th);
  const ring=[[-d.width/2,-d.height/2],[d.width/2,-d.height/2],[d.width/2,d.height/2],[-d.width/2,d.height/2],[-d.width/2,-d.height/2]].map(([x,y])=>[lon+(x*c+y*s)/mx,lat+(-x*s+y*c)/my]);
  return polygon([ring],{id});
}

export function layoutInSite(lon:number,lat:number,d:PhysicalDesign,r:SiteRequest,id:string):Layout {
  const assets:PlannedAsset[]=[],solar=r.technology==='solar',mx=111195*Math.cos(lat*Math.PI/180),my=111195,th=d.direction*Math.PI/180,c=Math.cos(th),s=Math.sin(th);
  let left=d.wanted;
  const occupiedX=(d.columns-1)*d.stepX,occupiedY=(d.rows-1)*d.stepY;
  for(let row=0;row<d.rows;row++)for(let col=0;col<d.columns;col++) {
    if(left<=0)break;
    const count=solar?Math.min(52,left):1,x=col*d.stepX-occupiedX/2,y=row*d.stepY-occupiedY/2;
    assets.push({id:assets.length+1,cellId:id,longitude:lon+(x*c+y*s)/mx,latitude:lat+(-x*s+y*c)/my,capacityMw:solar?count*r.moduleWp/1e6:r.turbineMw,technology:r.technology,moduleCount:solar?count:undefined});left-=count;
  }
  const capacityMw=assets.reduce((s,a)=>s+a.capacityMw,0);
  return {assets,capacityMw,targetMw:r.mode==='capacity'?r.value:capacityMw,technology:r.technology,assumptions:{tableWidthM:d.tableWidth,tableLengthM:d.tableLength,tiltDeg:d.tilt,rowPitchM:d.pitch,modulesPerTable:52,moduleWp:r.moduleWp,rotorM:r.rotorM,hubM:r.hubM,turbineMw:r.turbineMw,alongD:7,crossD:4,directionDeg:d.direction},warning:'Screening layout. Geometry fits inside the candidate boundary; terrain, cadastral and context checks use mapped data. Foundation, grading, electrical connection, transport access and detailed setback design require site investigation.'};
}

export function footprintAreaHa(lon:number,lat:number,d:PhysicalDesign){return area(sitePolygon(lon,lat,d,''))/10000;}
