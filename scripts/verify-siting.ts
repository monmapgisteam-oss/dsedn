import {writeFile} from 'node:fs/promises';
import {initialRequest,type SiteRun} from '../lib/siting';
async function main(){
 const scenarios=process.argv.includes('--all')?[{name:'area20',patch:{}},{name:'count200',patch:{mode:'count',value:200}},{name:'count200-no-parcels',patch:{mode:'count',value:200,parcels:false}},{name:'solar100mw',patch:{mode:'capacity',value:100}},{name:'wind30',patch:{technology:'wind',mode:'count',value:30,maxSlope:15,settlementSetbackM:500}}]:[{name:'area20',patch:{}}];
 for(const s of scenarios){
  console.time(s.name);const response=await fetch('http://127.0.0.1:3000/api/siting',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...initialRequest,...s.patch})});
  if(!response.ok)throw new Error(await response.text());
  const text=await response.text(),events=text.trim().split('\n').map(line=>JSON.parse(line));
  const error=events.find(e=>e.type==='error');if(error)throw new Error(error.message);
  const result=events.find(e=>e.type==='result')?.result as SiteRun;if(!result)throw new Error('Missing result');
  await writeFile(`.data/verified-${s.name}.json`,JSON.stringify(result));
  console.timeEnd(s.name);console.log(JSON.stringify({scenario:s.name,examined:result.examined,rejected:result.rejected,candidates:result.candidates.length,first:result.candidates[0]?{...result.candidates[0].properties,metrics:result.candidates[0].metrics}:null,parcels:result.layers.parcels.features.length,dsedn:result.layers.parcels.features.filter(f=>f.properties?.dsedn).length}));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
