import { area } from '@turf/turf';
import { cellCenter, nearestKm, overlaps } from './geo';
import type { Cell, CellResult, Collection, Criterion, Resource, Settings, Terrain } from './types';

const criteria: Criterion[] = ['resource','grid','terrain','access'];
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export function weightedScore(components: Record<Criterion, number>, weights: Record<Criterion,number>) {
  const total = criteria.reduce((s,k) => s+weights[k],0);
  if (!Number.isFinite(total) || total <= 0 || criteria.some(k => !Number.isFinite(weights[k]) || weights[k]<0)) throw new Error('At least one criterion must have positive weight; all weights must be nonnegative.');
  return criteria.reduce((s,k) => s+components[k]*weights[k]/total,0);
}
export function slopeFromPatch(z: (number|null)[], spacingMeters: number): number | null {
  if (z.length!==9 || z.some(v => v===null || !Number.isFinite(v)) || spacingMeters<=0) return null;
  const v=z as number[];
  const dx=((v[2]+2*v[5]+v[8])-(v[0]+2*v[3]+v[6]))/(8*spacingMeters);
  const dy=((v[6]+2*v[7]+v[8])-(v[0]+2*v[1]+v[2]))/(8*spacingMeters);
  return Math.atan(Math.hypot(dx,dy))*180/Math.PI;
}
export function validateSettings(settings: Settings) {
  weightedScore({resource:0,grid:0,terrain:0,access:0},settings.weights);
  for (const v of [settings.maxSlope,settings.maxGridKm,settings.maxRoadKm,settings.densityMwKm2]) if (!Number.isFinite(v) || v<=0) throw new Error('Slope, distance limits, and capacity density must be positive.');
  if (!Number.isFinite(settings.resourceLow) || !Number.isFinite(settings.resourceHigh) || settings.resourceLow<0 || settings.resourceHigh<=settings.resourceLow) throw new Error('The upper resource anchor must exceed the lower anchor.');
  if (settings.maxSlope>90) throw new Error('Slope must not exceed 90 degrees.');
  if (settings.maxGridKm>10 || settings.maxRoadKm>5) throw new Error('Distance anchors must stay within the fetched coverage: grid at most 10 km and roads at most 5 km.');
  if (settings.solarYield!==null && (!Number.isFinite(settings.solarYield) || settings.solarYield<=0 || settings.solarYield>3000)) throw new Error('Specific PV yield must be between 0 and 3,000 kWh/kWp/year.');
  if (settings.windCapacityFactor!==null && (!Number.isFinite(settings.windCapacityFactor) || settings.windCapacityFactor<=0 || settings.windCapacityFactor>=1)) throw new Error('Wind capacity factor must be between 0 and 1.');
}

export function analyze(cells: Cell[], settings: Settings, inputs: { grid?: Collection; roads?: Collection; exclusions?: Collection; terrain?: Terrain; resource?: Resource }): CellResult[] {
  validateSettings(settings);
  const samples = new Map(inputs.terrain?.samples.map(s => [s.id,s]));
  return cells.map(cell => {
    const p = cellCenter(cell), sample = samples.get(cell.properties.id);
    const gridKm = nearestKm(p,inputs.grid), roadKm = nearestKm(p,inputs.roads);
    const slope = sample?.slope ?? null, elevation = sample?.elevation ?? null;
    const resourceValue = (settings.technology === 'solar' ? inputs.resource?.solar : inputs.resource?.wind) ?? null;
    const components: Partial<Record<Criterion,number>> = {};
    if (resourceValue!==null) components.resource = clamp(100*(resourceValue-settings.resourceLow)/(settings.resourceHigh-settings.resourceLow));
    if (gridKm!==null) components.grid = clamp(100*(1-gridKm/settings.maxGridKm));
    if (roadKm!==null) components.access = clamp(100*(1-roadKm/settings.maxRoadKm));
    if (slope!==null) components.terrain = clamp(100*(1-slope/settings.maxSlope));
    const reasons: string[] = [];
    if (slope!==null && slope>settings.maxSlope) reasons.push('Slope exceeds scenario limit');
    if (overlaps(cell, inputs.exclusions)) reasons.push('Intersects an exclusion polygon');
    const excluded = reasons.length>0;
    const missing = criteria.filter(k => components[k]===undefined);
    reasons.push(...missing.map(k => `Missing ${k} data`));
    if (!settings.exclusionsReviewed) reasons.push('Environmental, settlement and land-use constraints not fully reviewed');
    const score = excluded || missing.length ? null : weightedScore(components as Record<Criterion,number>,settings.weights);
    const scenarios = score===null ? [] : criteria.flatMap(k => [0.8,1.2].map(factor => weightedScore(components as Record<Criterion,number>,{...settings.weights,[k]:settings.weights[k]*factor})));
    const status = excluded ? 'excluded' : score===null ? 'unassessed' : score>=70 ? 'high' : score>=50 ? 'moderate' : 'low';
    const areaKm2 = area(cell)/1e6;
    const capacityMw = score!==null && status==='high' ? areaKm2*settings.densityMwKm2 : null;
    const energyGwh = capacityMw===null ? null : settings.technology==='solar'
      ? settings.solarYield===null ? null : capacityMw*settings.solarYield/1000
      : settings.windCapacityFactor===null ? null : capacityMw*8760*settings.windCapacityFactor/1000;
    return { ...cell, properties: { id:cell.properties.id, areaKm2, score, sensitivityMin:scenarios.length?Math.min(score!,...scenarios):null, sensitivityMax:scenarios.length?Math.max(score!,...scenarios):null,
      status, provisional:!settings.exclusionsReviewed, reasons, gridKm,roadKm,slope,elevation,resourceValue,components,capacityMw,energyGwh } };
  });
}
