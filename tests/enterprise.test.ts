import test from 'node:test';
import assert from 'node:assert/strict';
import {portalIdentity,rememberRun,saveEnterprise} from '../lib/server/results';
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
test('save uses renewable folder, private access, verifies receipt and retry does not create a duplicate',async t=>{
 let added=0;const r=await rememberRun(run());
 t.mock.method(globalThis,'fetch',async(url:unknown,init:RequestInit)=>{
  assert.ok(String(url).startsWith('https://gis.selbecity.mn/geoportal/sharing/rest/'));assert.equal(init.redirect,'error');const b=init.body as URLSearchParams;assert.equal(b.get('token'),'test-token');
  if(String(url).endsWith('/community/self'))return Response.json({username:'test-user'});
  if(String(url).endsWith('/content/users/test-user'))return Response.json({folders:[{id:'folder123',title:'renewable'}]});
  if(String(url).endsWith('/folder123/addItem')){added++;assert.equal(b.get('access'),'private');assert.equal(b.get('type'),'Feature Collection');assert.equal(JSON.parse(b.get('text')!).layers.length,4);return Response.json({success:true,id:'a'.repeat(32)});}
  if(String(url).endsWith('/content/items/'+'a'.repeat(32)))return Response.json({type:'Feature Collection',access:'private'});
  throw new Error('Unexpected portal request');
 });
 const saved=await saveEnterprise(r,'Test renewable','test-token');assert.equal(saved.folder,'renewable');assert.match(saved.url,/geoportal\/home\/item/);await saveEnterprise(r,'Test renewable','test-token');assert.equal(added,1);
});
