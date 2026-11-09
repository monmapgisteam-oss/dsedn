import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArcGISLayer } from '../lib/server/arcgis';

test('ArcGIS paginates all IDs, requests safe fields, and never returns credentials',async t=>{
  const previous=process.env.ARCGIS_API_KEY;process.env.ARCGIS_API_KEY='synthetic-test-credential';
  t.after(()=>{if(previous===undefined)delete process.env.ARCGIS_API_KEY;else process.env.ARCGIS_API_KEY=previous;});
  const ids=Array.from({length:1001},(_,i)=>i+1);let pages=0;
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body=init.body as URLSearchParams;
    assert.equal(body.get('token'),'synthetic-test-credential');assert.equal(init.redirect,'error');
    if(body.get('returnIdsOnly'))return Response.json({objectIds:ids});
    pages++;assert.equal(body.get('outSR'),'4326');assert.equal(body.get('outFields'),'objectid,air_line_name,voltage_level');
    return Response.json({type:'FeatureCollection',features:body.get('objectIds')!.split(',').map(id=>({type:'Feature',properties:{objectid:Number(id)},geometry:{type:'LineString',coordinates:[[105.9,49.4],[105.91,49.41]]}}))});
  });
  const result=await loadArcGISLayer(0,[105.9,49.4,106,49.5]);
  assert.equal(result.data.features.length,1001);assert.equal(pages,3);assert.ok(!JSON.stringify(result).includes('synthetic-test-credential'));
});
test('ArcGIS refuses an incomplete page and disabled branch layers',async t=>{
  const previous=process.env.ARCGIS_API_KEY;process.env.ARCGIS_API_KEY='synthetic-test-credential';
  t.after(()=>{if(previous===undefined)delete process.env.ARCGIS_API_KEY;else process.env.ARCGIS_API_KEY=previous;});
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>Response.json((init.body as URLSearchParams).get('returnIdsOnly')?{objectIds:[1,2]}:{type:'FeatureCollection',features:[]}));
  await assert.rejects(loadArcGISLayer(0,[105.9,49.4,106,49.5]),/incomplete/);
  await assert.rejects(loadArcGISLayer(5,[105.9,49.4,106,49.5]),/not enabled/);
  await assert.rejects(loadArcGISLayer(7,[105.9,49.4,106,49.5]),/incomplete/);
});

test('parcel classification retains DSEDN land and strips all owner personal fields',async t=>{
  const previous=process.env.ARCGIS_API_KEY;process.env.ARCGIS_API_KEY='synthetic-test-credential';
  t.after(()=>{if(previous===undefined)delete process.env.ARCGIS_API_KEY;else process.env.ARCGIS_API_KEY=previous;});
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body=init.body as URLSearchParams;
    if(body.get('returnIdsOnly'))return Response.json({objectIds:[1,2,3]});
    assert.equal(body.get('outFields'),'objectid,possession,possessi_1,possessi_2');
    return Response.json({type:'FeatureCollection',features:[
      {type:'Feature',geometry:{type:'Polygon',coordinates:[]},properties:{objectid:1,possessi_1:'Дархан Сэлэнгийн цахилгаан түгээх сүлжээ ХК',possessi_2:'private-identifier'}},
      {type:'Feature',geometry:{type:'Polygon',coordinates:[]},properties:{objectid:2,possessi_1:'Different Company',possession:'private-name'}},
      {type:'Feature',geometry:{type:'Polygon',coordinates:[]},properties:{objectid:3,possessi_1:null}},
    ]});
  });
  const d=await loadArcGISLayer(8,[105.9,49.4,106,49.5]);
  assert.deepEqual(d.data.features.map(f=>f.properties?.dsedn),[true,false,false]);
  assert.ok(!JSON.stringify(d).includes('private-'));
  assert.deepEqual(Object.keys(d.data.features[0].properties!).sort(),['dsedn','layer','objectid','tenure']);
});

test('canonical cable /4 display uses a technical allowlist and geometry length, never another export or owner fields',async t=>{
 const previous=process.env.ARCGIS_API_KEY;process.env.ARCGIS_API_KEY='synthetic-test-credential';
 t.after(()=>{if(previous===undefined)delete process.env.ARCGIS_API_KEY;else process.env.ARCGIS_API_KEY=previous;});
 const urls:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  urls.push(url);const body=init.body as URLSearchParams;
  if(!url.endsWith('/query'))return Response.json({fields:[{name:'objectid'},{name:'voltage_level_cable',alias:'Хүчдэл'},{name:'length_km'},{name:'owner_name',alias:'Private'}]});
  if(body.get('returnIdsOnly'))return Response.json({objectIds:[1]});
  assert.equal(body.get('outFields'),'objectid,voltage_level_cable,length_km');
  return Response.json({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[106,49.5],[106.01,49.5]]},properties:{objectid:1,voltage_level_cable:3,length_km:123456,owner_name:'private-person'}}]});
 });
 const result=await loadArcGISLayer(4,[105.99,49.49,106.02,49.51],true),p=result.data.features[0].properties!;
 assert.ok(urls.every(url=>url.includes('/FeatureServer/4')));assert.equal(p.sourceLayer,4);
 assert.ok(p.geometryLengthKm>.7&&p.geometryLengthKm<.75);assert.equal(p.length_km,123456);
 assert.equal(p.display.voltage_level_cable.value,'3 · эх утга');assert.ok(!JSON.stringify(result).includes('private-person'));
 await assert.rejects(loadArcGISLayer(2,[105.99,49.49,106.02,49.51],true),/not enabled/);
 await assert.rejects(loadArcGISLayer(3,[105.99,49.49,106.02,49.51],true),/not enabled/);
});
