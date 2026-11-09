// Adapted from the user-provided Booroljuut reference, commit 782827f.
import { curveValue, type PowerPoint } from "./equipmentCurve";
// Салхи, нарны физик томьёо — сайтын өгөгдөл биш, зөвхөн тооцооны аргачлал

/** Гамма функц (Lanczos) */
export function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Weibull: дундаж хурд ба k-аас масштаб A */
export const weibullA = (mean: number, k: number) => mean / gamma(1 + 1 / k);
export const weibullPdf = (v: number, k: number, A: number) =>
  v <= 0 ? 0 : (k / A) * Math.pow(v / A, k - 1) * Math.exp(-Math.pow(v / A, k));

/** Хүчин зэргийн (power law) өндрийн шилжүүлэлт */
export const shear = (v: number, h1: number, h2: number, alpha: number) => v * Math.pow(h2 / h1, alpha);

/** Агаарын нягт: ISA барометрын томьёо, далайн түвшнээс дээших өндөр (м), дундаж температур (°C) */
export function airDensity(elev: number, tC = 15) {
  const p = 101325 * Math.pow(1 - 2.25577e-5 * elev, 5.25588);
  return p / (287.05 * (tC + 273.15));
}

/** Weibull-ийн хүчний нягт W/m² */
export const powerDensity = (rho: number, k: number, A: number) => 0.5 * rho * Math.pow(A, 3) * gamma(1 + 3 / k);

/** Ерөнхий турбины хүчний муруй (MW): cut-in-ээс rated хүртэл куб */
export function powerCurve(v: number, p: { rated: number; vin: number; vr: number; vout: number; curve?:PowerPoint[] }) {
  if (v < p.vin || v >= p.vout) return 0;
  if (p.curve?.length) return Math.min(p.rated,curveValue(p.curve,v));
  if (v >= p.vr) return p.rated;
  return p.rated * (Math.pow(v, 3) - Math.pow(p.vin, 3)) / (Math.pow(p.vr, 3) - Math.pow(p.vin, 3));
}

/** Нэг турбины жилийн бруто үйлдвэрлэл (MWh) */
export function turbineAEP(k: number, A: number, p: { rated: number; vin: number; vr: number; vout: number; curve?:PowerPoint[] }) {
  let e = 0;
  const dv = 0.1;
  for (let v = dv / 2; v < 40; v += dv) e += powerCurve(v, p) * weibullPdf(v, k, A) * dv;
  return e * 8760;
}

// ---------- Нарны байрлал (NOAA аргачлал) ----------
const rad = Math.PI / 180;

export function sunPosition(date: Date, lat: number, lon: number) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad)
    - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad)); // минут
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (utcMin + eqTime + 4 * lon + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZ = Math.sin(lat * rad) * Math.sin(decl * rad) + Math.cos(lat * rad) * Math.cos(decl * rad) * Math.cos(ha * rad);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZ))) / rad;
  let az = Math.atan2(Math.sin(ha * rad), Math.cos(ha * rad) * Math.sin(lat * rad) - Math.tan(decl * rad) * Math.cos(lat * rad)) / rad + 180;
  az = (az + 360) % 360;
  // Нар мандах/жаргах (цагийн өнцөг, 90.833° зенит)
  const cosH0 = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  const H0 = Math.acos(Math.max(-1, Math.min(1, cosH0))) / rad;
  const noonUTC = 720 - 4 * lon - eqTime; // минут
  return { elevation: 90 - zen, azimuth: az, decl, noonUTC, dayLengthH: (8 * H0) / 60, sunriseUTC: noonUTC - 4 * H0, sunsetUTC: noonUTC + 4 * H0 };
}
