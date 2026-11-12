# DSEDN renewable siting and planning

A Mongolian-language platform for **Дархан Сэлэнгийн Цахилгаан Түгээх Сүлжээ ХК**. The identity and logo come from [dsedn.mn](https://dsedn.mn/). ArcGIS MapView/SceneView, renewable physics and metre-scale equipment models are adapted from the user-provided local Booroljuut reference at commit `782827f63df9a61ffa7d25e4028cc3f6aa50096d`. Booroljuut is a technical reference, not the platform's company identity.

## Run

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. The development server binds to `127.0.0.1`. ArcGIS basemaps/terrain need internet and WebGL. Set `ARCGIS_API_KEY` in ignored `.env.local`; never use a `NEXT_PUBLIC_` credential. The key is sent only by the server to the fixed supplied Enterprise service and Portal endpoints in POST bodies. Public ZTHT endpoints never receive it. Redirects are rejected and errors sanitized.

## Workflow

1. Choose solar or wind, then **area in hectares**, **capacity in MW**, or **individual panel/turbine count**. A 200-panel request is 200 modules, not 200 tables. Capacity requests round up to the minimum whole equipment count; the actual capacity is displayed.
2. Choose **Дархан — Renewable /6** (all 27 source polygons, the default) or **Нийт талбай — Renewable /5** (all five source polygons). Search covers the entire polygon union, including holes and disconnected parts. Map pan/zoom does not restrict analysis. The server derives bounds from the full service and ignores legacy rectangle/individual-feature selections. The /5 versus /6 cadastral coverage behavior follows the project owner’s explicit instruction; administrative geometry alone does not establish coverage.
3. Choose parcel-aware mode (exclude other/unknown owners, allow exact DSEDN organization matches) or parcel-independent comparison mode. These two modes apply to /5. In /6, cadastral queries are skipped and rights are shown as unknown, not clear. Parcel conflicts remain visible in the /5 comparison mode.
4. Adjust slope, grid/road/centre proximity, river and other setbacks, equipment assumptions, five importance sliders, and the ERA5 start/end dates. Annual production requires 1–30 complete past calendar years (January 1 to December 31); partial seasons cannot silently become annual yields. Run **Тохиромжтой газар хайх**. Progress streams from `/api/siting` as NDJSON.
5. Compare candidate boundaries, score, capacity, annual production, distances, slope and parcel conflicts. Select a candidate and open **Төлөвлөлт** for actual-size ArcGIS 3D models. The close-up control shows table supports/panels or turbines.
6. Export the result JSON, candidate GeoJSON or equipment GeoJSON. Use **Үр дүнг хадгалах** to save a private, map-viewable Feature Collection item into the `renewable` folder in the supplied ArcGIS Enterprise portal. Completed runs also receive a server-generated ID and a local snapshot in ignored `.data/runs/`. UI state is in memory; export or save before reloading. The export contains request assumptions, source provenance, mapped input layers, candidates and layouts. Raw hourly ERA5 and DEM tiles remain in ignored `.data/siting/` for reproducibility.

## Whole-layer computation

The server unions every polygon in the selected layer (including holes), divides its envelope into approximately 10 km cores, and tests the intersecting cores. Conservative geodesic centre-distance and buffered infrastructure-envelope bounds first exclude cores wholly outside the supplied centres', mapped grid's or accessible national roads' permitted distances. These are necessary conditions only; the precise proximity checks still run on sampled sites. Remaining cores receive 30 m terrain and local infrastructure, river and cadastral checks. Their data windows extend by the rotated equipment footprint plus a margin, so crossing an internal processing boundary does not invalidate a site. A centre belongs to exactly one core. The 2.5-million-pixel DEM safety limit applies to each processing window, not the selected territory; DEM arrays are released between cores.

The base sampling step is `max(80 m, sqrt(union area / 60000))`; large equipment can increase it locally. Each core contributes up to 12 spatially ranked candidates with detailed energy estimates. Candidates are merged by score and overlap into a final shortlist of up to 12. This is sampled, hierarchical screening, not exhaustive optimisation of every possible placement or shape. ERA5 requests use a 0.25° sampling lattice with actual returned coordinates retained; each candidate identifies its own climate sample. The displayed climate chart follows the selected candidate.

The result includes whole-layer coverage counts and all failed core IDs/messages. Failed cores are **unassessed**, never excluded as unsuitable. Three consecutive failures stop further provider requests and mark remaining cores unassessed. A result with any such cores is explicitly incomplete, including its saved metadata. Large-region runs take longer than the old rectangular search. The API streams progress and allows up to one hour on hosting platforms that honour `maxDuration`; client disconnects cancel subsequent processing.

Uncached Copernicus COGs download in bounded 1 MiB byte ranges (four concurrently), with content range, byte count and ETag checks. Only a complete, verified file is moved into the local cache. This avoids a failed large-file transfer leaving a truncated DEM or repeatedly timing out neighbouring cores.

## Data

| Source | Use | Limits |
| --- | --- | --- |
| Supplied [ArcGIS Renewable service](https://gis.selbecity.mn/map/rest/services/Hosted/Renewable/FeatureServer) | Overhead lines 0, owner-selected cable 4; ownership 7, possession 8. Complete object-ID pagination. | No network capacity, operational status or interconnection approval. Layer 0's voltage is not inferred. Duplicate exports /2 and /3 are excluded at the owner's request. |
| [Renewable /5 and /6](https://gis.selbecity.mn/map/rest/services/Hosted/Renewable/FeatureServer) | Whole-layer polygon union: /6 Darkhan; /5 all territory. | Automatically partitioned into ~10 km cores with footprint overlap; exact source boundaries remain mandatory. |
| [Enterprise river service /28](https://gis.selbecity.mn/map/rest/services/Hosted/%D0%93%D0%BE%D0%BB_/FeatureServer/28) | Actual supplied river line; editable metric protection buffer, initially 100 m. River and buffer are separate visible layers. | A centreline buffer is not a measured bank, floodplain or legal protection boundary. Missing/incomplete river access blocks siting; a complete empty spatial query does not imply complete river mapping. |
| Ownership / possession | Exact normalized organization aliases classify DSEDN records. Other or unrecognized owners exclude intersecting candidates in parcel-aware mode. | No personal owner fields leave the server. Matching is conservative; unusual company aliases require verification. Absence of a parcel is not evidence of public/free land or permission. Empty cadastral queries block parcel-aware analysis. |
| [ERA5 through Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api) | Explicit `models=era5`; user-selected complete calendar period, initially 2021–2025 (43,824 hourly records). GHI/DNI/DHI, 10/100 m wind, direction, temperature. | Regional samples requested per processing core on a 0.25° lattice; candidates retain their sample reference. Selected-period screening sample, not a bankable long-term climatology. All requested fields, hours and units must be complete; missing values never become zero. |
| [Copernicus GLO-30 public DSM](https://registry.opendata.aws/copernicus-dem/) | 2021 release COG tiles; bilinear local 30 m grid, Horn 3×3 slope in degrees, 3.3 km buffer. | Surface elevations include vegetation/buildings; not a terrain survey or grading design. |
| [Geofabrik Mongolia / OSM](https://download.geofabrik.de/asia/mongolia.html) | Roads/tracks, rail, settlements, residential/industrial/commercial land use, water, protected areas. | Incomplete community mapping. No bridge loads, swept transport paths, seasonal passability or official protected-area clearance. Straight-line proximity is not a route. |
| [ZTHT centre points /8](https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/ZTHT_ALL_Data/FeatureServer/8) | Capital, aimag and soum centres now drive the settlement distance threshold and adjustable importance score (initially 10%); nearest centre is named in the result. | Points are proxies for nearby settlement, not residential boundaries. Blank names are explicitly derived from the containing soum where possible. |
| [ZTHT national roads /9](https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/ZTHT_ALL_Data/FeatureServer/9) | Authoritative input for nearest road access; ZTHT road and OSM rail corridors are excluded. Other OSM roads are display context only. Explicitly closed/unopened records do not contribute to access scoring. | Source condition attributes are dated; operational status and heavy-haul access are not certified. Unknown status remains an unverified mapped-access proxy. |
| [ZTHT soum information /12](https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/ZTHT_ALL_Data/FeatureServer/12) | Administrative outlines, containing-soum names and recorded population. | Never used as residential polygons, exclusion land or electricity-demand estimates. Population reference year is not supplied. |
| [ZTHT project endpoints /2](https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/ZTHT_ALL_Data/FeatureServer/2) | Road-project start/end locations available as a separate map layer. | Context only; these do not establish an operational road or a settlement. An empty local selection is valid. |

The explicit service URL is authoritative here. Its reported service item is `d03247783ade41ab84dc667bc67c6abd`, different from the initially supplied item `0f422fabc1be40ce981ce35321b6e6e2`.

## Search and scientific method

`lib/siting.ts` converts demand into physical site dimensions and exact equipment counts. `lib/server/whole-area-search.ts` coordinates the full geographic scope and passes each processing core to `lib/server/site-engine.ts` with the declared sampling step. The engine scans rectangular candidate footprints, checking full cadastral overlap, settlement/water/protected-area exclusion, and every covered 30 m slope sample. Any missing terrain or excessive slope rejects the candidate.

Solar sites keep the whole array footprint clear of mapped roads/electric corridors. Wind envelopes may contain corridors, but each turbine's rotor-sized square plus the selected buffer must be clear. Wind envelopes still undergo whole-site parcel, settlement, water, protected-area and slope checks. Setbacks are **editable planning assumptions**, not legal determinations: initially settlements 100 m solar / 500 m wind, lines 30 m, ZTHT roads / OSM rail 10 m, OSM water 30 m, supplied river 100 m (editable 1–3000 m).

Grid and road distances are local metric straight-line distances from the site centre; limits are 10 km grid and 5 km road. Settlement proximity now uses geodesic distance to the supplied ZTHT /8 centre points, with an editable maximum of up to 12 km. OSM residential/settlement separation remains a hard exclusion; distance to OSM residential edges/settlement points is reported separately, excluding industrial/commercial/cemetery land from this residential-distance metric. Road access now uses only the supplied national-road layer, so the national-road and access distances coincide. All four ZTHT sources are queried with a 13 km buffer and complete ID pagination, without forwarding the private ArcGIS credential. Missing/incomplete service responses stop the run; a complete empty centre query yields no sites within the required centre distance. Soum polygons and project points do not contribute to settlement scoring. Source edit dates are retained individually in the exported provenance.

A separate suitability point layer records the sampled centres, preliminary scores and first exclusion reasons. Its score represents feasibility of the entire requested footprint at that centre, using regional ERA5 resource without detailed candidate horizon/wake corrections; it is not a continuous construction permit map. Non-overlapping candidates are preselected by the configured score; up to 12 receive detailed resource/energy calculations and final ranking. This is a bounded rectangular search, not an exhaustive global optimization or an irregular buildable-land solver. A zero-result search is valid and its rejection counts are shown.

Initial, editable weights: resource 30%, grid 25%, slope 20%, roads 15%, settlement 10%. Sliders use 0–100 relative importance, normalized to sum to 100%; all-zero weights are rejected and hard constraints remain mandatory even with zero criterion weight. All component scores are clipped to 0–1. Resource anchors: PV POA 1000–2000 kWh/m²/year; hub wind 3–9 m/s. Distance and slope scores are `1 - value/limit`. Weights/anchors are scenario assumptions, not calibrated probabilities. One-at-a-time ±20% weight changes produce score sensitivity ranges. The energy ±20% scenario is **not P50/P90 or a confidence interval**.

### Solar

ERA5 becomes an 8760-slot mean calendar year (leap days excluded). NOAA/Meeus solar geometry is evaluated at the midpoint of the preceding radiation hour. Liu–Jordan isotropic transposition compares south-facing tilts 25–50°. A conservative row pitch uses winter-solstice solar noon ±2 hours and the maximum permitted north-facing slope, plus 1 m spacing allowance.

Terrain shading uses nine footprint origins, 32 azimuth rays and a 3 km horizon; direct beam is blocked below the terrain horizon and diffuse receives an approximate sky-view correction. Annual production = shaded POA × DC capacity × user PR / 1000 (GWh). Monthly estimates sum to the annual result. Snow, soiling, electrical losses and temperature are represented only through the selected PR; residual row shading and detailed grading are not separately simulated.

Default module: 580 Wp, 2.278 × 1.134 m; two portrait rows × 26 columns per table (52 modules), partial last table rendered with its actual module count. Capacity is DC MWp, not AC export capacity.

### Wind

Sixteen directional sectors use fitted Weibull distributions. The 10–100 m wind ratio determines the power-law shear exponent; hub-height and air-density corrections feed a generic cubic 3/12/25 m/s cut-in/rated/cut-out curve. Jensen/Park wake uses Ct=.8 and k=.075, five sub-directions per sector and quadratic deficit superposition. Other losses default to 10%. No manufacturer-certified power curve or terrain-flow speed-up is inferred.

Default turbine: 6 MW, 170 m rotor, 120 m hub; 7D along / 4D across the dominant ERA5 energy direction. Wind AEP is annual; monthly wind speed is displayed without fabricating monthly energy from annual Weibull estimates. The chosen equipment is a scenario, not a recommended commercial machine.

### Reference methods

- [NOAA solar calculation details](https://www.gml.noaa.gov/grad/solcalc/calcdetails.html) (the online calculator is no longer maintained; equations are implemented locally).
- [DTU/WAsP wind-model literature](https://wasp.dtu.dk/support/literature), including Jensen, *A note on wind generator interaction* (1983).
- Adapted pure functions: `lib/physics/`; original local sources: `web/lib/era5.ts`, `energy.ts`, `solarsite.ts`, `windfarm.ts`, `equipmentCurve.ts`.
- Procedural glTF: `lib/renewable-models.ts`; ArcGIS orchestration: `components/study-map.tsx`. Scene lighting is visualization, separate from the energy model.

### Land overlap

The **Газрын давхцал** card reports the selected site’s unique overlap with other/unknown claims and DSEDN-only land in m² and percent, plus the remaining unmapped area. Intersecting ownership/possession records are unioned before measuring; overlap between DSEDN and other claims remains classified as other/unknown. A boundary-only touch measures zero area while the existing conservative cadastral exclusion still applies. In /6 or when cadastral data is unavailable, the card reports unknown rather than 0%. The optional map overlay highlights clipped other claims red, DSEDN-only claims green, and the site background gray. These measurements do not replace the existing parcel-aware hard exclusion or introduce an extra weighting criterion.

## Enterprise storage and map presentation

The fixed portal is `https://gis.selbecity.mn/geoportal`. A content-capable user token is required for Portal item creation; the supplied API key currently identifies an application with access to the Renewable source item, not a Portal user. The save card uses the ArcGIS SDK sign-in dialog, sends the returned token only to the local save endpoint, and targets the user’s `renewable` folder (created if absent). Credentials are submitted directly by the SDK to the trusted Enterprise token endpoint; no passwords are stored in this app. Alternatively, administrators can set `ARCGIS_PORTAL_TOKEN` in ignored server environment configuration. `ARCGIS_RIVER_TOKEN` is an optional separate read credential; the now-public river works with the existing source configuration.

Saved content is a native Feature Collection item with screening centres, candidate polygons, equipment points, clipped study boundary, and a derived land-overlap polygon layer for new results. It includes period, weights, model assumptions, source provenance and limitations; private source cadastral records are not republished. Source services are never edited. The server reads its own completed-run snapshot, checks the item response, retains a receipt and reuses it on retry. This is an Enterprise item, **not a newly published hosted FeatureServer**. Actual item creation needs a successful user sign-in; automated checks simulate creation and verify the live sign-in dialog without submitting credentials.

2D starts with an ArcGIS light vector basemap; 3D uses imagery and world elevation. The **Давхаргууд** drawer provides searchable groups, feature counts, visibility and per-layer opacity. Detailed cadastral/context layers appear at closer scales. The drawer reflects which layers are hidden in the realistic planning view, and enabling an analysis layer returns its analytical overlays. Map extent and layer settings do not constrain the whole-region suitability calculation.

Renewable source layers now have distinct colours and independent controls: overhead /0, low voltage /1, high-voltage cable /4, branch boundaries /5, Darkhan boundaries /6, ownership /7 and possession /8. On 2026-11-05 the owner confirmed the cable exports were duplicates and selected `High_voltage_c_ExportFeature` (/4); /2 and /3 are excluded from the display endpoint and new analyses. /1 remains a context layer. Displaying either cadastral layer does not enable or change cadastral exclusions in the analysis request.

Move the pointer over a feature for a Mongolian information card; click to pin it, use the arrows to inspect overlapping objects, and press Escape to close. Lines and physical equipment take priority over underlying boundary polygons. Booroljuut's inspection pattern is adapted with a 120 ms throttle, stale-response checks, and no hit tests during camera navigation. Hovering does not rebuild map data. Only approved technical attributes are fetched for electrical layers; private owner/contact/editor fields remain excluded. Domain values are decoded only where the layer supplies a domain. Unlabelled numeric codes are identified as source values. Because observed `length_km` values use inconsistent scales, the card separates the unverified stored value from geodesic length computed from the returned geometry.

Wind meshes retain metres (120 m hub plus 85 m rotor radius = 205 m tip height for the default turbine), and the 2D plan shows rotor envelopes in metres. Booroljuut’s shared GPU renderer animates up to 40 nearby on-screen rotors; the remaining turbines use static glTF instances. Native tower instances retain terrain shadows. Rotor speed uses the selected candidate’s ERA5 hub-speed mean with an illustrative TSR=7, 12 rpm cap and cut-in/out limits; it is not a manufacturer RPM model or an hourly playback. Reduced-motion preference, hidden tabs, low equipment opacity and the motion switch restore static models. The custom rotor pass does not cast moving blade shadows. Solar tables use textured cells, metal frames, braces and footings while retaining the requested panel count and dimensions. Lighting controls change the illustrative June 21 scene, not the production calculation.

Booroljuut’s concrete support model is reused for **illustrative** 14 m poles at up to 100 m spacing along overhead lines only; underground cables are excluded. Terrain-sampled conductor paths join insulators with assumed parabolic sag. These are not surveyed pole positions, voltage-specific designs or clearance calculations. The display is capped at 600 supports within a local window around the current close view and appears below 1:40,000; the cap and assumptions are visible.

Mapped vertices, including bends, retain supports; exact shared endpoints are merged, duplicate spans are removed, and a geometric crossing without a mapped vertex does not create a junction. At bends, the crossarm heading follows the incoming/outgoing direction bisector. Wires preserve their attachment side when a source line is reversed. Hovering over a 3D pole or conductor identifies its source overhead line, inferred role, bend angle, illustrative height or span/sag, and the model limitation. Direct 3D viewing starts with analytical ground overlays hidden; they can be enabled in the layer drawer.

The ArcGIS map and loaded data persist when switching 2D/3D. Large suitability point collections upload to a client FeatureLayer in batches, and selecting a candidate or changing visibility/opacity does not reconstruct them. Hidden graphics are built on first use. SceneView and equipment models load when needed; preview requests for boundary, river and transport finish independently and share cached/in-flight reads. A headless Chrome replay of the same 43,045-point result reduced three candidate selections from 3,890 ms total main-thread blocking to no tasks above 50 ms. This is a local interaction benchmark, not a claim about server analysis or network download time. Replay checks also verified every point was retained, map identity persisted across dimension changes, opacity worked during animation, and the 800 px layout did not overflow.

## Prepare local context

The current workspace already has the extract. On another machine, download the official `mongolia-latest-free.shp.zip` from Geofabrik and extract it into `.data/mongolia`, then:

```sh
node scripts/prepare-logistics.mjs .data/mongolia
node scripts/prepare-context.mjs
```

These create `.data/mongolia-logistics.json` and `.data/mongolia-context.json`. OSM attribution: © OpenStreetMap contributors, ODbL. Follow source licenses when redistributing data. Roads can fall back to Overpass; context requires the prepared local extract. ERA5/DEM download on demand and cache to disk; ArcGIS/local selections cache in memory for one hour. Restart after replacing an extract.

## Vercel deployment

Production: https://renewable.twincore.mn (also https://dsedn-renewable.vercel.app; project `monmap/dsedn-renewable`). Source: https://github.com/monmapgisteam-oss/dsedn. Vercel is connected to the repository's `main` production branch. The Vercel CLI is linked through the ignored `.vercel/project.json`; credentials and local analysis archives are excluded by `.vercelignore` and Next.js output tracing.

After updating the public OSM extracts, run `node scripts/package-vercel-data.mjs`. This writes gzip copies into `runtime-data/`, preserving all source features and provenance. The deployment build validates both files. Keep these files with the deployment source; they are server assets, not public browser downloads. The original `.data` files remain the local-development inputs.

Configure `ARCGIS_API_KEY` as an encrypted **server-only** environment variable in Vercel (Production and Preview); never use a `NEXT_PUBLIC_` variable for it. The supplied Renewable service requires authentication. The private Blob store `dsedn-renewable-results` is connected for completed run snapshots and Enterprise save receipts. Blob writes and reads are compressed, private, and durable across instances. Local `.data/runs` snapshots remain compatible. Terrain/ERA5 caches use the writable temporary directory on Vercel, while local development retains `.data/siting`.

Large GIS responses stream in chunks. The current Hobby plan permits up to 300 seconds per function invocation; hosted analysis sends an explicit error at 275 seconds and does not label an interrupted calculation as complete. Full-region runs can exceed this limit, especially with cold DEM/ERA5 downloads. Use the local Node server for those runs until a durable background-job backend is implemented. Increasing `maxDuration` alone does not remove the plan limit.

Push subsequent changes to `main` with `git push origin main` to trigger a production deployment automatically. For a manual deployment, use `vercel deploy --prod`. On Windows, use `vercel.cmd` if PowerShell blocks the script shim. The CLI's native Windows `env run -- node ...` dispatcher currently needs the absolute `node.exe` path; this was verified and reported to Vercel. Do not download production credentials for routine verification.

## Verify

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
# With the local development server running:
node --import tsx scripts/verify-siting.ts --all
```

Tests additionally cover polygon holes and real study extents, river buffers overriding score weights, period validation, weight normalization, scaled wind geometry, cable exclusion from 3D supports, and private Enterprise folder/save/retry behavior. Tests cover physical demand conversion, exact counts, capacity rounding, footprint containment, rotated turbine spacing, cadastral classification/privacy, complete service pagination, energy conservation and wake direction, winter row pitch, plus the earlier screening maths. The live verification command writes auditable JSON outputs under ignored `.data/verified-*.json`.

Verified after the boundary/river/road changes: 20 ha solar in /5 produced 12 candidates; 296 of 4,830 sampled footprints were rejected by the initial 100 m river buffer. /6 with 200 panels and 2024-only ERA5 produced 12 candidates, 8,784 valid hourly records and no cadastral query. A three-turbine /5 scenario produced 12 candidates. Every exported candidate in these checks remained inside the actual selected region and outside the supplied river buffer. Earlier 30-turbine/100 MW example counts predate these constraints and must be recalculated. These are provisional screening results, not approved or connectable projects.

Tailwind content scanning is disabled because the UI uses explicit CSS and this workspace contains large GIS archives. ESLint excludes the ignored data/reference archives; production code remains checked.
