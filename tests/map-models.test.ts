import test from 'node:test';
import assert from 'node:assert/strict';
import {solarTableModel,turbineModel,turbineRotorMesh,turbineTowerMesh} from '../lib/renewable-models';
import {advanceRotor,createRotorMotion,setRotorTarget,rotorRpm,rotorMatrices} from '../lib/turbine-motion';

test('textured solar geometry preserves physical dimensions and exact module count, including a partial table',()=>{
 for(const count of [1,7,44,52]){
  const rows=count===1?1:2,cols=Math.ceil(count/rows),width=cols*1.134,length=rows*2.278,tilt=35;
  const model=solarTableModel(width,length,tilt,cols,rows,count);
  assert.equal(solarTableModel(width,length,tilt,cols,rows,count),model,'Reuse the same model for repeated instances');
  const bytes=Buffer.from(model.href.split(',')[1],'base64'),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  const glass=gltf.meshes[0].primitives.find((p:{attributes:Record<string,number>})=>p.attributes.TEXCOORD_0!==undefined);
  assert.equal(gltf.accessors[glass.attributes.POSITION].count,count*6);
  assert.equal(gltf.accessors[glass.attributes.TEXCOORD_0].count,count*6);
  assert.equal(gltf.accessors[glass.attributes.TEXCOORD_0].type,'VEC2');
  assert.match(gltf.images[0].uri,/^data:image\/png;base64,/);
  const positions=gltf.accessors.filter((a:{min?:number[]})=>a.min),xmin=Math.min(...positions.map((a:{min:number[]})=>a.min[0])),xmax=Math.max(...positions.map((a:{max:number[]})=>a.max[0])),ymax=Math.max(...positions.map((a:{max:number[]})=>a.max[1]));
  assert.ok(Math.abs(xmax-xmin-width)<1e-5);assert.ok(Math.abs(ymax-model.height)<1e-5);
  assert.ok(Math.abs(model.height-(.8+length*Math.sin(tilt*Math.PI/180)+.045*Math.cos(tilt*Math.PI/180)))<1e-6);
  const binary=new Float32Array(bytes.buffer,bytes.byteOffset+28+jsonLength,(bytes.length-28-jsonLength)/4);assert.ok(binary.every(Number.isFinite));
 }
});

test('animated turbine and static glTF agree on metre-scale tower and rotor dimensions',()=>{
 for(const [hub,diameter] of [[80,120],[120,170],[160,220]]){
  const rotor=turbineRotorMesh(diameter),tower=turbineTowerMesh(hub,diameter),ys=(mesh:Float32Array)=>Array.from({length:mesh.length/9},(_,i)=>mesh[i*9+1]);
  assert.ok(rotor.every(Number.isFinite));assert.ok(tower.every(Number.isFinite));
  assert.equal(Math.max(...ys(rotor)),diameter/2);
  assert.ok(Math.abs(Math.max(...ys(tower))-turbineModel(hub,diameter,'tower').height)<1e-5);
  assert.equal(turbineModel(hub,diameter).height,hub+diameter/2);
 }
});

test('rotor motion depends on elapsed time, not frame rate, and respects operating cutoffs',()=>{
 for(const speed of [NaN,-1,0,2.9,25,30])assert.equal(rotorRpm(speed,170,3,25),0);
 assert.ok(rotorRpm(8,170,3,25)>0);assert.equal(rotorRpm(24,170,3,25),12);
 const low=createRotorMotion(3,0),high=createRotorMotion(3,0);setRotorTarget(low,8,0);setRotorTarget(high,8,0);
 advanceRotor(low,10000);for(let ms=10;ms<=10000;ms+=10)advanceRotor(high,ms);
 assert.ok(Math.abs(low.phase-high.phase)<1e-8);assert.ok(Math.abs(low.rpm-high.rpm)<1e-8);
 const before=low.phase;advanceRotor(low,9000);assert.equal(low.phase,before);
});

test('camera-relative GPU transforms retain precision and do not move the rotor hub while spinning',()=>{
 const identity=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),origin=identity.slice(),view=identity.slice();
 origin[12]=4_000_000.25;origin[13]=3_000_000.5;origin[14]=2_000_000.75;view[12]=-4_000_000;view[13]=-3_000_000;view[14]=-2_000_000;
 for(const phase of [0,90,180,270]){
  const mv=new Float32Array(16),normal=new Float32Array(9);rotorMatrices(origin,view,337.5,phase,mv,normal);
  assert.deepEqual([...mv.slice(12,15)],[.25,.5,.75]);assert.ok(mv.every(Number.isFinite));
  for(let c=0;c<3;c++)assert.ok(Math.abs(Math.hypot(...normal.slice(c*3,c*3+3))-1)<1e-6);
 }
});
