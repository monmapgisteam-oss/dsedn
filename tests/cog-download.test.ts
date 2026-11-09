import test from 'node:test';
import assert from 'node:assert/strict';
import {cogBytes} from '../lib/server/cog-download';

test('COG range transfers preserve every byte including the final partial chunk',async t=>{
 const expected=Buffer.alloc(2*1024*1024+17);for(let i=0;i<expected.length;i++)expected[i]=i%251;let ranges=0;
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
  if(init.method==='HEAD')return new Response(null,{headers:{'content-length':String(expected.length),etag:'fixture'}});
  const headers=new Headers(init.headers);assert.equal(headers.get('If-Match'),'fixture');const [start,end]=headers.get('Range')!.slice(6).split('-').map(Number);ranges++;
  return new Response(expected.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${expected.length}`,etag:'fixture'}});
 });
 assert.deepEqual(await cogBytes('https://example.invalid/dem.tif'),expected);assert.equal(ranges,3);
});

test('truncated or ignored ranges are rejected rather than cached as a valid DEM',async t=>{
 let status=206;
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>init.method==='HEAD'?new Response(null,{headers:{'content-length':'20',etag:'fixture'}}):new Response(new Uint8Array(3),{status,headers:{'content-range':'bytes 0-19/20',etag:'fixture'}}));
 await assert.rejects(cogBytes('https://example.invalid/dem.tif'),/байт дутуу/);status=200;
 await assert.rejects(cogBytes('https://example.invalid/dem.tif'),/бүрэн биш/);
});
