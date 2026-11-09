import { open } from 'shapefile';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { bbox } from '@turf/turf';

const features=[];
for(const [name,kind] of [['places_free','settlement'],['places_a_free','settlement'],['landuse_a_free','residential'],['water_a_free','water'],['protected_areas_a_free','protected']]) {
  const path=`.data/mongolia/gis_osm_${name}_1`;
  const projection=await readFile(`${path}.prj`,'utf8');
  if(!/GCS_WGS_1984|WGS 84/.test(projection))throw new Error('Expected WGS84 extract.');
  const source=await open(`${path}.shp`,`${path}.dbf`,{encoding:'utf-8'});
  while(true) {
    const {done,value}=await source.read(); if(done)break;
    const p=value.properties;
    if(kind==='settlement'&&!/^(city|town|village|hamlet|suburb)$/.test(p.fclass))continue;
    if(kind==='residential'&&!/^(residential|industrial|commercial|cemetery)$/.test(p.fclass))continue;
    value.bbox=bbox(value);value.properties={kind,name:p.name,fclass:p.fclass,osm_id:p.osm_id};features.push(value);
  }
}
const info=await stat('.data/mongolia/gis_osm_places_free_1.shp');
await writeFile('.data/mongolia-context.json',JSON.stringify({data:{type:'FeatureCollection',features},provenance:{name:'OSM settlements, land use, water and protected areas',source:'https://download.geofabrik.de/asia/mongolia.html',retrievedAt:new Date().toISOString(),detail:`OpenStreetMap contributors / Geofabrik; ODbL; source file ${info.mtime.toISOString()}. Coverage is incomplete and is not an official protected-area or settlement register.`}}));
console.log(`Prepared ${features.length} context features.`);
