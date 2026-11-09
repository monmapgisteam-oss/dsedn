import type { Resource, Technology } from '@/lib/types';

export default function ClimateChart({resource,technology}:{resource?:Resource;technology:Technology}){
  const values=(technology==='solar'?resource?.monthlySolar:resource?.monthlyWind)??[];
  if(!values.some(v=>v!==null))return null;
  const maximum=Math.max(1,...values.filter((v):v is number=>v!==null));
  const unit=technology==='solar'?'кВт·ц/м²/өдөр':'м/с · 50 м';
  return <section className="climate-card"><div className="section-heading"><h3>{technology==='solar'?'Нарны цацраг · сараар':'Салхины хурд · сараар'}</h3><span>{unit}</span></div><div className="climate-bars" role="img" aria-label={`NASA POWER сарын дундаж, ${unit}. ${values.map((v,i)=>`${i+1} сар: ${v??'өгөгдөлгүй'}`).join('; ')}`}>
    {values.map((v,i)=><div key={i}><span className="bar-value">{v===null?'—':v.toFixed(1)}</span><div className="bar-track"><i style={{height:`${v===null?0:v/maximum*100}%`}}/></div><small>{i+1}</small></div>)}
  </div><p>NASA POWER · бүс нутгийн дундаж, талбай доторх ялгааг илэрхийлэхгүй.</p></section>;
}
