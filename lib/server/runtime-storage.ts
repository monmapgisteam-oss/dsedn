import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {get,put} from '@vercel/blob';

const compress=promisify(gzip),decompress=promisify(gunzip);
export const onVercel=()=>process.env.VERCEL==='1';
export const cacheDirectory=()=>join(onVercel()?join(tmpdir(),'dsedn-renewable'):join(process.cwd(),'.data'),'siting');
const runDirectory=()=>join(process.cwd(),'.data','runs');
function storageKey(name:string){
 if(!/^[a-zA-Z0-9.-]+\.json$/.test(name))throw new Error('Invalid result storage key.');
 return 'runs/'+name+'.gz';
}
function assertBlob(){
 if(!process.env.BLOB_STORE_ID&&!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Vercel private Blob storage is not connected.');
}
// Local snapshots keep their existing paths. Cloud snapshots never rely on ephemeral /tmp.
export async function writeStoredJson(name:string,value:unknown){
 const key=storageKey(name),json=JSON.stringify(value);
 if(onVercel()){
  assertBlob();
  await put(key,await compress(json),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/gzip'});
 }else{
  await mkdir(runDirectory(),{recursive:true});
  await writeFile(join(runDirectory(),name),json);
 }
}
export async function readStoredJson<T>(name:string):Promise<T>{
 const key=storageKey(name);
 if(!onVercel())return JSON.parse(await readFile(join(runDirectory(),name),'utf8')) as T;
 assertBlob();
 const blob=await get(key,{access:'private',useCache:false});
 if(!blob||blob.statusCode!==200)throw new Error('Stored result not found.');
 return JSON.parse((await decompress(Buffer.from(await new Response(blob.stream).arrayBuffer()))).toString('utf8')) as T;
}
export async function readReferenceJson<T>(name:'mongolia-context'|'mongolia-logistics'):Promise<T>{
 const packaged=async()=>JSON.parse((await decompress(await readFile(join(process.cwd(),'runtime-data',name+'.json.gz')))).toString('utf8')) as T;
 if(onVercel())return packaged();
 // A fresh checkout has no prepared `.data` extract; the committed packaged copy holds the same features.
 try{return JSON.parse(await readFile(join(process.cwd(),'.data',name+'.json'),'utf8')) as T;}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return packaged();}
}
