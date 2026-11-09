import type { Collection, Bounds, LayerData } from '../types';
import { isDsednOwner } from '../ownership';
import {electricalDisplayFields,electricalDisplay,renewableLayers,type DisplayField} from '../renewable-catalog';
import {cached} from './providers';
import {length} from '@turf/turf';
import type {Feature,LineString,MultiLineString} from 'geojson';

const service = 'https://gis.selbecity.mn/map/rest/services/Hosted/Renewable/FeatureServer';
const fields: Record<number,string> = {
  0:'objectid,air_line_name,voltage_level',
  4:'objectid,voltage_level_cable',
  6:'objectid_1,name,code,parent_id',
  7:'objectid,owner_midd,owner_firs,owner_name',
  8:'objectid,possession,possessi_1,possessi_2',
};
type ArcGISResponse = { error?: {code:number}; objectIds?:number[]; features?:Collection['features']; type?:string; exceededTransferLimit?:boolean; name?:string; fields?:unknown[]; layers?:{id:number;name:string;geometryType:string}[] };

export async function arcgis(path: string, values: Record<string,string> = {}): Promise<ArcGISResponse> {
  const key = process.env.ARCGIS_API_KEY;
  if (!key) throw new Error('ArcGIS is not configured. Set ARCGIS_API_KEY in .env.local on the server.');
  const response = await fetch(`${service}${path}`, {method:'POST', body:new URLSearchParams({f:'json', ...values, token:key}), cache:'no-store', redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`ArcGIS returned HTTP ${response.status}.`);
  const data = await response.json() as ArcGISResponse;
  if (data.error) throw new Error([498,499].includes(data.error.code) ? 'ArcGIS authorization failed. Update the server credential.' : `ArcGIS query failed (${data.error.code}).`);
  return data;
}

export async function loadArcGISLayer(layer: number, bounds: Bounds,display=false): Promise<LayerData> {
  let requested=display&&electricalDisplayFields[layer]?electricalDisplayFields[layer].join(','):fields[layer];
  if (!requested) throw new Error('This layer is not enabled for the planning workspace.');
  let displayFields:DisplayField[]=[];
  if(display&&layer<=4){
    const meta=await cached(`renewable-display-meta:${layer}`,()=>arcgis(`/${layer}`));
    if(!Array.isArray(meta.fields))throw new Error('Давхаргын талбарын тайлбар татагдсангүй.');
    displayFields=(meta.fields as DisplayField[]).filter(f=>electricalDisplayFields[layer].includes(f.name));
    if(!displayFields.some(f=>f.name==='objectid'))throw new Error('Давхаргын ID талбар олдсонгүй.');
    requested=displayFields.map(f=>f.name).join(',');
  }
  // Buffer queries so proximity is not biased by the study-area edge.
  const parcel=layer===7||layer===8;
  const lat=(bounds[1]+bounds[3])/2, dy=(parcel?0:12)/111.2, dx=dy/Math.cos(lat*Math.PI/180);
  const extent=[bounds[0]-dx,bounds[1]-dy,bounds[2]+dx,bounds[3]+dy];
  const query={where:'1=1',geometry:extent.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
  const ids = await arcgis(`/${layer}/query`,{...query,returnIdsOnly:'true'});
  if (!Array.isArray(ids.objectIds)) throw new Error('ArcGIS did not return a complete object ID list.');
  if (ids.objectIds.length>50000) throw new Error('Too many features. Reduce the study area.');
  const features: Collection['features']=[];
  for (let i=0;i<ids.objectIds.length;i+=500) {
    const batch=ids.objectIds.slice(i,i+500);
    const page=await arcgis(`/${layer}/query`,{objectIds:batch.join(','),outFields:requested,returnGeometry:'true',returnZ:'false',returnM:'false',outSR:'4326',f:'geojson'});
    if (page.type!=='FeatureCollection' || !Array.isArray(page.features) || page.features.length!==batch.length || page.exceededTransferLimit) throw new Error('ArcGIS returned an incomplete page. No partial dataset was accepted.');
    features.push(...page.features.map(f=>{
      if(!parcel){const safe=Object.fromEntries(requested.split(',').map(key=>[key,f.properties?.[key]??null]));return {...f,properties:{...safe,sourceLayer:layer,...(displayFields.length?{display:electricalDisplay(safe,displayFields),geometryLengthKm:length(f as Feature<LineString|MultiLineString>,{units:'kilometers'})}:{})}};}
      const p=f.properties??{};
      const names=layer===7?[p.owner_midd,p.owner_firs,p.owner_name]:[p.possession,p.possessi_1,p.possessi_2];
      // Personal names/addresses never leave the server. Unknown records remain excluded.
      return {...f,properties:{objectid:p.objectid,layer,dsedn:names.some(isDsednOwner),tenure:layer===7?'ownership':'possession'}};
    }));
  }
  return {data:{type:'FeatureCollection',features},provenance:{name:renewableLayers.find(l=>l.id===layer)?.name??'Renewable',source:`${service}/${layer}`,retrievedAt:new Date().toISOString(),detail:`Complete spatial query: ${features.length} features; WGS84; ${parcel?0:12} km query buffer. ${parcel?`${features.filter(f=>f.properties?.dsedn).length} records exactly match a DSEDN organization alias; others/unknown excluded in parcel-aware mode. Only tenure, object ID and DSEDN classification retained; no personal owner data returned.`:layer===0?'Voltage field has no coded-value domain; voltage is not inferred.':layer===4?'Owner-selected canonical high-voltage cable layer /4; duplicate exports /2 and /3 excluded. Unlabelled voltage values are not decoded using another layer’s domain.':'Display context; not added to suitability inputs.'} No electrical capacity or network operating status is inferred.`}};
}
