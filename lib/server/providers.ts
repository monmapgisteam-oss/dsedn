import { destination, point } from '@turf/turf';
import {readReferenceJson} from './runtime-storage';
import { cellCenter, makeCells } from '../geo';
import { slopeFromPatch } from '../analysis';
import type { Bounds, LayerData, Resource, Terrain } from '../types';

const cache = new Map<string,{expires:number;value:unknown}>();
const inFlight=new Map<string,Promise<unknown>>();
export async function cached<T>(key:string, loader:()=>Promise<T>): Promise<T> {
  const entry=cache.get(key);
  if (entry && entry.expires>Date.now()) return entry.value as T;
  const active=inFlight.get(key);if(active)return active as Promise<T>;
  const task=loader().then(value=>{if(cache.size>50)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+3600000,value});return value;});
  inFlight.set(key,task);try{return await task;}finally{inFlight.delete(key);}
}
async function fetchJson(url:string, init?:RequestInit) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(45000),redirect:'error'});
  if (!response.ok) throw new Error(`External data provider returned HTTP ${response.status}. Retry later or import a local dataset.`);
  return response.json();
}
export async function loadResource(bounds:Bounds):Promise<Resource> {
  const lon=(bounds[0]+bounds[2])/2,lat=(bounds[1]+bounds[3])/2;
  const url=`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,WS50M&community=RE&longitude=${lon.toFixed(5)}&latitude=${lat.toFixed(5)}&format=JSON`;
  const data=await fetchJson(url);
  const p=data.properties?.parameter;
  if (!p) throw new Error('NASA POWER did not return resource parameters.');
  const valid=(v:unknown)=>typeof v==='number' && Number.isFinite(v) && v>=0 && v!==data.header?.fill_value ? v:null;
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  if (!String(data.parameters?.ALLSKY_SFC_SW_DWN?.units).match(/kW-hr\/m\^2\/day|kWh\/m/)) throw new Error('NASA solar units changed; conversion needs review.');
  if (data.parameters?.WS50M?.units!=='m/s') throw new Error('NASA wind units changed; conversion needs review.');
  return {solar:valid(p.ALLSKY_SFC_SW_DWN?.ANN),wind:valid(p.WS50M?.ANN),windHeight:50,
    monthlySolar:months.map(m=>valid(p.ALLSKY_SFC_SW_DWN?.[m])),monthlyWind:months.map(m=>valid(p.WS50M?.[m])),
    provenance:{name:'NASA POWER climatology',source:url,retrievedAt:new Date().toISOString(),detail:`${data.header?.range ?? 'Period not reported'}; ${data.header?.sources?.join(', ') ?? ''}. One regional point (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E), used uniformly for screening. Solar ~1° native grid; meteorology ~0.5° × 0.625°. Wind at 50 m; not turbine hub-height yield. API ${data.header?.api?.version ?? 'unknown'}.`}};
}

let elevationQueue: Promise<unknown>=Promise.resolve();
function elevationBatch(locations:string) {
  const request=elevationQueue.then(async()=>{
    const data=await fetchJson('https://api.opentopodata.org/v1/srtm90m',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locations,interpolation:'bilinear'})});
    if (data.status!=='OK' || !Array.isArray(data.results)) throw new Error('Elevation service unavailable or rate limited. Import a DEM or retry later.');
    return data.results as {elevation:number|null}[];
  });
  elevationQueue=request.catch(()=>{}).then(()=>new Promise(r=>setTimeout(r,1100)));
  return request;
}
export async function loadTerrain(bounds:Bounds,size:number):Promise<Terrain> {
  const cells=makeCells(bounds,size), locations:string[]=[];
  for (const cell of cells) {
    const center=cellCenter(cell);
    for (let y=-1;y<=1;y++) for (let x=-1;x<=1;x++) {
      const north=destination(point(center),-y*0.09,0);
      const xy=destination(north,x*0.09,90).geometry.coordinates;
      locations.push(`${xy[1].toFixed(7)},${xy[0].toFixed(7)}`);
    }
  }
  const elevations:(number|null)[]=[];
  for (let i=0;i<locations.length;i+=99) {
    const batch=locations.slice(i,i+99), result=await elevationBatch(batch.join('|'));
    if (result.length!==batch.length) throw new Error('Elevation service returned an incomplete batch.');
    elevations.push(...result.map(r=>typeof r.elevation==='number' && Number.isFinite(r.elevation) ? r.elevation:null));
  }
  return {samples:cells.map((c,i)=>({id:c.properties.id,elevation:elevations[i*9+4],slope:slopeFromPatch(elevations.slice(i*9,i*9+9),90)})),
    provenance:{name:'SRTM 90 m via Open Topo Data',source:'https://www.opentopodata.org/datasets/srtm/',retrievedAt:new Date().toISOString(),detail:'Horn 3×3 gradient of bilinear elevation samples at 90 m spacing around each cell center. Local slope proxy, not a cell-wide maximum or developable-area measurement. SRTM acquisition: February 2000. Elevation in metres; slope in degrees.'}};
}

export async function loadLogistics(bounds:Bounds):Promise<LayerData> {
  const dy=6/111.2, dx=dy/Math.cos((bounds[1]+bounds[3])/2*Math.PI/180);
  try {
    const local=await cached('mongolia-local-logistics',()=>readReferenceJson<LayerData>('mongolia-logistics'));
    const features=local.data.features.filter(f=>{const b=f.bbox;return b && b[0]<=bounds[2]+dx && b[2]>=bounds[0]-dx && b[1]<=bounds[3]+dy && b[3]>=bounds[1]-dy;});
    return {data:{type:'FeatureCollection',features},provenance:{...local.provenance,detail:`${local.provenance.detail} Spatial selection: ${features.length} features; 6 km query buffer.`}};
  } catch(error) {
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('The local logistics extract cannot be read. Re-run scripts/prepare-logistics.mjs.');
  }
  const box=[bounds[1]-dy,bounds[0]-dx,bounds[3]+dy,bounds[2]+dx].map(v=>v.toFixed(6)).join(',');
  const query=`[out:json][timeout:35];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)(_link)?$"](${box});way["railway"="rail"](${box}););out geom;`;
  const data=await fetchJson('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'User-Agent':'DSEDN-Renewable-Atlas/0.1 (local renewable site screening; https://www.dsedn.mn)','Accept':'application/json'},body:new URLSearchParams({data:query})});
  if (!Array.isArray(data.elements) || data.remark) throw new Error('OpenStreetMap returned an incomplete query. Retry or import roads from the Mongolia Geofabrik extract.');
  type Way={id:number;tags?:Record<string,string>;geometry?:{lon:number;lat:number}[]};
  const features=(data.elements as Way[]).filter(w=>w.geometry && w.geometry.length>1).map(w=>({type:'Feature' as const,geometry:{type:'LineString' as const,coordinates:w.geometry!.map(p=>[p.lon,p.lat])},properties:{osm_id:w.id,...w.tags}}));
  return {data:{type:'FeatureCollection',features},provenance:{name:'OpenStreetMap roads & rail',source:'https://overpass-api.de/api/interpreter',retrievedAt:new Date().toISOString(),detail:`OSM contributors, ODbL. Snapshot ${data.osm3s?.timestamp_osm_base ?? 'not supplied'}; 6 km query buffer. Roads include tracks; railway is context only. Missing surface/width/bridge limits remain unknown. Query: ${query}`}};
}
