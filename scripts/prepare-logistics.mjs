// Prepares the official Geofabrik Mongolia download for local spatial queries.
import { open } from 'shapefile';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { bbox } from '@turf/turf';

const directory=process.argv[2] || '.data/mongolia';
const features=[];
for(const [name,kind] of [['gis_osm_roads_free_1','road'],['gis_osm_railways_free_1','rail']]){
  const projection=await readFile(join(directory,`${name}.prj`),'utf8');
  if(!projection.includes('GCS_WGS_1984')&&!projection.includes('WGS 84'))throw new Error('Expected Geofabrik WGS84 data.');
  const source=await open(join(directory,`${name}.shp`),join(directory,`${name}.dbf`),{encoding:'utf-8'});
  while(true){
    const {done,value}=await source.read();if(done)break;
    const p=value.properties;
    if(kind==='road'&&!/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)(_[a-z0-9]+)?$/.test(p.fclass))continue;
    if(kind==='rail'&&p.fclass!=='rail')continue;
    value.bbox=bbox(value);
    value.properties={osm_id:p.osm_id,name:p.name,highway:kind==='road'?p.fclass:undefined,railway:kind==='rail'?'rail':undefined,bridge:p.bridge,tunnel:p.tunnel,source:'OpenStreetMap / Geofabrik'};
    features.push(value);
  }
}
const info=await stat(join(directory,'gis_osm_roads_free_1.shp'));
const result={data:{type:'FeatureCollection',features},provenance:{name:'Geofabrik Mongolia roads & railway',source:'https://download.geofabrik.de/asia/mongolia.html',retrievedAt:new Date().toISOString(),detail:`OpenStreetMap contributors, ODbL. Geofabrik Mongolia shapefile extract, source file timestamp ${info.mtime.toISOString()}. Roads include tracks; rail is context only. Vehicle loading, road surface, turning radius and seasonal access remain unverified.`}};
await writeFile('.data/mongolia-logistics.json',JSON.stringify(result));
console.log(`Prepared ${features.length.toLocaleString()} roads and railway features for local queries.`);
