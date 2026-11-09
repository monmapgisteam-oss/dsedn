import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import Point from '@arcgis/core/geometry/Point.js';
import SpatialReference from '@arcgis/core/geometry/SpatialReference.js';
import {watch} from '@arcgis/core/core/reactiveUtils.js';
import {renderCoordinateTransformAt} from '@arcgis/core/views/3d/webgl.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import type {Layout} from '@/lib/planning';
import {createRotorMotion,rotorRpm,MAX_MOVING_TURBINES} from '@/lib/turbine-motion';
import {turbineModel,modelRenderer} from '@/lib/renewable-models';
import {createTurbineRenderer,type RenderRotor} from './turbine-renderer';

// Booroljuut's shared GPU geometry; only near, on-screen rotors animate. Remaining turbines stay as glTF instances.
export function animateWind(scene:SceneView,base:FeatureLayer,layout:Layout,speed:number,onStatus:(s:string)=>void){
 let dead=false,failed=false,frame=0,renderer:ReturnType<typeof createTurbineRenderer>|undefined,handle:ReturnType<typeof watch>|undefined,towers:FeatureLayer|undefined,towerUrl:string|undefined;
 let refresh=()=>{};const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const schedule=()=>{if(frame||dead)return;frame=requestAnimationFrame(()=>{frame=0;refresh();});};
 const restore=()=>{if(!base.destroyed)base.definitionExpression='';if(towers&&!towers.destroyed)towers.definitionExpression='1=0';};
 const fail=()=>{failed=true;restore();onStatus('Роторын хөдөлгөөн ачаалсангүй. Бодит хэмжээтэй статик загвар харагдаж байна.');};
 document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',schedule);
 void(async()=>{
  const a=layout.assumptions,terrain=await scene.map.ground.queryElevation(new Multipoint({points:layout.assets.map(t=>[t.longitude,t.latitude]),spatialReference:{wkid:4326}}),{returnSampleInfo:true});
  if(dead)return;
  const points=(terrain.geometry as Multipoint).points;
  if(points.some(p=>!Number.isFinite(p[2]))||terrain.sampleInfo?.some(s=>s.demResolution<=0))throw new Error('Terrain not available');
  const rpm=rotorRpm(speed,a.rotorM,3,25),now=performance.now();
  const pool=layout.assets.map((asset,i)=>{
   const [lon,lat,z]=points[i],origin=new Float64Array(16),groundOrigin=new Float64Array(16);
   renderCoordinateTransformAt(scene,[lon,lat,z+a.hubM],SpatialReference.WGS84,origin);
   renderCoordinateTransformAt(scene,[lon,lat,z],SpatialReference.WGS84,groundOrigin);
   return {id:asset.id,origin,groundOrigin,point:new Point({longitude:lon,latitude:lat,z:z+a.hubM}),motion:createRotorMotion(rpm,now,asset.id*37%360)};
  });
  let rotating:RenderRotor[]=[];let previous='';
  // Native static towers retain terrain shadows; only rotor blades use the shared GPU pass.
  const model=turbineModel(a.hubM,a.rotorM,'tower'),bytes=Uint8Array.from(atob(model.href.split(',')[1]),c=>c.charCodeAt(0));
  towerUrl=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
  towers=new FeatureLayer({id:'wind-towers',title:'Турбины цамхаг',geometryType:'point',spatialReference:{wkid:4326},objectIdField:'oid',outFields:['*'],fields:[{name:'oid',type:'oid'}],source:pool.map((t,i)=>new Graphic({geometry:new Point({longitude:points[i][0],latitude:points[i][1],z:points[i][2]}),attributes:{oid:t.id}})),definitionExpression:'1=0',elevationInfo:{mode:'absolute-height'},renderer:modelRenderer({...model,href:towerUrl},a.directionDeg) as __esri.SimpleRendererProperties & {type:'simple'},popupEnabled:false});
  scene.map.add(towers);await towers.load();if(dead)return;
  renderer=createTurbineRenderer(scene,a.rotorM,{frame:()=>({rotors:!dead&&!failed&&!document.hidden&&base.visible&&base.opacity>=.99?rotating:[],heading:a.directionDeg}),failed:fail});
  refresh=()=>{
   if(dead||failed||scene.destroyed)return;
   const shown=scene.scale<=50000&&!document.hidden&&!reduced.matches&&base.visible&&base.opacity>=.99;
   const near=shown?pool.map(t=>({t,p:scene.toScreen(t.point)})).filter(({p})=>p&&p.x>=-150&&p.y>=-150&&p.x<=scene.width+150&&p.y<=scene.height+150).sort((a,b)=>Math.hypot(a.p!.x-scene.width/2,a.p!.y-scene.height/2)-Math.hypot(b.p!.x-scene.width/2,b.p!.y-scene.height/2)).slice(0,MAX_MOVING_TURBINES).map(({t})=>t):[];
   const key=near.map(t=>t.id).sort((a,b)=>a-b).join(',');rotating=near;
   if(key!==previous){previous=key;base.definitionExpression=key?`oid NOT IN (${key})`:'';if(towers)towers.definitionExpression=key?`oid IN (${key})`:'1=0';}
   renderer?.requestRender();
  };
  refresh();handle=watch(()=>[scene.scale,scene.camera.position.x,scene.camera.position.y,scene.camera.position.z,scene.camera.heading,scene.camera.tilt,scene.width,scene.height,base.visible,base.opacity],schedule);
  onStatus(`${Number.isFinite(speed)?speed.toFixed(1):'—'} м/с · ERA5 дундаж · ${rpm.toFixed(1)} rpm жишиг. Хөдөлгөөн нь үйлдвэрлэлийн тооцоог өөрчлөхгүй.`);
 })().catch(()=>{if(!dead)fail();});
 return ()=>{dead=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',schedule);reduced.removeEventListener('change',schedule);handle?.remove();renderer?.destroy();restore();if(towers){scene.map?.remove(towers);towers.destroy();}if(towerUrl)URL.revokeObjectURL(towerUrl);};
}
