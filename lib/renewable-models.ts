// Adapted from the user-provided Booroljuut repository, main commit 782827f.
// Procedural, metre-scale glTF models. glTF axes: X east, Y up, -Z north.
// Shared by every instance in a FeatureLayer; no external model downloads.
import {solarTexture} from './solar-texture';
type V3 = [number, number, number];
type Part = { positions: number[]; normals: number[]; color: number[]; metal: number; rough: number; emissive?: number[];uv?:number[];texture?:string };

export class Model {
  parts: Part[] = [];
  part(color: number[], metal = 0, rough = 0.7, emissive?: number[]) {
    const p: Part = { positions: [], normals: [], color, metal, rough, emissive };
    this.parts.push(p);
    return p;
  }
  tri(p: Part, a: V3, b: V3, c: V3) {
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    p.positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) p.normals.push(...n.map((x) => x / len));
  }
  quad(p: Part, a: V3, b: V3, c: V3, d: V3) {
    this.tri(p, a, b, c); this.tri(p, a, c, d);
  }
  box(p: Part, center: V3, size: V3, transform = (v: V3): V3 => v) {
    const points = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
      .map((v) => transform(v.map((n, i) => center[i] + n * size[i] / 2) as V3));
    for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])
      this.quad(p, points[a], points[b], points[c], points[d]);
  }
  cone(p: Part, y0: number, y1: number, r0: number, r1: number) {
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
      const q: V3[] = [[r0*Math.cos(a),y0,r0*Math.sin(a)], [r1*Math.cos(a),y1,r1*Math.sin(a)],
        [r1*Math.cos(b),y1,r1*Math.sin(b)], [r0*Math.cos(b),y0,r0*Math.sin(b)]];
      this.quad(p, ...q as [V3,V3,V3,V3]);
      this.tri(p, [0,y1,0], q[2], q[1]);
    }
  }
  pipe(p:Part,a:V3,b:V3,r:number,segments=12){
    const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta),u=delta.map(v=>v/length);
    const ref=Math.abs(u[1])<0.9?[0,1,0]:[1,0,0];
    const cross=(x:number[],y:number[])=>[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
    const raw=cross(u,ref),n=raw.map(v=>v/Math.hypot(...raw)),t=cross(u,n);
    const at=(c:V3,angle:number)=>c.map((v,i)=>v+r*(n[i]*Math.cos(angle)+t[i]*Math.sin(angle))) as V3;
    for(let i=0;i<segments;i++){const a0=at(a,i*2*Math.PI/segments),a1=at(a,(i+1)*2*Math.PI/segments),b0=at(b,i*2*Math.PI/segments),b1=at(b,(i+1)*2*Math.PI/segments);this.quad(p,a0,a1,b1,b0);this.tri(p,a,a1,a0);this.tri(p,b,b0,b1);}
  }
  export() {
    const accessors: object[] = [], bufferViews: object[] = [], chunks: Float32Array[] = [];
    let byteLength = 0;
    const add = (values: number[], bounds: boolean,components=3) => {
      const data = new Float32Array(values), count = data.length / components;
      const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
      for (let i = 0; i < data.length; i++) { min[i%3] = Math.min(min[i%3], data[i]); max[i%3] = Math.max(max[i%3], data[i]); }
      bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength });
      accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count, type: components===2?"VEC2":"VEC3", ...(bounds ? { min, max } : {}) });
      chunks.push(data); byteLength += data.byteLength;
      return accessors.length - 1;
    };
    const parts = this.parts.filter((p) => p.positions.length);
    const primitives = parts.map((p, material) => ({ attributes: { POSITION: add(p.positions, true), NORMAL: add(p.normals, false), ...(p.uv?{TEXCOORD_0:add(p.uv,false,2)}:{}) }, material }));
    const textures=[...new Set(parts.flatMap(p=>p.texture?[p.texture]:[]))];
    const gltf = { asset: { version: "2.0", generator: "Booroljuut planning models" }, scene: 0,
      scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives }],
      materials: parts.map((p) => ({ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...p.color,1], metallicFactor: p.metal, roughnessFactor: p.rough, ...(p.texture?{baseColorTexture:{index:textures.indexOf(p.texture)}}:{}) }, ...(p.emissive ? {emissiveFactor:p.emissive} : {}) })),
      ...(textures.length?{images:textures.map(uri=>({uri})),samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],textures:textures.map((_,source)=>({sampler:0,source}))}:{}),
      accessors, bufferViews, buffers: [{ byteLength }] };
    const json = new TextEncoder().encode(JSON.stringify(gltf)), jsonLength = Math.ceil(json.length / 4) * 4;
    const buffer = new ArrayBuffer(28 + jsonLength + byteLength), dv = new DataView(buffer), bytes = new Uint8Array(buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, buffer.byteLength, true);
    dv.setUint32(12, jsonLength, true); dv.setUint32(16, 0x4e4f534a, true);
    bytes.fill(32, 20, 20 + jsonLength); bytes.set(json, 20);
    dv.setUint32(20 + jsonLength, byteLength, true); dv.setUint32(24 + jsonLength, 0x004e4942, true);
    let offset = 28 + jsonLength;
    for (const chunk of chunks) { bytes.set(new Uint8Array(chunk.buffer), offset); offset += chunk.byteLength; }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:model/gltf-binary;base64,${btoa(binary)}`;
  }
}

function buildTurbine(hub: number, rotor: number, part: "complete" | "tower" | "rotor") {
  const m = new Model(), white = m.part([0.88,0.9,0.91], 0.15, 0.45), concrete = m.part([0.49,0.49,0.45]);
  const dark = m.part([0.19,0.23,0.26], 0.4), red = m.part([0.68,0.16,0.1]);
  const h = Math.max(10, hub), r = Math.max(5, rotor / 2), base = Math.max(2, r * 0.032);
  if (part !== "rotor") {
  m.cone(concrete, 0, 0.7, base * 1.7, base * 1.7);
  m.cone(white, 0.7, h, base, base * 0.53);
  m.box(white, [0,h,0.8], [5,4.4,10]);
  m.box(dark, [0,h+2.23,2], [3.4,0.08,3.6]);
  }
  // Three tapered airfoil-like blades, facing north. Full swept diameter = rotor.
  if (part !== "tower") for (let blade = 0; blade < 3; blade++) {
    const angle = blade * Math.PI * 2 / 3;
    const at = (x: number, y: number, z: number): V3 => [x*Math.cos(angle)-y*Math.sin(angle), (part === "rotor" ? 0 : h)+x*Math.sin(angle)+y*Math.cos(angle), z-5.2];
    const stations = [[1,0.65,0], [r*0.18,r*0.027,0], [r*0.55,r*0.018,-0.6], [r*0.94,0.38,-1.5], [r,0.06,-1.8]];
    for (let i = 0; i < stations.length - 1; i++) {
      const [y,w,s] = stations[i], [yn,wn,sn] = stations[i+1], p = i === stations.length-2 ? red : white;
      m.quad(p, at(s-w,y,-0.22),at(sn-wn,yn,-0.12),at(sn+wn,yn,-0.12),at(s+w,y,-0.22));
      m.quad(p, at(s+w,y,-0.22),at(sn+wn,yn,-0.12),at(sn,yn,0.45),at(s,y,0.65));
      m.quad(p, at(s,y,0.65),at(sn,yn,0.45),at(sn-wn,yn,-0.12),at(s-w,y,-0.22));
    }
  }
  if (part !== "tower") m.box(white, [0,part === "rotor" ? 0 : h,-5], [2.7,2.7,2.4]);
  return m;
}

// glTF ба хөдөлгөөнт ротор нэг геометр ашиглана; GPU буферийг зөвхөн нэг удаа үүсгэнэ.
function turbineMesh(m:Model) {
  const data: number[] = [];
  for (const p of m.parts) for (let i = 0; i < p.positions.length; i += 3) {
    data.push(...p.positions.slice(i, i + 3), ...p.normals.slice(i, i + 3), ...p.color);
  }
  return new Float32Array(data);
}

export const turbineRotorMesh=(diameter:number)=>turbineMesh(buildTurbine(0,diameter,"rotor"));
export const turbineTowerMesh=(hub:number,diameter:number)=>turbineMesh(buildTurbine(hub,diameter,"tower"));
const turbineCache=new Map<string,{href:string;height:number}>();
export function turbineModel(hub: number, rotor: number, part: "complete" | "tower" | "rotor" = "complete") {
  const key=[hub,rotor,part].join(":"),cached=turbineCache.get(key);if(cached)return cached;
  const m = buildTurbine(hub, rotor, part);
  let lo=Infinity, hi=-Infinity;
  for (const p of m.parts) for (let i=1;i<p.positions.length;i+=3) {lo=Math.min(lo,p.positions[i]);hi=Math.max(hi,p.positions[i]);}
  const result={href:m.export(),height:hi-lo};turbineCache.set(key,result);if(turbineCache.size>24)turbineCache.delete(turbineCache.keys().next().value!);return result;
}

const solarCache=new Map<string,{href:string;height:number}>();
export function solarTableModel(width: number, length: number, tilt: number, columns: number, rows: number, count=columns*rows) {
  const key=[width,length,tilt,columns,rows,count].join(':'),cached=solarCache.get(key);if(cached)return cached;
  const m = new Model(), frame = m.part([0.57,0.62,0.65], 0.65, 0.4), glass = m.part([1,1,1], .1, .32),concrete=m.part([.51,.52,.48],0,.95);
  glass.uv=[];glass.texture=solarTexture;
  const w = Math.max(0.2,width), l = Math.max(0.2,length), angle = Math.max(0, Math.min(85,tilt)) * Math.PI / 180;
  const s = Math.sin(angle), c = Math.cos(angle), clearance = 0.8;
  // Front edge is south (positive glTF Z); rear edge rises toward north.
  const at = ([x,y,z]: V3): V3 => [x, clearance + (l/2-z)*s + y*c, z*c+y*s];
  // Дээд талыг тусад нь хуваана: шилний доор давхардсан нүүр байхгүй.
  const slab = [[-w/2,-0.045,-l/2],[w/2,-0.045,-l/2],[w/2,0.045,-l/2],[-w/2,0.045,-l/2],
    [-w/2,-0.045,l/2],[w/2,-0.045,l/2],[w/2,0.045,l/2],[-w/2,0.045,l/2]].map(v => at(v as V3));
  for (const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4]])
    m.quad(frame, slab[a], slab[b], slab[c], slab[d]);
  const surface = (p: Part, x0: number, x1: number, z0: number, z1: number) => {
    m.quad(p, at([x0,0.045,z0]), at([x0,0.045,z1]), at([x1,0.045,z1]), at([x1,0.045,z0]));
    if(p.uv)p.uv.push(0,0,0,1,1,1,0,0,1,1,1,0);
  };
  const nc = Math.max(1,Math.min(100,Math.round(columns))), nr = Math.max(1,Math.min(12,Math.round(rows)));
  const rim = Math.min(0.0125, w/nc/8, l/nr/8);
  for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
    if(i*nr+j>=count)continue;
    const x0 = -w/2+i*w/nc, x1 = -w/2+(i+1)*w/nc;
    const z0 = -l/2+j*l/nr, z1 = -l/2+(j+1)*l/nr;
    // Шил ба хүрээ нэг хавтгайг давхцалгүй эзэлнэ. Пикселээс жижиг
    // давхар зураас камер хөдөлгөхөд анивчдаг тул геометрээр нэмэхгүй.
    surface(glass, x0+rim, x1-rim, z0+rim, z1-rim);
    surface(frame, x0, x0+rim, z0, z1);
    surface(frame, x1-rim, x1, z0, z1);
    surface(frame, x0+rim, x1-rim, z0, z0+rim);
    surface(frame, x0+rim, x1-rim, z1-rim, z1);
  }
  for (let x = -w/2+0.6; x < w/2; x += 5) for (const z of [-l*0.32,l*0.32]) {
    const top = at([x,-0.06,z]);
    m.box(concrete,[x,.1,top[2]],[.32,.2,.32]);
    m.box(frame, [x,top[1]/2,top[2]], [0.09,top[1],0.09]);
    if(z<0){const front=at([x,-.09,l*.32]);m.pipe(frame,[x,.32,front[2]],[x,top[1]-.12,top[2]],.028,6);}
  }
  const result={href:m.export(),height:clearance+l*s+0.045*c};solarCache.set(key,result);if(solarCache.size>24)solarCache.delete(solarCache.keys().next().value!);return result;
}

export function modelRenderer(model: { href: string; height: number }, heading = 0) {
  return { type: "simple", symbol: { type: "point-3d", symbolLayers: [{ type: "object",
    resource: { href: model.href }, height: model.height, width: null, depth: null,
    anchor: "origin", heading, castShadows: true,
  }] } };
}

