import {renewableLayers,renewableKey} from './renewable-catalog';
export const mapGroups:{name:string;layers:{id:string;name:string;color:string}[]}[]=[
 {name:'Үнэлгээ ба төлөвлөлт',layers:[
  {id:'results',name:'Санал болгосон талбай',color:'#13866c'},
  {id:'screening',name:'Тохиромжийн үнэлгээ',color:'#31a77a'},
  {id:'equipment',name:'Төлөвлөсөн тоноглол',color:'#326b91'},
  {id:'parcelOverlap',name:'Сонгосон талбайн давхцал',color:'#dc5a52'},
 ]},
 {name:'Renewable · эх давхаргууд',layers:renewableLayers.map(l=>({id:renewableKey(l.id),name:l.name,color:l.color}))},
 {name:'Дэд бүтэц ба суурьшил',layers:[
  {id:'infrastructure',name:'3D шон, дамжуулагч',color:'#79878e'},
  {id:'nationalRoads',name:'Улсын авто зам',color:'#718294'},
  {id:'centres',name:'Аймаг, сумын төв',color:'#167aab'},
  {id:'roads',name:'OSM зам, төмөр зам',color:'#a0a9af'},
  {id:'roadProjects',name:'Замын төслийн цэг',color:'#9b72ad'},
 ]},
 {name:'Газар ба хамгаалалт',layers:[
  {id:'boundary',name:'Тооцооллын бодит хил',color:'#177965'},
  {id:'rivers',name:'Гол',color:'#269cce'},
  {id:'riverProtection',name:'Голын хамгаалах зурвас',color:'#97d4e6'},
  {id:'context',name:'Суурьшил, ус, хамгаалалт',color:'#91a9aa'},
  {id:'soums',name:'Сумын хил, хүн ам',color:'#94a3b8'},
 ]},
];
export const mapColors={high:'#23866a',moderate:'#b6b950',low:'#dda65b',excluded:'#b69293',unassessed:'#a5b1b5'};
