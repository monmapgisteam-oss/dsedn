import {randomUUID} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import type {SiteRun} from '../siting';
import {enterpriseResult} from '../enterprise-result';
import {readStoredJson,writeStoredJson} from './runtime-storage';
import {PORTAL_URL} from './enterprise';
export const portal=PORTAL_URL;
export async function rememberRun(run:SiteRun){run.id=randomUUID();await writeStoredJson(run.id+'.json',run);return run;}
export async function readRun(id:string):Promise<SiteRun>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Тооцооллын ID буруу.');try{return await readStoredJson<SiteRun>(id+'.json');}catch{throw new Error('Тооцооны хадгалсан хувилбар олдсонгүй. Дахин тооцоолно уу.');}}
type PortalItem={id:string;title:string;type:string;owner?:string;created?:number;modified?:number;snippet?:string;tags?:string[];typeKeywords?:string[]};
type Packed={schemaVersion?:number;encoding?:string;data?:string};
type PortalResponse={error?:{code:number;message?:string;details?:string[]};username?:string;user?:{username:string};privileges?:string[];appInfo?:{appOwner:string;privileges:string[]};folders?:{id:string;title:string}[];folder?:{id:string};id?:string;success?:boolean;access?:string;type?:string;ownerFolder?:string;owner?:string;title?:string;created?:number;typeKeywords?:string[];items?:PortalItem[];nextStart?:number;dsednRun?:Packed};
const compress=promisify(gzip),decompress=promisify(gunzip);

/** Marks Feature Collection items that also carry the complete run, so they reopen without recalculating. */
export const RUN_KEYWORD='DSEDN Run';
// Feature Collection items accept no resources ("AddResources not supported for this item type") and a single
// 13 MB request failed with HTTP 500, while ~5 MB item text is accepted. The run is therefore stored in one or
// more companion items of ≤4 MB each, whose IDs the main item lists in its typeKeywords.
const PART_CHARS=4_000_000;
const DATA_KEYWORD='DSEDN Run Data';
const partKeyword=(i:number,id:string)=>`DSEDNRunData${i}_${id}`;
const ownerKeyword=(id:string)=>`DSEDNRunFor${id}`;
const receiptPathFor=(runId:string,owner:string)=>runId+'-'+Buffer.from(owner).toString('hex')+'.saved.json';
type Receipt={itemId:string;url:string;folder:string;savedAt:string};
const itemUrl=(id:string)=>`${portal}/home/item.html?id=${id}`;

async function unpackRun(base64:string):Promise<SiteRun>{
 const run=JSON.parse((await decompress(Buffer.from(base64,'base64'))).toString('utf8')) as SiteRun;
 if(!run||typeof run!=='object'||!run.request||!Array.isArray(run.candidates)||!run.layers||typeof run.layers!=='object'||typeof run.createdAt!=='string')throw new Error('Хадгалсан загварын бүтэц буруу байна.');
 return run;
}
/** Companion item IDs in part order, read from the main item's typeKeywords. */
const runParts=(keywords?:string[])=>(keywords??[]).map(k=>/^DSEDNRunData(\d{1,3})_([a-f0-9]{32})$/i.exec(k)).filter(m=>!!m).sort((a,b)=>Number(a[1])-Number(b[1])).map(m=>m[2]);

async function portalFetch(path:string,body:URLSearchParams|FormData,referer?:string,timeout=60000){
 const step=path.split('/').pop()||path;
 const response=await fetch(`${portal}/sharing/rest${path}`,{method:'POST',body,headers:referer?{Referer:referer}:undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw new Error(`Enterprise HTTP ${response.status} (${step}).`);
 return {response,step};
}
async function portalRequest(path:string,token:string,values:Record<string,string>={},referer?:string):Promise<PortalResponse>{
 const {response,step}=await portalFetch(path,new URLSearchParams({f:'json',...values,token}),referer);const d=await response.json();
 if(d.error)throw new Error(`Enterprise хүсэлтийн алдаа (${step}, ${d.error.code}${d.error.message?`: ${d.error.message}`:''}). Portal-д бичих эрхтэй хэрэглэгчээр нэвтэрнэ үү.`);return d;
}
export async function portalIdentity(token:string,referer?:string){
 const d=await portalRequest('/community/self',token,{},referer);const username=d.username||d.user?.username;
 if(!username)throw new Error('Одоогийн API key нь давхарга унших эрхтэй боловч Portal хэрэглэгчийн эрхгүй. Enterprise-д нэвтэрч renewable хавтаст хадгална уу.');
 return username;
}
export const configuredToken=()=>process.env.ARCGIS_PORTAL_TOKEN||process.env.ARCGIS_API_KEY||'';
async function userFolder(token:string,referer?:string){
 const owner=await portalIdentity(token,referer),user='/content/users/'+encodeURIComponent(owner);
 const listing=await portalRequest(user,token,{},referer);
 return {owner,user,folder:listing.folders?.find(f=>f.title.toLowerCase()==='renewable')?.id};
}

/** Stores the compressed run in companion items, then marks the main item as reopenable. Safe to repeat. */
async function attachRun(run:SiteRun,itemId:string,title:string,user:string,folder:string,token:string,referer:string|undefined,keywords:string[]){
 const packed=(await compress(JSON.stringify(run))).toString('base64'),parts=Math.max(1,Math.ceil(packed.length/PART_CHARS));
 // A previous, interrupted attempt may have left companion items behind.
 for(const stale of (await folderItems(user,folder,token,referer)).filter(i=>i.typeKeywords?.includes(ownerKeyword(itemId))))
  await portalRequest(`${user}/items/${stale.id}/delete`,token,{},referer).catch(()=>{});
 const ids:string[]=[];
 for(let i=0;i<parts;i++){
  const text=JSON.stringify({layers:[],dsednRunPart:{schemaVersion:1,encoding:'gzip+base64',index:i,parts,item:itemId,data:packed.slice(i*PART_CHARS,(i+1)*PART_CHARS)}});
  const added=await portalRequest(`${user}/${encodeURIComponent(folder)}/addItem`,token,{title:`${title} · загварын өгөгдөл ${i+1}/${parts}`,type:'Feature Collection',text,tags:'DSEDN,renewable,model-data',snippet:'«Хадгалсан загвар»-ыг дахин нээхэд хэрэглэгдэх өгөгдөл. Устгавал үндсэн үр дүнг дахин нээх боломжгүй.',typeKeywords:['Data','Feature Collection',DATA_KEYWORD,ownerKeyword(itemId)].join(','),access:'private'},referer);
  if(!added.success||!added.id||!/^[a-f0-9]{32}$/i.test(added.id))throw new Error(`Загварын хэсэг ${i+1}/${parts} хадгалагдсангүй.`);
  ids.push(added.id);
 }
 const typeKeywords=[...keywords.filter(k=>k!==RUN_KEYWORD&&!/^DSEDNRunData\d/.test(k)),RUN_KEYWORD,...ids.map((id,i)=>partKeyword(i,id))].join(',');
 const updated=await portalRequest(`${user}/items/${itemId}/update`,token,{typeKeywords},referer);
 if(updated.success===false)throw new Error('Загварын тэмдэглэгээ шинэчлэгдсэнгүй.');
}
async function folderItems(user:string,folder:string,token:string,referer?:string){
 const items:PortalItem[]=[];
 for(let start=1;start>0&&items.length<2000;){const page=await portalRequest(`${user}/${encodeURIComponent(folder)}`,token,{num:'100',start:String(start)},referer);items.push(...(page.items??[]));start=page.nextStart&&page.nextStart>start?page.nextStart:-1;}
 return items;
}
/** The signed-in user's saved results in their `renewable` folder, newest first. */
export async function listSaved(token:string,referer?:string){
 const {user,folder}=await userFolder(token,referer);if(!folder)return [];
 return (await folderItems(user,folder,token,referer)).filter(i=>i.type==='Feature Collection'&&!i.typeKeywords?.includes(DATA_KEYWORD)).sort((a,b)=>(b.modified??0)-(a.modified??0)).map(i=>({
  id:i.id,title:i.title,modified:i.modified??null,snippet:i.snippet??'',loadable:!!i.typeKeywords?.includes(RUN_KEYWORD),
  technology:i.tags?.includes('solar')?'solar':i.tags?.includes('wind')?'wind':null,url:itemUrl(i.id),
 }));
}

/** Reopens a saved model. Only the signed-in owner's items are accepted. */
export async function loadSaved(id:string,token:string,referer?:string){
 if(!/^[a-f0-9]{32}$/i.test(id))throw new Error('Item ID буруу.');
 const owner=await portalIdentity(token,referer),item=await portalRequest('/content/items/'+id,token,{},referer);
 if(item.type!=='Feature Collection'||item.owner!==owner)throw new Error('Энэ item таны хадгалсан үр дүн биш.');
 const parts=runParts(item.typeKeywords);let packed='';
 if(parts.length){
  for(const [i,partId] of parts.entries()){
   const meta=await portalRequest('/content/items/'+partId,token,{},referer);
   if(meta.owner!==owner||!meta.typeKeywords?.includes(ownerKeyword(id)))throw new Error(`Загварын хэсэг ${i+1}/${parts.length} энэ үр дүнд хамаарахгүй.`);
   const part=(await portalRequest(`/content/items/${partId}/data`,token,{},referer)) as {dsednRunPart?:{index?:number;data?:string}};
   if(part.dsednRunPart?.index!==i||typeof part.dsednRunPart.data!=='string')throw new Error(`Загварын хэсэг ${i+1}/${parts.length} уншигдсангүй. Portal дээр «загварын өгөгдөл» item устсан байж магадгүй.`);
   packed+=part.dsednRunPart.data;
  }
 }else{
  // Early saves carried the run inside the item data.
  const embedded=(await portalRequest(`/content/items/${id}/data`,token,{},referer)).dsednRun;
  if(embedded?.encoding==='gzip+base64'&&typeof embedded.data==='string')packed=embedded.data;
 }
 if(!packed)throw new Error('Энэ item-д бүтэн тооцооллын загвар хадгалагдаагүй (хуучин хувилбар). Дахин тооцоолж хадгална уу.');
 const run=await unpackRun(packed);
 if(!run.id||!/^[a-f0-9-]{36}$/.test(run.id))run.id=randomUUID();
 // Keep the run and a receipt on this server so "save" offers the existing item instead of a duplicate.
 await writeStoredJson(run.id+'.json',run);
 await writeStoredJson(receiptPathFor(run.id,owner),{itemId:id,url:itemUrl(id),folder:'renewable',savedAt:new Date(item.created??Date.now()).toISOString()} satisfies Receipt);
 return {run,title:item.title??'',url:itemUrl(id)};
}

// Creates a private, map-viewable Feature Collection item and attaches the full run. Never edits the source services.
export async function saveEnterprise(run:SiteRun,title:string,token:string,referer?:string){
 const request=(path:string,values:Record<string,string>={})=>portalRequest(path,token,values,referer);
 const context=await userFolder(token,referer),{owner,user}=context;let folder=context.folder;
 const receiptPath=receiptPathFor(run.id??'',owner);
 const previous=await readStoredJson<Receipt>(receiptPath).then(async receipt=>({receipt,item:await request('/content/items/'+receipt.itemId)})).catch(()=>null);/* Missing/deleted saved item: perform a new save. */
 if(previous?.item.type==='Feature Collection'){
  // An earlier attempt created the item but did not finish attaching the run: finish it now instead of duplicating it.
  const {receipt,item}=previous;
  if(!item.typeKeywords?.includes(RUN_KEYWORD))await attachRun(run,receipt.itemId,item.title??title,user,item.ownerFolder??folder??'',token,referer,item.typeKeywords??[]);
  return receipt;
 }
 if(!folder){const created=await request(user+'/createFolder',{title:'renewable'});folder=created.folder?.id;if(!created.success||!folder)throw new Error('renewable хавтас үүссэнгүй.');}
 const text=JSON.stringify(enterpriseResult(run));if(Buffer.byteLength(text)>40*1024*1024)throw new Error('Хадгалах үр дүн 40 MB-аас их. Тоноглолын хэмжээг багасгана уу.');
 const keywords=['Data','Feature Collection'];
 const added=await request(`${user}/${encodeURIComponent(folder)}/addItem`,{title,type:'Feature Collection',text,tags:`DSEDN,renewable,suitability,ERA5,${run.request.technology}`,snippet:'Судалгааны үнэлгээ, талбай, тоноглол, тооцооны нөхцөл. Инженерийн эцсийн зураг төсөл биш.',typeKeywords:keywords.join(','),extent:`${run.request.bounds[0]},${run.request.bounds[1]},${run.request.bounds[2]},${run.request.bounds[3]}`,access:'private'});
 if(!added.success||!added.id||!/^[a-f0-9]{32}$/i.test(added.id))throw new Error('Enterprise хадгалалт баталгаажаагүй.');
 const receipt:Receipt={itemId:added.id,url:itemUrl(added.id),folder:'renewable',savedAt:new Date().toISOString()};
 // Keep the receipt before verification so a retry cannot duplicate an accepted item.
 await writeStoredJson(receiptPath,receipt);
 const verified=await request('/content/items/'+added.id);if(verified.type!=='Feature Collection'||verified.access!=='private')throw new Error(`Item үүссэн (${added.id}); хадгалалтын метадата баталгаажаагүй. Дахин шалгана уу.`);
 await attachRun(run,added.id,title,user,folder,token,referer,verified.typeKeywords??keywords);
 return receipt;
}
