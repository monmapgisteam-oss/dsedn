// Adapted from the user-provided Booroljuut reference, commit 782827f.
// Нарны станцын DEM-д суурилсан тооцоо: налуу гадаргын цацраг (изотроп загвар), эгнээний зай, GCR.
// Цацрагийн шилжүүлэлт: Liu & Jordan (1963) изотроп тэнгэр — Beam·cosθ + DHI·(1+cosβ)/2 + GHI·ρ·(1−cosβ)/2.
// Рельефийн сүүдэр: DEM-ээс чиглэл бүрийн хаалтын өнцөг (horizon) ба тэнгэрийн харагдах хэсэг (SVF).
import { sunPosition } from "./energy";

import type { Climate } from "./era5";

const R = Math.PI / 180;
export type SunTrack = { cosZ: Float64Array; sinZ: Float64Array; az: Float64Array };

/** Жишиг жилийн цаг бүрийн нарны байрлал: ERA5-ийн утга өмнөх цагийн дундаж тул цагийн дунд (−30 мин) */
export function sunTrack(lat: number, lon: number, year = 2025): SunTrack {
  const cosZ = new Float64Array(8760), sinZ = new Float64Array(8760), az = new Float64Array(8760);
  const t0 = Date.UTC(year, 0, 1);
  for (let k = 0; k < 8760; k++) {
    const p = sunPosition(new Date(t0 + k * 3600e3 - 1800e3), lat, lon);
    const z = (90 - p.elevation) * R;
    cosZ[k] = Math.cos(z); sinZ[k] = Math.sin(z); az[k] = p.azimuth * R;
  }
  return { cosZ, sinZ, az };
}

/** Налуу β (°), чиг γ (°, уруу зүг, хойд=0) гадаргад жилд хүрэх цацраг, кВт·ц/м² */
export function surfaceAnnual(ty: Climate["ty"], sun: SunTrack, betaDeg: number, aspectDeg: number, albedo: number) {
  const b = betaDeg * R, g = aspectDeg * R;
  const cb = Math.cos(b), sb = Math.sin(b);
  const fd = (1 + cb) / 2, fr = albedo * (1 - cb) / 2;
  let e = 0;
  for (let k = 0; k < 8760; k++) {
    const ghi = ty.ghi[k];
    if (!ghi) continue;
    let beam = 0;
    if (sun.cosZ[k] > 0) {
      const ci = sun.cosZ[k] * cb + sun.sinZ[k] * sb * Math.cos(sun.az[k] - g);
      if (ci > 0) beam = ty.dni[k] * ci;
    }
    e += beam + ty.dhi[k] * fd + ghi * fr;
  }
  return e / 1000;
}

/** Урд зүгт харсан тогтмол налуутай эгнээний хамгийн их POA-г өгөх налуу */
export function bestTilt(ty: Climate["ty"], sun: SunTrack, albedo: number, candidates: number[]) {
  const rows = candidates.map((t) => ({ tilt: t, poa: surfaceAnnual(ty, sun, t, 180, albedo) }));
  return { best: rows.reduce((a, b) => (b.poa > a.poa ? b : a)), rows };
}

/**
 * Өвлийн туйлын өдөр үд ±shadeHours цагт эгнээ сүүдэрлэхгүй байх нарны "хойд-урд хавтгай дахь" өндрийн өнцөг (°).
 * tan h_ns = tan h / cos(азимутын зөрүү)
 */
export function designSunElev(lat: number, lon: number, shadeHours: number, year = 2025) {
  const noon = sunPosition(new Date(Date.UTC(year, 11, 21, 4)), lat, lon).noonUTC;
  const p = sunPosition(new Date(Date.UTC(year, 11, 21) + (noon + shadeHours * 60) * 60e3), lat, lon);
  const dAz = (p.azimuth - 180) * R;
  return Math.atan(Math.tan(p.elevation * R) / Math.cos(dAz)) / R;
}

/**
 * Налуу газар дээрх эгнээний хэвтээ алхам (pitch) ба GCR.
 * σ — рельефийн хойд-урд бүрдэл (°; урагш харсан налуу эерэг, хойшоо харсан сөрөг).
 * Эгнээний дээд ирмэгийн сүүдэр хойд талын газарт буух цэг: x = L(sinβ + cosβ·tan h)/(tan h + tan σ).
 */
export function rowPitch(L: number, tiltDeg: number, sunElevDeg: number, sigmaDeg: number) {
  const b = tiltDeg * R, th = Math.tan(sunElevDeg * R), ts = Math.tan(sigmaDeg * R);
  if (th + ts <= 0) return { pitch: Infinity, gcr: 0 };
  const pitch = Math.max(L * Math.cos(b), (L * (Math.sin(b) + Math.cos(b) * th)) / (th + ts));
  return { pitch, gcr: L / pitch };
}

/** Рельефийн хойд-урд бүрдэл: tan σ = tan(slope)·(−cos aspect) */
export const nsSlope = (slopePct: number, aspectDeg: number) =>
  Math.atan((slopePct / 100) * -Math.cos(aspectDeg * R)) / R;

// ---------- Рельефийн сүүдэр (horizon) — ArcGIS Area Solar Radiation-ий viewshed-тэй ижил санаа ----------

export type HGrid = { x0: number; y0: number; cell: number; nx: number; ny: number; elev: Float64Array };

/** Бүсийн эргэн тойрны (buf м) бүдүүн DEM grid — хүрээлэх уул толгодын сүүдэрт */
function bilin(h: HGrid, x: number, y: number) {
  const fx = (x - h.x0) / h.cell, fy = (y - h.y0) / h.cell;
  const i = Math.max(0, Math.min(h.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(h.ny - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
  const e = h.elev, k = j * h.nx + i;
  return (e[k] * (1 - tx) + e[k + 1] * tx) * (1 - ty) + (e[k + h.nx] * (1 - tx) + e[k + h.nx + 1] * tx) * ty;
}

/** nAz чиглэл бүрт хамгийн их хаалтын өнцгийн tan (≥ 0), maxD хүртэл h.cell алхмаар */
export function horizonTan(h: HGrid, x: number, y: number, z0: number, nAz: number, maxD: number) {
  const out = new Float32Array(nAz);
  for (let a = 0; a < nAz; a++) {
    const th = (a * 2 * Math.PI) / nAz, sx = Math.sin(th), sy = Math.cos(th);
    let best = 0;
    for (let d = 1.5 * h.cell; d <= maxD; d += h.cell) {
      const t = (bilin(h, x + sx * d, y + sy * d) - z0) / d;
      if (t > best) best = t;
    }
    out[a] = best;
  }
  return out;
}

/** Тэнгэрийн харагдах хэсгийн коэффициент (хэвтээ): 1 − mean(sin h) */
export const skyView = (hor: Float32Array) => 1 - hor.reduce((s, t) => s + Math.sin(Math.atan(t)), 0) / hor.length;

/** Нарны гэрэлтэй цагуудын урьдчилан тооцсон утга (сүүдэртэй тооцоонд) */
export type SunHours = { k: Int32Array; cosZ: Float64Array; sinZ: Float64Array; az: Float64Array; tanE: Float64Array; azIdx: Int32Array; month: Int8Array; nAz: number };
export function sunHours(ty: Climate["ty"], sun: SunTrack, nAz: number, year = 2025): SunHours {
  const ks: number[] = [];
  for (let k = 0; k < 8760; k++) if (ty.ghi[k] > 0) ks.push(k);
  const n = ks.length;
  const o: SunHours = { k: Int32Array.from(ks), cosZ: new Float64Array(n), sinZ: new Float64Array(n), az: new Float64Array(n), tanE: new Float64Array(n), azIdx: new Int32Array(n), month: new Int8Array(n), nAz };
  const t0 = Date.UTC(year, 0, 1);
  ks.forEach((k, i) => {
    o.cosZ[i] = sun.cosZ[k]; o.sinZ[i] = sun.sinZ[k]; o.az[i] = sun.az[k];
    o.tanE[i] = sun.sinZ[k] > 1e-9 ? sun.cosZ[k] / sun.sinZ[k] : 1e9;
    o.azIdx[i] = Math.round((sun.az[k] / (2 * Math.PI)) * nAz) % nAz;
    o.month[i] = new Date(t0 + k * 3600e3).getUTCMonth();
  });
  return o;
}

/**
 * Рельефийн сүүдэртэй налуу гадаргын жилийн цацраг (кВт·ц/м²) ба сар бүрийн утга.
 * Шууд цацраг нар хаалтын өнцгөөс доош үед 0; сарнисан цацраг × SVF (ТААМАГЛАЛ: изотроп тэнгэр).
 */
export function shadedAnnual(ty: Climate["ty"], sh: SunHours, betaDeg: number, aspectDeg: number, albedo: number,
  hor: Float32Array | null, monthly?: Float64Array) {
  const b = betaDeg * R, g = aspectDeg * R, cb = Math.cos(b), sb = Math.sin(b);
  const svf = hor ? skyView(hor) : 1;
  const fd = ((1 + cb) / 2) * svf, fr = (albedo * (1 - cb)) / 2;
  let e = 0, beamLost = 0, blockedH = 0;
  for (let i = 0; i < sh.k.length; i++) {
    const k = sh.k[i];
    let beam = 0;
    if (sh.cosZ[i] > 0) {
      const ci = sh.cosZ[i] * cb + sh.sinZ[i] * sb * Math.cos(sh.az[i] - g);
      if (ci > 0) {
        beam = ty.dni[k] * ci;
        if (hor && sh.tanE[i] < hor[sh.azIdx[i]]) { beamLost += beam; beam = 0; blockedH++; }
      }
    }
    const v = beam + ty.dhi[k] * fd + ty.ghi[k] * fr;
    e += v;
    if (monthly) monthly[sh.month[i]] += v / 1000;
  }
  return { total: e / 1000, beamLost: beamLost / 1000, svf, blockedH };
}

