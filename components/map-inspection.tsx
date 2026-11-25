'use client';
import {useEffect,useRef,useState} from 'react';
import {watch} from '@arcgis/core/core/reactiveUtils.js';
import type MapView from '@arcgis/core/views/MapView.js';
import type SceneView from '@arcgis/core/views/SceneView.js';
import {ChevronLeft,ChevronRight,MousePointer2,Pin,X} from 'lucide-react';
import {inspectionInfo,inspectionPriority,type InspectionInfo} from '@/lib/map-inspection';
type Tip={x:number;y:number;items:InspectionInfo[];index:number;pinned:boolean;total:number};
// Booroljuut's throttled hit-test pattern: no picking while navigating, and discard stale results.
export function MapInspection({view,onSelect}:{view:MapView|SceneView|null;onSelect:(id:string)=>void}){
 const [tip,setTip]=useState<Tip|null>(null),clear=useRef(()=>{}),select=useRef(onSelect);
 useEffect(()=>{select.current=onSelect;},[onSelect]);
 useEffect(()=>{
  if(!view)return;
  let disposed=false,busy=false,pinned=false,version=0,last=0,timer:ReturnType<typeof setTimeout>|undefined,pointer:{x:number;y:number}|null=null;
  const reset=()=>{version++;pinned=false;if(timer){clearTimeout(timer);timer=undefined;}setTip(null);if(view.container)view.container.style.cursor='';};clear.current=()=>{pointer=null;reset();};
  const pick=async(pos:{x:number;y:number},pin=false)=>{
   if(disposed||busy||view.stationary===false||document.hidden)return;
   busy=true;const request=version;last=performance.now();
   try{
    const hit=await view.hitTest(pos,{include:view.map.layers.toArray()});if(disposed||request!==version)return;
    const graphics:__esri.Graphic[]=[];for(const h of hit.results)if(h.type==='graphic'&&h.graphic.layer?.visible&&h.graphic.layer.opacity>0&&h.graphic.visible!==false)graphics.push(h.graphic);
    const candidate=graphics.find(g=>String(g.layer?.id??'')==='results'&&g.attributes?.cellId);
    const items:InspectionInfo[]=[],seen=new Set<string>();
    graphics.sort((a,b)=>inspectionPriority(String(b.layer?.id??''),b.geometry?.type??'')-inspectionPriority(String(a.layer?.id??''),a.geometry?.type??''));
    for(const g of graphics){const p=g.attributes??{},info=inspectionInfo(String(g.layer?.id??''),p);if(!info)continue;const key=String(g.layer?.id??'')+':'+String(p.objectid??p.objectid_1??p.oid??p.cellId??p.sourceId??JSON.stringify(info.rows));if(seen.has(key))continue;seen.add(key);if(items.length<20)items.push(info);}
    pinned=pin&&items.length>0;setTip(items.length?{...pos,items,index:0,pinned,total:seen.size}:null);
    if(view.container)view.container.style.cursor=items.length?'pointer':'';
    if(pin&&candidate)select.current(candidate.attributes.cellId);
   }catch{if(!disposed&&request===version){pinned=false;setTip(null);}}finally{busy=false;if(!disposed&&!pinned&&request!==version&&pointer)schedule();}
  };
  const schedule=()=>{if(timer||disposed||pinned||!pointer||view.stationary===false)return;timer=setTimeout(()=>{timer=undefined;if(pointer)void pick(pointer);},Math.max(0,120-(performance.now()-last)));};
  const move=view.on('pointer-move',e=>{pointer={x:e.x,y:e.y};if(!pinned){version++;schedule();}});
  const leave=view.on('pointer-leave',()=>{pointer=null;if(!pinned)reset();});
  const click=view.on('click',e=>{version++;pinned=true;const pos={x:e.x,y:e.y},request=version;pointer=pos;const retry=()=>{if(disposed||request!==version)return;if(busy){timer=setTimeout(retry,30);return;}timer=undefined;void pick(pos,true);};if(timer)clearTimeout(timer);retry();});
  const stationary=watch(()=>view.stationary,still=>{reset();if(still)schedule();else if(timer){clearTimeout(timer);timer=undefined;}});
  const settings=watch(()=>view.map.allLayers.map(l=>`${l.id}:${l.visible}:${l.opacity}`).join('|'),reset);
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')clear.current();};document.addEventListener('keydown',key);
  return()=>{disposed=true;version++;if(timer)clearTimeout(timer);move.remove();leave.remove();click.remove();stationary.remove();settings.remove();document.removeEventListener('keydown',key);if(view.container)view.container.style.cursor='';};
 },[view]);
 if(!tip||!view)return null;const info=tip.items[tip.index];
 // Hover shows only the feature's name; clicking pins the full attribute panel.
 if(!tip.pinned){
  const left=Math.max(8,Math.min(tip.x+14,view.width-240)),top=Math.max(8,Math.min(tip.y+14,view.height-40));
  return <div role="tooltip" className="map-hover-name" style={{left,top}}><span style={{background:info.color}}/>{info.title}</div>;
 }
 const left=Math.max(8,Math.min(tip.x+18,view.width-322)),top=Math.max(8,Math.min(tip.y+18,view.height-390));
 return <section role={tip.pinned?'region':'tooltip'} aria-label="Газрын зургийн объектын мэдээлэл" className={`map-inspection ${tip.pinned?'is-pinned':''}`} style={{left,top,borderTopColor:info.color}}><header><span style={{background:info.color}}/>{tip.pinned?<Pin size={13}/>:<MousePointer2 size={13}/>}<b>{info.title}</b>{tip.pinned&&<button aria-label="Объектын мэдээллийг хаах" onClick={()=>clear.current()}><X size={16}/></button>}</header><dl>{(tip.pinned?info.rows:info.rows.slice(0,7)).map(([label,value],i)=><div key={label+i}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{info.source&&<small>{info.source}</small>}{info.note&&<p>{info.note}</p>}<footer>{tip.pinned&&tip.items.length>1?<><button aria-label="Өмнөх давхцсан объект" onClick={()=>setTip({...tip,index:(tip.index-1+tip.items.length)%tip.items.length})}><ChevronLeft size={16}/></button><span>{tip.index+1} / {tip.total} объект{tip.total>20?' · эхний 20':''}</span><button aria-label="Дараах давхцсан объект" onClick={()=>setTip({...tip,index:(tip.index+1)%tip.items.length})}><ChevronRight size={16}/></button></>:<span>{tip.pinned?'Esc · хаах':`Дарж бүрэн харах${tip.total>1?` · ${tip.total} объект давхцсан`:''}`}</span>}</footer></section>;
}
