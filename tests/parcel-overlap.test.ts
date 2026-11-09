import test from 'node:test';
import assert from 'node:assert/strict';
import {area,bboxPolygon,featureCollection,intersect,polygon} from '@turf/turf';
import {measureParcelOverlap} from '../lib/parcel-overlap';

const site=bboxPolygon([106,49.5,106.01,49.51]);
test('duplicate ownership and possession records count only unique clipped area',()=>{
 const p=bboxPolygon([105.99,49.5,106.005,49.51],{properties:{dsedn:false,owner_name:'private'}});
 const result=measureParcelOverlap(site,featureCollection([p,p]),true,'SITE-01');assert.equal(result.summary.status,'checked');if(result.summary.status!=='checked')return;
 const expected=area(intersect(featureCollection([site,p]))!);assert.ok(Math.abs(result.summary.otherM2-expected)<.001);assert.ok(Math.abs(result.summary.otherPct-50)<.001);assert.equal(result.features.length,1);assert.equal(JSON.stringify(result.features).includes('private'),false);
});
test('other/unknown land takes precedence over overlapping DSEDN claims without inflating the total',()=>{
 const other=bboxPolygon([106,49.5,106.005,49.51]);const owned={...site,properties:{dsedn:true}};
 const r=measureParcelOverlap(site,featureCollection([other,owned]),true,'SITE-01');assert.equal(r.summary.status,'checked');if(r.summary.status!=='checked')return;
 assert.ok(Math.abs(r.summary.otherPct-50)<.001);assert.ok(Math.abs(r.summary.dsednPct-50)<.001);assert.ok(r.summary.unmappedM2<.001);assert.ok(Math.abs(r.summary.otherPct+r.summary.dsednPct+r.summary.unmappedPct-100)<1e-9);
 assert.ok(!intersect(featureCollection(r.features as (typeof site)[])));
});
test('touching a boundary has zero overlap area while holes remain unmapped',()=>{
 const touching=bboxPolygon([106.01,49.5,106.02,49.51]);const r=measureParcelOverlap(site,featureCollection([touching]),true,'S');assert.equal(r.summary.status,'checked');if(r.summary.status!=='checked')return;assert.equal(r.summary.otherM2,0);assert.equal(r.summary.unmappedPct,100);
 const hole=polygon([site.geometry.coordinates[0],[[106.002,49.502],[106.002,49.508],[106.008,49.508],[106.008,49.502],[106.002,49.502]]],{dsedn:true});
 const h=measureParcelOverlap(site,featureCollection([hole]),true,'S');assert.equal(h.summary.status,'checked');if(h.summary.status!=='checked')return;assert.ok(h.summary.unmappedM2>0);assert.ok(h.summary.dsednPct<100);
});
test('missing cadastre is unknown, never a zero-overlap result',()=>{
 assert.deepEqual(measureParcelOverlap(site,featureCollection([]),false,'S'),{summary:{status:'unavailable'},features:[]});
 const r=measureParcelOverlap(site,featureCollection([]),true,'S');assert.equal(r.summary.status,'checked');if(r.summary.status==='checked')assert.equal(r.summary.unmappedPct,100);
});
