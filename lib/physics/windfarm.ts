// Adapted from the user-provided Booroljuut reference, commit 782827f.
// Салхин паркийн байршуулалт ба AEP: зууван зайтай greedy байршуулалт, Jensen (Park) wake загвар.
// Томьёо: N.O. Jensen (1983) "A note on wind generator interaction", Risø-M-2411;
//         Katic, Højstrup, Jensen (1986) — дээд урсгалын дутагдлыг квадрат нийлбэрээр нэгтгэх.
import type { PowerPoint } from "./equipmentCurve";
import { turbineAEP } from "./energy";
import type { Sector } from "./era5";

export type Turb = { rated: number; rotor: number; hub: number; vin: number; vr: number; vout: number; ct: number; curve?:PowerPoint[] };
export type Cand = { x: number; y: number; score: number; elev: number; gwa?: number };
export type Placed = Cand & { no: number };

const R = Math.PI / 180;

/**
 * Оноо ихээс нь эхлэн байршуулна. Хоёр турбины хооронд давамгай чиглэлийн дагуу along·D,
 * хөндлөн cross·D-ээс багагүй (зууван хязгаар).
 */
export function placeTurbines(cands: Cand[], D: number, along: number, cross: number, dirDeg: number, maxN = Infinity): Placed[] {
  const out: Placed[] = [];
  const s = Math.sin(dirDeg * R), c = Math.cos(dirDeg * R);
  const ra = along * D, rc = cross * D;
  const sorted = [...cands].sort((p, q) => q.score - p.score);
  for (const p of sorted) {
    if (out.length >= maxN) break;
    let ok = true;
    for (const q of out) {
      const dx = p.x - q.x, dy = p.y - q.y;
      const a = dx * s + dy * c, b = dx * c - dy * s;
      if ((a / ra) ** 2 + (b / rc) ** 2 < 1) { ok = false; break; }
    }
    if (ok) out.push({ ...p, no: out.length + 1 });
  }
  return out;
}

/** Хоёр тойргийн огтлолцлын талбай / роторын талбай */
function overlap(r: number, Rw: number, d: number, rr: number) {
  if (d >= Rw + r) return 0;
  if (d <= Rw - r) return 1;
  const a = r * r * Math.acos((d * d + r * r - Rw * Rw) / (2 * d * r));
  const b = Rw * Rw * Math.acos((d * d + Rw * Rw - r * r) / (2 * d * Rw));
  const c = 0.5 * Math.sqrt(Math.max(0, (-d + r + Rw) * (d + r - Rw) * (d - r + Rw) * (d + r + Rw)));
  return (a + b - c) / rr;
}

/**
 * Сектор бүрт турбин бүрийн хурдны дутагдал δ (0..1).
 * Сектор дотор 5 дэд чиглэлээр дундажлана (сарнайн дискретчлэлийн хэт огцом нөлөөг зөөлрүүлэх).
 */
export function wakeDeficits(t: { x: number; y: number }[], D: number, ct: number, k: number, nSec: number): Float64Array[] {
  const width = 360 / nSec, subs = [-0.4, -0.2, 0, 0.2, 0.4];
  const r = D / 2, rr = Math.PI * r * r, a0 = 1 - Math.sqrt(1 - ct);
  return Array.from({ length: nSec }, (_, s) => {
    const out = new Float64Array(t.length);
    for (const f of subs) {
      const th = (s * width + f * width) * R;
      const wx = -Math.sin(th), wy = -Math.cos(th); // салхи "-аас" чиглэлээс эсрэг зүг рүү урсана
      for (let j = 0; j < t.length; j++) {
        let sum = 0;
        for (let i = 0; i < t.length; i++) {
          if (i === j) continue;
          const dx = t[j].x - t[i].x, dy = t[j].y - t[i].y;
          const x = dx * wx + dy * wy;
          if (x <= 0) continue;
          const lat = Math.abs(dx * wy - dy * wx);
          const Rw = r + k * x;
          const ov = overlap(r, Rw, lat, rr);
          if (ov > 0) sum += (a0 * (D / (D + 2 * k * x)) ** 2 * ov) ** 2;
        }
        out[j] += Math.sqrt(sum) / subs.length;
      }
    }
    return out;
  });
}

/**
 * Турбин бүрийн жилийн үйлдвэрлэл (MWh).
 * Сектор бүрийн 100 м Weibull-ийг hub өндөрт power law-аар шилжүүлж,
 * агаарын нягтыг IEC 61400-12-1-ийн тэнцүү хурдаар (v·(ρ/1.225)^(1/3)) тооцно.
 * scale[j] — турбин бүрийн орон нутгийн хурдны коэффициент (GWA hub хурд ÷ ERA5 hub хурд); байхгүй бол 1.
 */
export function farmAEP(turbs: Placed[], sectors: Sector[], alpha: number, turb: Turb, rho: (elev: number) => number, deficits: Float64Array[], scale?: number[]) {
  const shearF = Math.pow(turb.hub / 100, alpha);
  const curve = { rated: turb.rated, vin: turb.vin, vr: turb.vr, vout: turb.vout, curve:turb.curve };
  return turbs.map((t, j) => {
    const dens = Math.cbrt(rho(t.elev) / 1.225), sc = scale?.[j] ?? 1;
    let gross = 0, net = 0, vHub = 0;
    sectors.forEach((s, i) => {
      if (!s.f || !s.A) return;
      const A = s.A * shearF * dens * sc;
      gross += s.f * turbineAEP(s.k, A, curve);
      net += s.f * turbineAEP(s.k, A * (1 - deficits[i][j]), curve);
      vHub += s.f * s.mean * shearF * sc;
    });
    return { gross, net, wake: gross ? 1 - net / gross : 0, vHub };
  });
}
