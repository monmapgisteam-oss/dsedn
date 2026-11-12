import { validateBounds } from '@/lib/geo';
import { arcgis, loadArcGISLayer } from '@/lib/server/arcgis';
import { cached, loadLogistics, loadResource, loadTerrain } from '@/lib/server/providers';
import {loadWholeStudy,loadRegions} from '@/lib/server/study-layers';
import {RENEWABLE_DISPLAY_SCHEMA} from '@/lib/renewable-catalog';
import {jsonResponse} from '@/lib/server/json-response';
import {requireApiSession} from '@/lib/server/auth';

export async function GET() {
  const session=await requireApiSession();if(session instanceof Response)return session;
  try {
    const service=await arcgis('');
    return Response.json({connected:true,layers:service.layers?.map(l=>({id:l.id,name:l.name,geometryType:l.geometryType}))}, {headers:{'Cache-Control':'no-store'}});
  } catch(error) { return Response.json({connected:false,error:error instanceof Error?error.message:'Connection failed'}, {status:502}); }
}
export async function POST(request:Request) {
  const session=await requireApiSession();if(session instanceof Response)return session;
  try {
    const body=await request.json();
    const bounds=['arcgis','renewable'].includes(body.kind)&&[5,6].includes(body.regionLayer)?(await loadWholeStudy(body.regionLayer)).bounds:validateBounds(body.bounds);
    const key=JSON.stringify([body.kind,body.kind==='renewable'?RENEWABLE_DISPLAY_SCHEMA:0,body.layer,bounds,body.size]);
    let data;
    if(body.kind==='renewable'){
      if(![0,1,4,5,6,7,8].includes(body.layer))throw new Error('Renewable давхаргын дугаар буруу. /2, /3 давхардсан экспортыг ашиглахгүй.');
      data=await cached(key,()=>[5,6].includes(body.layer)?loadRegions(body.layer):loadArcGISLayer(body.layer,bounds,true));
    }
    else if (body.kind==='arcgis') data=await cached(key,()=>loadArcGISLayer(body.layer,bounds));
    else if (body.kind==='resource') data=await cached(key,()=>loadResource(bounds));
    else if (body.kind==='terrain') data=await cached(key,()=>loadTerrain(bounds,body.size));
    else if (body.kind==='logistics') data=await cached(key,()=>loadLogistics(bounds));
    else return Response.json({error:'Unknown data source.'},{status:400});
    return jsonResponse(data);
  } catch(error) {
    const message=error instanceof Error?error.message:'Data request failed.';
    return Response.json({error:/fetch failed|timeout|aborted/i.test(message)?'The data provider did not respond. Retry later or import a local dataset.':message},{status:400});
  }
}
