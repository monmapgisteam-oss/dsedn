import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import type ArcMap from '@arcgis/core/Map.js';
import type {Feature,Geometry} from 'geojson';
import {mapGroups,mapColors} from '@/lib/map-catalog';
import {renewableLayers,renewableKey} from '@/lib/renewable-catalog';
import {mapGeometry,rgba} from './map-geometry';

type Features=Feature<Geometry>[]|undefined;
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export const analysisLayers=new Set(['screening','results','boundary','parcelOverlap','riverProtection','context','soums',...renewableLayers.map(l=>renewableKey(l.id))]);
const scales:Record<string,number>={parcels:80000,context:180000,roads:300000,riverProtection:200000,roadProjects:600000};
const layerStyle:Record<string,{color:string;width:number;alpha?:number;dash?:boolean}>={
 boundary:{color:'#177965',width:1.6},grid:{color:'#d17a35',width:.8},roads:{color:'#a0a9af',width:.8},nationalRoads:{color:'#718294',width:1.4},soums:{color:'#94a3b8',width:1,dash:true},rivers:{color:'#269cce',width:1},riverProtection:{color:'#97d4e6',width:.4,alpha:.2},context:{color:'#91a9aa',width:.5,alpha:.12},parcels:{color:'#ad83c5',width:.6,alpha:.14},results:{color:'#13866c',width:1.5,alpha:.22},parcelOverlap:{color:'#dc5a52',width:1,alpha:.55},exclusions:{color:'#b98996',width:1,alpha:.15},
};
// Layers that stay at full strength while results are highlighted.
const focusKeep=new Set(['results','parcelOverlap','centres']);
const FOCUS_EFFECT='grayscale(70%) opacity(45%)';
export class MapDataLayers{
 readonly graphics=new Map<string,GraphicsLayer>();
 readonly stats={graphicsBuilt:0,screeningUploads:0};
 private records=new Map<string,{features:Features;revision:number;built:boolean}>();
 private visibility:Record<string,boolean>={};private opacity:Record<string,number>={};private realistic=false;private overlap=false;private selected:string|null=null;private dead=false;private focus=false;
 private screening?:FeatureLayer;private screeningRevision=0;
 constructor(private map:ArcMap,private loading:(message:string)=>void){
  const ids=['boundary','soums','riverProtection','rivers','context',...renewableLayers.filter(l=>l.id>=5).map(l=>renewableKey(l.id)),'roads','nationalRoads',...renewableLayers.filter(l=>l.id<5).map(l=>renewableKey(l.id)),'centres','roadProjects','results','parcelOverlap'];
  for(const id of ids){const title=mapGroups.flatMap(g=>g.layers).find(l=>l.id===id)?.name??id;const layer=new GraphicsLayer({id,title,elevationInfo:{mode:'on-the-ground'},minScale:['renewable-7','renewable-8'].includes(id)?80000:scales[id]??0});this.graphics.set(id,layer);map.add(layer);}
 }
 sync(id:string,features:Features){
  const previous=this.records.get(id);
  if(previous?.features===features||previous&&!previous.features?.length&&!features?.length)return;
  const record={features,revision:(previous?.revision??0)+1,built:false};this.records.set(id,record);
  if(id==='screening'){this.screeningRevision++;if(this.screening){this.map.remove(this.screening);this.screening.destroy();this.screening=undefined;}}
  else this.graphics.get(id)?.removeAll();
  if(this.shown(id))void this.build(id,record);
 }
 private shown(id:string){return (this.visibility[id]??true)&&!(this.realistic&&analysisLayers.has(id));}
 settings(visibility:Record<string,boolean>,opacity:Record<string,number>,realistic:boolean,overlapChecked=false,focus=false){
  const overlap=!!visibility.parcelOverlap&&overlapChecked&&!realistic,changed=overlap!==this.overlap;
  const focused=focus&&!realistic,focusChanged=focused!==this.focus;
  this.visibility=visibility;this.opacity=opacity;this.realistic=realistic;this.overlap=overlap;this.focus=focused;
  if(changed)for(const g of this.graphics.get('results')?.graphics??[])g.symbol=this.resultSymbol(String(g.attributes.cellId),String(g.attributes.status)) as never;
  for(const [id,layer] of this.graphics){
   layer.visible=this.shown(id);layer.opacity=opacity[id]??1;
   // "Highlight results": supporting layers fade and lose colour so the suitability classes stand out.
   // The user's own opacity still applies on top. Effects are 2D-only; SceneView ignores them.
   layer.effect=focused&&!focusKeep.has(id)?FOCUS_EFFECT:null;
   const r=this.records.get(id);if(layer.visible&&r&&!r.built)void this.build(id,r);
  }
  if(this.screening){this.screening.visible=this.shown('screening');this.screening.opacity=opacity.screening??.7;if(focusChanged)this.screening.renderer=this.screeningRenderer() as never;}
  const r=this.records.get('screening');if(this.shown('screening')&&r&&!r.built)void this.build('screening',r);
 }
 select(id:string|null){if(id===this.selected)return;this.selected=id;for(const g of this.graphics.get('results')?.graphics??[]){g.symbol=this.resultSymbol(String(g.attributes.cellId),String(g.attributes.status)) as never;}this.filterOverlap();}
 private resultSymbol(id:string,status:string){return {type:'simple-fill',color:this.overlap&&id===this.selected?rgba('#cbd4d1',.6):rgba(mapColors[status as keyof typeof mapColors]??'#13866c',id===this.selected ? .2:.1),outline:{color:id===this.selected?'#087d68':'#298d79',width:id===this.selected?2.8:1.4}};}
 private filterOverlap(){for(const g of this.graphics.get('parcelOverlap')?.graphics??[])g.visible=g.attributes.siteId===this.selected;}
 private graphic(id:string,f:Feature<Geometry>):Graphic[]{
  const geometry=mapGeometry(f);if(!geometry)return [];const p=f.properties??{};
  const source=renewableLayers.find(l=>renewableKey(l.id)===id);
  if(source)return [new Graphic({geometry,attributes:{...p,sourceLayer:source.id},symbol:(geometry.type==='polygon'?{type:'simple-fill',color:rgba(source.color,source.id>=7?.12:.03),outline:{color:p.dsedn?'#168654':source.color,width:p.dsedn?1.7:1,style:source.id===5?'dash':'solid'}}:{type:'simple-line',color:source.color,width:source.id===0?.9:.8,style:source.id===0?'solid':source.id===1?'short-dot':'dash'}) as never})];
  if(id==='centres'||id==='roadProjects'){
   const name=String(p.displayName||p.name||'');return [new Graphic({geometry,attributes:p,symbol:{type:'simple-marker',style:id==='centres'?'circle':'square',size:id==='centres'?7:5,color:id==='centres'?'#167aab':'#9b72ad',outline:{color:'#fff',width:1.4}}}),...(name?[new Graphic({geometry,symbol:{type:'text',text:name,color:'#234658',haloColor:'#fff',haloSize:1.5,yoffset:11,font:{size:9,family:'Arial',weight:'bold'}}})]:[])];
  }
  if(id==='results')return [new Graphic({geometry,attributes:{...p,cellId:p.id},symbol:this.resultSymbol(p.id,p.status) as never})];
  const s=layerStyle[id]??layerStyle.context;
  const color=id==='parcels'?(p.dsedn?'#269b68':s.color):id==='parcelOverlap'?(p.category==='dsedn'?'#269b68':'#dc5a52'):id==='nationalRoads'&&p.accessEligible===false?'#b6bdc3':s.color;
  return [new Graphic({geometry,attributes:p,symbol:(geometry.type==='point'?{type:'simple-marker',size:4,color,outline:{width:0}}:geometry.type==='polygon'?{type:'simple-fill',color:rgba(color,s.alpha??0),outline:{color,width:s.width,style:s.dash?'dash':'solid'}}:{type:'simple-line',color,width:s.width,style:s.dash||p.accessEligible===false?'dash':'solid'}) as never})];
 }
 private async build(id:string,record:{features:Features;revision:number;built:boolean}){
  if(record.built||this.dead)return;record.built=true;
  const features=record.features??[];if(!features.length)return;
  if(id==='screening'){await this.uploadScreening(features);return;}
  const layer=this.graphics.get(id);if(!layer)return;
  for(let i=0;i<features.length;){
   if(this.dead||this.records.get(id)!==record)return;
   const start=performance.now(),batch:Graphic[]=[];
   do{batch.push(...this.graphic(id,features[i++]));}while(i<features.length&&batch.length<400&&performance.now()-start<7);
   layer.addMany(batch);this.stats.graphicsBuilt+=batch.length;if(id==='parcelOverlap')this.filterOverlap();await pause();
  }
 }
 // While highlighting, excluded sample points recede so the scored classes read first.
 private screeningRenderer(){return {type:'unique-value',field:'status',uniqueValueInfos:Object.entries(mapColors).map(([value,color])=>({value,symbol:{type:'simple-marker',size:value==='excluded'?2.2:3.6,color:value==='excluded'&&this.focus?rgba(color,.3):color,outline:{width:0}}}))};}
 private async uploadScreening(features:NonNullable<Features>){
  const revision=this.screeningRevision;
  const layer=new FeatureLayer({id:'screening',title:'Тохиромжийн үнэлгээ',geometryType:'point',spatialReference:{wkid:4326},objectIdField:'oid',outFields:['*'],source:[],fields:[{name:'oid',type:'oid'},{name:'score',type:'double'},{name:'status',type:'string'},{name:'reason',type:'string'},{name:'stepM',type:'double'}],elevationInfo:{mode:'on-the-ground'},opacity:this.opacity.screening??.7,visible:this.shown('screening'),popupEnabled:true,popupTemplate:{title:'Тохиромжийн үнэлгээ · дээжийн төв',content:[{type:'fields',fieldInfos:[{fieldName:'score',label:'Оноо / 100'},{fieldName:'reason',label:'Хасагдсан шалтгаан'},{fieldName:'stepM',label:'Дээжийн алхам · м'}]}]},renderer:this.screeningRenderer() as never});
  this.screening=layer;this.map.add(layer,2);
  try{
   await layer.load();
   for(let i=0;i<features.length;i+=1000){
    if(this.dead||revision!==this.screeningRevision)return;
    const batch=features.slice(i,i+1000).flatMap((f,j)=>{const geometry=mapGeometry(f);return geometry?[new Graphic({geometry,attributes:{oid:i+j+1,score:f.properties?.score,status:f.properties?.status,reason:f.properties?.reason,stepM:f.properties?.stepM}})]:[];});
    const result=await layer.applyEdits({addFeatures:batch});if(result.addFeatureResults.some(r=>r.error))throw new Error('Үнэлгээний давхарга бүрэн зурагдсангүй.');
    this.stats.screeningUploads+=batch.length;this.loading(`Үнэлгээний давхарга · ${Math.min(i+1000,features.length).toLocaleString()} / ${features.length.toLocaleString()}`);await pause();
   }
   if(!this.dead&&revision===this.screeningRevision)this.loading('');
  }catch(e){if(!this.dead&&revision===this.screeningRevision)this.loading(e instanceof Error?e.message:'Үнэлгээний давхарга ачаалсангүй.');}
 }
 destroy(){this.dead=true;this.screeningRevision++;}
}
