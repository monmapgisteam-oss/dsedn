'use client';

import { Database, Zap, Mountain, Route, Sun, ShieldCheck, Upload, ArrowUpRight } from 'lucide-react';
import type { LayerData, Resource, Terrain, Provenance } from '@/lib/types';

type Props={inputs:{grid?:LayerData;roads?:LayerData;terrain?:Terrain;resource?:Resource;exclusions?:LayerData};sources:Provenance[];busy:boolean;reviewNote:string;reviewed:boolean;onNote:(s:string)=>void;onReviewed:(v:boolean)=>void;onImport:(file:File|undefined,kind:'terrain'|'roads'|'exclusions')=>void};
export default function SourcePanel(p:Props){
  const cards=[
    {title:'Цахилгаан сүлжээ',icon:Zap,source:p.inputs.grid?.provenance,kind:null,text:'Агаарын шугамын 0, кабелийн 2 дугаар давхарга. Давхардсан 3, 4 дүгээр экспорт болон өмчлөгчийн мэдээллийг ашиглахгүй.'},
    {title:'Газрын гадарга',icon:Mountain,source:p.inputs.terrain?.provenance,kind:'terrain',text:'SRTM 90 м өгөгдлөөс нүдний төвийн налууг тооцно. Метрээр илэрхийлсэн, хойд зүг дээш чиглэсэн EPSG:4326 GeoTIFF DEM-ээр сольж болно.'},
    {title:'Зам ба логистик',icon:Route,source:p.inputs.roads?.provenance,kind:'roads',text:'Geofabrik / OpenStreetMap авто зам, шороон зам, төмөр зам. Төмөр замыг зөвхөн зурагт харуулна. Хүнд даацын тээврийн боломжийг баталгаажуулаагүй.'},
    {title:'Нар, салхины нөөц',icon:Sun,source:p.inputs.resource?.provenance,kind:null,text:'NASA POWER-ийн бүс нутгийн уур амьсгалын дундаж. GHI болон 50 м өндөр дэх салхины хурдыг талбайн бүх нүдэнд ижил хэрэглэнэ.'},
    {title:'Байгаль орчин, газрын хязгаарлалт',icon:ShieldCheck,source:p.inputs.exclusions?.provenance,kind:'exclusions',text:'Тусгай хамгаалалттай газар, ус, суурьшил, хамгаалалтын бүс зэрэг хасах талбайг WGS84 polygon GeoJSON хэлбэрээр оруулна. Буферийн үндэслэлийг тэмдэглэнэ.'},
  ] as const;
  return <div className="document-page"><div className="document-heading"><span className="eyebrow">ӨГӨГДЛИЙН УДИРДЛАГА</span><h1>Эх үүсвэр ба баталгаажуулалт</h1><p>Холболт, хамрах хүрээ, өгөгдлийн чанарыг үнэлгээний хамт хадгална.</p></div>
    <div className="source-notice"><Database size={22}/><p>ArcGIS түлхүүр зөвхөн локал серверт хадгалагдана. Холболт нь унших эрхтэй бөгөөд газрын өмчлөгч, эзэмшигчийн бүртгэлийг татахгүй.</p><span className="tag">ЗӨВХӨН УНШИХ</span></div>
    <div className="source-grid">{cards.map(({title,icon:Icon,source,kind,text})=><article className="source-card" key={title}><div className="source-card-top"><Icon size={22}/><span className={`source-state ${source?'ok':''}`}>{source?'Холбогдсон':kind==='exclusions'?'Өгөгдөл шаардлагатай':'Үнэлгээ хийхэд татна'}</span></div><h2>{title}</h2><p>{text}</p>{source&&<small>Татсан: {new Date(source.retrievedAt).toLocaleString('mn-MN',{timeZone:'Asia/Ulaanbaatar'})} · УБ</small>}{kind&&<label className={`button secondary upload-button ${p.busy?'disabled':''}`}><Upload size={15}/>{source?'Файл солих':kind==='terrain'?'DEM оруулах':'GeoJSON оруулах'}<input type="file" disabled={p.busy} accept={kind==='terrain'?'.tif,.tiff':'.json,.geojson'} onChange={e=>{p.onImport(e.target.files?.[0],kind);e.target.value='';}}/></label>}</article>)}</div>
    <section className="review-box"><ShieldCheck size={24}/><div><h2>Хязгаарлалтын шалгалт</h2><p>Эх үүсвэр, огноо, хамрах хүрээ, хамгаалалтын зай болон шалгасан хүний тэмдэглэлийг бичнэ үү.</p><textarea aria-label="Хязгаарлалт шалгасан үндэслэл" placeholder="Өгөгдлийн нэр, огноо, хамрах хүрээ, буферийн үндэслэл, шалгасан хүн…" value={p.reviewNote} disabled={p.busy} onChange={e=>p.onNote(e.target.value)}/><label className="check-line"><input type="checkbox" disabled={p.busy||p.reviewNote.trim().length<25} checked={p.reviewed} onChange={e=>p.onReviewed(e.target.checked)}/>Талбайн байгаль орчин, газар ашиглалтын хязгаарлалт болон өгөгдлийн хамрах хүрээг шалгасан.</label></div></section>
    <h2 className="section-title">Эх өгөгдлийн бүртгэл</h2><p className="muted">Нийлүүлэгчийн нэр, техникийн тайлбарыг эх хэлбэрээр нь хадгалсан. JSON экспортод мөн багтана.</p>
    {p.sources.map((s,i)=><details className="source-record" key={i}><summary>{s.name}<time>{s.retrievedAt.slice(0,10)}</time></summary><p>{s.detail}</p>{s.source.startsWith('https://')?<a href={s.source} target="_blank" rel="noreferrer">Эх үүсвэр нээх <ArrowUpRight size={14}/></a>:<small>{s.source}</small>}</details>)}
    <p className="note">Сервисийн item: d03247783ade41ab84dc667bc67c6abd. Энэ нь өгсөн 0f422fabc1be40ce981ce35321b6e6e2 item-аас өөр тул заасан FeatureServer URL-ийг үндсэн холболт болгосон.</p>
  </div>;
}
