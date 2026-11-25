'use client';
import {useEffect,useRef,useState} from 'react';
import {FolderOpen,LoaderCircle,Sun,Wind,ExternalLink,RefreshCw,X} from 'lucide-react';
import type {SiteRun} from '@/lib/siting';

/** Fired on window after a result is saved to Portal, so the saved-model list refreshes. */
export const SAVED_EVENT='dsedn:saved';
type Saved={id:string;title:string;modified:number|null;snippet:string;loadable:boolean;technology:'solar'|'wind'|null;url:string};

/** Header button listing the user's results saved to Portal; choosing one reopens it without recalculating. */
export function SavedModels({disabled,onOpen}:{disabled?:boolean;onOpen:(run:SiteRun,title:string)=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Saved[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[opening,setOpening]=useState('');
 const root=useRef<HTMLDivElement>(null);
 async function refresh(){
  setLoading(true);setError('');
  try{const r=await fetch('/api/results/saved',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setItems(d.items);}
  catch(e){setError(e instanceof Error?e.message:'Жагсаалт татагдсангүй.');}finally{setLoading(false);}
 }
 async function choose(item:Saved){
  setOpening(item.id);setError('');
  try{const r=await fetch('/api/results/saved/'+item.id,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);onOpen(d.run as SiteRun,d.title||item.title);setOpen(false);}
  catch(e){setError(e instanceof Error?e.message:'Загвар нээгдсэнгүй.');}finally{setOpening('');}
 }
 function toggle(){setOpen(v=>{if(!v)void refresh();return !v;});}
 // Load the list once up front so the button can be greyed out while nothing is saved, and again after each save.
 useEffect(()=>{
  let alive=true;
  const load=()=>fetch('/api/results/saved',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(alive&&d)setItems(d.items);}).catch(()=>{});
  void load();window.addEventListener(SAVED_EVENT,load);
  return()=>{alive=false;window.removeEventListener(SAVED_EVENT,load);};
 },[]);
 const none=items!==null&&!items.some(i=>i.loadable);
 useEffect(()=>{
  if(!open)return;
  const away=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',key);};
 },[open]);
 return <div className="saved-models" ref={root}>
  <button className="button" disabled={disabled||none} title={none?'Хадгалсан загвар алга':'Хадгалсан загвар нээх'} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><FolderOpen size={15}/><span>Хадгалсан загвар</span></button>
  {open&&<section className="saved-models-panel" role="dialog" aria-label="Хадгалсан загварууд">
   <header><b>Хадгалсан загварууд</b><span>Portal · renewable</span><button type="button" aria-label="Жагсаалт шинэчлэх" title="Шинэчлэх" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/></button><button type="button" aria-label="Хаах" onClick={()=>setOpen(false)}><X size={15}/></button></header>
   {error&&<p className="saved-models-error" role="alert">{error}</p>}
   {items===null?<p className="saved-models-empty"><LoaderCircle size={14} className="spin"/>Ачаалж байна…</p>:!items.length?<p className="saved-models-empty">Хадгалсан загвар алга. Тооцооллын дараа «Enterprise-д хадгалах» дарна уу.</p>:
   <ul>{items.map(item=><li key={item.id}>
    <button type="button" className="saved-model" disabled={!item.loadable||!!opening} title={item.loadable?'Дахин тооцоололгүй нээх':'Хуучин хувилбар: бүтэн загвар хадгалагдаагүй'} onClick={()=>void choose(item)}>
     <i>{item.technology==='wind'?<Wind size={15}/>:<Sun size={15}/>}</i>
     <span><b>{item.title}</b><small>{item.modified?new Date(item.modified).toLocaleString('mn-MN',{dateStyle:'medium',timeStyle:'short'}):''}{!item.loadable&&' · дахин нээх боломжгүй'}</small></span>
     {opening===item.id&&<LoaderCircle size={15} className="spin"/>}
    </button>
    <a href={item.url} target="_blank" rel="noreferrer" aria-label={`${item.title} — Portal дээр нээх`} title="Portal дээр нээх"><ExternalLink size={13}/></a>
   </li>)}</ul>}
  </section>}
 </div>;
}
