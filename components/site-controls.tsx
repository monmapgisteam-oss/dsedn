'use client';
import {useEffect,useState} from 'react';
import {SlidersHorizontal,CalendarRange,MapPinned,RotateCcw} from 'lucide-react';
import {criterionLabels,weightPercent,type SiteWeights} from '@/lib/siting-controls';
import {bbox} from '@turf/turf';
import {scopeName} from '@/lib/search-scope';
import type {Bounds} from '@/lib/types';
import type {SiteRequest} from '@/lib/siting';
import type {LayerData,Collection} from '@/lib/types';
import {previewData} from '@/lib/client-data';
import type {TransportData} from '@/lib/transport';
type Preview={study?:{data?:LayerData;error?:string};river?:{data?:{rivers:LayerData;protection:Collection};error?:string};transport?:{data?:TransportData;error?:string}};
export function useStudyLayers(r:SiteRequest){
 const [catalog,setCatalog]=useState<LayerData[]>([]),[preview,setPreview]=useState<Preview>({}),[loading,setLoading]=useState(false),[version,setVersion]=useState(0),[catalogError,setCatalogError]=useState('');
 useEffect(()=>{let alive=true;previewData<{layers:LayerData[]}>('/api/study-layers',undefined,version>0).then(d=>{if(alive){setCatalog(d.layers);setCatalogError('');}}).catch(e=>{if(alive)setCatalogError(e.message);});return()=>{alive=false;};},[version]);
 const {regionLayer,riverSetbackM}=r;
 useEffect(()=>{let alive=true;const timer=setTimeout(()=>{
  setLoading(true);setPreview({});let remaining=3;
  for(const part of ['study','river','transport'] as const){
   previewData<Preview>('/api/study-layers',{regionLayer,riverSetbackM,part},version>0).then(d=>{if(alive)setPreview(previous=>({...previous,[part]:d[part]}));}).catch(e=>{if(alive)setPreview(previous=>({...previous,[part]:{error:e.message}}));}).finally(()=>{remaining--;if(alive&&!remaining)setLoading(false);});
  }
 },200);return()=>{alive=false;clearTimeout(timer);};},[regionLayer,riverSetbackM,version]);
 return {catalog,preview,loading,errors:[catalogError,...Object.values(preview).map(p=>p?.error)].filter(Boolean) as string[],refresh:()=>setVersion(v=>v+1)};
}
export function StudyControls({request:r,edit,catalog,loading,errors,refresh}:{request:SiteRequest;edit:(p:Partial<SiteRequest>)=>void;catalog:LayerData[];loading:boolean;errors:string[];refresh:()=>void}){
 const regions=catalog[r.regionLayer===5?0:1]?.data.features??[];
 return <><section className="control-card study-controls"><div className="section-heading"><h3><MapPinned size={15}/>Тооцооллын орон зай</h3><button className="text-button" onClick={refresh} title="Давхаргын хандалтыг дахин шалгах"><RotateCcw size={13}/></button></div><div className="parcel-modes" role="group" aria-label="Хайх орон зай">{([6,5] as const).map(layer=><button key={layer} className={r.regionLayer===layer?'active':''} aria-pressed={r.regionLayer===layer} onClick={()=>{const source=catalog[layer===5?0:1];edit({regionLayer:layer,regionId:0,parcels:layer===6?false:r.parcels,...(source?{bounds:bbox(source.data) as Bounds}:{})});}}><MapPinned size={15}/><span>{scopeName(layer)}<small>Renewable /{layer} · бүх хил</small></span></button>)}</div><p className="small-text">Сонгосон давхаргын бүх {regions.length||'…'} полигоны дотор хайна. Газрын зургийн харагдац, томруулалт хайлтын хүрээг өөрчлөхгүй. Том бүсийг автоматаар хэсэгчлэн тооцоолж нэгтгэнэ.</p>{r.regionLayer===6&&<p className="note">/6: газрын эрхийн мэдээлэлгүй. Кадастрын шалгалт хийхгүй; газрыг эрхийн хувьд чөлөөтэй гэж батлахгүй.</p>}<div className="layer-health">{loading?'Хил, гол, авто зам, төвүүдийг шинэчилж байна…':errors.length?'Зарим давхарга татагдсангүй':'Хил, гол, ЗТХТ давхаргууд бэлэн'}</div>{errors.map(e=><p className="note" key={e}>{e}</p>)}</section>
 <section className="control-card weight-controls"><div className="section-heading"><h3><SlidersHorizontal size={15}/>Шалгуурын ач холбогдол</h3><span>Слайдераар тохируулна</span></div>{Object.entries(criterionLabels).map(([key,label])=>{const k=key as keyof SiteWeights;return <label key={key}><span>{label}<b>{weightPercent(r.weights,k).toFixed(1)}%</b></span><input aria-label={label+' · жин'} type="range" min={0} max={100} step={1} value={r.weights[k]} onChange={e=>edit({weights:{...r.weights,[k]:Number(e.target.value)}})}/></label>;})}<p className="small-text">Жингийн нийлбэрийг 100%-д хувиргана. Шугамын зайг оноо болон дээд зайн босгоор тооцно. Жинг 0 болгосон ч хатуу хориг, хамгаалах зай хэвээр үйлчилнэ.</p></section>
 <section className="control-card study-controls"><div className="section-heading"><h3><CalendarRange size={15}/>ERA5 · хугацааны сонголт</h3></div><div className="period-inputs"><label>Эхлэх огноо<input type="date" value={r.era5Start} min="1940-01-01" onChange={e=>edit({era5Start:e.target.value})}/></label><label>Дуусах огноо<input type="date" value={r.era5End} min={r.era5Start} onChange={e=>edit({era5End:e.target.value})}/></label></div><p className="small-text">Жилийн үйлдвэрлэлд 01-01 → 12-31 хүртэл дууссан бүтэн жилүүд (1–30 жил) ашиглана. Сонгосон хугацааны цаг тутмын өгөгдлөөр дундаж календарийн жил гаргана.</p></section></>;
}
