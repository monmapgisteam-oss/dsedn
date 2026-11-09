'use client';
// Share in-flight reads and recently loaded previews across map modes. Never cache errors.
const reads=new Map<string,{at:number;value:Promise<unknown>}>();
export function previewData<T>(url:string,body?:unknown,refresh=false):Promise<T>{
 const key=url+JSON.stringify(body??null),previous=reads.get(key);
 if(!refresh&&previous&&Date.now()-previous.at<300000)return previous.value as Promise<T>;
 const value=fetch(url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Давхарга татагдсангүй.');return data;}).catch(e=>{if(reads.get(key)?.value===value)reads.delete(key);throw e;});
 if(reads.size>=16)reads.delete(reads.keys().next().value!);reads.set(key,{at:Date.now(),value});return value;
}
