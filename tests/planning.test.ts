import test from 'node:test';
import assert from 'node:assert/strict';
import { bboxPolygon, booleanPointInPolygon, point } from '@turf/turf';
import { generateLayout } from '../lib/planning';
import type { CellResult } from '../lib/types';

const cell=(id:string,w:number,e:number,score:number|null=80):CellResult=>({
  ...bboxPolygon([w,49.47,e,49.49]),
  properties:{id,score,areaKm2:4,sensitivityMin:score,sensitivityMax:score,status:score===null?'excluded':'high',provisional:true,reasons:[],gridKm:1,roadKm:1,slope:1,elevation:700,resourceValue:4,components:{},capacityMw:null,energyGwh:null},
});

test('solar concept respects target, shortlisted cells and footprint containment',()=>{
  const cells=[cell('A',105.9,105.93),cell('B',105.93,105.96)];
  const layout=generateLayout(cells,['A'],'solar',20);
  assert.equal(layout.assets.length,909);
  assert.ok(layout.capacityMw<=20 && 20-layout.capacityMw<.022);
  for(const a of layout.assets){
    assert.equal(a.cellId,'A');
    for(const [dx,dy] of [[-12,-2],[12,-2],[12,2],[-12,2]])
      assert.equal(booleanPointInPolygon(point([a.longitude+dx/(111195*Math.cos(a.latitude*Math.PI/180)),a.latitude+dy/111195]),cells[0]),true);
  }
});

test('wind concept preserves assumed spacing across adjacent cells',()=>{
  const layout=generateLayout([cell('A',105.9,105.93),cell('B',105.93,105.96)],['A','B'],'wind',60);
  assert.ok(layout.assets.length>0 && layout.capacityMw<=60);
  const {rotorM,crossD,alongD}=layout.assumptions;
  for(let i=0;i<layout.assets.length;i++)for(let j=0;j<i;j++){
    const a=layout.assets[i],b=layout.assets[j];
    const dx=(a.longitude-b.longitude)*111195*Math.cos(49.48*Math.PI/180),dy=(a.latitude-b.latitude)*111195;
    assert.ok((dx/(crossD*rotorM))**2+(dy/(alongD*rotorM))**2>=1-1e-8);
  }
});

test('excluded cells and invalid or sub-unit targets cannot create equipment',()=>{
  assert.equal(generateLayout([cell('X',105.9,105.93,null)],['X'],'solar').assets.length,0);
  assert.equal(generateLayout([cell('A',105.9,105.93)],['A'],'wind',2).assets.length,0);
  for(const target of [0,-1,NaN,101])assert.throws(()=>generateLayout([],[],'solar',target));
});
