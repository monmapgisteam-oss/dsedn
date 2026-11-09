import test from 'node:test';
import assert from 'node:assert/strict';
import { area, bboxPolygon, featureCollection, lineString } from '@turf/turf';
import { analyze, slopeFromPatch, validateSettings, weightedScore } from '../lib/analysis';
import { cellCenter, makeCells, nearestKm, overlaps, validateBounds, validateCollection } from '../lib/geo';
import { defaultSettings } from '../lib/types';
import type { Cell, Resource, Terrain } from '../lib/types';

const bounds:[number,number,number,number]=[105.9,49.47,105.91,49.48];
const cell:Cell={...bboxPolygon(bounds),properties:{id:'C001'}};
const center=cellCenter(cell);
const lines=featureCollection([lineString([[center[0],center[1]-.1],[center[0],center[1]+.1]])]);
const provenance={name:'Synthetic analytical test',source:'Test fixture only',retrievedAt:'2026-01-01T00:00:00Z',detail:'Not observed data'};
const resource:Resource={solar:5.5,wind:8,windHeight:50,monthlySolar:[],monthlyWind:[],provenance};
const terrain:Terrain={samples:[{id:'C001',elevation:700,slope:0}],provenance};
const inputs={grid:lines,roads:lines,resource,terrain};

test('analytic linear plane yields the expected Horn slope',()=>{
  assert.equal(slopeFromPatch(Array(9).fill(700),90),0);
  assert.ok(Math.abs(slopeFromPatch([0,90,180,0,90,180,0,90,180],90)!-45)<1e-9);
  assert.equal(slopeFromPatch([0,0,0,0,null,0,0,0,0],90),null);
});
test('normalized score is invariant to multiplying every weight by a constant',()=>{
  const scores={resource:100,grid:50,terrain:0,access:80};
  assert.equal(weightedScore(scores,{resource:4,grid:3,terrain:2,access:1}),63);
  assert.equal(weightedScore(scores,{resource:40,grid:30,terrain:20,access:10}),63);
  assert.throws(()=>weightedScore(scores,{resource:0,grid:0,terrain:0,access:0}));
});
test('perfect inputs score 100 with zero weight sensitivity and no invented yield',()=>{
  const p=analyze([cell],defaultSettings('solar'),inputs)[0].properties;
  assert.ok(Math.abs(p.score!-100)<1e-8);assert.equal(p.status,'high');
  assert.ok(p.sensitivityMax!-p.sensitivityMin!<1e-8);
  assert.equal(p.energyGwh,null);assert.equal(p.provisional,true);
});
test('missing inputs never become zero or get silently renormalized away',()=>{
  const p=analyze([cell],defaultSettings('solar'),{...inputs,roads:undefined})[0].properties;
  assert.equal(p.score,null);assert.equal(p.roadKm,null);assert.equal(p.capacityMw,null);assert.equal(p.status,'unassessed');
  const missing=analyze([cell],defaultSettings('solar'),{...inputs,terrain:{...terrain,samples:[{id:'C001',slope:null,elevation:null}]}})[0].properties;
  assert.equal(missing.slope,null);assert.equal(missing.score,null);
});
test('slope and polygon exclusions override attractive resource and access scores',()=>{
  const steep=analyze([cell],defaultSettings('solar'),{...inputs,terrain:{...terrain,samples:[{id:'C001',slope:6,elevation:700}]}})[0].properties;
  assert.equal(steep.status,'excluded');assert.equal(steep.capacityMw,null);
  const mask=featureCollection([bboxPolygon([105.905,49.475,105.908,49.478])]);
  assert.equal(overlaps(cell,mask),true);
  const masked=analyze([cell],defaultSettings('solar'),{...inputs,exclusions:mask})[0].properties;
  assert.equal(masked.status,'excluded');assert.equal(masked.score,null);
});
test('exclusion touching only the cell boundary does not exclude area',()=>{
  assert.equal(overlaps(cell,featureCollection([bboxPolygon([105.91,49.47,105.92,49.48])])),false);
});
test('the nearest point lies on a line interior, not merely a vertex',()=>{
  assert.ok(nearestKm(center,lines)!<1e-8);assert.equal(nearestKm(center,featureCollection([])),null);
});
test('mesh conserves study area and stays inside its exact bounds',()=>{
  const b:[number,number,number,number]=[105.79,49.39,106.065,49.57];const cells=makeCells(b,2);
  assert.equal(cells.length,110);assert.equal(new Set(cells.map(c=>c.properties.id)).size,110);
  assert.ok(Math.abs(cells.reduce((s,c)=>s+area(c),0)-area(bboxPolygon(b)))<0.1);
  assert.throws(()=>makeCells(b,1),/400 cells/);
});
test('invalid bounds and malformed or projected GeoJSON fail clearly',()=>{
  for(const b of [[106,49,105,50],[105,49,106,49],[0,0,1,1],[105,49,NaN,50]])assert.throws(()=>validateBounds(b));
  assert.throws(()=>validateCollection(featureCollection([lineString([[11800000,6350000],[11800100,6350000]])]),'roads'));
  assert.throws(()=>validateCollection(lines,'exclusions'));
});
test('capacity and annual energy use the documented units',()=>{
  const s={...defaultSettings('solar'),solarYield:1500};const p=analyze([cell],s,inputs)[0].properties;
  assert.ok(Math.abs(p.capacityMw!-area(cell)/1e6*40)<1e-9);
  assert.ok(Math.abs(p.energyGwh!-p.capacityMw!*1.5)<1e-9);
  const w=analyze([cell],{...defaultSettings('wind'),windCapacityFactor:.3},inputs)[0].properties;
  assert.ok(Math.abs(w.energyGwh!-w.capacityMw!*8760*.3/1000)<1e-9);
});
test('changing a criterion weight produces a bounded sensitivity range containing the base score',()=>{
  const p=analyze([cell],defaultSettings('solar'),{...inputs,resource:{...resource,solar:4}})[0].properties;
  assert.ok(p.sensitivityMin!<p.score!);assert.ok(p.sensitivityMax!>p.score!);
  assert.ok(p.sensitivityMin!>=0 && p.sensitivityMax!<=100);
});
test('bad physical assumptions are rejected',()=>{
  for(const patch of [{maxSlope:0},{maxGridKm:11},{maxRoadKm:6},{resourceHigh:2},{windCapacityFactor:1},{densityMwKm2:-1},{solarYield:NaN}])assert.throws(()=>validateSettings({...defaultSettings('solar'),...patch}));
});
