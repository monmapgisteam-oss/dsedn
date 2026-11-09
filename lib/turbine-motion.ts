// Adapted from the user-provided Booroljuut project. Visual motion only.
import type { PowerPoint } from "./physics/equipmentCurve";

export const MAX_MOVING_TURBINES = 40;
// ТААМАГЛАЛ: үйлдвэрлэгчийн RPM муруйгүй үед TSR=7, дээд 12 rpm концепц.
export function rotorRpm(speed:number, diameter:number, cutIn:number, cutOut:number, maxRpm=12, tipSpeedRatio=7) {
  if (![speed,diameter,cutIn,cutOut,maxRpm,tipSpeedRatio].every(Number.isFinite) || diameter<=0 || speed<0 || cutIn<0 || cutOut<=cutIn || speed<cutIn || speed>=cutOut) return 0;
  return Math.max(0,Math.min(maxRpm, speed*tipSpeedRatio*60/(Math.PI*diameter)));
}

export function hasRpmCurve(curve?: PowerPoint[]) {
  return !!curve && curve.length >= 2 && curve.every((p, i) => Number.isFinite(p.rpm) && p.rpm! >= 0 && Number.isFinite(p.speed) && (i === 0 || p.speed > curve[i - 1].speed));
}

export function targetRotorRpm(speed:number, diameter:number, cutIn:number, cutOut:number, curve?:PowerPoint[]) {
  if (![speed,diameter,cutIn,cutOut].every(Number.isFinite) || diameter<=0 || cutIn<0 || speed < 0 || speed < cutIn || speed >= cutOut || cutOut <= cutIn) return 0;
  if (!hasRpmCurve(curve)) return rotorRpm(speed, diameter, cutIn, cutOut);
  // Оруулсан муруйн хүрээнээс гадуур RPM зохиож экстраполяц хийхгүй.
  if (speed < curve![0].speed || speed > curve![curve!.length - 1].speed) return 0;
  for (let i = 1; i < curve!.length; i++) if (speed <= curve![i].speed) {
    const a = curve![i - 1], b = curve![i], f = (speed - a.speed) / (b.speed - a.speed);
    return a.rpm! + (b.rpm! - a.rpm!) * f;
  }
  return 0;
}

export type RotorMotion = { phase: number; rpm: number; target: number; at: number };
export function createRotorMotion(rpm:number, at:number, phase=0):RotorMotion {
  return { phase, rpm, target: rpm, at };
}

// ТААМАГЛАЛ: 1.25 сек нь зөвхөн дүрслэлийн шилжилт; бодит инерц/тоормосны загвар биш.
// Экспоненциал шилжилтийн интеграл: кадрын тоо, zoom, тасалдлаас хурд хамаарахгүй.
export function advanceRotor(m: RotorMotion, now: number) {
  const dt = Math.max(0, (now - m.at) / 1000), tau = 1.25;
  const decay = Math.exp(-dt / tau), integral = m.target * dt + (m.rpm - m.target) * tau * -Math.expm1(-dt / tau);
  m.phase = ((m.phase + 6 * integral) % 360 + 360) % 360;
  m.rpm = m.target + (m.rpm - m.target) * decay;
  m.at = Math.max(now, m.at);
  return m;
}

export function setRotorTarget(m: RotorMotion, rpm: number, now: number) {
  advanceRotor(m, now);
  m.target = Number.isFinite(rpm) ? Math.max(0, rpm) : 0;
}

// glTF (X, Y↑, -Z north) → ENU → дэлхийн координат → камер.
// Том ECEF координатыг камерын матрицтай double precision-ээр нийлүүлж чичиргээг арилгана.
export function rotorMatrices(origin:ArrayLike<number>, view:ArrayLike<number>, heading:number, phase:number, modelView:Float32Array, normal:Float32Array) {
  const h = heading * Math.PI / 180, p = phase * Math.PI / 180;
  const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p);
  const rotation = [ch*cp,-sh*cp,sp, -ch*sp,sh*sp,cp, -sh,-ch,0];
  const world = new Float64Array(16);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
    world[c*4+r] = origin[r]*rotation[c*3] + origin[4+r]*rotation[c*3+1] + origin[8+r]*rotation[c*3+2];
    normal[c*3+r] = world[c*4+r];
  }
  world[12]=origin[12]; world[13]=origin[13]; world[14]=origin[14]; world[15]=1;
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
    modelView[c*4+r] = view[r]*world[c*4] + view[4+r]*world[c*4+1] + view[8+r]*world[c*4+2] + view[12+r]*world[c*4+3];
  }
}
