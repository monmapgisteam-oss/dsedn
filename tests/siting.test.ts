import test from 'node:test';
import assert from 'node:assert/strict';
import {booleanPointInPolygon,point,area,bboxPolygon} from '@turf/turf';
import {designFootprint,layoutInSite,sitePolygon,initialRequest,validateRequest,type SiteRequest} from '../lib/siting';
import {isDsednOwner} from '../lib/ownership';
import {parcelConflicts} from '../lib/server/site-engine';
import {wakeDeficits,farmAEP} from '../lib/physics/windfarm';
import {rowPitch,designSunElev} from '../lib/physics/solarsite';
import {powerCurve} from '../lib/physics/energy';

test('200 individual panels remain exactly 200, including a partial final table',()=>{
 const r:SiteRequest={...initialRequest,mode:'count',value:200},d=designFootprint(r,18,35,0),l=layoutInSite(106,49.5,d,r,'test');
 assert.equal(l.assets.length,4);assert.deepEqual(l.assets.map(a=>a.moduleCount),[52,52,52,44]);assert.equal(l.capacityMw,.116);
});
test('capacity mode meets 100 MW with the minimum whole number of units',()=>{
 for(const technology of ['solar','wind'] as const){const r:SiteRequest={...initialRequest,technology,mode:'capacity',value:100},d=designFootprint(r,18,35,337.5),l=layoutInSite(106,49.5,d,r,'test'),unit=technology==='solar'?r.moduleWp/1e6:r.turbineMw;
  assert.ok(l.capacityMw>=100);assert.ok(l.capacityMw-unit<100);if(technology==='wind')assert.equal(l.assets.length,17);
 }
});
test('20 hectares produces a contiguous 20 ha footprint with every equipment corner inside',()=>{
 const r={...initialRequest},d=designFootprint(r,18,35,0),p=sitePolygon(106,49.5,d,'test'),l=layoutInSite(106,49.5,d,r,'test');
 assert.ok(Math.abs(area(p)/10000-20)<.001);
 const mx=111195*Math.cos(49.5*Math.PI/180);
 for(const a of l.assets)for(const dx of [-d.tableWidth/2,d.tableWidth/2])for(const dy of [-d.tableLength/2,d.tableLength/2])assert.ok(booleanPointInPolygon(point([a.longitude+dx/mx,a.latitude+dy/111195]),p));
});
test('30 turbines fit their rotated boundary and obey 7D by 4D directional spacing',()=>{
 const r:SiteRequest={...initialRequest,technology:'wind',mode:'count',value:30},d=designFootprint(r,1,0,337.5),l=layoutInSite(106,49.5,d,r,'test'),p=sitePolygon(106,49.5,d,'test');
 assert.equal(l.assets.length,30);assert.equal(l.capacityMw,180);
 const th=d.direction*Math.PI/180,mx=111195*Math.cos(49.5*Math.PI/180);
 for(let i=0;i<l.assets.length;i++){const a=l.assets[i];assert.ok(booleanPointInPolygon(point([a.longitude,a.latitude]),p));
  for(let j=0;j<i;j++){const b=l.assets[j],dx=(a.longitude-b.longitude)*mx,dy=(a.latitude-b.latitude)*111195;assert.ok(((dx*Math.sin(th)+dy*Math.cos(th))/(7*r.rotorM))**2+((dx*Math.cos(th)-dy*Math.sin(th))/(4*r.rotorM))**2>=1-1e-8);}
 }
});
test('company names must match exactly; other companies and unknown owners stay excluded',()=>{
 assert.ok(isDsednOwner('Дархан-Сэлэнгийн цахилгаан түгээх сүлжээ ХК'));assert.ok(isDsednOwner('ДСЦТС ХК'));
 assert.ok(!isDsednOwner('Дарханы дулааны цахилгаан станц'));assert.ok(!isDsednOwner('DSEDN neighbour'));assert.ok(!isDsednOwner(null));
 const site=bboxPolygon([106,49.5,106.01,49.51]);
 const ds=bboxPolygon([106,49.5,106.005,49.505],{properties:{dsedn:true}}),unknown=bboxPolygon([106.005,49.505,106.01,49.51],{properties:{dsedn:false}});
 const conflicts=parcelConflicts(site,{type:'FeatureCollection',features:[ds,unknown]});assert.equal(conflicts.length,1);assert.equal(conflicts[0].properties?.dsedn,false);
});
test('wind physics conserves energy and produces downstream wake losses',()=>{
 const turbines=[{x:0,y:1000,elev:700,score:1,no:1},{x:0,y:0,elev:700,score:1,no:2}],deficits=wakeDeficits(turbines,170,.8,.075,16);
 assert.equal(deficits[0][0],0);assert.ok(deficits[0][1]>0);
 const result=farmAEP(turbines,Array.from({length:16},(_,i)=>({f:i===0?1:0,k:2,A:8,mean:7,e:i===0?1:0})),.14,{rated:6,rotor:170,hub:120,vin:3,vr:12,vout:25,ct:.8},()=>1.15,deficits);
 assert.ok(result[0].gross>0&&result[0].gross<6*8760);assert.equal(result[0].net,result[0].gross);assert.ok(result[1].net<result[1].gross);
 assert.equal(powerCurve(2,{rated:6,vin:3,vr:12,vout:25}),0);assert.equal(powerCurve(25,{rated:6,vin:3,vr:12,vout:25}),0);
});
test('north facing slope increases required winter pitch; impossible design is not silently accepted',()=>{
 const h=designSunElev(49.5,106,2),flat=rowPitch(4.576,35,h,0),north=rowPitch(4.576,35,h,-5);
 assert.ok(north.pitch>flat.pitch);assert.equal(rowPitch(4.576,35,h,-30).pitch,Infinity);
 assert.throws(()=>validateRequest({...initialRequest,value:0}));assert.throws(()=>validateRequest({...initialRequest,mode:'count',value:2.5}));assert.throws(()=>validateRequest({...initialRequest,technology:'wind',hubM:60,rotorM:170}));
});
