import { fromBlob } from 'geotiff';
import { distance } from '@turf/turf';
import { cellCenter } from './geo';
import type { Cell, Terrain } from './types';

export async function readDem(file:File,cells:Cell[]):Promise<Terrain> {
  if (file.size>200e6) throw new Error('Clip your DEM to the study area first (maximum 200 MB).');
  const tiff=await fromBlob(file), image=await tiff.getImage(), keys=image.getGeoKeys();
  if (keys?.GeographicTypeGeoKey!==4326 || keys?.ProjectedCSTypeGeoKey || keys?.VerticalUnitsGeoKey && keys.VerticalUnitsGeoKey!==9001) throw new Error('Use a north-up EPSG:4326 DEM with elevation in metres. Reproject other files in GIS first.');
  const [rx,ry]=image.getResolution(), [ox,oy]=image.getOrigin();
  if (rx<=0 || ry>=0 || image.fileDirectory.hasTag('ModelTransformation')) throw new Error('Rotated or flipped rasters are not supported. Export a north-up DEM.');
  const nodata=image.getGDALNoData(), samples:Terrain['samples']=[];
  for (const cell of cells) {
    const [lon,lat]=cellCenter(cell), x=Math.floor((lon-ox)/rx),y=Math.floor((lat-oy)/ry);
    let elevation:number|null=null,slope:number|null=null;
    if (x>0 && y>0 && x<image.getWidth()-1 && y<image.getHeight()-1) {
      const data=await image.readRasters({window:[x-1,y-1,x+2,y+2],samples:[0],interleave:true});
      const z=Array.from(data as ArrayLike<number>);
      if (z.every(v=>Number.isFinite(v) && v!==nodata)) {
        elevation=z[4];
        const dx=distance([lon,lat],[lon+rx,lat])*1000, dy=distance([lon,lat],[lon,lat+Math.abs(ry)])*1000;
        const gx=((z[2]+2*z[5]+z[8])-(z[0]+2*z[3]+z[6]))/(8*dx);
        const gy=((z[6]+2*z[7]+z[8])-(z[0]+2*z[1]+z[2]))/(8*dy);
        slope=Math.atan(Math.hypot(gx,gy))*180/Math.PI;
      }
    }
    samples.push({id:cell.properties.id,elevation,slope});
  }
  if (!samples.some(s=>s.slope!==null)) throw new Error('The DEM has no valid center samples inside this study area. Check coverage and NoData.');
  return {samples,provenance:{name:file.name,source:'Local DEM import',retrievedAt:new Date().toISOString(),detail:`User-supplied EPSG:4326 DEM; elevation assumed metres. Pixel size ${rx}° × ${Math.abs(ry)}°. Horn slope from 3×3 native pixels at each cell center, not a zonal maximum. File modification ${new Date(file.lastModified).toISOString()}.`}};
}
