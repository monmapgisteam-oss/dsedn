import test from 'node:test';
import assert from 'node:assert/strict';
import {bbox,bboxPolygon,point,lineString,featureCollection,buffer} from '@turf/turf';
import {loadTransportLayer} from '../lib/server/transport';
import {normalizeTransportFeature,centreDisplayName,nearestCentre,roadAccessEligible,type TransportData} from '../lib/transport';
import {findSites} from '../lib/server/site-engine';
import {initialRequest} from '../lib/siting';
import type {Collection,LayerData,Bounds} from '../lib/types';
import type {Climate} from '../lib/physics/era5';
import type {ElevationGrid} from '../lib/server/site-data';

test('public transport loader paginates completely, reprojects, buffers and never forwards a credential',async t=>{
 const ids=Array.from({length:1001},(_,i)=>i+1);let pages=0;
 t.mock.method(globalThis,'fetch',async(url:unknown,init:RequestInit)=>{
  const body=init.body as URLSearchParams;assert.equal(body.has('token'),false);assert.equal(init.redirect,'error');assert.ok(String(url).startsWith('https://services.arcgis.com/HJzgwvlNIXssnQar/'));
  if(!String(url).endsWith('/query'))return Response.json({name:'Centres',fields:['FID','NAME','CODE'].map(name=>({name})),editingInfo:{dataLastEditDate:1661405329841}});
  if(body.get('returnIdsOnly')){const box=body.get('geometry')!.split(',').map(Number);assert.ok(box[0]<105.8&&box[2]>106.1);assert.equal(body.get('inSR'),'4326');return Response.json({objectIds:ids});}
  pages++;assert.equal(body.get('outSR'),'4326');assert.equal(body.get('outFields'),'FID,NAME,CODE');
  return Response.json(featureCollection(body.get('objectIds')!.split(',').map(id=>point([106,49.5],{FID:Number(id),NAME:'Centre',CODE:'sum'}))));
 });
 const d=await loadTransportLayer(8,[105.9,49.4,106,49.5]);assert.equal(d.data.features.length,1001);assert.equal(pages,3);assert.equal(d.data.features[0].properties?.kind,'centre');assert.match(d.provenance.detail,/2022/);
});
test('duplicate or missing transport features fail closed instead of accepting a partial query',async t=>{
 t.mock.method(globalThis,'fetch',async(url:unknown,init:RequestInit)=>{
  const body=init.body as URLSearchParams;
  if(!String(url).endsWith('/query'))return Response.json({fields:['FID','NAME','CODE'].map(name=>({name}))});
  if(body.get('returnIdsOnly'))return Response.json({objectIds:[1,2]});
  return Response.json(featureCollection([point([106,49.5],{FID:1}),point([106,49.5],{FID:1})]));
 });
 await assert.rejects(loadTransportLayer(8,[105.9,49.4,106,49.5]),/ID/);
 await assert.rejects(loadTransportLayer(6,[105.9,49.4,106,49.5]),/Unsupported/);
});
test('road status and feature roles are preserved without promoting project endpoints or soum polygons to residences',()=>{
 assert.equal(roadAccessEligible('Хаасан'),false);assert.equal(roadAccessEligible('Ашиглагтанд ороогүй'),false);assert.equal(roadAccessEligible('Хэвийн'),true);
 const road=normalizeTransportFeature(9,lineString([[106,49.5],[106.01,49.5]],{FID:3,Roadstatus:'Хаасан'}));assert.equal(road.properties?.accessEligible,false);
 assert.equal(normalizeTransportFeature(2,point([106,49.5],{OBJECTID:1})).properties?.kind,'road_project');
 assert.equal(normalizeTransportFeature(12,bboxPolygon([105,49,107,50],{properties:{FID:1,name:'Сум'}})).properties?.kind,'soum');
});
test('centre distances use the point location and missing centre names are explicitly derived',()=>{
 const centre=normalizeTransportFeature(8,point([106,49.5],{FID:1,NAME:' ',CODE:'aimag'}));
 const soums=featureCollection([normalizeTransportFeature(12,bboxPolygon([105.9,49.4,106.1,49.6],{properties:{FID:2,name:'Дархан сум',hvn_am_too:86749,density:0}}))]);
 const display=centreDisplayName(centre as ReturnType<typeof point>,soums);assert.equal(display.nameDerived,true);assert.match(display.name,/Дархан/);
 centre.properties={...centre.properties,displayName:display.name,nameDerived:display.nameDerived};
 const near=nearestCentre([106,49.51],featureCollection([centre]),2)!;assert.ok(near.distanceKm>1.11&&near.distanceKm<1.12);assert.equal(nearestCentre([106,49.51],featureCollection([centre]),1),null);assert.equal(near.nameDerived,true);
});

function fixture(){
 const bounds:Bounds=[106,49.5,106.02,49.52],empty:Collection=featureCollection([]);
 const layer=(data:Collection):LayerData=>({data,provenance:{name:'Synthetic fixture',source:'fixture',retrievedAt:'2026-01-01',detail:'Test only'}});
 const transport:TransportData={
  centres:layer(featureCollection([normalizeTransportFeature(8,point([106.03,49.51],{FID:1,NAME:'Test centre',CODE:'sum'}))])),
  roads:layer(featureCollection([normalizeTransportFeature(9,lineString([[105.995,49.49],[105.995,49.54]],{FID:1,Roadstatus:'Хэвийн',ROADNAME:'Test road'}))])),
  soums:layer(featureCollection([normalizeTransportFeature(12,bboxPolygon([105.9,49.4,106.1,49.6],{properties:{FID:1,name:'Whole-study soum',hvn_am_too:1000,density:1}}))])),
  projects:layer(featureCollection([normalizeTransportFeature(2,point([106.01,49.51],{OBJECTID:1,Poin_name:'Endpoint'}))])),
 };
 const elev=new Float64Array(400*400).fill(700),slope=new Float32Array(400*400);
 const dem:ElevationGrid={lon0:105.95,lat0:49.45,mx:111195*Math.cos(49.51*Math.PI/180),my:111195,step:30,nx:400,ny:400,elev,slope,provenance:layer(empty).provenance};
 const climate:Climate={lat:49.51,lon:106.01,gridElev:700,start:'2021-01-01',end:'2025-12-31',hours:43824,fetchedAt:0,annualReady:true,coverage:1,expectedHours:43824,solarSlots:8760,model:'ERA5',raw:{latitude:49.51,longitude:106.01,elevation:700,hourly:{time:[]}},wind:{mean10:4,mean100:6,alpha:.14,k:2,A:7,tMean:5,sectors:Array.from({length:16},()=>({f:1/16,mean:6,k:2,A:7,e:1/16})),monthly:Array(12).fill(6)},ty:{ghi:Array(8760).fill(100),dni:Array(8760).fill(50),dhi:Array(8760).fill(50)},solar:{ghi:876,dni:438,dhi:438}};
 return {bounds,data:{grid:layer(featureCollection([lineString([[105.99,49.49],[105.99,49.54]])])),roads:layer(empty),parcels:layer(empty),context:layer(empty),transport,dem,climate}};
}
test('supplied centre points and national roads drive suitability while administrative polygons remain context',()=>{
 const f=fixture(),r={...initialRequest,bounds:f.bounds,mode:'count' as const,value:200,parcels:false,maxSettlementKm:3};
 const run=findSites(r,f.data);assert.ok(run.candidates.length>0);
 for(const c of run.candidates){assert.ok(c.metrics.settlementKm<=3);assert.equal(c.metrics.nearestCentre.name,'Test centre');assert.equal(c.metrics.soums[0].name,'Whole-study soum');assert.equal(c.metrics.soums[0].population,1000);assert.ok(c.properties.roadKm!==null);assert.ok(c.metrics.nationalRoadKm!==null);}
 // Move only the centre; a nearby project point and a containing soum must not satisfy the distance limit.
 f.data.transport.centres= {...f.data.transport.centres,data:featureCollection([normalizeTransportFeature(8,point([106.1,49.51],{FID:1,NAME:'Far centre',CODE:'sum'}))])};
 const far=findSites({...r,maxSettlementKm:1},f.data);assert.equal(far.candidates.length,0);assert.ok(far.rejected.settlement_proximity>0);
 f.data.transport.roads.data.features[0].properties!.accessEligible=false;
 assert.throws(()=>findSites(r,f.data),/замын өгөгдөлгүй/);
});

test('actual scope and river exclusions override even perfect grid weighting in the full engine',()=>{
 const f=fixture(),r={...initialRequest,bounds:f.bounds,mode:'count' as const,value:200,parcels:false,weights:{resource:0,grid:100,terrain:0,road:0,settlement:0}};
 const study={...f.data.grid,data:featureCollection([bboxPolygon([106,49.5,106.01,49.52])])};
 const run=findSites(r,{...f.data,study});assert.ok(run.candidates.length>0);assert.ok(run.rejected.boundary>0);assert.ok(run.screening!.features.length>0);
 for(const c of run.candidates){assert.ok(bbox(c)[2]<=106.01);assert.ok(Math.abs(c.properties.score!-100*(1-c.properties.gridKm!/r.maxGridKm))<1e-8);}
 const riverProtection=featureCollection([buffer(bboxPolygon(f.bounds),100,{units:'meters'})!]);
 const excluded=findSites(r,{...f.data,study,riverProtection});assert.equal(excluded.candidates.length,0);assert.ok(excluded.rejected.river_setback>0);assert.equal(excluded.screening!.features.every(f=>f.properties?.score===null),true);
});

test('tiled search accepts a complete footprint spanning an internal tile seam',()=>{
 const f=fixture(),r={...initialRequest,bounds:f.bounds,mode:'count' as const,value:200,parcels:false};
 const core:Bounds=[106.0099,49.5099,106.0101,49.5101];
 const run=findSites(r,{...f.data,study:{...f.data.grid,data:featureCollection([bboxPolygon(f.bounds)])}},()=>{},{bounds:core,stepM:80});
 assert.equal(run.examined,1);assert.equal(run.candidates.length,1);
 const b=bbox(run.candidates[0]);assert.ok(b[0]<core[0]&&b[2]>core[2]);
});

test('parcel overlap metrics reach the result layer without weakening cadastral exclusions',()=>{
 const f=fixture(),r={...initialRequest,regionLayer:5 as const,bounds:f.bounds,mode:'count' as const,value:200,parcels:false};
 // Extend beyond the study to avoid its sub-centimetre geographic edge tolerance in this full-cover fixture.
 const cover:[number,number,number,number]=[105.99,49.49,106.03,49.53];
 const other=bboxPolygon(cover,{properties:{dsedn:false}}),owned=bboxPolygon(cover,{properties:{dsedn:true}});
 const data={...f.data,parcels:{...f.data.parcels,data:featureCollection([other,owned,other])}};
 const compared=findSites(r,data);assert.ok(compared.candidates.length>0);assert.equal(compared.layers.parcelOverlap?.features.length,compared.candidates.length);
 for(const c of compared.candidates){const m=c.metrics.parcelOverlap!;assert.equal(m.status,'checked');if(m.status==='checked'){assert.ok(Math.abs(m.otherPct-100)<1e-6,JSON.stringify(m));assert.equal(m.dsednPct,0);}}
 const excluded=findSites({...r,parcels:true},data);assert.equal(excluded.candidates.length,0);assert.ok(excluded.rejected.parcel>0);
 const allowed=findSites({...r,parcels:true},{...data,parcels:{...data.parcels,data:featureCollection([owned])}});assert.ok(allowed.candidates.length>0);for(const c of allowed.candidates){const m=c.metrics.parcelOverlap!;assert.equal(m.status,'checked');if(m.status==='checked'){assert.equal(m.otherM2,0);assert.ok(Math.abs(m.dsednPct-100)<1e-6);}}
 const unknown=findSites({...r,regionLayer:6},f.data);assert.ok(unknown.candidates.length>0);assert.ok(unknown.candidates.every(c=>c.metrics.parcelOverlap?.status==='unavailable'));assert.equal(unknown.layers.parcelOverlap?.features.length,0);
});
