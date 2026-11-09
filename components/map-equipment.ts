import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import {circle} from '@turf/turf';
import {mapGeometry} from './map-geometry';
import {solarTableModel,turbineModel,modelRenderer} from '@/lib/renewable-models';
import type {Layout} from '@/lib/planning';

export function planFootprints(layout:Layout){
 const layer=new GraphicsLayer({id:'equipment-plan',title:'Тоноглол · бодит газрын хэмжээ',elevationInfo:{mode:'on-the-ground'}}),a=layout.assumptions;
 layer.addMany(layout.assets.map(asset=>{
  if(layout.technology==='wind')return new Graphic({geometry:mapGeometry(circle([asset.longitude,asset.latitude],a.rotorM/2,{units:'meters',steps:24}))!,attributes:{cellId:asset.cellId},symbol:{type:'simple-fill',color:[42,117,146,.12],outline:{color:'#287b95',width:1}}});
  const count=asset.moduleCount??52,rows=count===1?1:2,columns=Math.ceil(count/rows),w=a.tableWidthM*columns/26/2,h=a.tableLengthM*rows/2*Math.cos(a.tiltDeg*Math.PI/180)/2,mx=111195*Math.cos(asset.latitude*Math.PI/180);
  const rings=[[[-w,-h],[w,-h],[w,h],[-w,h],[-w,-h]].map(([x,y])=>[asset.longitude+x/mx,asset.latitude+y/111195])];
  return new Graphic({geometry:new Polygon({rings,spatialReference:{wkid:4326}}),attributes:{cellId:asset.cellId},symbol:{type:'simple-fill',color:'#1d4f73',outline:{color:'#8ab3ce',width:.4}}});
 }));return layer;
}
export function equipmentLayer(layout:Layout){
 const a=layout.assumptions,solar=layout.technology==='solar',urls:string[]=[];
 const symbols=[...new Set(layout.assets.map(asset=>solar?(asset.moduleCount??52):1))].map(count=>{
  const rows=count===1?1:2,columns=Math.ceil(count/rows);
  const model=solar?solarTableModel(a.tableWidthM*columns/26,a.tableLengthM*rows/2,a.tiltDeg,columns,rows,count):turbineModel(a.hubM,a.rotorM);
  const bytes=Uint8Array.from(atob(model.href.split(',')[1]),c=>c.charCodeAt(0)),href=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));urls.push(href);
  return {value:count,symbol:modelRenderer({...model,href},solar?0:a.directionDeg).symbol};
 });
 const layer=new FeatureLayer({id:'planned-equipment',title:solar?'Нарны ширээ · 3D':'Салхин турбин · 3D',geometryType:'point',spatialReference:{wkid:4326},objectIdField:'oid',outFields:['*'],fields:[{name:'oid',type:'oid'},{name:'cellId',type:'string'},{name:'moduleCount',type:'integer'},{name:'capacityMw',type:'double'}],source:layout.assets.map(asset=>new Graphic({geometry:new Point({longitude:asset.longitude,latitude:asset.latitude}),attributes:{oid:asset.id,cellId:asset.cellId,moduleCount:solar?(asset.moduleCount??52):1,capacityMw:asset.capacityMw}})),elevationInfo:{mode:'relative-to-ground'},minScale:solar?18000:150000,popupEnabled:true,popupTemplate:{title:solar?'Нарны ширээ · бодит хэмжээ':'Салхин турбин · бодит хэмжээ',content:[{type:'fields',fieldInfos:[{fieldName:'oid',label:'Тоноглолын дугаар'},{fieldName:'moduleCount',label:solar?'Панелийн тоо':'Турбины тоо'},{fieldName:'capacityMw',label:'Чадал · МВт'}]}]},renderer:{type:'unique-value',field:'moduleCount',uniqueValueInfos:symbols} as __esri.UniqueValueRendererProperties & {type:'unique-value'}});
 return {layer,dispose:()=>{layer.destroy();urls.forEach(url=>URL.revokeObjectURL(url));}};
}
