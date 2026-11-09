import type { CellResult, Criterion } from './types';

export const criterionNames:Record<Criterion,string>={resource:'Эрчим хүчний нөөц',grid:'Сүлжээний ойр байдал',terrain:'Газрын налуу',access:'Замын хүртээмж'};
export const statusNames:Record<CellResult['properties']['status'],string>={high:'Өндөр',moderate:'Дунд',low:'Бага',excluded:'Хасагдсан',unassessed:'Өгөгдөл дутуу'};
const messages:Record<string,string>={
  'Slope exceeds scenario limit':'Газрын налуу сонгосон босгоос их',
  'Intersects an exclusion polygon':'Хязгаарлалтын талбайтай давхцсан',
  'Environmental, settlement and land-use constraints not fully reviewed':'Байгаль орчин, суурьшил, газар ашиглалтын хязгаарлалтыг бүрэн шалгаагүй',
  'Missing resource data':'Эрчим хүчний нөөцийн өгөгдөл дутуу',
  'Missing grid data':'Цахилгаан сүлжээний өгөгдөл дутуу',
  'Missing terrain data':'Газрын гадаргын өгөгдөл дутуу',
  'Missing access data':'Замын өгөгдөл дутуу',
  'At least one criterion must have positive weight; all weights must be nonnegative.':'Жин сөрөг байж болохгүй. Дор хаяж нэг шалгуур эерэг жинтэй байна.',
  'Slope, distance limits, and capacity density must be positive.':'Налуу, зайн босго, чадлын нягт тэгээс их байна.',
  'The upper resource anchor must exceed the lower anchor.':'Нөөцийн дээд босго нь доод босгоос их байна.',
  'Slope must not exceed 90 degrees.':'Газрын налуу 90°-аас их байж болохгүй.',
  'Distance anchors must stay within the fetched coverage: grid at most 10 km and roads at most 5 km.':'Өгөгдлийн хамрах хүрээнд сүлжээний босго ≤10 км, замын босго ≤5 км байна.',
  'Specific PV yield must be between 0 and 3,000 kWh/kWp/year.':'Нарны нэгж чадлын жилийн үйлдвэрлэл 0–3,000 кВт·ц/кВтp/жил байна.',
  'Wind capacity factor must be between 0 and 1.':'Салхины чадал ашиглалтын коэффициент 0–1 хооронд байна.',
  'A study area needs four numeric WGS84 bounds.':'Судалгааны талбайд WGS84 системийн дөрвөн координат шаардлагатай.',
  'Choose a valid study area within Mongolia (87–120°E, 41–53°N).':'Монголын нутаг дахь талбай сонгоно уу (87–120°E, 41–53°N).',
  'Keep this interactive study area below 900 km². Use regional GIS processing for larger areas.':'Талбайг 900 км²-аас бага сонгоно уу. Илүү том бүсэд GIS боловсруулалт шаардлагатай.',
  'This area exceeds 400 cells. Increase the mesh size or reduce the study area.':'400-аас олон нүд үүсэх тул торны хэмжээг томсгох эсвэл талбайг багасгана уу.',
  'Use a 1, 2, or 5 km screening mesh.':'1, 2 эсвэл 5 км-ийн тор сонгоно уу.',
  'ArcGIS authorization failed. Update the server credential.':'ArcGIS нэвтрэх эрх хүчингүй байна. Серверийн түлхүүрийг шинэчилнэ үү.',
  'ArcGIS is not configured. Set ARCGIS_API_KEY in .env.local on the server.':'ArcGIS холболтыг сервер дээр тохируулна уу.',
  'The data provider did not respond. Retry later or import a local dataset.':'Эх үүсвэр хариу өгсөнгүй. Дахин оролдох эсвэл өөрийн өгөгдлийг оруулна уу.',
  'Elevation service unavailable or rate limited. Import a DEM or retry later.':'Өндрийн үйлчилгээ түр боломжгүй байна. DEM оруулах эсвэл дахин оролдоно уу.',
  'Clip your DEM to the study area first (maximum 200 MB).':'DEM-ээ судалгааны талбайгаар тайрна уу. Дээд хэмжээ 200 МБ.',
  'Use a north-up EPSG:4326 DEM with elevation in metres. Reproject other files in GIS first.':'Өндөр нь метрээр, хойд зүг дээш чиглэсэн EPSG:4326 DEM ашиглана уу.',
  'Rotated or flipped rasters are not supported. Export a north-up DEM.':'Эргэсэн растр дэмжихгүй. Хойд зүг дээш чиглэсэн DEM экспортолно уу.',
  'The DEM has no valid center samples inside this study area. Check coverage and NoData.':'Талбайн төвүүдэд хүчинтэй өндрийн утга алга. DEM-ийн хамрах хүрээ ба NoData-г шалгана уу.',
  'Clip the GeoJSON to your study area first (maximum 30 MB).':'GeoJSON-оо судалгааны талбайгаар тайрна уу. Дээд хэмжээ 30 МБ.',
  'Provide a GeoJSON FeatureCollection with 1–30,000 features.':'1–30,000 объекттой GeoJSON FeatureCollection оруулна уу.',
  'Reproject input to EPSG:4326 longitude/latitude within Mongolia.':'Оролтын өгөгдлийг EPSG:4326 системийн Монголын нутаг дахь уртраг, өргөрөгт хөрвүүлнэ үү.',
  'Concept target must be above zero and at most 100 MW.':'Төлөвлөлтийн зорилтот чадал 0-ээс их, 100 МВт-аас ихгүй байна.',
};

/** Presentation-only translation; exported source records and model identifiers stay stable. */
export function mnMessage(text:string):string {
  if(messages[text])return messages[text];
  if(text.includes('incomplete'))return 'Эх үүсвэр дутуу өгөгдөл буцаалаа. Хэсэгчилсэн өгөгдлийг үнэлгээнд ашиглаагүй.';
  if(text.startsWith('Invalid exclusions'))return 'Хязгаарлалтын GeoJSON нь хүчинтэй Polygon / MultiPolygon геометртэй байна.';
  if(text.startsWith('Invalid roads'))return 'Замын GeoJSON нь хүчинтэй LineString / MultiLineString геометртэй байна.';
  if(/HTTP \d+/.test(text))return `Өгөгдлийн үйлчилгээний алдаа (${text.match(/HTTP \d+/)?.[0]}). Дахин оролдоно уу.`;
  if(/fetch failed|timeout|aborted|Failed to fetch/i.test(text))return 'Сүлжээний холболт тасарлаа. Дахин оролдоно уу.';
  return text;
}

export const conceptWarning='Энэ нь тоноглолын урьдчилсан байршлын дүрслэл. Нүдний төвийн үнэлгээ нь тоноглол бүрийн суурийг баталгаажуулахгүй. Сүүдэр, турбины мөрийн нөлөө, газар шорооны ажил, кабель, зам, хамгаалалтын зай, суурь болон сүлжээний холболтыг нарийвчлан тооцоогүй.';
