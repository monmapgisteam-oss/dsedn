import {loadDEM,loadERA5} from '../lib/server/site-data';
import {loadArcGISLayer} from '../lib/server/arcgis';
import {initialRequest} from '../lib/siting';
import {writeFile} from 'node:fs/promises';
async function main(){
 const b=initialRequest.bounds;
 const all=await Promise.allSettled([
  loadDEM(b,console.log).then(g=>({dem:{nx:g.nx,ny:g.ny,valid:g.elev.filter(Number.isFinite).length,range:[Math.min(...g.elev.slice(0,1000).filter(Number.isFinite)),Math.max(...g.elev.slice(0,1000).filter(Number.isFinite))]}})),
  loadERA5(b,console.log).then(c=>({era5:{hours:c.hours,coverage:c.coverage,ghi:c.solar.ghi,wind:c.wind.mean100}})),
  Promise.all([7,8].map(async id=>{const d=await loadArcGISLayer(id,b);await writeFile(`.data/parcel-${id}.json`,JSON.stringify(d));return {id,count:d.data.features.length,dsedn:d.data.features.filter(f=>f.properties?.dsedn).length};})),
 ]);console.log(JSON.stringify(all));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
