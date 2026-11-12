import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fromFile } from 'geotiff';
import { summarize, type WeatherRaw, type Climate } from '../physics/era5';
import type { Bounds, LayerData, Provenance } from '../types';
import { cached } from './providers';
import {validatePeriod} from '../siting-controls';
import {downloadCog} from './cog-download';
import {cacheDirectory,readReferenceJson} from './runtime-storage';

const fields=['wind_speed_10m','wind_speed_100m','wind_direction_100m','temperature_2m','shortwave_radiation','diffuse_radiation','direct_normal_irradiance'];
const directory=cacheDirectory();
export async function loadERA5(bounds:Bounds, progress:(s:string)=>void=()=>{},start='2021-01-01',end='2025-12-31'):Promise<Climate> {
  validatePeriod(start,end);
  const lat=(bounds[1]+bounds[3])/2,lon=(bounds[0]+bounds[2])/2;
  const raw:WeatherRaw={latitude:lat,longitude:lon,elevation:0,hourly:{time:[]}};
  for(const field of fields)raw.hourly[field]=[];
  await mkdir(directory,{recursive:true});
  for(let year=Number(start.slice(0,4));year<=Number(end.slice(0,4));year++) {
    progress(`ERA5 · ${year} оны цаг тутмын өгөгдөл`);
    const path=join(directory,`era5-${lat.toFixed(4)}-${lon.toFixed(4)}-${year}.json`);
    let data:WeatherRaw & {hourly_units?:Record<string,string>};
    try {data=JSON.parse(await readFile(path,'utf8'));}
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      const q=new URLSearchParams({latitude:lat.toFixed(4),longitude:lon.toFixed(4),start_date:`${year}-01-01`,end_date:`${year}-12-31`,models:'era5',hourly:fields.join(','),wind_speed_unit:'ms',timezone:'GMT',cell_selection:'nearest'});
      // Open-Meteo's free archive API has per-minute, per-hour and per-day quotas. A minute quota clears by
      // waiting; the longer ones cannot be waited out inside one run, so they are reported as such.
      let response:Response;
      for(let attempt=0;;attempt++){
        response=await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`,{signal:AbortSignal.timeout(90000)});
        if(response.status!==429)break;
        const reason=await response.json().then(d=>String(d?.reason??''),()=>'');
        if(/hourly/i.test(reason))throw new Error('ERA5 (Open-Meteo) цагийн хүсэлтийн хязгаарт хүрлээ. Нэг цагийн дараа дахин хайна уу; татсан өгөгдөл хадгалагдсан тул үргэлжлүүлнэ.');
        if(/daily/i.test(reason))throw new Error('ERA5 (Open-Meteo) өдрийн хүсэлтийн хязгаарт хүрлээ. Маргааш дахин хайна уу; татсан өгөгдөл хадгалагдсан тул үргэлжлүүлнэ.');
        if(attempt>=3)throw new Error('ERA5 өгөгдөл татагдсангүй (HTTP 429). Хэдэн минутын дараа дахин хайна уу.');
        progress(`ERA5 · хүсэлтийн хязгаар, 65 секунд хүлээж байна (${attempt+1}/3)`);
        await new Promise(resolve=>setTimeout(resolve,65000));
      }
      if(!response.ok)throw new Error(`ERA5 өгөгдөл татагдсангүй (HTTP ${response.status}).`);
      data=await response.json();
      await writeFile(path,JSON.stringify(data));
    }
    const expected=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/3600000;
    if(data.hourly?.time?.length!==expected||data.hourly.time.some((t,i)=>Date.parse(`${t}Z`)!==Date.UTC(year,0,1)+i*3600000))throw new Error('ERA5 цагийн цуваа бүрэн биш. Үр дүн гаргаагүй.');
    for(const f of fields) {
      const values=data.hourly[f];
      if(values?.length!==expected||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('ERA5 өгөгдөл дутуу байна. Хоосон утгыг тэгээр нөхөөгүй.');
      const expectedUnit=f.includes('wind_speed')?'m/s':/radiation|irradiance/.test(f)?'W/m²':f==='temperature_2m'?'°C':'°';
      if(data.hourly_units?.[f]!==expectedUnit)throw new Error('ERA5 нэгж өөрчлөгдсөн. Хөрвүүлэлтийг шалгана уу.');
      (raw.hourly[f] as number[]).push(...values as number[]);
    }
    raw.hourly.time.push(...data.hourly.time);raw.latitude=data.latitude;raw.longitude=data.longitude;raw.elevation=data.elevation;
  }
  return summarize(raw,16,start,end);
}

export type ElevationGrid={lon0:number;lat0:number;mx:number;my:number;step:number;nx:number;ny:number;elev:Float64Array;slope:Float32Array;provenance:Provenance};
export function terrainAt(g:ElevationGrid,lon:number,lat:number) {
  const x=(lon-g.lon0)*g.mx/g.step,y=(lat-g.lat0)*g.my/g.step,i=Math.floor(x),j=Math.floor(y);
  if(i<0||j<0||i>=g.nx-1||j>=g.ny-1)return {elevation:NaN,slope:NaN};
  const k=j*g.nx+i,tx=x-i,ty=y-j;
  const elevation=(g.elev[k]*(1-tx)+g.elev[k+1]*tx)*(1-ty)+(g.elev[k+g.nx]*(1-tx)+g.elev[k+g.nx+1]*tx)*ty;
  return {elevation,slope:Math.max(g.slope[k],g.slope[k+1],g.slope[k+g.nx],g.slope[k+g.nx+1])};
}
export async function loadDEM(bounds:Bounds,progress:(s:string)=>void=()=>{},retain=true):Promise<ElevationGrid> {
  const compute=async()=>{
    const my=111195,mx=my*Math.cos((bounds[1]+bounds[3])/2*Math.PI/180),step=30,buffer=3300;
    const lon0=bounds[0]-buffer/mx,lat0=bounds[1]-buffer/my;
    const nx=Math.ceil(((bounds[2]-bounds[0])*mx+2*buffer)/step)+1,ny=Math.ceil(((bounds[3]-bounds[1])*my+2*buffer)/step)+1;
    if(nx*ny>2500000)throw new Error('DEM тооцооллын бүс хэт том. Хайлтын бүсийг багасгана уу.');
    const g:ElevationGrid={lon0,lat0,mx,my,step,nx,ny,elev:new Float64Array(nx*ny).fill(NaN),slope:new Float32Array(nx*ny).fill(NaN),provenance:{name:'Copernicus GLO-30 DSM',source:'https://registry.opendata.aws/copernicus-dem/',retrievedAt:new Date().toISOString(),detail:'2021 public release; native ~30 m surface elevations, resampled to a 30 m local metric grid. Horn 3×3 slope in degrees. 3.3 km buffer for horizon modelling. DSM includes vegetation/buildings; not a survey or grading design.'}};
    const east=lon0+(nx-1)*step/mx,north=lat0+(ny-1)*step/my;
    await mkdir(directory,{recursive:true});
    for(let lat=Math.floor(lat0);lat<=Math.floor(north);lat++)for(let lon=Math.floor(lon0);lon<=Math.floor(east);lon++) {
      const name=`Copernicus_DSM_COG_10_N${String(lat).padStart(2,'0')}_00_E${String(lon).padStart(3,'0')}_00_DEM`;
      const path=join(directory,`${name}.tif`);progress(`Copernicus DEM · ${lat}°N ${lon}°E`);
      try{await access(path);}catch {
        await downloadCog(`https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`,path);
      }
      const tiff=await fromFile(path);
      try {
        const im=await tiff.getImage(),origin=im.getOrigin(),res=im.getResolution();
        const offset=im.getGeoKeys()?.GTRasterTypeGeoKey===2?0:.5;
        const xOrigin=origin[0]+offset*res[0],yOrigin=origin[1]+offset*res[1];
        const w=Math.max(lon0,lon),e=Math.min(east,lon+1),s=Math.max(lat0,lat),n=Math.min(north,lat+1);
        const x0=Math.max(0,Math.floor((w-xOrigin)/res[0])-1),x1=Math.min(im.getWidth(),Math.ceil((e-xOrigin)/res[0])+2);
        const y0=Math.max(0,Math.floor((n-yOrigin)/res[1])-1),y1=Math.min(im.getHeight(),Math.ceil((s-yOrigin)/res[1])+2);
        const raster=await im.readRasters({window:[x0,y0,x1,y1],samples:[0],interleave:true}),width=x1-x0,nd=im.getGDALNoData();
        const read=(x:number,y:number)=>{const z=Number(raster[(y-y0)*width+x-x0]);return z===nd?NaN:z;};
        for(let j=Math.max(0,Math.ceil((s-lat0)*my/step));j<ny;j++) {
          const latitude=lat0+j*step/my;if(latitude>=n)break;
          for(let i=Math.max(0,Math.ceil((w-lon0)*mx/step));i<nx;i++) {
            const longitude=lon0+i*step/mx;if(longitude>=e)break;
            const fx=(longitude-xOrigin)/res[0],fy=(latitude-yOrigin)/res[1],ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
            if(ix<x0||iy<y0||ix+1>=x1||iy+1>=y1)continue;
            g.elev[j*nx+i]=(read(ix,iy)*(1-tx)+read(ix+1,iy)*tx)*(1-ty)+(read(ix,iy+1)*(1-tx)+read(ix+1,iy+1)*tx)*ty;
          }
        }
      } finally {await tiff.close();}
    }
    for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++) {
      const k=j*nx+i,z=g.elev;
      const dx=(z[k-nx+1]+2*z[k+1]+z[k+nx+1]-z[k-nx-1]-2*z[k-1]-z[k+nx-1])/(8*step);
      const dy=(z[k+nx-1]+2*z[k+nx]+z[k+nx+1]-z[k-nx-1]-2*z[k-nx]-z[k-nx+1])/(8*step);
      g.slope[k]=Math.atan(Math.hypot(dx,dy))*180/Math.PI;
    }
    return g;
  };
  return retain?cached(`copdem30:${bounds.join(',')}`,compute):compute();
}

export async function loadContext(bounds:Bounds):Promise<LayerData> {
  const source=await cached('osm-context',()=>readReferenceJson<LayerData>('mongolia-context'));
  const dy=12/111.195,dx=dy/Math.cos((bounds[1]+bounds[3])/2*Math.PI/180);
  const features=source.data.features.filter(f=>f.bbox&&f.bbox[0]<=bounds[2]+dx&&f.bbox[2]>=bounds[0]-dx&&f.bbox[1]<=bounds[3]+dy&&f.bbox[3]>=bounds[1]-dy);
  return {data:{type:'FeatureCollection',features},provenance:{...source.provenance,detail:source.provenance.detail+` Spatial selection: ${features.length} features; 12 km buffer.`}};
}
