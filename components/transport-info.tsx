import {ExternalLink,MapPinned} from 'lucide-react';
import type {SiteMetrics,SiteRun} from '@/lib/siting';
import {centreKindName,transportService} from '@/lib/transport';
const n=(value:number|null,d=2)=>value===null?'Мэдээлэлгүй':value.toLocaleString('mn-MN',{maximumFractionDigits:d});
export function TransportCandidate({metrics:m}:{metrics:SiteMetrics}){
 if(!m.nearestCentre)return <p className="note">Тээвэр, суурьшлын шинэ өгөгдлөөр дахин хайна уу.</p>;
 return <div className="transport-candidate"><h3><MapPinned size={14}/>Суурьшил ба тээврийн хүртээмж</h3><dl className="key-values"><div><dt>Ойрын төв · ЗТХТ</dt><dd>{m.nearestCentre.name}</dd></div><div><dt>{centreKindName(m.nearestCentre.kind)} хүртэл</dt><dd>{n(m.nearestCentre.distanceKm)} км</dd></div><div><dt>OSM суурьшлын цэг / зах</dt><dd>{m.residentialKm===null?'12 км хүрээнд зураглаагүй':`${n(m.residentialKm)} км`}</dd></div><div><dt>Улсын авто зам хүртэл</dt><dd>{m.nationalRoadKm===null?'13 км хүрээнд бүртгэлгүй':`${n(m.nationalRoadKm)} км`}</dd></div>{m.soums.map(s=><div key={s.id}><dt>{s.name}<small>Бүртгэлийн хүн ам · он тодорхойгүй</small></dt><dd>{n(s.population,0)}</dd></div>)}</dl></div>;
}
export function TransportSources({run}:{run:SiteRun|null}){
 const rows=[{id:8,label:'Нийслэл, аймаг, сумын төв',detail:'Ойр байдлын оноо + хамгийн их зай',count:run?.layers.centres?.features.length},{id:9,label:'Улсын чанартай авто зам',detail:'Замын хүртээмж ба хамгаалах зурвас',count:run?.layers.nationalRoads?.features.length},{id:12,label:'Сумын хил, хүн ам',detail:'Зөвхөн мэдээлэл; суурьшлын хил биш',count:run?.layers.soums?.features.length},{id:2,label:'Замын төслийн эхлэл / төгсгөл',detail:'Зөвхөн мэдээлэл; ашиглагдаж буй зам биш',count:run?.layers.roadProjects?.features.length}];
 return <details className="control-card transport-sources"><summary>ЗТХТ · суурьшил ба тээврийн өгөгдөл</summary>{rows.map(row=><div key={row.id}><a href={`${transportService}/${row.id}`} target="_blank" rel="noreferrer">{row.label}<ExternalLink size={11}/></a><span>{row.count===undefined?'Газрын зурагт татна':`${row.count} бүртгэл`}</span><small>{row.detail}</small></div>)}</details>;
}
