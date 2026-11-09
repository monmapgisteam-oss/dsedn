// Adapted from the user-provided Booroljuut reference, commit 782827f.
import { gamma } from "./energy";
export type WeatherRaw={latitude:number;longitude:number;elevation:number;hourly: {time:string[]} & Record<string, (number|null)[] | string[]>};
export type Sector = { f: number; mean: number; k: number; A: number; e: number };
export type Climate = {
  lat: number; lon: number; gridElev: number; start: string; end: string; hours: number; fetchedAt: number; cached?: boolean;
  annualReady: boolean; coverage: number; expectedHours: number; solarSlots: number; model: "ERA5"; raw: WeatherRaw;
  wind: {
    mean10: number; mean100: number; alpha: number; k: number; A: number; tMean: number;
    sectors: Sector[]; monthly: number[]; // 100 м-ийн сарын дундаж
  };
  // Жишиг жил: он бүрийн (өдөр, UTC цаг)-ийн дундаж, 365×24, W/m² — өмнөх цагийн дундаж утга
  ty: { ghi: number[]; dni: number[]; dhi: number[] };
  solar: { ghi: number; dni: number; dhi: number }; // кВт·ц/м²/жил
};

/** Weibull (Justus, 1978): k = (σ/μ)^-1.086, A = μ / Γ(1+1/k) */
export function fitWeibull(vs: number[]) {
  const n = vs.length;
  if (n < 2) return { mean: 0, k: 2, A: 0 };
  const mean = vs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(vs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const k = mean > 0 && sd > 0 ? Math.pow(sd / mean, -1.086) : 2;
  return { mean, k, A: mean / gamma(1 + 1 / k) };
}

type Raw = WeatherRaw;

export function summarize(d: Raw, nSec: number, start: string, end: string): Climate {
  const h = d.hourly as Record<string, (number | null)[]> & { time: string[] };
  const v10: number[] = [], v100: number[] = [], t: number[] = [];
  const secV: number[][] = Array.from({ length: nSec }, () => []);
  const mSum = Array(12).fill(0), mN = Array(12).fill(0);
  const tyS = { ghi: new Float64Array(8760), dni: new Float64Array(8760), dhi: new Float64Array(8760) };
  const tyN = new Uint16Array(8760);
  const width = 360 / nSec;
  let hours = 0;
  for (let i = 0; i < h.time.length; i++) {
    const time = h.time[i];
    const a = h.wind_speed_10m[i], b = h.wind_speed_100m[i], dir = h.wind_direction_100m[i], tc = h.temperature_2m[i];
    if (b != null && dir != null && Number.isFinite(b) && Number.isFinite(dir)) {
      v100.push(b); hours++;
      secV[Math.round(dir / width) % nSec].push(b);
      const m = Number(time.slice(5, 7)) - 1;
      mSum[m] += b; mN[m]++;
    }
    if (a != null && Number.isFinite(a)) v10.push(a);
    if (tc != null && Number.isFinite(tc)) t.push(tc);
    // Жишиг жил: 2-р сарын 29-ийг алгасна
    if (time.slice(5, 10) === "02-29") continue;
    const g = h.shortwave_radiation[i], n = h.direct_normal_irradiance[i], df = h.diffuse_radiation[i];
    if (g == null || n == null || df == null || !Number.isFinite(g+n+df)) continue;
    const y = Number(time.slice(0, 4));
    const doy = Math.round((Date.UTC(y, Number(time.slice(5, 7)) - 1, Number(time.slice(8, 10))) - Date.UTC(y, 0, 1)) / 864e5)
      - ((y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) && Number(time.slice(5, 7)) > 2 ? 1 : 0);
    const k = doy * 24 + Number(time.slice(11, 13));
    tyS.ghi[k] += g; tyS.dni[k] += n; tyS.dhi[k] += df; tyN[k]++;
  }
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const mean10 = avg(v10), mean100 = avg(v100);
  const all = fitWeibull(v100);
  const sectors: Sector[] = secV.map((vs) => {
    const w = fitWeibull(vs);
    return { f: vs.length / Math.max(1, hours), mean: w.mean, k: w.k, A: w.A, e: vs.reduce((s, v) => s + v ** 3, 0) };
  });
  const eSum = sectors.reduce((s, x) => s + x.e, 0) || 1;
  sectors.forEach((s) => { s.e /= eSum; });
  const expectedHours = (Date.parse(end) - Date.parse(start)) / 3600000 + 24;
  const solarSlots = tyN.reduce((s,n)=>s+(n>0 ? 1 : 0),0);
  const coverage = hours / expectedHours;
  const annualReady = solarSlots === 8760 && coverage >= 0.98;
  const r = (a: Float64Array) => Array.from(a, (v, k) => (tyN[k] ? v / tyN[k] : NaN));
  const ty = { ghi: r(tyS.ghi), dni: r(tyS.dni), dhi: r(tyS.dhi) };
  const kwh = (a: number[]) => a.reduce((s, v) => s + v, 0) / 1000;
  return {
    annualReady, coverage, expectedHours, solarSlots, model: "ERA5", raw: d,
    lat: d.latitude, lon: d.longitude, gridElev: d.elevation, start, end, hours, fetchedAt: Date.now(),
    wind: {
      mean10, mean100, alpha: Math.log(mean100 / mean10) / Math.log(100 / 10), k: all.k, A: all.A, tMean: avg(t),
      sectors, monthly: mSum.map((s, i) => (mN[i] ? s / mN[i] : NaN)),
    },
    ty, solar: { ghi: kwh(ty.ghi), dni: kwh(ty.dni), dhi: kwh(ty.dhi) },
  };
}

