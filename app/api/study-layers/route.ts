import {loadRegions,loadRivers,loadWholeStudy} from '@/lib/server/study-layers';
import {loadTransport} from '@/lib/server/transport';
import {scopeName} from '@/lib/search-scope';
import {jsonResponse} from '@/lib/server/json-response';
import {requireApiSession} from '@/lib/server/auth';
export async function GET(){const session=await requireApiSession();if(session instanceof Response)return session;try{const layers=await Promise.all([loadRegions(5),loadRegions(6)]);return jsonResponse({layers});}catch(e){return Response.json({error:e instanceof Error?e.message:'Хил татагдсангүй.'},{status:502});}}
export async function POST(request:Request){
 const session=await requireApiSession();if(session instanceof Response)return session;
 try{const r=await request.json();if(![5,6].includes(r.regionLayer)||!Number.isFinite(r.riverSetbackM)||r.riverSetbackM<1||r.riverSetbackM>3000)throw new Error('Бүс эсвэл голын хамгаалах зай буруу.');
  const scope=await loadWholeStudy(r.regionLayer),regions=scope.regions,b=scope.bounds;
  if(r.part){
   const loaders={study:async()=>({...regions,data:{type:'FeatureCollection',features:[{...scope.mask,properties:{name:scopeName(r.regionLayer),layer:r.regionLayer,regionId:0}}]}}),river:()=>loadRivers(b,r.riverSetbackM),transport:()=>loadTransport(b)};
   if(!Object.hasOwn(loaders,r.part))throw new Error('Давхаргын төрөл буруу.');
   try{return jsonResponse({[r.part]:{data:await loaders[r.part as keyof typeof loaders]()}});}catch(e){return Response.json({error:e instanceof Error?e.message:'Давхарга татагдсангүй.'},{status:502});}
  }
  const results=await Promise.allSettled([Promise.resolve({...regions,data:{type:'FeatureCollection',features:[{...scope.mask,properties:{name:scopeName(r.regionLayer),layer:r.regionLayer,regionId:0}}]}}),loadRivers(b,r.riverSetbackM),loadTransport(b)]);
  return jsonResponse(Object.fromEntries(results.map((r,i)=>[['study','river','transport'][i],r.status==='fulfilled'?{data:r.value}:{error:r.reason instanceof Error?r.reason.message:'Давхарга татагдсангүй.'}])));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Хүсэлт буруу.'},{status:400});}
}
