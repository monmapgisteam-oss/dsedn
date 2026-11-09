// IDs and names verified against the owner's Renewable FeatureServer.
export const renewableLayers=[
 {id:0,name:'Агаарын шугам',sourceName:'Tsahilgaan_damjuulax_agaar_shugam',color:'#d97825'},
 {id:1,name:'Нам хүчдэл',sourceName:'Nam_huchdel',color:'#17a7a1'},
 {id:4,name:'Өндөр хүчдэлийн кабель · /4',sourceName:'High_voltage_c_ExportFeature',color:'#7653d5'},
 {id:5,name:'ДСЦТС салбаруудын хил · /5',sourceName:'DSEDN_salbaruud',color:'#2176bc'},
 {id:6,name:'Дарханы хил · /6',sourceName:'Darkhanhil',color:'#24976e'},
 {id:7,name:'Газрын өмчлөл · /7',sourceName:'darkhan_omchlol',color:'#cfab22'},
 {id:8,name:'Газрын эзэмшил · /8',sourceName:'Darhan_ezemshil',color:'#dc6861'},
];
export const renewableKey=(id:number)=>`renewable-${id}`;
// Owner confirmed /2 and /3 are duplicate exports. Use only /4 for high-voltage cable.
export const GRID_LAYER_IDS=[0,4] as const;
export const RENEWABLE_DISPLAY_SCHEMA=2;
// Only technical attributes are returned to the browser. No owner/contact/editor fields.
export const electricalDisplayFields:Record<number,string[]>={
 0:['objectid','air_line_name','voltage_level','damjuulagchiin_turul','wire_diameter','helheenii_too','length_km','tuluw'],
 ...Object.fromEntries([1,4].map(id=>[id,['objectid','voltage_level_cable','damjuulagchiin_mark','wire_size','material','cable_quantity','cabliin_bairlalp','length_km','tuluw']])),
};
export type DisplayField={name:string;alias?:string;domain?:{codedValues?:{code:string|number;name:string}[]}|null};
export function electricalDisplay(properties:Record<string,unknown>,fields:DisplayField[]){
 return Object.fromEntries(fields.filter(f=>f.name!=='objectid').flatMap(f=>{
  const raw=properties[f.name];if(raw===null||raw===undefined||raw==='')return [];
  const decoded=f.domain?.codedValues?.find(v=>String(v.code)===String(raw));
  const numeric=typeof raw==='number'||/^[-+]?\d+(\.\d+)?$/.test(String(raw));
  const unverifiedCode=numeric&&!decoded&&!['length_km','helheenii_too','cable_quantity'].includes(f.name);
  return [[f.name,{label:f.name==='length_km'?'Бүртгэлийн урт · эх утга':f.alias||f.name,value:decoded?.name??`${String(raw)}${unverifiedCode?' · эх утга':''}`}]];
 }));
}
