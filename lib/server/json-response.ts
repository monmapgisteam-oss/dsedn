/** Stream large GIS responses without Vercel's buffered response size limit. */
export function jsonResponse(data:unknown,init?:ResponseInit){
 const bytes=new TextEncoder().encode(JSON.stringify(data));let offset=0;
 const stream=new ReadableStream<Uint8Array>({pull(controller){
  if(offset>=bytes.length){controller.close();return;}
  const end=Math.min(offset+64*1024,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;
 }});
 const headers=new Headers(init?.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');
 return new Response(stream,{...init,headers});
}
