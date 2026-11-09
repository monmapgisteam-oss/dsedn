import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';

export type Technology = 'solar' | 'wind';
export type Bounds = [number, number, number, number];
export type Collection = FeatureCollection<Geometry>;
export type Cell = Feature<Polygon | MultiPolygon, { id: string; [key: string]: unknown }>;
export type Criterion = 'resource' | 'grid' | 'terrain' | 'access';
export type Settings = {
  technology: Technology;
  weights: Record<Criterion, number>;
  maxSlope: number;
  maxGridKm: number;
  maxRoadKm: number;
  resourceLow: number;
  resourceHigh: number;
  densityMwKm2: number;
  solarYield: number | null;
  windCapacityFactor: number | null;
  exclusionsReviewed: boolean;
};
export type Provenance = { name: string; source: string; retrievedAt: string; detail: string };
export type LayerData = { data: Collection; provenance: Provenance };
export type Resource = {
  solar: number | null;
  wind: number | null;
  windHeight: number;
  monthlySolar: (number | null)[];
  monthlyWind: (number | null)[];
  provenance: Provenance;
};
export type TerrainSample = { id: string; elevation: number | null; slope: number | null };
export type Terrain = { samples: TerrainSample[]; provenance: Provenance };
export type CellResult = Cell & { properties: {
  id: string;
  areaKm2: number;
  score: number | null;
  sensitivityMin: number | null;
  sensitivityMax: number | null;
  status: 'high' | 'moderate' | 'low' | 'excluded' | 'unassessed';
  provisional: boolean;
  reasons: string[];
  gridKm: number | null;
  roadKm: number | null;
  slope: number | null;
  elevation: number | null;
  resourceValue: number | null;
  components: Partial<Record<Criterion, number>>;
  capacityMw: number | null;
  energyGwh: number | null;
} };

export function defaultSettings(technology: Technology): Settings {
  return { technology, weights: { resource: 40, grid: 25, terrain: 20, access: 15 },
    maxSlope: technology === 'solar' ? 5 : 15, maxGridKm: 10, maxRoadKm: 5,
    resourceLow: technology === 'solar' ? 3 : 4, resourceHigh: technology === 'solar' ? 5.5 : 8,
    densityMwKm2: technology === 'solar' ? 40 : 5,
    solarYield: null, windCapacityFactor: null, exclusionsReviewed: false };
}
