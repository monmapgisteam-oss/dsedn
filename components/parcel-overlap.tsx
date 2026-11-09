'use client';
import {LandPlot} from 'lucide-react';
import type {Candidate} from '@/lib/siting';
import {num} from './site-details';

export function ParcelOverlapCard({candidate,enabled,onToggle,enforced}:{candidate:Candidate;enabled:boolean;onToggle:(visible:boolean)=>void;enforced:boolean}){
 const value=candidate.metrics.parcelOverlap;
 return <section className="control-card parcel-overlap-card"><div className="section-heading"><h3><LandPlot size={15}/>Газрын давхцал</h3><span>{candidate.properties.id}</span></div>
 {!value||value.status==='unavailable'?<p className="note">{!value?'Давхцлын хэмжээг харахын тулд дахин тооцоолно уу.':'Энэ бүсэд кадастрын мэдээлэлгүй. Давхцлыг 0% гэж үзэхгүй.'}</p>:<>
 <div className="overlap-bar" role="img" aria-label={`Бусдын / тодорхойгүй ${num(value.otherPct,1)}%, ДСЦТС ${num(value.dsednPct,1)}%, бүртгэлгүй хэсэг ${num(value.unmappedPct,1)}%`}><i className="overlap-other" style={{width:`${value.otherPct}%`}}/><i className="overlap-dsedn" style={{width:`${value.dsednPct}%`}}/><i className="overlap-unmapped" style={{width:`${value.unmappedPct}%`}}/></div>
 <dl className="key-values">{[['Бусдын / тодорхойгүй эрх',value.otherM2,value.otherPct,'other'],['ДСЦТС-ийн газар',value.dsednM2,value.dsednPct,'dsedn'],['Кадастр зураглаагүй хэсэг',value.unmappedM2,value.unmappedPct,'unmapped']].map(([label,m2,pct,kind])=><div key={kind}><dt><i className={`overlap-dot overlap-${kind}`}/>{label}</dt><dd>{num(Number(m2),1)} м² <strong>· {num(Number(pct),2)}%</strong></dd></div>)}</dl>
 <label className="layer-row"><input type="checkbox" checked={enabled} onChange={e=>onToggle(e.target.checked)}/><span>Сонгосон талбайн давхцлыг зурагт харах</span></label>
 <p className="small-text">{enforced?'Бусдын болон тодорхойгүй эрхтэй газрын огтлолцлыг хайлтаас хассан.':'Кадастр тооцохгүй горим: давхцлыг хэмжиж харуулсан, хайлтаас хасаагүй.'} Давхардсан бүртгэлийг нэг удаа хэмжинэ. Давхар эрх таарвал бусдын / тодорхойгүй хэсэгт тооцно.</p><p className="small-text">Кадастр зураглаагүй хэсэг нь газар ашиглах эрх чөлөөтэйг батлахгүй.</p>
 </>}
 </section>;
}
