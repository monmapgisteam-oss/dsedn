import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cacheDirectory,readStoredJson,writeStoredJson} from '../lib/server/runtime-storage';
import {jsonResponse} from '../lib/server/json-response';

test('large streamed GIS JSON preserves Mongolian text and every feature',async()=>{
 const data={name:'Дархан · Өмчлөл',features:Array.from({length:80000},(_,id)=>({id,name:'Цахилгаан дамжуулах агаарын шугам'}))};
 const response=jsonResponse(data),reader=response.body!.getReader(),parts:Uint8Array[]=[];
 while(true){const p=await reader.read();if(p.done)break;assert.ok(p.value.length<=65536);parts.push(p.value);}
 const bytes=Buffer.concat(parts);assert.ok(bytes.length>4.5*1024*1024);assert.deepEqual(JSON.parse(bytes.toString('utf8')),data);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('local result storage keeps round-trip compatibility and rejects path traversal',async()=>{
 const name=randomUUID()+'.json',value={name:'Тохиромжтой байдал',score:0,ids:[0,4],complete:false};
 try{await writeStoredJson(name,value);assert.deepEqual(await readStoredJson(name),value);}finally{await unlink(join(process.cwd(),'.data','runs',name)).catch(()=>{});}
 await assert.rejects(writeStoredJson('../secret.json',value),/Invalid result storage key/);
 await assert.rejects(readStoredJson('../secret.json'),/Invalid result storage key/);
});

test('Vercel uses temporary terrain cache and fails closed without durable storage',async()=>{
 const previous=process.env.VERCEL,store=process.env.BLOB_STORE_ID,token=process.env.BLOB_READ_WRITE_TOKEN;
 try{
  process.env.VERCEL='1';delete process.env.BLOB_STORE_ID;delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.equal(cacheDirectory(),join(tmpdir(),'dsedn-renewable','siting'));
  await assert.rejects(writeStoredJson('test.json',{}),/private Blob storage is not connected/);
 }finally{
  for(const [key,value] of [['VERCEL',previous],['BLOB_STORE_ID',store],['BLOB_READ_WRITE_TOKEN',token]])if(value===undefined)delete process.env[key!];else process.env[key!]=value;
 }
});
