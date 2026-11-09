import test from 'node:test';
import assert from 'node:assert/strict';
import {area,bbox,bboxPolygon,featureCollection,intersect,lineString,point,polygon,union} from '@turf/turf';
import {wholeStudy,searchTiles,expandForFootprint,canReachCentre,canReachInfrastructure,scopeName} from '../lib/search-scope';
import {sitePolygon,initialRequest} from '../lib/siting';
import type {Bounds} from '../lib/types';
import {insideStudy} from '../lib/study-area';

test('whole-layer search retains disconnected polygons and holes rather than a former rectangle or feature ID',()=>{
 const west=polygon([[[105,49],[105.2,49],[105.2,49.2],[105,49.2],[105,49]],[[105.08,49.08],[105.08,49.12],[105.12,49.12],[105.12,49.08],[105.08,49.08]]]);
 const east=bboxPolygon([106,49.5,106.1,49.6]);
 const scope=wholeStudy(featureCollection([west,east]));
 assert.deepEqual(scope.bounds,[105,49,106.1,49.6]);
 assert.ok(insideStudy(bboxPolygon([106.02,49.52,106.03,49.53]),scope.mask));
 assert.equal(insideStudy(bboxPolygon([105.09,49.09,105.11,49.11]),scope.mask),false);
 const tiles=searchTiles(scope.mask),coverage=union(featureCollection(tiles.map(t=>bboxPolygon(t.bounds))))!;
 const covered=intersect(featureCollection([scope.mask,coverage]))!;
 assert.ok(Math.abs(area(covered)-area(scope.mask))<1);
 assert.equal(new Set(tiles.map(t=>t.id)).size,tiles.length);
 assert.equal(initialRequest.regionLayer,6);assert.equal(initialRequest.regionId,0);
 assert.equal(scopeName(6),'Дархан');assert.equal(scopeName(5),'Нийт талбай');
});

test('analysis padding contains rotated footprints at core edges and uses independent core ownership',()=>{
 const b:Bounds=[106,49.5,106.1,49.6],width=3000,height=6500,direction=67;
 const expanded=expandForFootprint(b,width,height,direction);
 for(const [lon,lat] of [[b[0],b[1]],[b[2],b[3]],[b[0],b[3]],[b[2],b[1]]]){
  const footprint=sitePolygon(lon,lat,{width,height,direction,columns:1,rows:1,pitch:1,tilt:0,wanted:1,stepX:1,stepY:1,margin:0,tableWidth:1,tableLength:1},'edge');
  const f=bbox(footprint);assert.ok(f[0]>expanded[0]&&f[1]>expanded[1]&&f[2]<expanded[2]&&f[3]<expanded[3]);
 }
});

test('centre pruning retains reachable edges even when the tile midpoint is beyond the limit',()=>{
 const b:Bounds=[106,49.5,106.1,49.6];
 assert.equal(canReachCentre(b,featureCollection([point([106.1,49.6])]),1),true);
 assert.equal(canReachCentre(b,featureCollection([point([108,50])]),12),false);
});

test('infrastructure pruning retains boundary and near-edge lines but rejects remote line segments',()=>{
 const b:Bounds=[106,49.5,106.1,49.6];
 assert.equal(canReachInfrastructure(b,featureCollection([lineString([[106.1,49.4],[106.1,49.7]])]),1),true);
 assert.equal(canReachInfrastructure(b,featureCollection([lineString([[106.11,49.4],[106.11,49.7]])]),1),true);
 assert.equal(canReachInfrastructure(b,featureCollection([lineString([[107,49.4],[107,49.7]])]),10),false);
 assert.equal(canReachInfrastructure(b,featureCollection([]),10),false);
});
