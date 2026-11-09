import test from 'node:test';
import assert from 'node:assert/strict';
import {cached} from '../lib/server/providers';
import {previewData} from '../lib/client-data';

test('concurrent preview loaders share a request and a failed provider can be retried',async()=>{
 let calls=0;let release!:(n:number)=>void;const load=()=>{calls++;return new Promise<number>(resolve=>{release=resolve;});};
 const a=cached('map-concurrent-test',load),b=cached('map-concurrent-test',load);
 assert.equal(calls,1);release(12);assert.deepEqual(await Promise.all([a,b]),[12,12]);
 assert.equal(await cached('map-concurrent-test',load),12);assert.equal(calls,1);
 await assert.rejects(cached('map-retry-test',async()=>{throw Error('Provider unavailable');}));
 assert.equal(await cached('map-retry-test',async()=>24),24);
});

test('map previews reuse reads, while refresh and independent layer parts can finish separately',async t=>{
 const requests:{url:string;body:unknown;resolve:(r:Response)=>void}[]=[];
 t.mock.method(globalThis,'fetch',(url:string,init?:RequestInit)=>new Promise<Response>(resolve=>requests.push({url,body:JSON.parse(String(init?.body??'null')),resolve})));
 const river=previewData('/test-layers',{part:'river'}),riverAgain=previewData('/test-layers',{part:'river'}),roads=previewData('/test-layers',{part:'transport'});
 assert.equal(requests.length,2);assert.equal(river,riverAgain);
 requests[1].resolve(Response.json({roads:3}));assert.deepEqual(await roads,{roads:3});
 requests[0].resolve(Response.json({river:1}));await river;
 assert.deepEqual(await previewData('/test-layers',{part:'river'}),{river:1});assert.equal(requests.length,2);
 const refreshed=previewData('/test-layers',{part:'river'},true);assert.equal(requests.length,3);
 requests[2].resolve(Response.json({river:2}));assert.deepEqual(await refreshed,{river:2});
});

test('a stale failed preview must not evict a successfully refreshed copy',async t=>{
 const resolvers:((r:Response)=>void)[]=[];
 t.mock.method(globalThis,'fetch',()=>new Promise<Response>(resolve=>resolvers.push(resolve)));
 const stale=previewData('/test-refresh-race'),fresh=previewData('/test-refresh-race',undefined,true);
 const rejected=assert.rejects(stale,/Unavailable/);
 resolvers[1](Response.json({version:2}));await fresh;
 resolvers[0](Response.json({error:'Unavailable'},{status:502}));await rejected;
 assert.deepEqual(await previewData('/test-refresh-race'),{version:2});assert.equal(resolvers.length,2);
});
