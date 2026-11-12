'use client';
import {useEffect,useState} from 'react';
import {Save,LoaderCircle,ExternalLink} from 'lucide-react';
import type {SiteRun} from '@/lib/siting';
export function SaveResults({run}:{run:SiteRun}){
 const [title,setTitle]=useState(`DSEDN · ${run.request.technology==='solar'?'Нар':'Салхи'} · ${run.createdAt.slice(0,10)}`),[ready,setReady]=useState(false),[message,setMessage]=useState('Enterprise эрхийг шалгаж байна…'),[busy,setBusy]=useState(false),[url,setUrl]=useState(''),[host,setHost]=useState('ArcGIS Enterprise');
 useEffect(()=>{let alive=true;fetch('/api/results').then(async r=>{const d=await r.json();if(alive){setReady(r.ok&&d.ready);if(typeof d.portal==='string')try{setHost(new URL(d.portal).host);}catch{/* keep generic label */}setMessage(r.ok?`${d.username} · renewable хавтаст хувийн item хадгална.`:d.error||'Enterprise холболт шалгагдсангүй.');}}).catch(()=>{if(alive)setMessage('Enterprise холболт шалгагдсангүй.');});return()=>{alive=false;};},[]);
 async function save(){setBusy(true);setUrl('');try{
  const response=await fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:run.id,title})});
  const d=await response.json();if(response.status===401)setReady(false);if(!response.ok)throw new Error(d.error);setUrl(d.url);setMessage('renewable хавтаст хадгаллаа.');
 }catch(e){setMessage(e instanceof Error?e.message:'Нэвтрэлт / хадгалалт цуцлагдсан.');}finally{setBusy(false);}}
 return <section className="control-card save-results"><div className="section-heading"><h3><Save size={15}/>Үр дүнг хадгалах</h3><span>ArcGIS Enterprise</span></div><label>Үр дүнгийн нэр<input value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></label><p className="small-text">{host} → renewable<br/>Үнэлгээний цэгүүд, талбайнууд, газрын давхцал, тоноглол, тооцооллын хил болон аргачлалын мэдээлэл. Хувийн Feature Collection item.</p><button className="button primary full-width" disabled={!ready||busy||!run.id||!title.trim()} onClick={save}>{busy?<LoaderCircle size={15} className="spin"/>:<Save size={15}/>} {busy?'Хадгалж байна…':'Enterprise-д хадгалах'}</button><p className="small-text" role="status">{message}</p>{url&&<a href={url} target="_blank" rel="noreferrer">Хадгалсан үр дүн нээх <ExternalLink size={13}/></a>}</section>;
}
