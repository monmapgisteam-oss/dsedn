import { area, bbox, booleanIntersects, buffer, point } from '@turf/turf';
import type { Feature, Geometry, Polygon } from 'geojson';
import type { Bounds, Collection, LayerData } from '../types';
import { designFootprint, layoutInSite, sitePolygon, type Candidate, type SiteRequest, type SiteRun } from '../siting';
import type { Climate } from '../physics/era5';
import { bestTilt, designSunElev, horizonTan, rowPitch, shadedAnnual, sunHours, sunTrack } from '../physics/solarsite';
import { airDensity } from '../physics/energy';
import { farmAEP, wakeDeficits } from '../physics/windfarm';
import { terrainAt, type ElevationGrid } from './site-data';
import {nearestCentre,soumsAt,type TransportData,type CentreMatch} from '../transport';

import {prepareStudy,type AreaFeature} from '../study-area';
import {weightedScore} from '../siting-controls';
import {measureParcelOverlap} from '../parcel-overlap';

type Box=[number,number,number,number];
const intersects=(a:Box,b:Box)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
class GeometryIndex {
  records:{f:Feature<Geometry>;b:Box}[];
  constructor(data:Collection){this.records=data.features.map(f=>({f,b:bbox(f) as Box}));}
  query(poly:Feature<Polygon>){const b=bbox(poly) as Box;return this.records.filter(r=>intersects(b,r.b)&&booleanIntersects(poly,r.f)).map(r=>r.f);}
}
// Local equirectangular distances over this <=900 km² study: horizontal straight-line access proxies, not routes.
class DistanceIndex {
  segments:[number,number,number,number][]=[];
  constructor(data:Collection,private mx:number,private my:number){
    for(const f of data.features){const g=f.geometry;const parts=g.type==='Point'?[[g.coordinates]]:g.type==='LineString'? [g.coordinates]:g.type==='MultiLineString'||g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
      for(const line of parts){for(let i=0;i<Math.max(1,line.length-1);i++){const a=line[i],b=line[Math.min(i+1,line.length-1)];this.segments.push([a[0]*mx,a[1]*my,b[0]*mx,b[1]*my]);}}
    }
  }
  nearest(lon:number,lat:number,maxKm:number){const x=lon*this.mx,y=lat*this.my;let best=(maxKm*1000)**2,found=false;
    for(const [ax,ay,bx,by] of this.segments){if(x+Math.sqrt(best)<Math.min(ax,bx)||x-Math.sqrt(best)>Math.max(ax,bx)||y+Math.sqrt(best)<Math.min(ay,by)||y-Math.sqrt(best)>Math.max(ay,by))continue;
      const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1))),d=(x-ax-t*dx)**2+(y-ay-t*dy)**2;
      if(d<=best){best=d;found=true;}
    }return found?Math.sqrt(best)/1000:null;
  }
}
const padded=(poly:Feature<Polygon>,metres:number)=>metres>0?buffer(poly,metres,{units:'meters',steps:4}) as Feature<Polygon>:poly;
const fc=(features:Collection['features']):Collection=>({type:'FeatureCollection',features});
const norm=(v:number,lo:number,hi:number)=>Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
export function parcelConflicts(poly:Feature<Polygon>,parcels:Collection){return new GeometryIndex(parcels).query(poly).filter(f=>f.properties?.dsedn!==true);}

export function siteDesign(r:SiteRequest,climate:Climate){
  const b=r.bounds,lat=(b[1]+b[3])/2,lon=(b[0]+b[2])/2,solar=r.technology==='solar';
  const sun=sunTrack(lat,lon),tilt=bestTilt(climate.ty,sun,.2,[25,30,35,40,45,50]).best.tilt;
  // Worst north-facing gradient permitted by the slope limit: conservative uniform row pitch.
  const pitch=rowPitch(4.576,tilt,designSunElev(lat,lon,2),-r.maxSlope).pitch+1;
  if(solar&&!Number.isFinite(pitch))throw new Error('Өвлийн эгнээний зай тодорхойлох боломжгүй. Налуугийн босгыг багасгана уу.');
  const direction=climate.wind.sectors.reduce((best,s,i)=>s.e>climate.wind.sectors[best].e?i:best,0)*22.5;
  const design=designFootprint(r,solar?pitch:1,tilt,direction);
  if(design.columns===0||design.rows===0)throw new Error('Оруулсан талбайд нэг ч тоноглол хамгаалах зайтайгаа багтахгүй. Талбайг нэмнэ үү.');
  return {sun,tilt,pitch,direction,design};
}

export function findSites(request:SiteRequest,data:{study?:LayerData;rivers?:LayerData;riverProtection?:Collection;grid:LayerData;roads:LayerData;parcels:LayerData;context:LayerData;transport:TransportData;dem:ElevationGrid;climate:Climate},progress:(s:string)=>void=()=>{},scan?:{bounds:Bounds;stepM:number}):SiteRun {
  const r=request,{dem,climate}=data,solar=r.technology==='solar',b=r.bounds,lat=(b[1]+b[3])/2;
  if(!climate.annualReady||!Number.isFinite(climate.wind.alpha))throw new Error('ERA5 жилийн үнэлгээнд хангалтгүй байна.');
  const allRoads=data.transport.roads.data;
  const accessRoads=fc(allRoads.features.filter(f=>f.properties?.railway!=='rail'&&f.properties?.accessEligible!==false));
  if(!scan&&(!data.grid.data.features.length||!accessRoads.features.length))throw new Error('Цахилгаан шугам эсвэл ашиглах боломжтой гэж зурагласан замын өгөгдөлгүй бүс. Үр дүн гаргаагүй.');
  if(r.parcels&&!data.parcels.data.features.length)throw new Error('Энэ бүсэд кадастрын бүртгэл ирсэнгүй. Газрын эрхийн зураглалын хамрах хүрээг баталгаажуулна уу.');
  const {sun,tilt,direction,design}=siteDesign(r,climate);
  const study=data.study?.data.features[0] as AreaFeature|undefined,within=study?prepareStudy(study):null,riverZone=new GeometryIndex(data.riverProtection??fc([]));
  const parcels=new GeometryIndex(data.parcels.data),grid=new GeometryIndex(data.grid.data),roads=new GeometryIndex(fc([...allRoads.features,...data.roads.data.features.filter(f=>f.properties?.railway==='rail')]));
  const settlementFeatures=[...data.context.data.features.filter(f=>['settlement','residential'].includes(f.properties?.kind)),...data.transport.centres.data.features];
  const settlements=new GeometryIndex(fc(settlementFeatures)),water=new GeometryIndex(fc(data.context.data.features.filter(f=>f.properties?.kind==='water'))),protectedAreas=new GeometryIndex(fc(data.context.data.features.filter(f=>f.properties?.kind==='protected')));
  const mx=111195*Math.cos(lat*Math.PI/180),my=111195,gridDistance=new DistanceIndex(data.grid.data,mx,my),roadDistance=new DistanceIndex(accessRoads,mx,my);
  const residentialDistance=new DistanceIndex(fc(data.context.data.features.filter(f=>f.properties?.kind==='settlement'||f.properties?.kind==='residential'&&f.properties?.fclass==='residential')),mx,my);
  const nationalRoadDistance=new DistanceIndex(fc(data.transport.roads.data.features.filter(f=>f.properties?.accessEligible!==false)),mx,my);
  const studyWidth=(b[2]-b[0])*mx,studyHeight=(b[3]-b[1])*my;
  const step=Math.max(scan?.stepM??Math.max(80,Math.sqrt(studyWidth*studyHeight/5000)),Math.min(design.width,design.height)/4);
  const angle=design.direction*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),halfX=(Math.abs(c)*design.width+Math.abs(s)*design.height)/2,halfY=(Math.abs(s)*design.width+Math.abs(c)*design.height)/2;
  const rejected:Record<string,number>={},potential:{lon:number;lat:number;poly:Feature<Polygon>;meanSlope:number;maxSlope:number;elevation:number;n:number;gridKm:number;roadKm:number;settlementKm:number;centre:CentreMatch;conflicts:number;owned:number;score:number}[]=[];
  const screening:Collection=fc([]);
  const regionalResource=solar?norm(shadedAnnual(climate.ty,sunHours(climate.ty,sun,32),tilt,180,.2,null).total,1000,2000):norm(climate.wind.mean100*Math.pow(r.hubM/100,climate.wind.alpha),3,9);
  let examined=0;
  const reject=(why:string)=>{rejected[why]=(rejected[why]??0)+1;const last=screening.features.at(-1);if(last)last.properties={...last.properties,status:'excluded',reason:why,score:null};};
  // In whole-layer mode centres belong to a non-overlapping core, but footprints may cross its edges.
  const sb=scan?.bounds,x0=sb?(sb[0]-b[0])*mx+Math.min(step/2,(sb[2]-sb[0])*mx/2):halfX,y0=sb?(sb[1]-b[1])*my+Math.min(step/2,(sb[3]-sb[1])*my/2):halfY;
  const xEnd=sb?(sb[2]-b[0])*mx-1e-8:studyWidth-halfX,yEnd=sb?(sb[3]-b[1])*my-1e-8:studyHeight-halfY;
  for(let y=y0;y<=yEnd;y+=step)for(let x=x0;x<=xEnd;x+=step){
    const cx=b[0]+x/mx,cy=b[1]+y/my;examined++;
    const poly=sitePolygon(cx,cy,design,`S${examined}`);
    screening.features.push(point([cx,cy],{id:`SCAN-${examined}`,status:'excluded',score:null,reason:'',stage:'requested-footprint screening',stepM:step}));
    if(within&&!within(poly)){reject('boundary');continue;}
    if(riverZone.query(poly).length){reject('river_setback');continue;}
    // Rotation and geographic scale must not put any corner outside the requested study bounds.
    const bb=bbox(poly) as Box;
    if(bb[0]<b[0]-1e-8||bb[1]<b[1]-1e-8||bb[2]>b[2]+1e-8||bb[3]>b[3]+1e-8){reject('boundary');continue;}
    const land=parcels.query(poly),conflicts=land.filter(f=>f.properties?.dsedn!==true).length;
    if(r.parcels&&conflicts){reject('parcel');continue;}
    if(protectedAreas.query(poly).length||water.query(padded(poly,30)).length){reject('water_protected');continue;}
    if(settlements.query(padded(poly,r.settlementSetbackM)).length){reject('settlement_setback');continue;}
    // A wind-farm envelope may span an existing corridor. Keep every turbine's swept
    // footprint plus the selected buffer clear; solar keeps the whole array site clear.
    const equipmentPolygons=solar?[poly]:layoutInSite(cx,cy,design,r,'check').assets.map(a=>sitePolygon(a.longitude,a.latitude,{...design,width:r.rotorM,height:r.rotorM,direction:0},'check'));
    if(equipmentPolygons.some(p=>grid.query(padded(p,r.lineSetbackM)).length)){reject('line_setback');continue;}
    if(equipmentPolygons.some(p=>roads.query(padded(p,10)).length)){reject('road_corridor');continue;}
    const centre=nearestCentre([cx,cy],data.transport.centres.data,r.maxSettlementKm);
    if(!centre){reject('settlement_proximity');continue;}
    const settlementKm=centre.distanceKm;
    const gridKm=gridDistance.nearest(cx,cy,r.maxGridKm),roadKm=roadDistance.nearest(cx,cy,r.maxRoadKm);
    if(gridKm===null||roadKm===null){reject('proximity');continue;}
    let slopeSum=0,maxSlope=0,elevation=0,n=0,invalid=false;
    const ix0=Math.max(1,Math.floor((bb[0]-dem.lon0)*dem.mx/dem.step)),ix1=Math.min(dem.nx-2,Math.ceil((bb[2]-dem.lon0)*dem.mx/dem.step));
    const iy0=Math.max(1,Math.floor((bb[1]-dem.lat0)*dem.my/dem.step)),iy1=Math.min(dem.ny-2,Math.ceil((bb[3]-dem.lat0)*dem.my/dem.step));
    for(let j=iy0;j<=iy1&&!invalid;j++)for(let i=ix0;i<=ix1;i++){
      const dx=(dem.lon0+i*dem.step/dem.mx-cx)*my*Math.cos(cy*Math.PI/180),dy=(dem.lat0+j*dem.step/dem.my-cy)*my;
      // Include one pixel around the footprint so tiny sites also have terrain evidence.
      if(Math.abs(dx*c-dy*s)>design.width/2+dem.step/2||Math.abs(dx*s+dy*c)>design.height/2+dem.step/2)continue;
      const k=j*dem.nx+i,sl=dem.slope[k],z=dem.elev[k];
      if(!Number.isFinite(sl+z)){invalid=true;break;}
      if(sl>r.maxSlope){invalid=true;break;}
      slopeSum+=sl;maxSlope=Math.max(maxSlope,sl);elevation+=z;n++;
    }
    if(invalid||!n){reject('terrain');continue;}
    const meanSlope=slopeSum/n;
    const criteria={resource:regionalResource,grid:1-gridKm/r.maxGridKm,terrain:1-meanSlope/r.maxSlope,road:1-roadKm/r.maxRoadKm,settlement:1-settlementKm/r.maxSettlementKm};
    const score=weightedScore(criteria,r.weights);
    screening.features.at(-1)!.properties={...screening.features.at(-1)!.properties,...criteria,score,status:score>=70?'high':score>=45?'moderate':'low',reason:''};
    potential.push({lon:cx,lat:cy,poly,meanSlope,maxSlope,elevation:elevation/n,n,gridKm,roadKm,settlementKm,centre,conflicts,owned:land.filter(f=>f.properties?.dsedn===true).length,score});
  }
  progress(`${examined} байршлаас ${potential.length} нь орон зайн шалгалт давлаа. Үйлдвэрлэл тооцоолж байна…`);
  const parcelOverlap:Collection=fc([]);
  const candidates:Candidate[]=[],ranked=potential.sort((a,b)=>b.score-a.score),sh=sunHours(climate.ty,sun,32);
  const hg={x0:0,y0:0,cell:dem.step,nx:dem.nx,ny:dem.ny,elev:dem.elev};
  for(const p of ranked){
    if(candidates.length>=12)break;
    if(candidates.some(other=>booleanIntersects(other,p.poly)))continue;
    const id=`SITE-${String(candidates.length+1).padStart(2,'0')}`,layout=layoutInSite(p.lon,p.lat,design,r,id),capacity=layout.capacityMw;
    let netGwh=0,grossGwh=0,wakeLoss=0,horizonLoss=0,poa:number|null=null,wind:number|null=null;
    let monthlyGwh=Array(12).fill(0) as number[];
    if(solar){
      // Nine horizon origins across the footprint, 32 directions, 3 km ray length.
      const unshaded=shadedAnnual(climate.ty,sh,tilt,180,.2,null).total;
      let total=0;
      for(const fx of [-.4,0,.4])for(const fy of [-.4,0,.4]){
        const ll=p.lon+fx*design.width/mx,la=p.lat+fy*design.height/my,z=terrainAt(dem,ll,la).elevation;
        const horizon=horizonTan(hg,(ll-dem.lon0)*dem.mx,(la-dem.lat0)*dem.my,z,32,3000),monthly=new Float64Array(12);
        const annual=shadedAnnual(climate.ty,sh,tilt,180,.2,horizon,monthly);total+=annual.total;
        monthlyGwh=monthlyGwh.map((v,i)=>v+monthly[i]*capacity*r.pvPr/1000/9);
      }
      poa=total/9;horizonLoss=unshaded?1-poa/unshaded:0;grossGwh=unshaded*capacity/1000;netGwh=poa*capacity*r.pvPr/1000;
    }else{
      const turbs=layout.assets.map((a,i)=>({x:(a.longitude-p.lon)*mx,y:(a.latitude-p.lat)*my,score:p.score,elev:terrainAt(dem,a.longitude,a.latitude).elevation,no:i+1}));
      const deficits=wakeDeficits(turbs,r.rotorM,.8,.075,16);
      const estimates=farmAEP(turbs,climate.wind.sectors,climate.wind.alpha,{rated:r.turbineMw,rotor:r.rotorM,hub:r.hubM,vin:3,vr:12,vout:25,ct:.8},deficits.length?z=>airDensity(z+r.hubM,climate.wind.tMean):()=>1.225,deficits);
      grossGwh=estimates.reduce((sum,t)=>sum+t.gross,0)/1000;
      const wakeNet=estimates.reduce((sum,t)=>sum+t.net,0)/1000;wakeLoss=grossGwh?1-wakeNet/grossGwh:0;netGwh=wakeNet*(1-r.windLoss);
      wind=climate.wind.mean100*Math.pow(r.hubM/100,climate.wind.alpha);
      monthlyGwh=[]; // No fabricated seasonal allocation from annual Weibull AEP.
    }
    const criteria={resource:solar?norm(poa!,1000,2000):norm(wind!,3,9),grid:1-p.gridKm/r.maxGridKm,terrain:1-p.meanSlope/r.maxSlope,road:1-p.roadKm/r.maxRoadKm,settlement:1-p.settlementKm/r.maxSettlementKm};
    const weights=[r.weights.resource,r.weights.grid,r.weights.terrain,r.weights.road,r.weights.settlement],values=Object.values(criteria),weighted=(w:number[])=>values.reduce((sum,v,i)=>sum+v*w[i],0)/w.reduce((a,b)=>a+b,0)*100,score=weighted(weights);
    const scenarios=[score,...weights.flatMap((_,i)=>[.8,1.2].map(f=>weighted(weights.map((v,j)=>j===i?v*f:v))))];
    const sensitivity:[number,number]=[Math.min(...scenarios),Math.max(...scenarios)];
    const equipmentCount=solar?layout.assets.reduce((sum,a)=>sum+(a.moduleCount??0),0):layout.assets.length;
    const overlap=measureParcelOverlap(p.poly,fc(parcels.query(p.poly)),r.regionLayer===5&&data.parcels.data.features.length>0,id);
    parcelOverlap.features.push(...overlap.features);
    candidates.push({...p.poly,properties:{id,areaKm2:area(p.poly)/1e6,score,sensitivityMin:sensitivity[0],sensitivityMax:sensitivity[1],status:score>=70?'high':score>=45?'moderate':'low',provisional:true,reasons:[],gridKm:p.gridKm,roadKm:p.roadKm,slope:p.meanSlope,elevation:p.elevation,resourceValue:solar?poa:wind,components:{resource:criteria.resource*100,grid:criteria.grid*100,terrain:criteria.terrain*100,access:criteria.road*100},capacityMw:capacity,energyGwh:netGwh},layout,metrics:{parcelOverlap:overlap.summary,meanSlope:p.meanSlope,maxSlope:p.maxSlope,terrainSamples:p.n,settlementKm:p.settlementKm,nearestCentre:p.centre,residentialKm:residentialDistance.nearest(p.lon,p.lat,12),nationalRoadKm:nationalRoadDistance.nearest(p.lon,p.lat,13),soums:soumsAt([p.lon,p.lat],data.transport.soums.data),parcelConflicts:p.conflicts,dsednParcels:p.owned,poaKwhM2:poa,windHubMs:wind,grossGwh,netGwh,wakeLoss,horizonLoss,monthlyGwh,equipmentCount,criteria,weights:r.weights,sensitivity,energyScenario:[netGwh*.8,netGwh*1.2]}});
  }
  candidates.sort((a,b)=>b.properties.score!-a.properties.score!);
  const months=Array(12).fill(0) as number[];climate.ty.ghi.forEach((v,i)=>{months[new Date(Date.UTC(2025,0,1)+i*3600000).getUTCMonth()]+=v/1000;});
  const sources=[...(data.study?[data.study.provenance]:[]),...(data.rivers?[data.rivers.provenance]:[]),data.grid.provenance,data.roads.provenance,data.parcels.provenance,data.context.provenance,...Object.values(data.transport).map(d=>d.provenance),dem.provenance,{name:'ERA5 hourly reanalysis / Open-Meteo',source:'https://open-meteo.com/en/docs/historical-weather-api',retrievedAt:new Date(climate.fetchedAt).toISOString(),detail:`Explicit models=era5; ${climate.start}–${climate.end}; ${climate.hours} complete hours. Returned grid point ${climate.lat},${climate.lon}; regional ~0.25° data shared across study region. 8760-slot mean calendar year excludes leap days; GHI/DNI/DHI W/m², wind 10/100 m m/s. The selected period is a screening sample, not a long-term bankable climatology.`}];
  return {screening:fc(screening.features.filter(f=>f.properties?.reason!=='boundary')),request:r,createdAt:new Date().toISOString(),candidates,examined,rejected,searchStepM:step,sources,layers:{parcelOverlap,study:data.study?.data,rivers:data.rivers?.data,riverProtection:data.riverProtection,grid:data.grid.data,roads:data.roads.data,parcels:data.parcels.data,context:data.context.data,centres:data.transport.centres.data,nationalRoads:data.transport.roads.data,soums:data.transport.soums.data,roadProjects:data.transport.projects.data},climate:{model:'ERA5',start:climate.start,end:climate.end,lat:climate.lat,lon:climate.lon,hours:climate.hours,mean100:climate.wind.mean100,ghi:climate.solar.ghi,alpha:climate.wind.alpha,direction,monthlyWind:climate.wind.monthly,monthlySolar:months,windRose:climate.wind.sectors.map(({f,e,mean})=>({f,e,mean}))},warnings:[
    'Энэ нь судалгааны түвшний боломжит байршил. Холболтын хүчин чадал, газрын эрх, геотехник, тээврийн маршрут тусдаа баталгаажуулна.',
    `Хайлтын төвийн алхам ${step.toFixed(0)} м; тэгш өнцөгт хувилбарууд, 12 хүртэл давхцаагүй байршил. Бүх боломжит хэлбэр, байршлыг хамарсан оновчлол биш.`,
    'Үнэлгээний цэгэн давхарга нь өгсөн хэмжээний талбайг тухайн төвд байрлуулах орон зайн шалгалт. Оноонд бүсийн ERA5 нөөц ашигласан; сонгосон 12 хувилбарт сүүдэр / wake-тай үйлдвэрлэлийг нарийвчилна. Цэгийн өнгө нь бүх газрыг барилга барих боломжтой гэж батлахгүй.',
    'ERA5 нь бүсийн нөөц. 30 м DSM нь нарийн салхины урсгалыг шийдэхгүй; салхины бичил байршлын хэмжилт шаардлагатай.',
    'Суурьшил, ус, хамгаалалт: OSM-ийн бүрэн бус зураглал. Газрын кадастрт бүртгэлгүй газар нь чөлөөтэй ашиглах эрхийг нотлохгүй.',
    'Суурьшлын ойр байдлын тохируулсан жин ба дээд зай: ЗТХТ /8 нийслэл, аймаг, сумын төвийн цэг хүртэлх геодезийн зай. Энэ нь орон сууцны зах, ачааллын хэмжилт биш; OSM суурьшлын талбайн хамгаалах зайг давхар мөрдөнө.',
    'Замын хүртээмжийн оноог зөвхөн таны ЗТХТ /9 улсын авто замаар тооцов. ЗТХТ зам болон OSM төмөр замын зурвасыг тусад нь хасна. OSM зам нь нэмэлт харах давхарга. Хаасан, ашиглалтад ороогүй гэж бүртгэсэн улсын замыг хүртээмжийн оноонд оруулаагүй. Давхардсан замыг нэмэхэд ойрын зайн оноо давхардахгүй. Замын одоогийн ашиглалт, даац баталгаажаагүй.',
    'ЗТХТ /12 сумын хил ба хүн ам, /2 замын төслийн цэгүүд нь мэдээллийн давхарга. Сумын хилээр суурьшлын талбайг орлуулж хасаагүй; хүн амын тоог цахилгааны хэрэглээ болгож хувиргаагүй. Хүн амын лавлах он тодорхойгүй.',
    `Хамгаалах зайн хувилбар: суурьшил ${r.settlementSetbackM} м, шугам ${r.lineSetbackM} м, зам/төмөр зам 10 м, OSM ус 30 м, өгсөн голын геометрээс ${r.riverSetbackM} м. Эдгээр нь хуулийн баталгаат норм биш.`,
    solar?'Нар: өмнө зүг, 25–50° налуугаас сонгоно; өвлийн туйлын үд ±2 цагийн эгнээний зай; 9 цэгийн рельефийн сүүдэр; PR нь хэрэглэгчийн таамаглал. Цас, бохирдол, цахилгааны алдагдал тусад нь загварчлаагүй.':'Салхи: ерөнхий куб чадлын муруй (3/12/25 м/с), 16 секторын Weibull, өндрийн power-law шилжүүлэлт, нягтын засвар, Jensen wake (Ct=.8, k=.075), 7D × 4D зай. Үйлдвэрлэгчийн баталгаат муруй биш.',
    '±20% үйлдвэрлэлийн хувилбар нь мэдрэмжийн жишээ; P50/P90 буюу статистик итгэлцлийн интервал биш.',
    ...(!r.parcels?['Кадастрын хязгаарлалтыг унтраасан. Бусдын газартай давхцалтай хувилбаруудыг ашиглах эрх гэж үзэхгүй.']:[])
  ]};
}
