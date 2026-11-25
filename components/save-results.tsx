'use client';
import {useEffect,useState} from 'react';
import {Save,LoaderCircle,Check} from 'lucide-react';
import type {SiteRun} from '@/lib/siting';
import {SAVED_EVENT} from './saved-models';
export function SaveResults({run}:{run:SiteRun}){
 const [title,setTitle]=useState(`DSEDN · ${run.request.technology==='solar'?'Нар':'Салхи'} · ${run.createdAt.slice(0,10)}`),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{let alive=true;fetch('/api/results').then(async r=>{const d=await r.json();if(alive){setReady(r.ok&&d.ready);if(!r.ok)setError(d.error||'Enterprise холболт шалгагдсангүй.');}}).catch(()=>{if(alive)setError('Enterprise холболт шалгагдсангүй.');});return()=>{alive=false;};},[]);
 async function save(){setBusy(true);setError('');try{
  const response=await fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:run.id,title})});
  const d=await response.json();if(response.status===401)setReady(false);if(!response.ok)throw new Error(d.error);setSaved(true);window.dispatchEvent(new Event(SAVED_EVENT));
 }catch(e){setError(e instanceof Error?e.message:'Нэвтрэлт / хадгалалт цуцлагдсан.');}finally{setBusy(false);}}
 return <section className="control-card save-results"><div className="section-heading"><h3><Save size={15}/>Үр дүнг хадгалах</h3><span>ArcGIS Enterprise</span></div><label>Үр дүнгийн нэр<input value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);setSaved(false);}}/></label><button className="button primary full-width" disabled={!ready||busy||saved||!run.id||!title.trim()} onClick={save}>{busy?<LoaderCircle size={15} className="spin"/>:saved?<Check size={15}/>:<Save size={15}/>} {busy?'Хадгалж байна…':saved?'Хадгалагдсан':'Enterprise-д хадгалах'}</button>{error&&<p className="small-text" role="alert">{error}</p>}</section>;
}
