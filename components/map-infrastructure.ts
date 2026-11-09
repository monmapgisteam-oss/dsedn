import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import Multipoint from '@arcgis/core/geometry/Multipoint.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer.js';
import RotationVariable from '@arcgis/core/renderers/visualVariables/RotationVariable.js';
import type ArcMap from '@arcgis/core/Map.js';
import type {Bounds,Collection} from '@/lib/types';
import {conceptualSpans,conductorPath} from '@/lib/infrastructure';
import {concretePoleModel,distributionAttachmentOffsets} from '@/lib/distribution-pole-model';
import {modelRenderer} from '@/lib/renewable-models';
export async function infrastructureLayers(map:ArcMap,grid:Collection,bounds:Bounds){
 const model=conceptualSpans(grid,bounds);if(!model.poles.length)return null;
 const terrain=await map.ground.queryElevation(new Multipoint({points:model.poles.map(p=>[p.longitude,p.latitude]),spatialReference:{wkid:4326}}),{returnSampleInfo:true});
 const points=(terrain.geometry as Multipoint).points;
 if(points.some(p=>!Number.isFinite(p[2]))||terrain.sampleInfo?.some(s=>s.demResolution<=0))throw new Error('3D шонгийн газрын өндөр баталгаажаагүй.');
 const href=concretePoleModel(14),bytes=Uint8Array.from(atob(href.split(',')[1]),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
 const roles={corner:'Эргэлтийн орой',junction:'Нийлсэн орой',end:'Шугамын төгсгөл',intermediate:'Завсрын тулгуур',clip:'Дүрслэлийн хязгаар'};
 const supports=new FeatureLayer({id:'concept-poles',title:'Загварчилсан тулгуур · хэмжилтийн байршил биш',geometryType:'point',spatialReference:{wkid:4326},objectIdField:'oid',outFields:['*'],fields:[{name:'oid',type:'oid'},...['heading','turnDeg','heightM'].map(name=>({name,type:'double' as const})),...['role','lineName','lineId','voltageText'].map(name=>({name,type:'string' as const}))],source:model.poles.map((p,i)=>new Graphic({geometry:new Point({longitude:p.longitude,latitude:p.latitude,z:points[i][2]}),attributes:{oid:i+1,heading:p.heading,role:roles[p.role],turnDeg:p.role==='corner'?p.turnDeg:null,heightM:14,lineName:p.lineNames.join(' / '),lineId:p.sourceIds.join(', '),voltageText:p.voltageTexts.join(' / ')}})),elevationInfo:{mode:'absolute-height'},renderer:new SimpleRenderer({...modelRenderer({href:url,height:14}) as unknown as __esri.SimpleRendererProperties,visualVariables:[new RotationVariable({field:'heading',rotationType:'geographic'})]}),popupEnabled:false,minScale:40000});
 const conductors=new GraphicsLayer({id:'concept-conductors',title:'Дамжуулагч · таамагласан унжилт',elevationInfo:{mode:'absolute-height'},minScale:40000});
 const attachments=distributionAttachmentOffsets(14);
 conductors.addMany(model.spans.flatMap((s,i)=>attachments.map(offset=>new Graphic({geometry:new Polyline({paths:[conductorPath(points[s.a],points[s.b],offset.rightM,offset.upM,Math.min(2,s.lengthM*.02),model.poles[s.a].heading,model.poles[s.b].heading)],spatialReference:{wkid:4326}}),attributes:{oid:i+1,lineName:s.lineName,lineId:s.lineId,voltageText:s.voltageText,spanM:s.lengthM,sagM:Math.min(2,s.lengthM*.02)},symbol:{type:'line-3d',symbolLayers:[{type:'path',profile:'circle',width:.035,height:.035,material:{color:'#3d474a'}}]}}))));
 return {layers:[supports,conductors],count:model.poles.length,corners:model.poles.filter(p=>p.role==='corner').length,truncated:model.truncated,dispose:()=>{supports.destroy();conductors.destroy();URL.revokeObjectURL(url);}};
}
