'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import ArcMap from '@arcgis/core/Map.js';
import Basemap from '@arcgis/core/Basemap.js';
import MapView from '@arcgis/core/views/MapView.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import type FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import type GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import Extent from '@arcgis/core/geometry/Extent.js';
import Compass from '@arcgis/core/widgets/Compass.js';
import HomeWidget from '@arcgis/core/widgets/Home.js';
import Fullscreen from '@arcgis/core/widgets/Fullscreen.js';
import Expand from '@arcgis/core/widgets/Expand.js';
import BasemapGallery from '@arcgis/core/widgets/BasemapGallery.js';
import LocalBasemapsSource from '@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js';
import {watch} from '@arcgis/core/core/reactiveUtils.js';
import {createPortal} from 'react-dom';
import {LocateFixed,Mountain,Layers,ZoomIn,Sun,Map as MapIcon} from 'lucide-react';
import type {Bounds,CellResult,Collection} from '@/lib/types';
import type {Layout} from '@/lib/planning';
import {mapGeometry} from './map-geometry';
import {MapDataLayers,analysisLayers} from './map-data-layers';
import {MapLayerPanel} from './map-layer-panel';
import {MapInspection} from './map-inspection';
import {renewableLayers,renewableKey} from '@/lib/renewable-catalog';

type View=MapView|SceneView;
type Props={renewable?:Partial<Record<number,Collection>>;layerStatus?:Record<string,string>;parcelOverlapStatus?:'checked'|'unavailable';parcelOverlap?:Collection;screening?:Collection;rivers?:Collection;riverProtection?:Collection;bounds:Bounds;grid?:Collection;roads?:Collection;boundary?:Collection;exclusions?:Collection;parcels?:Collection;context?:Collection;centres?:Collection;nationalRoads?:Collection;soums?:Collection;roadProjects?:Collection;results:CellResult[];selected:string|null;onSelect:(id:string)=>void;onVisible:(id:string,value:boolean)=>void;visible:Record<string,boolean>;busy:boolean;layout?:Layout;planning?:boolean;windSpeed?:number|null;/** Reports the 2D map scale denominator when the view settles; 0 in 3D, where no single scale applies. */onScale?:(scale:number)=>void};
const extent=(b:Bounds)=>new Extent({xmin:b[0],ymin:b[1],xmax:b[2],ymax:b[3],spatialReference:{wkid:4326}});

export default function StudyMap(props:Props){
 const host=useRef<HTMLDivElement>(null),wrap=useRef<HTMLDivElement>(null),map=useRef<ArcMap|null>(null),view=useRef<View|null>(null),manager=useRef<MapDataLayers|null>(null),current=useRef(props),savedExtent=useRef<Extent|null>(null),lastBounds=useRef(props.bounds.join(','));
 useEffect(()=>{current.current=props;},[props]);
 const focusRef=useRef<(detail?:boolean,home?:boolean)=>Promise<void>>(async()=>{});useEffect(()=>{focusRef.current=focus;});
 const [dim,setDim]=useState<'2d'|'3d'>('2d'),[readyDim,setReadyDim]=useState<'2d'|'3d'|null>(null),[error,setError]=useState(''),[upload,setUpload]=useState('');
 const [layerPanel,setLayerPanel]=useState(false),[opacities,setOpacities]=useState<Record<string,number>>({screening:.7});
 // Hosts for the two app-specific buttons that live in the ArcGIS UI column beside the SDK widgets.
 const [slots,setSlots]=useState<{layers:HTMLElement;focus:HTMLElement}|null>(null);
 const basemaps=useRef<Record<string,Basemap>|null>(null);
 const [hour,setHour]=useState(16),[quality,setQuality]=useState<'medium'|'high'>('medium'),[shadows,setShadows]=useState(true),[analysis,setAnalysis]=useState(false),[motion,setMotion]=useState(true),[windNote,setWindNote]=useState(''),[infrastructureNote,setInfrastructureNote]=useState('');
 const [scale,setScale]=useState(0),[lastPlanning,setLastPlanning]=useState(props.planning),[equipment,setEquipment]=useState<FeatureLayer|null>(null);
 const [infrastructureArea,setInfrastructureArea]=useState<Bounds|null>(null);
 const [inspectionView,setInspectionView]=useState<View|null>(null);
 const basemapRef=useRef('gray-vector'),opacityRef=useRef(opacities);useEffect(()=>{opacityRef.current=opacities;},[opacities]);
 if(lastPlanning!==props.planning){setLastPlanning(props.planning);setDim(props.planning?'3d':'2d');setAnalysis(false);}
 const ready=readyDim===dim;
 const realistic=dim==='3d'&&!analysis;
 const shownLayers=realistic?{...props.visible,...Object.fromEntries([...analysisLayers].map(id=>[id,false]))}:props.visible;
 const near=scale>0&&scale<6000,nearInfrastructure=scale>0&&scale<40000;
 const fallback=useMemo(()=>Object.fromEntries([0,4,7,8].map(id=>[id,(id<5?props.grid:props.parcels)?.features.filter(f=>(f.properties?.sourceLayer??f.properties?.layer)===id)])),[props.grid,props.parcels]);
 const infrastructureGrid=props.renewable?.[0]??props.grid;
 const data=useMemo(()=>({...Object.fromEntries(renewableLayers.map(l=>[renewableKey(l.id),props.renewable?.[l.id]?.features??fallback[l.id]])),boundary:props.boundary?.features,roads:props.roads?.features,nationalRoads:props.nationalRoads?.features,centres:props.centres?.features,soums:props.soums?.features,roadProjects:props.roadProjects?.features,context:props.context?.features,rivers:props.rivers?.features,riverProtection:props.riverProtection?.features,screening:props.screening?.features,results:props.results,parcelOverlap:props.parcelOverlap?.features}),[props.renewable,fallback,props.boundary,props.roads,props.nationalRoads,props.centres,props.soums,props.roadProjects,props.context,props.rivers,props.riverProtection,props.screening,props.results,props.parcelOverlap]);
 const counts=useMemo(()=>({...Object.fromEntries(Object.entries(data).map(([id,features])=>[id,features?.length])),equipment:props.layout?.assets.length}),[data,props.layout]);

 // Keep the map and its data when switching dimensions. Only the view is replaced.
 useEffect(()=>{
  let disposed=false,local:View|undefined,unwatch:ReturnType<typeof watch>|undefined,unwatchBasemap:ReturnType<typeof watch>|undefined;
  const frame=requestAnimationFrame(()=>{void(async()=>{
   if(!host.current||disposed)return;setError('');
   const choices=basemaps.current??=Object.fromEntries(([['gray-vector','Зураглал'],['satellite','Дагуул'],['topo-vector','Гадарга']] as const).map(([id,title])=>{const b=Basemap.fromId(id)!;b.title=title;return [id,b];}));
   if(!map.current){map.current=new ArcMap({basemap:choices['gray-vector']});manager.current=new MapDataLayers(map.current,setUpload);}
   const m=map.current,p=current.current;
   const target=p.planning?p.results.find(c=>c.properties.id===p.selected):undefined;
   const initial=target?mapGeometry(target)?.extent?.expand(1.4):savedExtent.current??extent(p.bounds).expand(1.15);
   if(dim==='3d'){
    const {default:Scene}=await import('@arcgis/core/views/SceneView.js');if(disposed)return;
    if(!m.ground.layers.length)m.set('ground','world-elevation');m.basemap=choices.satellite;
    local=new Scene({container:host.current,map:m,extent:initial,qualityProfile:'medium',environment:{atmosphereEnabled:true,starsEnabled:false,lighting:{type:'sun',date:new Date('2026-06-21T08:00:00Z'),directShadowsEnabled:false,cameraTrackingEnabled:false}},popupEnabled:false});
   }else{m.basemap=choices[basemapRef.current];local=new MapView({container:host.current,map:m,extent:initial,popupEnabled:false,constraints:{rotationEnabled:true}});}
   const v=local;view.current=v;
   // One column of controls running down from the top-right corner: ArcGIS SDK widgets plus two app buttons.
   const layersSlot=document.createElement('div'),focusSlot=document.createElement('div');layersSlot.className=focusSlot.className='map-ui-slot';
   const home=new HomeWidget({view:v});home.goToOverride=()=>focusRef.current(false,true);
   v.ui.move(['zoom','navigation-toggle','compass'],'top-right');
   v.ui.add([
    {component:layersSlot,position:'top-right',index:0},
    // Basemap gallery in both views. 3D opens on imagery; a choice made there does not change the 2D default.
    {component:new Expand({view:v,content:new BasemapGallery({view:v,source:new LocalBasemapsSource({basemaps:Object.values(choices)})}),expandIcon:'basemap',expandTooltip:'Суурь зураг',collapseTooltip:'Суурь зураг хаах',group:'top-right'}),position:'top-right',index:1},
    {component:home,position:'top-right',index:2},
    {component:focusSlot,position:'top-right',index:3},
    {component:new Fullscreen({view:v,element:wrap.current??undefined}),position:'top-right',index:4},
   ]);
   if(dim==='2d'){
    v.ui.add(new Compass({view:v}),'top-right');
    // Remember the gallery's choice so it is restored after a visit to the 3D view (which forces imagery).
    unwatchBasemap=watch(()=>m.basemap,b=>{const id=Object.keys(choices).find(key=>choices[key]===b);if(id)basemapRef.current=id;});
   }
   await v.when();if(disposed)return;setSlots({layers:layersSlot,focus:focusSlot});
   unwatch=watch(()=>v.stationary,stationary=>{
    if(!stationary)return;setScale(v.scale);current.current.onScale?.(v.type==='2d'?v.scale:0);
    if(v.type==='3d'&&v.scale<40000){
     const {longitude,latitude}=v.center;if(typeof longitude!=='number'||typeof latitude!=='number')return;
     const lon=Math.round(longitude*100)/100,lat=Math.round(latitude*100)/100,dy=1500/111195,dx=dy/Math.cos(lat*Math.PI/180);
     const b:Bounds=[lon-dx,lat-dy,lon+dx,lat+dy];setInfrastructureArea(old=>old?.join(',')===b.join(',')?old:b);
    }else setInfrastructureArea(null);
   },{initial:true});setReadyDim(dim);setInspectionView(v);
   if(process.env.NODE_ENV!=='production')(window as unknown as {__dsednMap:unknown}).__dsednMap={view:v,map:m,manager:manager.current};
  })().catch(()=>{if(!disposed)setError('ArcGIS зураг ачаалсангүй. Дахин шинэчилж үзнэ үү.');});});
  return()=>{disposed=true;cancelAnimationFrame(frame);unwatch?.remove();unwatchBasemap?.remove();if(local){if(local.extent)savedExtent.current=local.extent.clone();local.set({map:null,container:null});local.destroy();if(view.current===local)view.current=null;}};
 },[dim]);
 useEffect(()=>()=>{manager.current?.destroy();manager.current=null;map.current?.destroy();map.current=null;basemaps.current=null;},[]);
 useEffect(()=>{if(!ready||lastBounds.current===props.bounds.join(','))return;lastBounds.current=props.bounds.join(',');if(view.current&&!current.current.planning)void view.current.goTo({target:extent(props.bounds).expand(1.15),...(dim==='3d'?{tilt:55,heading:15}:{})},{animate:false}).catch(()=>{});},[ready,dim,props.bounds]);
 useEffect(()=>{manager.current?.settings(props.visible,opacities,realistic,props.parcelOverlapStatus==='checked');},[ready,props.visible,opacities,realistic,props.parcelOverlapStatus]);
 useEffect(()=>{if(!ready||!manager.current)return;for(const [id,features] of Object.entries(data))manager.current.sync(id,features);},[ready,data]);
 useEffect(()=>{manager.current?.select(props.selected);},[ready,props.selected,data.results]);

 // Equipment geometry is created only for a new layout, and glTF is loaded only in 3D.
 useEffect(()=>{
  if(!ready||!map.current||!props.layout?.assets.length){setEquipment(null);return;}
  let disposed=false,layer:FeatureLayer|GraphicsLayer|undefined,release:(()=>void)|undefined;const m=map.current,layout=props.layout;
  void import('./map-equipment').then(mod=>{
   if(disposed)return;if(dim==='3d'){const built=mod.equipmentLayer(layout);layer=built.layer;release=built.dispose;setEquipment(built.layer);}else{layer=mod.planFootprints(layout);release=()=>layer?.destroy();}
   layer.visible=current.current.visible.equipment!==false;layer.opacity=opacityRef.current.equipment??1;m.add(layer);
  }).catch(()=>{if(!disposed)setError('Тоноглолын загвар ачаалсангүй.');});
  return()=>{disposed=true;setEquipment(null);if(layer)m.remove(layer);release?.();};
 },[ready,dim,props.layout]);
 useEffect(()=>{for(const id of ['planned-equipment','equipment-plan']){const layer=map.current?.findLayerById(id);if(layer){layer.visible=props.visible.equipment!==false;layer.opacity=opacities.equipment??1;}}},[ready,dim,props.visible.equipment,opacities.equipment,equipment]);
 useEffect(()=>{
  if(!ready||dim!=='3d'||!equipment||!props.layout||props.layout.technology!=='wind'||!motion)return;
  let disposed=false,stop:(()=>void)|undefined;const scene=view.current as SceneView,layout=props.layout;
  void import('./map-wind-animation').then(mod=>{if(!disposed)stop=mod.animateWind(scene,equipment,layout,props.windSpeed??NaN,setWindNote);});
  return()=>{disposed=true;stop?.();};
 },[ready,dim,equipment,props.layout,props.windSpeed,motion]);
 useEffect(()=>{
  if(!ready||dim!=='3d'||!map.current||!infrastructureGrid||!props.visible.infrastructure||!infrastructureArea)return;
  let disposed=false,built:Awaited<ReturnType<typeof import('./map-infrastructure').infrastructureLayers>>=null;const m=map.current;
  void import('./map-infrastructure').then(mod=>disposed?null:mod.infrastructureLayers(m,infrastructureGrid,infrastructureArea)).then(value=>{built=value;if(disposed){built?.dispose();return;}if(!built)setInfrastructureNote('');if(built){for(const layer of built.layers)layer.opacity=opacityRef.current.infrastructure??1;m.addMany(built.layers);setInfrastructureNote(`${built.count} жишиг тулгуур · ${built.corners} эргэлтийн орой · 14 м${built.truncated?' · дүрслэлийн хязгаар':''}. Хэмжилтийн байршил биш.`);}}).catch(()=>{if(!disposed)setInfrastructureNote('Шонгийн газрын өндөр татагдсангүй.');});
  return()=>{disposed=true;if(built){m.removeMany(built.layers);built.dispose();}};
 },[ready,dim,infrastructureGrid,props.visible.infrastructure,infrastructureArea]);
 useEffect(()=>{for(const id of ['concept-poles','concept-conductors']){const layer=map.current?.findLayerById(id);if(layer)layer.opacity=opacities.infrastructure??1;}},[opacities.infrastructure,infrastructureNote]);
 useEffect(()=>{
  if(!ready||!props.planning||!props.layout?.assets.length||!view.current)return;const candidate=props.results.find(c=>c.properties.id===props.selected);if(!candidate)return;
  void view.current.goTo({target:mapGeometry(candidate)!,...(dim==='3d'?{tilt:62,heading:25}:{})},{animate:false}).catch(()=>{});
 },[ready,dim,props.planning,props.layout,props.results,props.selected]);
 useEffect(()=>{if(ready&&view.current?.type==='3d'){const scene=view.current as SceneView;scene.qualityProfile=quality;scene.environment.lighting={type:'sun',date:new Date(Date.UTC(2026,5,21,hour-8)),directShadowsEnabled:shadows&&near,displayUTCOffset:8,cameraTrackingEnabled:false};}},[ready,dim,hour,quality,shadows,near]);
 async function focus(detail=false,home=false){
  const v=view.current;if(!v)return;const asset=props.layout?.assets[0],candidate=props.results.find(c=>c.properties.id===props.selected);
  let target:__esri.Geometry|Extent=home?extent(props.bounds).expand(1.15):candidate?mapGeometry(candidate)!:extent(props.bounds).expand(1.15);
  if(detail&&asset){target=new Point({longitude:asset.longitude,latitude:asset.latitude});if(v.type==='3d'){try{const terrain=await v.map.ground.queryElevation(target as Point);const p=terrain.geometry as Point;if(typeof p.z==='number'&&Number.isFinite(p.z)){p.z+=(props.layout!.technology==='wind'?props.layout!.assumptions.hubM*.55:1.2);target=p;}}catch{/* Keep terrain-level target. */}}}
  if(detail&&asset&&v.type==='3d'&&props.layout?.technology==='solar'&&target.type==='point'){
   const p=target as Point;
   if(typeof p.z==='number'&&Number.isFinite(p.z)){
    const distance=70,heading=25,angle=heading*Math.PI/180;
    const position=new Point({longitude:asset.longitude-Math.sin(angle)*distance/(111195*Math.cos(asset.latitude*Math.PI/180)),latitude:asset.latitude-Math.cos(angle)*distance/111195});
    try{
     const ground=(await v.map.ground.queryElevation(position)).geometry as Point;
     if(typeof ground.z==='number'&&Number.isFinite(ground.z)){
      // At close scales a scale-based goTo may collide with rising terrain and lose the target.
      position.z=Math.max(ground.z+8,p.z+distance/Math.tan(68*Math.PI/180));
      await v.goTo({position,heading,tilt:Math.atan2(distance,position.z-p.z)*180/Math.PI},{duration:500});return;
     }
    }catch{/* Retain the ordinary goTo fallback. */}
   }
  }
  void v.goTo({target,...(detail?{scale:props.layout?.technology==='solar'?650:2500}:{}),...(dim==='3d'?{tilt:detail?76:58,heading:25}:{})},{duration:500}).catch(()=>{});
 }
 const overlap=!!props.visible.parcelOverlap&&props.parcelOverlapStatus==='checked'&&!realistic;
 function visibility(id:string,value:boolean){if(value&&dim==='3d'&&id!=='equipment'&&id!=='infrastructure')setAnalysis(true);props.onVisible(id,value);}
 return <div className={`map-wrap arcgis-map map-studio ${dim}`} ref={wrap}><div className="arcgis-host" ref={host} aria-label="ArcGIS судалгаа, төлөвлөлтийн газрын зураг"/>
  <MapInspection key={dim} view={ready?inspectionView:null} onSelect={props.onSelect}/>
  {ready&&slots&&createPortal(<button type="button" className={`esri-widget esri-widget--button ${layerPanel?'active':''}`} title="Давхаргууд" aria-label="Давхаргын самбар" aria-expanded={layerPanel} onClick={()=>setLayerPanel(v=>!v)}><Layers size={16}/></button>,slots.layers)}
  {ready&&slots&&createPortal(<button type="button" className="esri-widget esri-widget--button" title="Сонгосон талбай" aria-label="Талбай эсвэл сонгосон талбай рүү ойртох" onClick={()=>void focus()}><LocateFixed size={16}/></button>,slots.focus)}
  {layerPanel&&<MapLayerPanel status={props.layerStatus} visible={shownLayers} counts={counts} opacities={opacities} onVisible={visibility} onOpacity={(id,value)=>setOpacities(p=>({...p,[id]:value}))} onClose={()=>setLayerPanel(false)} dim={dim}/>}
  <div className="dimension-switch" role="group" aria-label="Газрын зургийн харагдац"><button aria-pressed={dim==='2d'} className={dim==='2d'?'active':''} onClick={()=>setDim('2d')}><MapIcon size={14}/>2D шинжилгээ</button><button aria-pressed={dim==='3d'} className={dim==='3d'?'active':''} onClick={()=>{setDim('3d');setAnalysis(false);}}><Mountain size={14}/>Бодит 3D</button></div>
  {props.layout?.assets.length?<button className="layout-focus" onClick={()=>void focus(true)}><ZoomIn size={15}/>Ойроос харах <b>{props.layout.assets.length.toLocaleString('mn-MN')} {props.layout.technology==='solar'?'ширээ':'турбин'}</b></button>:null}
  {dim==='3d'&&<details className="scene-controls" open><summary><Sun size={15}/>3D дүрслэл<span>Бодит хэмжээ</span></summary><div className="scene-controls-body"><label>Гэрэлтүүлэг · VI/21 <b>{hour}:00 УБ</b><input aria-label="Нарны гэрлийн цаг" type="range" min={7} max={20} value={hour} onChange={e=>setHour(Number(e.target.value))}/></label><label className="scene-quality">Чанар<select aria-label="3D дүрслэлийн чанар" value={quality} onChange={e=>setQuality(e.target.value as 'medium'|'high')}><option value="medium">Тэнцвэртэй</option><option value="high">Нарийвчилсан</option></select></label><label className="check-line"><input type="checkbox" checked={shadows} onChange={e=>setShadows(e.target.checked)}/>Ойрын сүүдэр</label>{props.layout?.technology==='wind'&&<label className="check-line"><input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/>Роторын хөдөлгөөн</label>}<label className="check-line"><input type="checkbox" checked={analysis} onChange={e=>setAnalysis(e.target.checked)}/>Шинжилгээний өнгө харуулах</label>{props.layout?.technology==='wind'&&<p>Цамхаг {props.layout.assumptions.hubM} м · ротор Ø{props.layout.assumptions.rotorM} м{motion&&windNote&&<small>{windNote}</small>}</p>}{props.layout?.technology==='solar'&&<p>{props.layout.assumptions.tiltDeg}° налуу · {props.layout.assumptions.rowPitchM.toFixed(1)} м эгнээний алхам</p>}</div></details>}
  {dim==='3d'&&props.visible.infrastructure&&nearInfrastructure&&infrastructureNote&&<div className="infrastructure-note">{infrastructureNote}</div>}
  {!ready&&!error&&<div className="map-loading-overlay"><span className="map-spinner"/>ArcGIS {dim.toUpperCase()} ачаалж байна…</div>}{error&&<div className="map-error" role="alert">{error}</div>}{ready&&upload&&<div className="map-upload" role="status"><span className="map-spinner"/>{upload}</div>}
  <div className="map-legend"><strong>{overlap?'Газрын давхцал':realistic?(props.planning?'Бодит хэмжээт төлөвлөлт':'Дэд бүтцийн 3D дүрслэл'):props.screening?.features.length?'Тохиромжийн үнэлгээ':'Дэд бүтэц ба тооцооллын хил'}</strong>{overlap?<div>{[['#dc5a52','Бусдын / тодорхойгүй'],['#269b68','ДСЦТС']].map(([color,label])=><span key={color}><i style={{background:color}}/>{label}</span>)}</div>:!realistic&&<div>{(props.screening?.features.length?[['#23866a','70–100'],['#b6b950','45–69'],['#dda65b','0–44'],['#b69293','Хасагдсан']]:[['#d17a35','Цахилгаан шугам'],['#718294','Авто зам'],['#269cce','Гол']]).map(([color,label])=><span key={color}><i style={{background:color}}/>{label}</span>)}</div>}<small>{realistic?'Урьдчилсан төлөвлөлт · инженерийн эцсийн зураг биш':overlap?'Кадастр зураглаагүй хэсэг нь чөлөөтэй газар гэсэн үг биш':'Харагдац солих нь бүх хилд хийх тооцоог хязгаарлахгүй'}</small></div>
 </div>;
}
