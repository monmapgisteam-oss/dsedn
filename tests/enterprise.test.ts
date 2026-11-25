import test from 'node:test';
import assert from 'node:assert/strict';
import {listSaved,loadSaved,portalIdentity,rememberRun,saveEnterprise} from '../lib/server/results';
import {enterpriseResult} from '../lib/enterprise-result';
import {initialRequest,type SiteRun} from '../lib/siting';
import {featureCollection,bboxPolygon,point} from '@turf/turf';
const empty=featureCollection([]);
const run=():SiteRun=>({request:initialRequest,createdAt:'2026-11-04T00:00:00Z',screening:featureCollection([point([106,49.5],{id:'SCAN-1',status:'high',score:80})]),candidates:[],examined:1,rejected:{},searchStepM:100,sources:[],layers:{study:featureCollection([bboxPolygon(initialRequest.bounds)]),grid:empty,roads:empty,parcels:empty,context:empty,centres:empty,nationalRoads:empty,soums:empty,roadProjects:empty},climate:{model:'ERA5',start:'2021-01-01',end:'2025-12-31',lat:49.5,lon:106,hours:43824,mean100:6,ghi:1600,alpha:.14,direction:0,monthlyWind:[],monthlySolar:[],windRose:[]},warnings:[]});
test('read-only API key is not mistaken for a portal user or write permission',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({appInfo:{appOwner:'owner',privileges:['portal:app:access:item:source']}}));
 await assert.rejects(portalIdentity('test-key'),/хэрэглэгчийн эрхгүй/);
});

test('Portal user identity checks preserve the referrer bound to the signed-in token',async t=>{
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
  assert.equal(new Headers(init.headers).get('referer'),'https://renewable.twincore.mn');
  return Response.json({username:'portal-user'});
 });
 assert.equal(await portalIdentity('test-user-token','https://renewable.twincore.mn'),'portal-user');
});
test('Enterprise payload contains native map layers, chosen settings and no source cadastral data',()=>{
 const r=run();r.layers.parcels=featureCollection([point([106,49.5],{owner_name:'do-not-export'})]);const data=enterpriseResult(r);
 assert.equal(data.layers.length,4);assert.equal(data.layers[0].featureSet.features[0].geometry.x,106);assert.equal(data.layers[0].featureSet.features[0].attributes.score,80);assert.deepEqual(data.dsednAnalysis.request.weights,initialRequest.weights);assert.equal(JSON.stringify(data).includes('do-not-export'),false);
});

test('derived land overlap is included as a separate polygon layer in Enterprise results',()=>{
 const r=run();r.layers.parcelOverlap=featureCollection([bboxPolygon(initialRequest.bounds,{properties:{siteId:'SITE-01',category:'other',areaM2:100,percent:25}})]);const d=enterpriseResult(r);
 assert.equal(d.layers.length,5);assert.equal(d.layers[4].layerDefinition.geometryType,'esriGeometryPolygon');assert.equal(d.layers[4].featureSet.features[0].attributes.category,'other');assert.equal(d.layers[4].featureSet.features[0].attributes.areaM2,100);
});

test('whole-layer coverage failures and regional climate references survive Enterprise export',()=>{
 const r=run();r.coverage={mode:'whole-layer',regionLayer:5,sourceFeatures:5,areaKm2:51986,tiles:627,assessed:105,excludedByCentre:359,excludedByInfrastructure:162,failed:[{tile:'T806',message:'Source timeout'}],complete:false};r.climates={T1:r.climate};
 const payload=JSON.parse(JSON.stringify(enterpriseResult(r)));
 assert.deepEqual(payload.dsednAnalysis.coverage,r.coverage);assert.equal(payload.dsednAnalysis.coverage.complete,false);assert.deepEqual(payload.dsednAnalysis.climates,r.climates);
});
// A minimal in-memory Portal: one user, a `renewable` folder, Feature Collection items and their typeKeywords.
// Like ArcGIS Enterprise 12.1, it refuses resources on Feature Collection items.
function fakePortal(t:{mock:{method:(o:object,k:string,f:(...a:never[])=>unknown)=>unknown}},opts:{owner?:()=>string}={}){
 const state={added:0,deleted:0,items:new Map<string,{title:string;tags:string;typeKeywords:string[];text:string}>()};
 const main=()=>[...state.items].filter(([,i])=>!i.typeKeywords.includes('DSEDN Run Data'));
 t.mock.method(globalThis,'fetch',async(url:unknown,init:RequestInit)=>{
  const u=String(url);assert.ok(u.startsWith('https://gis.selbecity.mn/geoportal/sharing/rest/'));assert.equal(init.redirect,'error');
  const b=init.body as URLSearchParams;assert.ok(b instanceof URLSearchParams,'no multipart uploads');assert.equal(b.get('token'),'test-token');
  if(u.endsWith('/community/self'))return Response.json({username:'test-user'});
  if(u.endsWith('/content/users/test-user'))return Response.json({folders:[{id:'folder123',title:'renewable'}]});
  if(u.endsWith('/folder123/addItem')){
   assert.equal(b.get('access'),'private');assert.equal(b.get('type'),'Feature Collection');
   assert.ok(b.get('text')!.length<=4_500_000,'each request stays well below the size Portal rejected');
   const id=String(++state.added).padStart(32,'a');state.items.set(id,{title:b.get('title')!,tags:b.get('tags')!,typeKeywords:b.get('typeKeywords')!.split(','),text:b.get('text')!});
   return Response.json({success:true,id});
  }
  if(u.endsWith('/content/users/test-user/folder123'))return Response.json({items:[...state.items].map(([id,i],n)=>({id,title:i.title,type:'Feature Collection',modified:n,tags:i.tags.split(','),typeKeywords:i.typeKeywords})),nextStart:-1});
  const m=/\/content\/(?:users\/test-user\/)?items\/([a-f0-9]{32})(?:\/(.*))?$/.exec(u);const item=m&&state.items.get(m[1]);
  if(!m||!item)throw new Error('Unexpected portal request '+u);
  const rest=m[2]??'';
  if(rest==='')return Response.json({type:'Feature Collection',access:'private',owner:opts.owner?.()??'test-user',title:item.title,created:1,ownerFolder:'folder123',typeKeywords:item.typeKeywords});
  if(rest==='addResources')return Response.json({error:{code:400,message:'AddResources not supported for this item type.'}});
  if(rest==='update'){item.typeKeywords=b.get('typeKeywords')!.split(',');return Response.json({success:true});}
  if(rest==='delete'){state.items.delete(m[1]);state.deleted++;return Response.json({success:true});}
  if(rest==='data')return new Response(item.text,{headers:{'Content-Type':'application/json'}});
  throw new Error('Unexpected portal request '+u);
 });
 return {state,main};
}
test('save uses renewable folder, private access, verifies receipt and retry does not create a duplicate',async t=>{
 const r=await rememberRun(run()),{main}=fakePortal(t);
 const saved=await saveEnterprise(r,'Test renewable','test-token');assert.equal(saved.folder,'renewable');assert.match(saved.url,/geoportal\/home\/item/);
 await saveEnterprise(r,'Test renewable','test-token');assert.equal(main().length,1);
 assert.equal(JSON.parse(main()[0][1].text).layers.length,4,'item data stays a map-viewable Feature Collection');
});

test('a saved model keeps the whole run in companion items and reopens it without recalculation, only for its owner',async t=>{
 const original=await rememberRun(run());let owner='test-user';const {state}=fakePortal(t,{owner:()=>owner});
 const saved=await saveEnterprise(original,'Нар 1','test-token'),item=state.items.get(saved.itemId)!;
 assert.ok(item.typeKeywords.includes('DSEDN Run'));assert.match(item.tags,/solar/);
 assert.ok(!JSON.parse(item.text).dsednRun,'the run is not inside the main item data');
 assert.equal(state.items.size,2,'one companion item for a small run');
 const list=await listSaved('test-token');assert.deepEqual(list.map(i=>[i.title,i.loadable,i.technology]),[['Нар 1',true,'solar']],'companions are not listed');
 const opened=await loadSaved(saved.itemId,'test-token');
 assert.equal(opened.title,'Нар 1');assert.equal(opened.run.id,original.id);assert.deepEqual(opened.run.screening,original.screening);assert.deepEqual(opened.run.request,original.request);
 owner='someone-else';await assert.rejects(loadSaved(saved.itemId,'test-token'),/таны хадгалсан/);
 await assert.rejects(loadSaved('../x','test-token'),/ID буруу/);
});

test('a save interrupted before the run was attached is completed on retry instead of duplicated',async t=>{
 const r=await rememberRun(run()),{state,main}=fakePortal(t);let calls=0;
 const fetchMock=globalThis.fetch;
 // The second addItem (the companion) fails once.
 t.mock.method(globalThis,'fetch',async(url:unknown,init:RequestInit)=>{if(String(url).endsWith('/addItem')&&++calls===2)return new Response('',{status:500});return fetchMock(url as string,init);});
 await assert.rejects(saveEnterprise(r,'Нар 2','test-token'),/HTTP 500 \(addItem\)/);
 const saved=await saveEnterprise(r,'Нар 2','test-token');
 assert.equal(main().length,1);assert.ok(state.items.get(saved.itemId)!.typeKeywords.includes('DSEDN Run'));
 assert.equal((await loadSaved(saved.itemId,'test-token')).run.id,r.id);
});