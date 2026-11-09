import {randomUUID} from 'node:crypto';
import {writeFile,rename,unlink} from 'node:fs/promises';

/** Public COGs support byte ranges. Bound each transfer and verify completeness before caching. */
export async function cogBytes(url:string):Promise<Buffer>{
 const head=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});
 if(!head.ok)throw new Error(`Copernicus DEM metadata HTTP ${head.status}.`);
 const size=Number(head.headers.get('content-length')),etag=head.headers.get('etag');
 if(!Number.isSafeInteger(size)||size<8||size>128*1024*1024)throw new Error('Copernicus DEM файлын хэмжээ баталгаажаагүй.');
 const chunk=1024*1024,parts:Buffer[]=[];
 for(let batch=0;batch<size;batch+=chunk*4){
  const offsets=Array.from({length:4},(_,i)=>batch+i*chunk).filter(start=>start<size);
  parts.push(...await Promise.all(offsets.map(async start=>{
   const end=Math.min(size-1,start+chunk-1);
   const response=await fetch(url,{headers:{Range:`bytes=${start}-${end}`,...(etag?{'If-Match':etag}:{})},signal:AbortSignal.timeout(30000)});
   if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${size}`||etag&&response.headers.get('etag')!==etag)throw new Error(`Copernicus DEM хэсэгчилсэн хариу бүрэн биш (HTTP ${response.status}).`);
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==end-start+1)throw new Error('Copernicus DEM байт дутуу. Хэсэгчилсэн файл ашиглаагүй.');return bytes;
  })));
 }
 return Buffer.concat(parts,size);
}
const downloads=new Map<string,Promise<void>>();
export async function downloadCog(url:string,path:string){
 const active=downloads.get(path);if(active)return active;
 const task=(async()=>{
  const temporary=path+'.'+randomUUID()+'.part';
  try{await writeFile(temporary,await cogBytes(url));await rename(temporary,path);}
  finally{await unlink(temporary).catch(()=>{});}
 })();downloads.set(path,task);
 try{await task;}finally{downloads.delete(path);}
}
