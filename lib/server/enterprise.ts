// ArcGIS Enterprise endpoints. Server-only: the API key and user tokens are sent to these hosts,
// so they are read from server environment variables (never NEXT_PUBLIC_) and must be https.
function endpoint(name: string, fallback: string) {
  const value = process.env[name]?.trim().replace(/\/+$/, '');
  if (!value) return fallback;
  if (!/^https:\/\/[^\s?#]+$/.test(value)) throw new Error(`${name} must be an https URL without query or fragment.`);
  return value;
}

/** Portal sharing root, e.g. https://host/portal — used for sign-in and saving results. */
export const PORTAL_URL = endpoint('ARCGIS_PORTAL_URL', 'https://gis.selbecity.mn/geoportal');
/** Renewable FeatureServer holding layers /0 /1 /4 /5 /6 /7 /8. */
export const RENEWABLE_SERVICE_URL = endpoint('ARCGIS_SERVICE_URL', 'https://gis.selbecity.mn/map/rest/services/Hosted/Renewable/FeatureServer');
// The code addresses Renewable layers by the IDs of the original service (/0 /1 /4 /5 /6 /7 /8).
// A republished copy may number the same layers differently; ARCGIS_LAYER_IDS maps
// "codeId:serviceId" pairs, e.g. "0:4,1:3,4:0,5:8,6:7,7:6,8:5". Unlisted IDs are unchanged.
const layerIds = new Map<number, number>();
for (const pair of (process.env.ARCGIS_LAYER_IDS ?? '').split(',').map(p => p.trim()).filter(Boolean)) {
  const match = /^(\d+):(\d+)$/.exec(pair);
  if (!match) throw new Error('ARCGIS_LAYER_IDS must look like "0:4,1:3" (codeId:serviceId).');
  layerIds.set(Number(match[1]), Number(match[2]));
}
/** Rewrites a leading "/<codeId>" in a service path to the ID that layer has on the configured service. */
export const serviceLayerPath = (path: string) =>
  path.replace(/^\/(\d+)(?=\/|$)/, (_, id) => '/' + (layerIds.get(Number(id)) ?? Number(id)));

/** River FeatureServer; defaults to the `Гол_` service next to the Renewable service. */
export const RIVER_SERVICE_URL = endpoint('ARCGIS_RIVER_SERVICE_URL',
  RENEWABLE_SERVICE_URL.replace(/[^/]+\/FeatureServer$/, encodeURIComponent('Гол_') + '/FeatureServer'));
