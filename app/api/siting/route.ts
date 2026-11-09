import {validateRequest,type SiteRequest} from '@/lib/siting';
import {searchWholeArea} from '@/lib/server/whole-area-search';
import {rememberRun} from '@/lib/server/results';
import {onVercel} from '@/lib/server/runtime-storage';

export const maxDuration=300;
export async function POST(request:Request){
 let input:SiteRequest;
 try{input=await request.json();input.regionId=0;validateRequest(input);}catch(e){return Response.json({error:e instanceof Error?e.message:'Хүсэлт буруу.'},{status:400});}
 const abort=new AbortController(),signal=AbortSignal.any([request.signal,abort.signal]);
 const stream=new ReadableStream({async start(controller){
  const encoder=new TextEncoder();let closed=false;
  const send=(data:unknown)=>{if(!closed&&!signal.aborted){const bytes=encoder.encode(JSON.stringify(data)+'\n');for(let offset=0;offset<bytes.length;offset+=64*1024)controller.enqueue(bytes.subarray(offset,offset+64*1024));}};
  const timer=onVercel()?setTimeout(()=>{
   send({type:'error',message:'Vercel-ийн 5 минутын тооцооллын хязгаарт хүрлээ. Үнэлгээ дуусаагүй тул үр дүн гаргаагүй. Урт хугацааны тооцооллыг local сервер дээр ажиллуулна уу.'});
   closed=true;controller.close();abort.abort();
  },275000):undefined;
  try{
   const result=await rememberRun(await searchWholeArea(input,message=>send({type:'progress',message}),signal));
   send({type:'result',result});
  }catch(e){send({type:'error',message:e instanceof Error?e.message:'Тооцоолол амжилтгүй.'});}
  finally{clearTimeout(timer);if(!closed&&!signal.aborted)controller.close();}
 },cancel(){abort.abort();}});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
