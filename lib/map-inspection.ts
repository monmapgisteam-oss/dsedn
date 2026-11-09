import {mapGroups} from './map-catalog';
import {electricalDisplayFields,renewableLayers,renewableKey} from './renewable-catalog';
export type InspectionInfo={title:string;color:string;rows:[string,string][];source?:string;note?:string};
const present=(v:unknown)=>v!==null&&v!==undefined&&v!=='';
const text=(v:unknown)=>typeof v==='number'?(Number.isFinite(v)?v.toLocaleString('mn-MN',{maximumFractionDigits:3}):'—'):String(v).slice(0,180);
export function inspectionPriority(id:string,geometry:string){
 if(id==='concept-poles')return 120;
 if(['planned-equipment','wind-towers','equipment-plan'].includes(id))return 110;
 if(id==='concept-conductors')return 100;
 if(geometry==='polyline'||geometry==='point'&&id!=='screening')return 90;
 if(id==='results')return 80;
 if(id==='screening')return 60;
 if(id==='parcelOverlap'||id==='renewable-7'||id==='renewable-8')return 50;
 return 10;
}
export function inspectionInfo(id:string,p:Record<string,unknown>):InspectionInfo|null{
 const definition=renewableLayers.find(l=>renewableKey(l.id)===id),entry=mapGroups.flatMap(g=>g.layers).find(l=>l.id===id);
 const rows:[string,string][]=[];
 const add=(label:string,value:unknown)=>{if(present(value))rows.push([label,text(value)]);};
 if(definition){
  add('Бүртгэлийн ID',p.objectid??p.objectid_1);
  if(definition.id<5){
   add('Геометрийн урт · км',p.geometryLengthKm);
   const display=p.display as Record<string,{label:string;value:string}>|undefined;
   for(const field of electricalDisplayFields[definition.id])if(display?.[field])add(display[field].label,display[field].value);
   if(!display){add('Шугамын нэр',p.air_line_name);add('Хүчдэлийн эх утга',p.voltage_level??p.voltage_level_cable);}
  }else if(definition.id<7){add('Нэр',p.name);add('Код',p.code);}
  else{add('Газрын эрх',definition.id===7?'Өмчлөл':'Эзэмшил');add('Ангилал',p.dsedn===true?'ДСЦТС':p.dsedn===false?'Бусдын / тодорхойгүй':'Тодорхойгүй');}
  return {title:definition.name,color:definition.color,rows,source:`Renewable /${definition.id} · ${definition.sourceName}`,note:definition.id>=7?'Эзэмшигчийн хувийн мэдээллийг харуулахгүй.':undefined};
 }
 if(id==='concept-poles'||id==='concept-conductors'){
  add('Шугамын нэр',p.lineName);add('Эх шугамын ID',p.lineId);add('Хүчдэл',p.voltageText);
  if(id==='concept-poles'){add('Тулгуурын дугаар',p.oid);add('Байрлалын төрөл',p.role);add('Эргэлтийн өнцөг · °',p.turnDeg);add('Загварын өндөр · м',p.heightM);}
  else{add('Алслалт · м',p.spanM);add('Жишиг унжилт · м',p.sagM);}
  return {title:id==='concept-poles'?'Агаарын шугамын тулгуур':'Агаарын дамжуулагч',color:'#d97825',rows,source:'Renewable /0 → 3D загвар',note:'Шугамын геометрээс загварчилсан. Шонгийн хэмжилт, баталгаат хийц биш.'};
 }
 if(['planned-equipment','equipment-plan','wind-towers'].includes(id)){
  add('Тоноглолын ID',p.oid??p.cellId);add('Чадал · МВт',p.capacityMw);if(Number(p.moduleCount)>1)add('Панелийн тоо',p.moduleCount);
  return {title:id==='wind-towers'?'Турбины цамхаг':'Төлөвлөсөн тоноглол',color:'#326b91',rows,note:'Бодит хэмжээтэй урьдчилсан төлөвлөлтийн загвар.'};
 }
 if(!entry||!Object.keys(p).length)return null;
 if(id==='results'){add('Талбай',p.cellId??p.id);add('Тохиромжийн оноо / 100',p.score);if(present(p.areaKm2))add('Талбай · га',Number(p.areaKm2)*100);add('Цахилгаан шугам хүртэл · км',p.gridKm);add('Авто зам хүртэл · км',p.roadKm);add('Налуу · °',p.slope);}
 else if(id==='screening'){add('Оноо / 100',p.score);add('Дээжийн алхам · м',p.stepM);add('Төлөв',({high:'Өндөр',moderate:'Дунд',low:'Бага',excluded:'Хасагдсан',unassessed:'Шалгаагүй'} as Record<string,string>)[String(p.status)]);add('Шалтгаан',({river_setback:'Голын хамгаалах зурвас',parcel:'Бусдын / тодорхойгүй газар',terrain:'Налуу / DEM',settlement_setback:'Суурьшлын хамгаалах зай',line_setback:'Шугамын хамгаалах зурвас',road_corridor:'Замын зурвас',water_protected:'Ус / хамгаалалт',proximity:'Дэд бүтэц хэт хол',settlement_proximity:'Төв хэт хол',boundary:'Хилийн гадна'} as Record<string,string>)[String(p.reason)]??p.reason);}
 else if(id==='parcelOverlap'){add('Талбай',p.siteId);add('Давхцлын ангилал',p.category==='dsedn'?'ДСЦТС':'Бусдын / тодорхойгүй');add('Давхцсан талбай · м²',p.areaM2);}
 else{add('Нэр',p.displayName??p.name??p.NAME);add('Бүртгэлийн ID',p.sourceId??p.objectid??p.OBJECTID);add('Төрөл',p.kind??p.type??p.highway??p.landuse);add('Код',p.code);add('Эх давхарга',p.sourceLayer);}
 return {title:entry.name,color:entry.color,rows:rows.length?rows:[['Давхарга',entry.name]]};
}
