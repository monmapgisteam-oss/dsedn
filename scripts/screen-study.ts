// Reproduce the initial custom-area screen using the same API and engine as the UI.
import { mkdir, writeFile } from 'node:fs/promises';
import { featureCollection } from '@turf/turf';
import { analyze } from '../lib/analysis';
import { makeCells } from '../lib/geo';
import { generateLayout } from '../lib/planning';
import { defaultSettings, type Bounds, type LayerData, type Resource, type Terrain } from '../lib/types';

async function main() {
  const bounds:Bounds=[105.79,49.39,106.065,49.57], meshKm=2;
  async function get<T>(kind:string,extra:Record<string,unknown>={}):Promise<T>{
    const response=await fetch('http://127.0.0.1:3000/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,bounds,size:meshKm,...extra}),signal:AbortSignal.timeout(180000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
  }
  const [overhead,cable,logistics,resource,terrain]=await Promise.all([
    get<LayerData>('arcgis',{layer:0}),get<LayerData>('arcgis',{layer:2}),
    get<LayerData>('logistics'),get<Resource>('resource'),get<Terrain>('terrain'),
  ]);
  const inputs={grid:featureCollection([...overhead.data.features,...cable.data.features]),roads:{...logistics.data,features:logistics.data.features.filter(f=>!f.properties?.railway)},resource,terrain};
  const cells=makeCells(bounds,meshKm);
  const scenarios=(['solar','wind'] as const).map(technology=>{
    const settings=defaultSettings(technology),results=analyze(cells,settings,inputs);
    const ranked=results.filter(r=>r.properties.score!==null).sort((a,b)=>b.properties.score!-a.properties.score!);
    const high=results.filter(r=>r.properties.status==='high');
    const shortlist=ranked.slice(0,2).map(c=>c.properties.id);
    return {technology,settings,results:featureCollection(results),shortlist,concept:generateLayout(results,shortlist,technology,20),summary:{cells:results.length,scored:ranked.length,excluded:results.filter(r=>r.properties.status==='excluded').length,unassessed:results.filter(r=>r.properties.status==='unassessed').length,highCells:high.length,highGrossAreaKm2:high.reduce((s,r)=>s+r.properties.areaKm2,0),grossCapacityScenarioMw:high.reduce((s,r)=>s+(r.properties.capacityMw??0),0),topCell:ranked[0]?.properties.id,topScore:ranked[0]?.properties.score}};
  });
  const run={model:'dsedn-screening-1.0',schemaVersion:1,generatedAt:new Date().toISOString(),bounds,meshKm,cells,inputs,logistics,sources:[overhead.provenance,cable.provenance,logistics.provenance,resource.provenance,terrain.provenance],limitations:'Preliminary custom-area screening, no branch analysis. No environmental exclusions imported or reviewed. Regional resource and center-patch slope proxies. Gross capacity is a land-density scenario. Concepts are illustrative.',scenarios};
  await mkdir('.data',{recursive:true});await writeFile('.data/initial-screening.json',JSON.stringify(run,null,2));
  console.log(JSON.stringify({gridFeatures:inputs.grid.features.length,logisticsFeatures:logistics.data.features.length,solarGhiKwhM2Day:resource.solar,wind50mMs:resource.wind,scenarios:scenarios.map(s=>({technology:s.technology,...s.summary,conceptUnits:s.concept.assets.length,conceptCapacityMw:s.concept.capacityMw})),saved:'.data/initial-screening.json'},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Screening failed');process.exitCode=1;});
