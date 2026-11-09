import test from 'node:test';
import assert from 'node:assert/strict';
import {electricalDisplay,renewableLayers,GRID_LAYER_IDS} from '../lib/renewable-catalog';
import {inspectionInfo,inspectionPriority} from '../lib/map-inspection';
import {conceptualSpans,conductorPath} from '../lib/infrastructure';
import {featureCollection,lineString} from '@turf/turf';

test('the chosen cable is /4; duplicates /2 and /3 are absent from map and analytical inputs',()=>{
 assert.deepEqual(GRID_LAYER_IDS,[0,4]);assert.deepEqual(renewableLayers.map(l=>l.id),[0,1,4,5,6,7,8]);
 assert.equal(new Set(renewableLayers.map(l=>l.color)).size,renewableLayers.length);
 assert.equal(inspectionInfo('renewable-2',{}),null);assert.equal(inspectionInfo('renewable-3',{}),null);
});

test('attribute inspection decodes only supplied domains and does not invent voltage or distance units',()=>{
 const fields=[{name:'voltage_level',alias:'Хүчдэл'},{name:'material',alias:'Материал',domain:{codedValues:[{code:1,name:'Хөнгөн цагаан'}]}},{name:'length_km',alias:'length_km'}];
 const display=electricalDisplay({voltage_level:5,material:1,length_km:12250},fields);
 assert.equal(display.voltage_level.value,'5 · эх утга');assert.equal(display.material.value,'Хөнгөн цагаан');assert.equal(display.length_km.label,'Бүртгэлийн урт · эх утга');
 const info=inspectionInfo('renewable-0',{objectid:3,air_line_name:'Шугам A',display,geometryLengthKm:12.25,owner_name:'private-person',token:'secret'})!;
 assert.ok(info.rows.some(([k,v])=>k==='Геометрийн урт · км'&&v.includes('12.25')));assert.ok(!JSON.stringify(info).includes('private-person'));assert.ok(!JSON.stringify(info).includes('secret'));
 const parcel=inspectionInfo('renewable-8',{objectid:5,dsedn:true,possessi_1:'private-person'})!;assert.ok(JSON.stringify(parcel).includes('ДСЦТС'));assert.ok(!JSON.stringify(parcel).includes('private-person'));
});

test('hover prioritizes physical poles and lines ahead of the underlying study polygon',()=>{
 assert.ok(inspectionPriority('concept-poles','point')>inspectionPriority('renewable-0','polyline'));
 assert.ok(inspectionPriority('renewable-0','polyline')>inspectionPriority('renewable-6','polygon'));
 assert.equal(inspectionInfo('basemap',{}),null);
 const info=inspectionInfo('concept-poles',{oid:2,lineName:'A',heightM:14,turnDeg:90,role:'Эргэлтийн орой'})!;
 assert.match(info.note!,/загварчилсан/);assert.ok(info.rows.some(([label,value])=>label.includes('өнцөг')&&value==='90'));
});

test('every mapped bend has one support with bisector heading and shared endpoints do not duplicate',()=>{
 const a=[106,49.5],b=[106.001,49.5],c=[106.001,49.501],d=[106.002,49.501];
 const line=lineString([a,b,c],{sourceLayer:0,objectid:1,air_line_name:'A',display:{voltage_level:{value:'35 кВ'}}});
 const network=featureCollection([line,lineString([c,d],{sourceLayer:0,objectid:2,air_line_name:'B'}),lineString([c,b,a],{sourceLayer:0,objectid:1}),lineString([a,d],{sourceLayer:4})]);
 const model=conceptualSpans(network,[105.99,49.49,106.01,49.51],1000);
 assert.equal(model.poles.length,4);assert.equal(model.spans.length,3);
 for(const pos of [b,c]){const matches=model.poles.filter(p=>Math.abs(p.longitude-pos[0])<1e-9&&Math.abs(p.latitude-pos[1])<1e-9);assert.equal(matches.length,1);assert.equal(matches[0].role,'corner');assert.ok(Math.abs(matches[0].turnDeg-90)<1e-8);assert.ok(Math.abs(matches[0].heading-45)<1e-8);}
 assert.equal(model.poles[0].role,'end');assert.equal(model.poles.at(-1)!.role,'end');
 assert.deepEqual(model.poles[1].voltageTexts,['35 кВ']);
});

test('a geometric crossing is not invented as a shared pole without a mapped vertex',()=>{
 const grid=featureCollection([lineString([[106,49.5],[106.002,49.5]],{sourceLayer:0}),lineString([[106.001,49.499],[106.001,49.501]],{sourceLayer:0})]);
 assert.equal(conceptualSpans(grid,[105.99,49.49,106.01,49.51],1000).poles.length,4);
});

test('reversed line headings preserve conductor side instead of crossing phases',()=>{
 const a=[106,49.5,700],b=[106.001,49.5,702];
 const forward=conductorPath(a,b,1.6,13.55,1,90,90),reversed=conductorPath(a,b,1.6,13.55,1,270,270);
 for(let i=0;i<forward.length;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(forward[i][axis]-reversed[i][axis])<1e-9);
});
