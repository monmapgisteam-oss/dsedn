// Adapted from the user-provided Booroljuut project; shared GPU meshes.
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode.js";
import type SceneView from "@arcgis/core/views/SceneView";
import { turbineRotorMesh, turbineTowerMesh } from "@/lib/renewable-models";
import { advanceRotor, rotorMatrices, type RotorMotion } from "@/lib/turbine-motion";

export type RenderRotor = { origin: Float64Array; groundOrigin?: Float64Array; motion: RotorMotion };
type Light = { direction: number[]; ambient: { color: number[]; intensity: number }; diffuse: { color: number[]; intensity: number } };

// ArcGIS RenderNode: https://developers.arcgis.com/javascript/latest/sample-code/custom-render-node-windmills/
// Геометрийг кадр бүр сольдоггүй. Зөвхөн хувиргалтын матриц, гэрлийг GPU-д дамжуулна.
export const ROTOR_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormal;
out vec3 vNormal;
out vec3 vColor;
void main() {
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
  vNormal = uNormal * aNormal;
  vColor = aColor;
}`;
export const ROTOR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
uniform vec3 uSun;
uniform vec3 uAmbient;
uniform vec3 uDiffuse;
layout(location=0) out vec4 color;
layout(location=1) out vec4 emission;
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  color = vec4(vColor * (uAmbient + uDiffuse * max(0.0, dot(n, uSun))), 1.0);
  emission = vec4(0.0);
}`;

// Тусдаа pass: GPU нөөцийн lifecycle, давтан upload хийхгүйг scene-гүйгээр шалгаж болно.
export class RotorGpuPass {
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private count = 0;
  private modelView = new Float32Array(16);
  private normal = new Float32Array(9);
  private projection = new Float32Array(16);
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, vertices: Float32Array) {
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      this.buffer = gl.createBuffer();
      this.vao = gl.createVertexArray();
      if (!this.program || !this.buffer || !this.vao) throw new Error("Rotor GPU allocation failed");
      for (const [type, source] of [[gl.VERTEX_SHADER, ROTOR_VERTEX_SHADER], [gl.FRAGMENT_SHADER, ROTOR_FRAGMENT_SHADER]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Rotor shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Rotor shader compilation failed");
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || "Rotor shader link failed");
      for (const name of ["ModelView", "Projection", "Normal", "Sun", "Ambient", "Diffuse"]) this.uniforms[name] = gl.getUniformLocation(this.program, `u${name}`);
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
      this.count = vertices.length / 9;
    } catch (error) {
      this.destroy(); throw error;
    } finally {
      for (const shader of shaders) {
        if (this.program) gl.detachShader(this.program, shader);
        gl.deleteShader(shader);
      }
      gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  draw(rotors: RenderRotor[], heading: number, now: number, camera: { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; viewport: readonly number[] }, light: Light, stationary=false) {
    const gl = this.gl;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.viewport(camera.viewport[0], camera.viewport[1], camera.viewport[2], camera.viewport[3]);
    this.projection.set(camera.projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.Projection, false, this.projection);
    gl.uniform3fv(this.uniforms.Sun, light.direction);
    gl.uniform3fv(this.uniforms.Ambient, light.ambient.color.map(c => c * light.ambient.intensity));
    gl.uniform3fv(this.uniforms.Diffuse, light.diffuse.color.map(c => c * light.diffuse.intensity));
    for (const rotor of rotors) {
      if(!stationary)advanceRotor(rotor.motion, now);
      rotorMatrices(stationary?rotor.groundOrigin??rotor.origin:rotor.origin, camera.viewMatrix, heading, stationary?0:rotor.motion.phase, this.modelView, this.normal);
      gl.uniformMatrix4fv(this.uniforms.ModelView, false, this.modelView);
      gl.uniformMatrix3fv(this.uniforms.Normal, false, this.normal);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
    gl.bindVertexArray(null); gl.useProgram(null);
  }

  destroy() {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.vao = this.buffer = this.program = null;
  }
}

export function createTurbineRenderer(view: SceneView, diameter: number, options: {
  frame: () => { rotors: RenderRotor[]; heading: number };
  failed: () => void;
  hub?: number;
}) {
  let pass: RotorGpuPass | undefined, towerPass: RotorGpuPass | undefined, context: WebGL2RenderingContext | undefined, failed = false;
  let removeContextListener = () => {};
  let disposed = false;
  const vertices = turbineRotorMesh(diameter),towerVertices=options.hub? turbineTowerMesh(options.hub,diameter):undefined;
  // @ts-expect-error createSubclass exists at runtime in 4.32 but is omitted from its declarations.
  const Node = RenderNode.createSubclass({
    render(this: RenderNode) {
      this.resetWebGLState();
      const output = this.bindRenderTarget();
      try {
        const { rotors, heading } = options.frame();
        if (disposed || failed || !rotors.length || this.gl.isContextLost()) return output;
        if (!pass || context !== this.gl) {
          pass?.destroy();towerPass?.destroy(); context = this.gl; pass = new RotorGpuPass(context, vertices);towerPass=towerVertices?new RotorGpuPass(context,towerVertices):undefined;
          removeContextListener();
          const canvas=context.canvas;
          const restored=()=>{pass?.destroy();towerPass?.destroy();pass=undefined;towerPass=undefined;if(!disposed)this.requestRender();};
          canvas.addEventListener("webglcontextrestored",restored);
          removeContextListener=()=>canvas.removeEventListener("webglcontextrestored",restored);
        }
        const now=performance.now();towerPass?.draw(rotors,heading,now,this.camera,this.sunLight,true);
        pass.draw(rotors, heading, now, this.camera, this.sunLight);
        if (rotors.some(r => r.motion.target > 0 || r.motion.rpm > 0.001)) this.requestRender();
      } catch (error) {
        failed = true;pass?.destroy();towerPass?.destroy();pass=undefined;towerPass=undefined;options.failed();
        console.error("Wind rotor rendering failed", error);
      } finally {
        // SDK-ийн framebuffer/depth/emissive хавсралтуудыг хадгалж буцаана.
        this.resetWebGLState();
      }
      return output;
    },
  });
  const node = new Node({ view, consumes: { required: ["opaque-color"] }, produces: "opaque-color" }) as RenderNode;
  return {
    requestRender: () => node.requestRender(),
    destroy: () => { disposed=true;removeContextListener();node.destroy();pass?.destroy();towerPass?.destroy();pass=undefined;towerPass=undefined; },
  };
}
