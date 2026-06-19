import { GRID_SIZE, PARTICLE_COUNT, OBSTACLE_RADIUS, OBSTACLE_TYPE_MAP, ObstacleType } from '../utils/constants';
import type { FluidBackend, SimStepResult } from './types';

const GRID_W = GRID_SIZE;
const GRID_H = GRID_SIZE * GRID_SIZE;

const VERT_FULLSCREEN = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const SDF_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
layout(location = 0) out vec4 outColor;
uniform ivec3 u_gridSize;
uniform uint u_obstacleType;
uniform float u_obstacleRadius;
uniform mat3 u_rotation;
uniform vec3 u_obstacleCenter;

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, float r, float R) {
  vec2 q = vec2(length(p.xy) - R, p.z);
  return length(q) - r;
}
float sdTorusKnot(vec3 p, float r) {
  vec3 p2 = p * 0.9;
  vec2 q = vec2(length(p2.xy) - 0.5, p2.z);
  float a = atan(p2.y, p2.x);
  float twist = sin(a * 2.0) * 0.12;
  vec2 q2 = q + vec2(0.0, twist);
  return length(q2) - r * 0.65;
}

ivec3 idxTo3D(int idx) {
  int z = idx / int(u_gridSize.x * u_gridSize.y);
  int rem = idx - z * int(u_gridSize.x * u_gridSize.y);
  int y = rem / int(u_gridSize.x);
  int x = rem - y * int(u_gridSize.x);
  return ivec3(x, y, z);
}

void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  int idx = pix.x + pix.y * u_gridSize.x;
  ivec3 gid = idxTo3D(idx);
  if (any(greaterThanEqual(gid, u_gridSize))) { discard; return; }
  vec3 npos = (vec3(gid) + 0.5) / vec3(u_gridSize);
  vec3 p = (npos - 0.5) * 2.0;
  vec3 pc = p - u_obstacleCenter;
  vec3 pr = u_rotation * pc;
  float dist;
  if (u_obstacleType == 0u) dist = sdSphere(pr, u_obstacleRadius);
  else if (u_obstacleType == 1u) dist = sdTorus(pr, u_obstacleRadius * 0.35, u_obstacleRadius);
  else dist = sdTorusKnot(pr, u_obstacleRadius);
  outColor = vec4(dist, 0.0, 0.0, 1.0);
}`;

const LBM_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;
in vec2 v_uv;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

uniform sampler2D u_fInA;
uniform sampler2D u_fInB;
uniform sampler2D u_sdf;
uniform ivec3 u_gridSize;
uniform float u_viscosity;
uniform float u_flowSpeed;
uniform uint u_isEmitting;
uniform float u_time;

const vec3 EI[7] = vec3[7](
  vec3(0,0,0), vec3(1,0,0), vec3(-1,0,0),
  vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1)
);
const float WI[7] = float[7](0.25, 0.125,0.125, 0.125,0.125, 0.125,0.125);
const uint OPP[7] = uint[7](0u, 2u,1u, 4u,3u, 6u,5u);

int idx2D(ivec3 p) {
  ivec3 s = u_gridSize;
  p.x = (p.x + s.x) % s.x;
  p.y = (p.y + s.y) % s.y;
  p.z = (p.z + s.z) % s.z;
  return p.x + p.y * s.x + p.z * s.x * s.y;
}

vec4 texAt(sampler2D tex, ivec3 p) {
  int idx = idx2D(p);
  ivec2 uv = ivec2(idx % u_gridSize.x, idx / u_gridSize.x);
  return texelFetch(tex, uv, 0);
}

float sampleF(ivec3 p, uint idx) {
  vec4 a = texAt(u_fInA, p);
  vec4 b = texAt(u_fInB, p);
  if (idx == 0u) return a.r;
  if (idx == 1u) return a.g;
  if (idx == 2u) return a.b;
  if (idx == 3u) return a.a;
  if (idx == 4u) return b.r;
  if (idx == 5u) return b.g;
  return b.b;
}

float eqDist(float rho, vec3 v, uint i) {
  vec3 e = EI[i];
  float eu = dot(e, v);
  float uu = dot(v, v);
  return WI[i] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * uu);
}

ivec3 idxTo3D(int idx) {
  int z = idx / int(u_gridSize.x * u_gridSize.y);
  int rem = idx - z * int(u_gridSize.x * u_gridSize.y);
  int y = rem / int(u_gridSize.x);
  int x = rem - y * int(u_gridSize.x);
  return ivec3(x, y, z);
}

void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  int idx = pix.x + pix.y * u_gridSize.x;
  ivec3 gid = idxTo3D(idx);
  if (any(greaterThanEqual(gid, u_gridSize))) { discard; return; }

  float sdf = texAt(u_sdf, gid).r;
  bool isInside = sdf < -0.005;
  bool isBoundary = sdf >= -0.005 && sdf < 0.03;

  float f[7];
  if (isInside) {
    for (uint i = 0u; i < 7u; i++) f[i] = WI[i] * 0.8;
  } else {
    for (uint i = 0u; i < 7u; i++) {
      ivec3 srcPos = gid - ivec3(EI[i]);
      float srcSdf = texAt(u_sdf, srcPos).r;
      if (srcSdf < -0.005) f[i] = sampleF(gid, OPP[i]);
      else f[i] = sampleF(srcPos, i);
    }
  }

  float rho = 0.0;
  vec3 mom = vec3(0.0);
  for (uint i = 0u; i < 7u; i++) {
    rho += f[i];
    mom += EI[i] * f[i];
  }
  rho = max(rho, 0.01);
  vec3 v = mom / rho;

  if (isInside) { v = vec3(0.0); rho = 0.8; }

  if (!isInside && u_isEmitting == 1u) {
    float t = u_time * 0.8;
    vec3 swirl = vec3(
      sin(t + float(gid.y) * 0.2),
      0.1 * sin(t * 1.3 + float(gid.x) * 0.15),
      cos(t * 0.7 + float(gid.y) * 0.2)
    ) * 0.05;
    vec3 inflow = vec3(1.0, 0.0, 0.0) * u_flowSpeed;
    v += (inflow + swirl) * 0.12;
  }

  if (isBoundary) {
    ivec3 px = gid + ivec3(1,0,0), mx = gid - ivec3(1,0,0);
    ivec3 py = gid + ivec3(0,1,0), my = gid - ivec3(0,1,0);
    ivec3 pz = gid + ivec3(0,0,1), mz = gid - ivec3(0,0,1);
    vec3 n = normalize(vec3(
      texAt(u_sdf, px).r - texAt(u_sdf, mx).r,
      texAt(u_sdf, py).r - texAt(u_sdf, my).r,
      texAt(u_sdf, pz).r - texAt(u_sdf, mz).r
    ) / 0.02 + 1e-5);
    float vn = dot(v, n);
    v = v - n * vn * 1.8;
    v *= 0.3;
  }

  float vmag = length(v);
  if (vmag > 0.4) v *= 0.4 / vmag;

  float nu = max(u_viscosity, 0.0001);
  float tau = 3.0 * nu * 6.0 + 0.6;
  float invTau = 1.0 / tau;

  float fout[7];
  for (uint i = 0u; i < 7u; i++) {
    float feq = eqDist(rho, v, i);
    fout[i] = f[i] - (f[i] - feq) * invTau;
  }

  if (isInside) {
    for (uint i = 0u; i < 7u; i++) fout[i] = WI[i] * 0.8;
  } else if (isBoundary) {
    for (uint i = 0u; i < 7u; i++) fout[i] = f[OPP[i]] * 0.85 + WI[i] * 0.8 * 0.15;
  }

  outA = vec4(fout[0], fout[1], fout[2], fout[3]);
  outB = vec4(fout[4], fout[5], fout[6], 1.0);
}`;

const LBM_VEL_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
layout(location = 0) out vec4 outVel;
uniform sampler2D u_fA;
uniform sampler2D u_fB;
uniform ivec3 u_gridSize;

const vec3 EI[7] = vec3[7](
  vec3(0,0,0), vec3(1,0,0), vec3(-1,0,0),
  vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1)
);

ivec3 idxTo3D(int idx) {
  int z = idx / int(u_gridSize.x * u_gridSize.y);
  int rem = idx - z * int(u_gridSize.x * u_gridSize.y);
  int y = rem / int(u_gridSize.x);
  int x = rem - y * int(u_gridSize.x);
  return ivec3(x, y, z);
}

void main() {
  ivec2 pix = ivec2(gl_FragCoord.xy);
  int idx = pix.x + pix.y * u_gridSize.x;
  ivec3 gid = idxTo3D(idx);
  if (any(greaterThanEqual(gid, u_gridSize))) { discard; return; }
  vec4 a = texelFetch(u_fA, pix, 0);
  vec4 b = texelFetch(u_fB, pix, 0);
  float fv[7] = float[7](a.r,a.g,a.b,a.a, b.r,b.g,b.b);
  float rho = 0.0;
  vec3 mom = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    rho += fv[i];
    mom += EI[i] * fv[i];
  }
  rho = max(rho, 0.01);
  outVel = vec4(mom / rho, rho);
}`;

const PARTICLE_VS = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec4 a_pos;
layout(location = 1) in vec4 a_vel;

out vec4 v_pos;
out vec4 v_vel;

uniform sampler2D u_velField;
uniform sampler2D u_sdf;
uniform ivec3 u_gridSize;
uniform float u_deltaTime;
uniform uint u_isEmitting;
uniform float u_emitRate;
uniform float u_time;
uniform uint u_particleCount;

float hash11(float p) {
  float x = fract(p * 0.1031);
  x = x * (x + 33.33);
  x = x * (x + x);
  return fract(x);
}
vec3 hash31(float p) {
  return vec3(hash11(p+1.7), hash11(p+5.3), hash11(p+9.1));
}

int gridIdx(ivec3 p) {
  ivec3 s = u_gridSize;
  p.x = (p.x + s.x) % s.x; p.y = (p.y + s.y) % s.y; p.z = (p.z + s.z) % s.z;
  return p.x + p.y * s.x + p.z * s.x * s.y;
}

ivec2 to2D(int idx) {
  return ivec2(idx % u_gridSize.x, idx / u_gridSize.x);
}

vec4 sample3D(sampler2D tex, vec3 p) {
  vec3 gs = vec3(u_gridSize);
  vec3 uvw = clamp(p * 0.5 + 0.5, 0.0, 0.9999);
  vec3 coord = uvw * (gs - 1.0);
  ivec3 i0 = ivec3(floor(coord));
  ivec3 i1 = min(i0 + 1, u_gridSize - 1);
  vec3 f = coord - vec3(i0);
  ivec2 p000 = to2D(gridIdx(ivec3(i0.x,i0.y,i0.z)));
  ivec2 p100 = to2D(gridIdx(ivec3(i1.x,i0.y,i0.z)));
  ivec2 p010 = to2D(gridIdx(ivec3(i0.x,i1.y,i0.z)));
  ivec2 p110 = to2D(gridIdx(ivec3(i1.x,i1.y,i0.z)));
  ivec2 p001 = to2D(gridIdx(ivec3(i0.x,i0.y,i1.z)));
  ivec2 p101 = to2D(gridIdx(ivec3(i1.x,i0.y,i1.z)));
  ivec2 p011 = to2D(gridIdx(ivec3(i0.x,i1.y,i1.z)));
  ivec2 p111 = to2D(gridIdx(ivec3(i1.x,i1.y,i1.z)));
  vec4 v000 = texelFetch(tex, p000, 0);
  vec4 v100 = texelFetch(tex, p100, 0);
  vec4 v010 = texelFetch(tex, p010, 0);
  vec4 v110 = texelFetch(tex, p110, 0);
  vec4 v001 = texelFetch(tex, p001, 0);
  vec4 v101 = texelFetch(tex, p101, 0);
  vec4 v011 = texelFetch(tex, p011, 0);
  vec4 v111 = texelFetch(tex, p111, 0);
  vec4 x00 = mix(v000, v100, f.x);
  vec4 x10 = mix(v010, v110, f.x);
  vec4 x01 = mix(v001, v101, f.x);
  vec4 x11 = mix(v011, v111, f.x);
  vec4 y0 = mix(x00, x10, f.y);
  vec4 y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

float sampleSDFVal(vec3 p) { return sample3D(u_sdf, p).r; }
vec3 sampleSDFGrad(vec3 p) {
  float h = 0.015;
  return normalize(vec3(
    sampleSDFVal(p + vec3(h,0,0)) - sampleSDFVal(p - vec3(h,0,0)),
    sampleSDFVal(p + vec3(0,h,0)) - sampleSDFVal(p - vec3(0,h,0)),
    sampleSDFVal(p + vec3(0,0,h)) - sampleSDFVal(p - vec3(0,0,h))
  ) / (2.0 * h) + 1e-5);
}

void main() {
  uint id = uint(gl_VertexID);
  vec4 pos = a_pos;
  vec4 vel = a_vel;

  if (pos.w <= 0.0 || pos.w > 6.0) {
    if (u_isEmitting == 1u) {
      float prob = u_emitRate / float(u_particleCount) * 60.0 * u_deltaTime;
      if (hash11(float(id) * 3.33 + u_time * 99.0) < prob) {
        vec3 rnd = hash31(float(id) + u_time * 13.0 + vel.w);
        vec3 rnd2 = hash31(float(id) * 7.77 + u_time * 3.1 + vel.w * 2.0);
        uint face = uint(floor(rnd.x * 5.99));
        vec3 ep;
        if (face == 0u) ep = vec3(-0.95, rnd.y * 1.8 - 0.9, rnd.z * 1.8 - 0.9);
        else if (face == 1u) ep = vec3(0.95, rnd.y * 1.8 - 0.9, rnd.z * 1.8 - 0.9);
        else if (face == 2u) ep = vec3(rnd.x * 1.8 - 0.9, -0.95, rnd.z * 1.8 - 0.9);
        else if (face == 3u) ep = vec3(rnd.x * 1.8 - 0.9, 0.95, rnd.z * 1.8 - 0.9);
        else if (face == 4u) ep = vec3(rnd.x * 1.8 - 0.9, rnd.y * 1.8 - 0.9, -0.95);
        else ep = vec3(rnd.x * 1.8 - 0.9, rnd.y * 1.8 - 0.9, 0.95);
        pos = vec4(ep, 1.0);
        vel = vec4(0.0, 0.0, 0.0, fract(vel.w + 0.137));
      } else {
        pos.w = 0.0;
      }
    } else {
      pos.w = 0.0;
    }
    v_pos = pos; v_vel = vel;
    return;
  }

  float sdf = sampleSDFVal(pos.xyz);
  if (sdf < -0.02) { pos.w = 0.0; v_pos = pos; v_vel = vel; return; }

  vec3 fVel = sample3D(u_velField, pos.xyz).rgb;
  vel.xyz = vel.xyz + fVel * u_deltaTime * 4.0;
  vel.xyz *= 0.96;

  if (sdf < 0.04) {
    vec3 grad = sampleSDFGrad(pos.xyz);
    float pushDist = max(0.04 - sdf, 0.0);
    float pushStr = sdf > 0.0 ? 3.0 : 6.0;
    pos.xyz += grad * pushDist * pushStr;
    float vn = dot(vel.xyz, grad);
    if (vn < 0.0) vel.xyz -= grad * vn * 2.0;
    vel.xyz -= grad * max(0.0, -sdf) * 12.0;
    vel.xyz *= 0.55;
  }

  pos.xyz += vel.xyz * u_deltaTime;
  pos.w += u_deltaTime;

  float sdfAfter = sampleSDFVal(pos.xyz);
  if (sdfAfter < -0.01) { pos.w = 0.0; v_pos = pos; v_vel = vel; return; }

  if (pos.w > 5.5 || any(greaterThan(abs(pos.xyz), vec3(0.98)))) {
    pos.w = 0.0;
  }
  float vm = length(vel.xyz);
  if (vm > 1.2) vel.xyz *= 1.2 / vm;

  v_pos = pos;
  v_vel = vel;
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error('Shader compile error:', log);
    throw new Error(log || 'shader compile error');
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string, tfVaryings?: string[]) {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  if (tfVaryings) gl.transformFeedbackVaryings(p, tfVaryings, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'link error');
  }
  return p;
}

export class WebGL2Backend implements FluidBackend {
  mode = 'webgl2' as const;
  private gl!: WebGL2RenderingContext;
  private canvas!: HTMLCanvasElement;

  private sdfTex!: WebGLTexture;
  private fTex: WebGLTexture[] = [];
  private fbo: WebGLFramebuffer[] = [];
  private velTex!: WebGLTexture;
  private velFbo!: WebGLFramebuffer;
  private pingpong = 0;

  private progSDF!: WebGLProgram;
  private progLBM!: WebGLProgram;
  private progVel!: WebGLProgram;
  private progParticles!: WebGLProgram;

  private quadBuf!: WebGLBuffer;
  private quadVao!: WebGLVertexArrayObject;

  private posBuf: WebGLBuffer[] = [];
  private velBuf: WebGLBuffer[] = [];
  private vaos: WebGLVertexArrayObject[] = [];
  private particleTF!: WebGLTransformFeedback;
  private particlePingpong = 0;

  private posReadbackBuf!: WebGLBuffer;
  private posData!: Float32Array;
  private singleFBO!: WebGLFramebuffer;

  time = 0;
  rotationAngle = 0;
  frame = 0;
  obstacleCenter: [number, number, number] = [0, 0, 0];
  private currentObstacle: ObstacleType = 'torus';
  private inited = false;

  async init(): Promise<boolean> {
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = GRID_W;
      this.canvas.height = GRID_H;
      const gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) return false;
      this.gl = gl;

      if (!gl.getExtension('EXT_color_buffer_float')) return false;

      this.createTextures();
      this.createPrograms();
      this.createQuad();
      this.createParticleBuffers();

      this.singleFBO = gl.createFramebuffer()!;
      this.regenerateSDF(this.currentObstacle, 0);

      this.posData = new Float32Array(PARTICLE_COUNT * 4);
      return true;
    } catch (e) {
      console.error('WebGL2 init failed:', e);
      return false;
    }
  }

  private createTextures() {
    const gl = this.gl;
    const makeTex = (internal: number, w = GRID_W, h = GRID_H) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    };

    this.sdfTex = makeTex(gl.R32F);
    this.velTex = makeTex(gl.RGBA16F);

    for (let i = 0; i < 2; i++) {
      const texA = makeTex(gl.RGBA16F);
      const texB = makeTex(gl.RGBA16F);
      this.fTex.push(texA, texB);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      this.fbo.push(fbo);
    }

    this.velFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createPrograms() {
    const gl = this.gl;
    this.progSDF = linkProgram(gl, VERT_FULLSCREEN, SDF_FRAG);
    this.progLBM = linkProgram(gl, VERT_FULLSCREEN, LBM_FRAG);
    this.progVel = linkProgram(gl, VERT_FULLSCREEN, LBM_VEL_FRAG);
    this.progParticles = linkProgram(gl, PARTICLE_VS, PARTICLE_FS, ['v_pos', 'v_vel']);
  }

  private createQuad() {
    const gl = this.gl;
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    const posLoc = gl.getAttribLocation(this.progSDF, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private createParticleBuffers() {
    const gl = this.gl;
    const posData = new Float32Array(PARTICLE_COUNT * 4);
    const velData = new Float32Array(PARTICLE_COUNT * 4);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      posData[i * 4] = 100;
      posData[i * 4 + 1] = 100;
      posData[i * 4 + 2] = 100;
      posData[i * 4 + 3] = 0;
      velData[i * 4 + 3] = Math.random();
    }

    for (let k = 0; k < 2; k++) {
      const pb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.bufferData(gl.ARRAY_BUFFER, posData, gl.DYNAMIC_COPY);
      this.posBuf.push(pb);

      const vb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, velData, gl.DYNAMIC_COPY);
      this.velBuf.push(vb);

      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      const l0 = gl.getAttribLocation(this.progParticles, 'a_pos');
      gl.enableVertexAttribArray(l0);
      gl.vertexAttribPointer(l0, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      const l1 = gl.getAttribLocation(this.progParticles, 'a_vel');
      gl.enableVertexAttribArray(l1);
      gl.vertexAttribPointer(l1, 4, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.vaos.push(vao);
    }

    this.particleTF = gl.createTransformFeedback()!;
    this.posReadbackBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this.posReadbackBuf);
    gl.bufferData(gl.COPY_WRITE_BUFFER, posData.byteLength, gl.DYNAMIC_READ);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
  }

  regenerateSDF(type: ObstacleType, angle: number, center?: [number, number, number]) {
    const gl = this.gl;
    if (center) this.obstacleCenter = center;
    this.currentObstacle = type;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.singleFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sdfTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, GRID_W, GRID_H);
    gl.useProgram(this.progSDF);
    gl.uniform3i(gl.getUniformLocation(this.progSDF, 'u_gridSize'), GRID_SIZE, GRID_SIZE, GRID_SIZE);
    gl.uniform1ui(gl.getUniformLocation(this.progSDF, 'u_obstacleType'), OBSTACLE_TYPE_MAP[type]);
    gl.uniform1f(gl.getUniformLocation(this.progSDF, 'u_obstacleRadius'), OBSTACLE_RADIUS);
    const c = Math.cos(angle), s = Math.sin(angle);
    const rot = new Float32Array([c, 0, s, 0, 1, 0, -s, 0, c]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.progSDF, 'u_rotation'), false, rot);
    const centerLoc = gl.getUniformLocation(this.progSDF, 'u_obstacleCenter');
    if (centerLoc !== null) {
      gl.uniform3f(centerLoc, this.obstacleCenter[0], this.obstacleCenter[1], this.obstacleCenter[2]);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setObstacleCenter(center: [number, number, number]) {
    this.obstacleCenter = [...center] as [number, number, number];
  }

  private initLBMTex() {
    const gl = this.gl;
    const total = GRID_SIZE * GRID_SIZE * GRID_SIZE;
    const initA = new Float32Array(total * 4);
    const initB = new Float32Array(total * 4);
    for (let i = 0; i < total; i++) {
      initA[i * 4] = 0.25;
      initA[i * 4 + 1] = 0.125;
      initA[i * 4 + 2] = 0.125;
      initA[i * 4 + 3] = 0.125;
      initB[i * 4] = 0.125;
      initB[i * 4 + 1] = 0.125;
      initB[i * 4 + 2] = 0.125;
      initB[i * 4 + 3] = 1;
    }
    for (let t = 0; t < 2; t++) {
      gl.bindTexture(gl.TEXTURE_2D, this.fTex[t * 2]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID_W, GRID_H, gl.RGBA, gl.FLOAT, initA);
      gl.bindTexture(gl.TEXTURE_2D, this.fTex[t * 2 + 1]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID_W, GRID_H, gl.RGBA, gl.FLOAT, initB);
    }
    this.inited = true;
  }

  async step(params: {
    dt: number;
    viscosity: number;
    flowSpeed: number;
    isEmitting: boolean;
    emitRate: number;
    obstacleType: ObstacleType;
    obstacleRotationSpeed: number;
    smokeEnabled: boolean;
    smokeAmount: number;
    smokeDiffusion: number;
    smokeSource: [number, number, number];
    smokeSourceRadius: number;
  }): Promise<SimStepResult> {
    const gl = this.gl;
    this.time += params.dt;
    this.frame++;
    this.rotationAngle += (params.obstacleRotationSpeed * Math.PI / 180) * params.dt;

    if (this.frame % 90 === 1 || params.obstacleType !== this.currentObstacle) {
      this.regenerateSDF(params.obstacleType, this.rotationAngle);
    }

    if (!this.inited) this.initLBMTex();

    const readIdx = this.pingpong;
    const writeIdx = 1 - this.pingpong;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[writeIdx]);
    gl.viewport(0, 0, GRID_W, GRID_H);
    gl.useProgram(this.progLBM);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fTex[readIdx * 2]);
    gl.uniform1i(gl.getUniformLocation(this.progLBM, 'u_fInA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fTex[readIdx * 2 + 1]);
    gl.uniform1i(gl.getUniformLocation(this.progLBM, 'u_fInB'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTex);
    gl.uniform1i(gl.getUniformLocation(this.progLBM, 'u_sdf'), 2);

    gl.uniform3i(gl.getUniformLocation(this.progLBM, 'u_gridSize'), GRID_SIZE, GRID_SIZE, GRID_SIZE);
    gl.uniform1f(gl.getUniformLocation(this.progLBM, 'u_viscosity'), params.viscosity);
    gl.uniform1f(gl.getUniformLocation(this.progLBM, 'u_flowSpeed'), params.flowSpeed);
    gl.uniform1ui(gl.getUniformLocation(this.progLBM, 'u_isEmitting'), params.isEmitting ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.progLBM, 'u_time'), this.time);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.pingpong = writeIdx;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velFbo);
    gl.viewport(0, 0, GRID_W, GRID_H);
    gl.useProgram(this.progVel);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fTex[writeIdx * 2]);
    gl.uniform1i(gl.getUniformLocation(this.progVel, 'u_fA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fTex[writeIdx * 2 + 1]);
    gl.uniform1i(gl.getUniformLocation(this.progVel, 'u_fB'), 1);
    gl.uniform3i(gl.getUniformLocation(this.progVel, 'u_gridSize'), GRID_SIZE, GRID_SIZE, GRID_SIZE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const readBuf = this.particlePingpong;
    const writeBuf = 1 - this.particlePingpong;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 1, 1);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.useProgram(this.progParticles);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velTex);
    gl.uniform1i(gl.getUniformLocation(this.progParticles, 'u_velField'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTex);
    gl.uniform1i(gl.getUniformLocation(this.progParticles, 'u_sdf'), 1);

    gl.uniform3i(gl.getUniformLocation(this.progParticles, 'u_gridSize'), GRID_SIZE, GRID_SIZE, GRID_SIZE);
    gl.uniform1f(gl.getUniformLocation(this.progParticles, 'u_deltaTime'), Math.min(params.dt, 0.016));
    gl.uniform1ui(gl.getUniformLocation(this.progParticles, 'u_isEmitting'), params.isEmitting ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.progParticles, 'u_emitRate'), params.emitRate);
    gl.uniform1f(gl.getUniformLocation(this.progParticles, 'u_time'), this.time);
    gl.uniform1ui(gl.getUniformLocation(this.progParticles, 'u_particleCount'), PARTICLE_COUNT);

    gl.bindVertexArray(this.vaos[readBuf]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.particleTF);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.posBuf[writeBuf]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.velBuf[writeBuf]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.bindBuffer(gl.COPY_READ_BUFFER, this.posBuf[writeBuf]);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, this.posReadbackBuf);
    gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, this.posData.byteLength);
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);
    gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);

    gl.bindBuffer(gl.COPY_READ_BUFFER, this.posReadbackBuf);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, this.posData);
    gl.bindBuffer(gl.COPY_READ_BUFFER, null);

    this.particlePingpong = writeBuf;

    let activeCount = 0;
    for (let i = 0; i < this.posData.length; i += 4) {
      if (this.posData[i + 3] > 0 && this.posData[i] < 50) activeCount++;
    }
    return { positionData: this.posData, activeCount, smokeData: null, smokeCount: 0 };
  }
}
