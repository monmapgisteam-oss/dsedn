import {randomUUID} from 'node:crypto';
import type {SiteRun} from '../siting';
import {enterpriseResult} from '../enterprise-result';
import {readStoredJson,writeStoredJson} from './runtime-storage';
export const portal='https://gis.selbecity.mn/geoportal';
export async function rememberRun(run:SiteRun){run.id=randomUUID();await writeStoredJson(run.id+'.json',run);return run;}
export async function readRun(id:string):Promise<SiteRun>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Тооцооллын ID буруу.');try{return await readStoredJson<SiteRun>(id+'.json');}catch{throw new Error('Тооцооны хадгалсан хувилбар олдсонгүй. Дахин тооцоолно уу.');}}
type PortalResponse={error?:{code:number};username?:string;user?:{username:string};privileges?:string[];appInfo?:{appOwner:string;privileges:string[]};folders?:{id:string;title:string}[];folder?:{id:string};id?:string;success?:boolean;access?:string;type?:string;ownerFolder?:string};
async function portalRequest(path:string,token:string,values:Record<string,string>={},referer?:string):Promise<PortalResponse>{
 const response=await fetch(`${portal}/sharing/rest${path}`,{method:'POST',body:new URLSearchParams({f:'json',...values,token}),headers:referer?{Referer:referer}:undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Enterprise HTTP ${response.status}.`);const d=await response.json();
 if(d.error)throw new Error(`Enterprise эрх / хүсэлтийн алдаа (${d.error.code}). Portal-д бичих эрхтэй хэрэглэгчээр нэвтэрнэ үү.`);return d;
}
export async function portalIdentity(token:string,referer?:string){
 const d=await portalRequest('/community/self',token,{},referer);const username=d.username||d.user?.username;
 if(!username)throw new Error('Одоогийн API key нь давхарга унших эрхтэй боловч Portal хэрэглэгчийн эрхгүй. Enterprise-д нэвтэрч renewable хавтаст хадгална уу.');
 return username;
}
export const configuredToken=()=>process.env.ARCGIS_PORTAL_TOKEN||process.env.ARCGIS_API_KEY||'';
// Creates a private, map-viewable Feature Collection item. Never edits the supplied source services.
export async function saveEnterprise(run:SiteRun,title:string,token:string,referer?:string){
 const request=(path:string,values:Record<string,string>={})=>portalRequest(path,token,values,referer);
 const owner=await portalIdentity(token,referer),user='/content/users/'+encodeURIComponent(owner);
 const listing=await request(user);let folder=listing.folders?.find(f=>f.title.toLowerCase()==='renewable')?.id;
 if(!folder){const created=await request(user+'/createFolder',{title:'renewable'});folder=created.folder?.id;if(!created.success||!folder)throw new Error('renewable хавтас үүссэнгүй.');}
 const receiptPath=run.id+'-'+Buffer.from(owner).toString('hex')+'.saved.json';
 try{const receipt=await readStoredJson<{itemId:string;url:string;folder:string;savedAt:string}>(receiptPath);const item=await request('/content/items/'+receipt.itemId);if(item.type==='Feature Collection')return receipt;}catch{/* Missing/deleted saved item: perform a new save. */}
 const item=enterpriseResult(run),text=JSON.stringify(item);if(Buffer.byteLength(text)>40*1024*1024)throw new Error('Хадгалах үр дүн 40 MB-аас их. Тоноглолын хэмжээг багасгана уу.');
 const added=await request(`${user}/${encodeURIComponent(folder)}/addItem`,{title,type:'Feature Collection',text,tags:'DSEDN,renewable,suitability,ERA5',snippet:'Судалгааны үнэлгээ, талбай, тоноглол, тооцооны нөхцөл. Инженерийн эцсийн зураг төсөл биш.',typeKeywords:'Data,Feature Collection',extent:`${run.request.bounds[0]},${run.request.bounds[1]},${run.request.bounds[2]},${run.request.bounds[3]}`,access:'private'});
 if(!added.success||!added.id||!/^[a-f0-9]{32}$/i.test(added.id))throw new Error('Enterprise хадгалалт баталгаажаагүй.');
 const receipt={itemId:added.id,url:`${portal}/home/item.html?id=${added.id}`,folder:'renewable',savedAt:new Date().toISOString()};
 // Keep the receipt before verification so a retry cannot duplicate an accepted item.
 await writeStoredJson(receiptPath,receipt);
 const verified=await request('/content/items/'+added.id);if(verified.type!=='Feature Collection'||verified.access!=='private')throw new Error(`Item үүссэн (${added.id}); хадгалалтын метадата баталгаажаагүй. Дахин шалгана уу.`);
 return receipt;
}
