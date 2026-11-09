import test from 'node:test';
import assert from 'node:assert/strict';
import {bboxPolygon,featureCollection,lineString,polygon,area,booleanIntersects} from '@turf/turf';
import {insideStudy,prepareStudy,studyMask,riverProtection} from '../lib/study-area';
import {defaultWeights,weightedScore,validatePeriod} from '../lib/siting-controls';
import {initialRequest,validateRequest} from '../lib/siting';
import {conceptualSpans,conductorPath} from '../lib/infrastructure';
import {turbineModel} from '../lib/renewable-models';

test('study mask clips to actual polygons, including holes, not just the search rectangle',()=>{
 const boundary=polygon([[[106,49],[107,49],[107,50],[106,50],[106,49]],[[106.4,49.4],[106.4,49.6],[106.6,49.6],[106.6,49.4],[106.4,49.4]]]);
 const mask=studyMask(featureCollection([boundary]),[106.1,49.1,106.9,49.9]);
 assert.ok(area(mask)<area(bboxPolygon([106.1,49.1,106.9,49.9])));
 assert.equal(insideStudy(bboxPolygon([106.15,49.15,106.2,49.2]),mask),true);
 assert.equal(insideStudy(bboxPolygon([106.3,49.3,106.7,49.7]),mask),false); // all corners pass, hole is enclosed
 assert.equal(insideStudy(bboxPolygon([106.05,49.15,106.2,49.2]),mask),false);
 const fast=prepareStudy(mask);for(let i=0;i<10;i++)for(let j=0;j<10;j++){const p=bboxPolygon([106+i*.09,49+j*.09,106.075+i*.09,49.075+j*.09]);assert.equal(fast(p),insideStudy(p,mask));}
 assert.throws(()=>studyMask(featureCollection([boundary]),[108,49,109,50]),/огтлолцохгүй/);
});
test('river safety uses the supplied line at the selected metric distance',()=>{
 const river=featureCollection([lineString([[106,49.4],[106,49.6]])]);const wide=riverProtection(river,200),narrow=riverProtection(river,20),near=bboxPolygon([106.001,49.49,106.002,49.50]);
 assert.equal(booleanIntersects(wide.features[0],near),true);assert.equal(booleanIntersects(narrow.features[0],near),false);assert.throws(()=>riverProtection(river,NaN));
});
test('weights control grid and access ranking, normalize and cannot all be zero',()=>{
 const values={resource:.3,grid:1,terrain:.9,road:.2,settlement:.1};
 assert.equal(weightedScore(values,{resource:0,grid:100,terrain:0,road:0,settlement:0}),100);
 assert.equal(weightedScore(values,{resource:0,grid:0,terrain:0,road:100,settlement:0}),20);
 assert.equal(weightedScore(values,defaultWeights),weightedScore(values,{resource:60,grid:50,terrain:40,road:30,settlement:20}));
 assert.throws(()=>validateRequest({...initialRequest,weights:{resource:0,grid:0,terrain:0,road:0,settlement:0}}),/жин/);
 assert.throws(()=>validateRequest({...initialRequest,regionLayer:6,parcels:true}),/кадастр/);
 validateRequest({...initialRequest,regionLayer:6,parcels:false});
});
test('ERA5 accepts only complete past calendar periods for annual production',()=>{
 const now=new Date('2026-11-04');validatePeriod('2024-01-01','2025-12-31',now);validatePeriod('1940-01-01','1940-12-31',now);
 for(const [a,b] of [['2024-02-01','2025-12-31'],['2024-01-01','2025-11-30'],['2026-01-01','2026-12-31'],['2025-01-01','2024-12-31'],['1939-01-01','1940-12-31'],['1990-01-01','2025-12-31']])assert.throws(()=>validatePeriod(a,b,now));
});
test('3D support generation excludes buried cables and maintains scale and sag endpoints',()=>{
 const grid=featureCollection([lineString([[105.99,49.5],[106.02,49.5]],{sourceLayer:0}),lineString([[106,49.505],[106.02,49.505]],{sourceLayer:2})]);
 const result=conceptualSpans(grid,[106,49.49,106.01,49.51]);assert.ok(result.poles.length>1);assert.equal(result.truncated,false);
 assert.ok(result.poles.every(p=>p.latitude===49.5&&p.longitude>=106&&p.longitude<=106.01));assert.ok(result.spans.every(s=>s.lengthM<=100.001));
 const wire=conductorPath([106,49.5,700],[106.001,49.5,710],0,13.55,2);assert.equal(wire[0][2],713.55);assert.equal(wire.at(-1)![2],723.55);assert.ok(Math.abs(wire[8][2]-716.55)<1e-9);
 assert.equal(conceptualSpans(grid,[106,49.49,106.01,49.51],100,2).truncated,true);
});
test('wind glTF retains metre-scale hub and swept envelope for varied equipment sizes',()=>{
 for(const [hub,diameter] of [[120,170],[80,120],[160,220]]){
  const m=turbineModel(hub,diameter),bytes=Buffer.from(m.href.split(',')[1],'base64'),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString());
  const positions=gltf.accessors.filter((a:{min?:number[]})=>a.min);const ymin=Math.min(...positions.map((a:{min:number[]})=>a.min[1])),ymax=Math.max(...positions.map((a:{max:number[]})=>a.max[1]));
  assert.equal(ymin,0);assert.equal(ymax,hub+diameter/2);assert.equal(m.height,hub+diameter/2);
 }
});
