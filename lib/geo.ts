import { area, bbox, bboxPolygon, booleanValid, coordEach, distance, featureCollection, intersect, lineString, nearestPointOnLine, point } from '@turf/turf';
import type { Feature, LineString, MultiLineString, Polygon, MultiPolygon } from 'geojson';
import type { Bounds, Cell, Collection } from './types';

export function validateBounds(input: unknown): Bounds {
  if (!Array.isArray(input) || input.length !== 4 || !input.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('A study area needs four numeric WGS84 bounds.');
  const [w, s, e, n] = input;
  if (w < 87 || e > 120 || s < 41 || n > 53 || w >= e || s >= n) throw new Error('Choose a valid study area within Mongolia (87–120°E, 41–53°N).');
  if (area(bboxPolygon(input as Bounds)) > 900e6) throw new Error('Keep this interactive study area below 900 km². Use regional GIS processing for larger areas.');
  return input as Bounds;
}

export function makeCells(bounds: Bounds, sizeKm: number): Cell[] {
  validateBounds(bounds);
  if (![1, 2, 5].includes(sizeKm)) throw new Error('Use a 1, 2, or 5 km screening mesh.');
  const [w, s, e, n] = bounds;
  const rows = Math.max(1, Math.ceil(distance([w, s], [w, n]) / sizeKm));
  const cols = Math.max(1, Math.ceil(distance([w, (s+n)/2], [e, (s+n)/2]) / sizeKm));
  if (rows * cols > 400) throw new Error('This area exceeds 400 cells. Increase the mesh size or reduce the study area.');
  const cells: Cell[] = [];
  for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
    const cell = bboxPolygon([w+(e-w)*x/cols,s+(n-s)*y/rows,w+(e-w)*(x+1)/cols,s+(n-s)*(y+1)/rows]);
    cells.push({ ...cell, properties: { id: `C${String(y*cols+x+1).padStart(3,'0')}` } });
  }
  return cells;
}

export function cellCenter(cell: Cell): [number, number] {
  const b = bbox(cell); return [(b[0]+b[2])/2, (b[1]+b[3])/2];
}

export function nearestKm(coordinate: [number, number], collection: Collection | undefined): number | null {
  if (!collection?.features.length) return null;
  let best = Infinity;
  const p = point(coordinate);
  for (const feature of collection.features) {
    if (feature.geometry.type === 'Point') best = Math.min(best, distance(p, feature.geometry.coordinates));
    if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
      const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const coordinates of lines) {
        if (coordinates.length > 1) best = Math.min(best, nearestPointOnLine(lineString(coordinates), p).properties.dist);
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}

export function overlaps(cell: Cell, polygons?: Collection): boolean {
  if (!polygons) return false;
  const a = bbox(cell);
  for (const f of polygons.features) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    const b = bbox(f);
    if (a[0] >= b[2] || a[2] <= b[0] || a[1] >= b[3] || a[3] <= b[1]) continue;
    const intersection = intersect(featureCollection([cell, f as Feature<Polygon|MultiPolygon>]));
    if (intersection && area(intersection) > 0.01) return true;
  }
  return false;
}

export function validateCollection(value: unknown, kind: 'exclusions' | 'roads'): Collection {
  const data = value as Collection;
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.length > 30000) throw new Error('Provide a GeoJSON FeatureCollection with 1–30,000 features.');
  for (const f of data.features) {
    const allowed = kind === 'exclusions' ? ['Polygon','MultiPolygon'] : ['LineString','MultiLineString'];
    if (!f.geometry || !allowed.includes(f.geometry.type) || !booleanValid(f)) throw new Error(`Invalid ${kind} geometry. Use valid ${allowed.join(' / ')} features.`);
    coordEach(f, c => { if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || c[0]<87 || c[0]>120 || c[1]<41 || c[1]>53) throw new Error('Reproject input to EPSG:4326 longitude/latitude within Mongolia.'); });
  }
  return data;
}

export function gridLines(collection: Collection): Feature<LineString | MultiLineString>[] {
  return collection.features.filter(f => ['LineString','MultiLineString'].includes(f.geometry.type)) as Feature<LineString | MultiLineString>[];
}
