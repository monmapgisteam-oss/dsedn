'use client';
import {useEffect,useState} from 'react';
import {Save,LogIn,LoaderCircle,ExternalLink} from 'lucide-react';
import type {SiteRun} from '@/lib/siting';
const portal='https://gis.selbecity.mn/geoportal';
export function SaveResults({run}:{run:SiteRun}){
 const [title,setTitle]=useState(`DSEDN · ${run.request.technology==='solar'?'Нар':'Салхи'} · ${run.createdAt.slice(0,10)}`),[ready,setReady]=useState(false),[message,setMessage]=useState('Enterprise эрхийг шалгаж байна…'),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
 useEffect(()=>{let alive=true;fetch('/api/results').then(r=>r.json()).then(d=>{if(alive){setReady(d.ready);setMessage(d.ready?'renewable хавтаст хувийн item хадгална.':d.message);}}).catch(()=>{if(alive)setMessage('Enterprise холболт шалгагдсангүй.');});return()=>{alive=false;};},[]);
 async function save(){setBusy(true);setUrl('');try{
  let token='';
  if(!ready){
   // SDK-managed sign-in: credentials go to the user's trusted Enterprise portal.
   const [{default:identity},{default:ServerInfo}]=await Promise.all([import('@arcgis/core/identity/IdentityManager.js'),import('@arcgis/core/identity/ServerInfo.js')]);
   identity.registerServers([new ServerInfo({server:portal+'/sharing/rest',tokenServiceUrl:portal+'/sharing/rest/generateToken',currentVersion:12.1})]);
   const credential=await identity.getCredential(portal+'/sharing/rest',{error:undefined});token=credential.token;
  }
  const response=await fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({runId:run.id,title})});
  const d=await response.json();if(!response.ok)throw new Error(d.error);setUrl(d.url);setMessage('renewable хавтаст хадгаллаа.');
 }catch(e){setMessage(e instanceof Error?e.message:'Нэвтрэлт / хадгалалт цуцлагдсан.');}finally{setBusy(false);}}
 return <section className="control-card save-results"><div className="section-heading"><h3><Save size={15}/>Үр дүнг хадгалах</h3><span>ArcGIS Enterprise</span></div><label>Үр дүнгийн нэр<input value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></label><p className="small-text">gis.selbecity.mn → renewable<br/>Үнэлгээний цэгүүд, талбайнууд, газрын давхцал, тоноглол, тооцооллын хил болон аргачлалын мэдээлэл. Хувийн Feature Collection item.</p><button className="button primary full-width" disabled={busy||!run.id||!title.trim()} onClick={save}>{busy?<LoaderCircle size={15} className="spin"/>:ready?<Save size={15}/>:<LogIn size={15}/>} {busy?'Хадгалж байна…':ready?'Enterprise-д хадгалах':'Enterprise-д нэвтрээд хадгалах'}</button><p className="small-text" role="status">{message}</p>{url&&<a href={url} target="_blank" rel="noreferrer">Хадгалсан үр дүн нээх <ExternalLink size={13}/></a>}</section>;
}
