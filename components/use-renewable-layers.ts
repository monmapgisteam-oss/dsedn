'use client';
import {useEffect,useMemo,useState} from 'react';
import {previewData} from '@/lib/client-data';
import {renewableKey,RENEWABLE_DISPLAY_SCHEMA} from '@/lib/renewable-catalog';
import type {Collection,LayerData} from '@/lib/types';
type State={scope:number;layers:Record<number,Collection>;errors:Record<number,string>};
export function useRenewableLayers(scope:5|6,visible:Record<string,boolean>,catalog:LayerData[]){
 const [state,setState]=useState<State>({scope,layers:{},errors:{}});
 const requested=[0,1,4,7,8].filter(id=>id===0||id===4||visible[renewableKey(id)]).join(',');
 useEffect(()=>{
  let alive=true;
  for(const id of requested.split(',').map(Number)){
   previewData<LayerData>('/api/data',{kind:'renewable',layer:id,regionLayer:scope,displaySchema:RENEWABLE_DISPLAY_SCHEMA}).then(d=>{
    if(!alive)return;setState(old=>{const previous=old.scope===scope?old:{scope,layers:{},errors:{}};if(previous.layers[id]===d.data&&!previous.errors[id])return previous;return {scope,layers:{...previous.layers,[id]:d.data},errors:{...previous.errors,[id]:''}};});
   }).catch(e=>{if(alive)setState(old=>{const previous=old.scope===scope?old:{scope,layers:{},errors:{}};return {...previous,errors:{...previous.errors,[id]:e.message}};});});
  }
  return()=>{alive=false;};
 },[scope,requested,visible]);
 const layers=useMemo<Partial<Record<number,Collection>>>(()=>({...(state.scope===scope?state.layers:{}),...(catalog[0]?{5:catalog[0].data}:{}),...(catalog[1]?{6:catalog[1].data}:{})}),[scope,state,catalog]);
 const status=Object.fromEntries(requested.split(',').map(Number).map(id=>[renewableKey(id),state.scope===scope&&state.errors[id]?'Алдаа · унтрааж асаана уу':layers[id]?'':'Ачаалж байна…']));
 return {layers,status,connected:!!layers[0]&&!!layers[4],connectionError:state.scope===scope?(state.errors[0]||state.errors[4]||''):''};
}
