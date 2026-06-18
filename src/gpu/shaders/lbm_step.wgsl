@group(0) @binding(0) var fInA: texture_3d<f32>;
@group(0) @binding(1) var fInB: texture_3d<f32>;
@group(0) @binding(2) var fOutA: texture_storage_3d<rgba16float, write>;
@group(0) @binding(3) var fOutB: texture_storage_3d<rgba16float, write>;
@group(0) @binding(4) var sdfTex: texture_3d<f32>;
@group(0) @binding(5) var velTex: texture_storage_3d<rgba16float, write>;

struct Uniforms {
  gridSize: vec3<u32>,
  viscosity: f32,
  flowSpeed: f32,
  isEmitting: u32,
  time: f32,
  pad0: vec3<u32>,
};
@group(0) @binding(6) var<uniform> u: Uniforms;

const EI: array<vec3<i32>, 7> = array<vec3<i32>, 7>(
  vec3<i32>(0,0,0),
  vec3<i32>(1,0,0), vec3<i32>(-1,0,0),
  vec3<i32>(0,1,0), vec3<i32>(0,-1,0),
  vec3<i32>(0,0,1), vec3<i32>(0,0,-1),
);
const WI: array<f32, 7> = array<f32, 7>(
  0.25,
  0.125, 0.125,
  0.125, 0.125,
  0.125, 0.125,
);
const OPP: array<u32, 7> = array<u32, 7>(0u, 2u, 1u, 4u, 3u, 6u, 5u);

fn wrap(p: vec3<i32>, s: vec3<u32>) -> vec3<i32> {
  let sv = vec3<i32>(s);
  var r = p;
  if (r.x < 0) { r.x = sv.x - 1; }
  if (r.x >= sv.x) { r.x = 0; }
  if (r.y < 0) { r.y = sv.y - 1; }
  if (r.y >= sv.y) { r.y = 0; }
  if (r.z < 0) { r.z = sv.z - 1; }
  if (r.z >= sv.z) { r.z = 0; }
  return r;
}

fn sampleF(pos: vec3<i32>, idx: u32) -> f32 {
  let p = vec3<u32>(wrap(pos, u.gridSize));
  let tA = textureLoad(fInA, p, 0);
  let tB = textureLoad(fInB, p, 0);
  switch (idx) {
    case 0u: { return tA.r; }
    case 1u: { return tA.g; }
    case 2u: { return tA.b; }
    case 3u: { return tA.a; }
    case 4u: { return tB.r; }
    case 5u: { return tB.g; }
    default: { return tB.b; }
  }
}

fn storeF(pos: vec3<u32>, f: array<f32, 7>) {
  textureStore(fOutA, pos, vec4<f32>(f[0], f[1], f[2], f[3]));
  textureStore(fOutB, pos, vec4<f32>(f[4], f[5], f[6], 1.0));
}

fn eqDist(rho: f32, v: vec3<f32>, idx: u32) -> f32 {
  let e = vec3<f32>(EI[idx]);
  let eu = dot(e, v);
  let uu = dot(v, v);
  return WI[idx] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * uu);
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (any(gid >= u.gridSize)) { return; }

  let pos = vec3<i32>(gid);
  let sdf = textureLoad(sdfTex, gid, 0).r;
  let isInside = sdf < -0.005;
  let isBoundary = sdf >= -0.005 && sdf < 0.03;

  var f: array<f32, 7>;
  if (isInside) {
    for (var i: u32 = 0u; i < 7u; i = i + 1u) {
      f[i] = WI[i] * 0.8;
    }
  } else {
    for (var i: u32 = 0u; i < 7u; i = i + 1u) {
      let srcPos = pos - EI[i];
      let srcSdf = textureLoad(sdfTex, vec3<u32>(wrap(srcPos, u.gridSize)), 0).r;
      if (srcSdf < -0.005) {
        f[i] = sampleF(pos, OPP[i]);
      } else {
        f[i] = sampleF(srcPos, i);
      }
    }
  }

  var rho = 0.0;
  var mom = vec3<f32>(0.0);
  for (var i: u32 = 0u; i < 7u; i = i + 1u) {
    rho = rho + f[i];
    mom = mom + vec3<f32>(EI[i]) * f[i];
  }
  rho = max(rho, 0.01);
  var v = mom / rho;

  if (isInside) {
    v = vec3<f32>(0.0);
    rho = 0.8;
  }

  if (!isInside && u.isEmitting == 1u) {
    let t = u.time * 0.8;
    let swirl = vec3<f32>(
      sin(t + f32(pos.y) * 0.2),
      0.1 * sin(t * 1.3 + f32(pos.x) * 0.15),
      cos(t * 0.7 + f32(pos.y) * 0.2)
    ) * 0.05;
    let inflow = vec3<f32>(1.0, 0.0, 0.0) * u.flowSpeed;
    v = v + (inflow + swirl) * 0.12;
  }

  if (isBoundary) {
    let h = 0.01;
    let n = vec3<f32>(
      textureLoad(sdfTex, vec3<u32>(wrap(pos + vec3<i32>(1,0,0), u.gridSize)), 0).r - textureLoad(sdfTex, vec3<u32>(wrap(pos - vec3<i32>(1,0,0), u.gridSize)), 0).r,
      textureLoad(sdfTex, vec3<u32>(wrap(pos + vec3<i32>(0,1,0), u.gridSize)), 0).r - textureLoad(sdfTex, vec3<u32>(wrap(pos - vec3<i32>(0,1,0), u.gridSize)), 0).r,
      textureLoad(sdfTex, vec3<u32>(wrap(pos + vec3<i32>(0,0,1), u.gridSize)), 0).r - textureLoad(sdfTex, vec3<u32>(wrap(pos - vec3<i32>(0,0,1), u.gridSize)), 0).r
    ) / (2.0 * h + 1e-5);
    let nn = normalize(n + vec3<f32>(1e-5));
    let vn = dot(v, nn);
    v = v - nn * vn * 1.8;
    v = v * 0.3;
  }

  let vmag = length(v);
  if (vmag > 0.4) { v = v * (0.4 / vmag); }

  let nu = max(u.viscosity, 0.0001);
  let tau = 3.0 * nu * 6.0 + 0.6;
  let invTau = 1.0 / tau;

  var fout: array<f32, 7>;
  for (var i: u32 = 0u; i < 7u; i = i + 1u) {
    let feq = eqDist(rho, v, i);
    fout[i] = f[i] - (f[i] - feq) * invTau;
  }

  if (isInside) {
    for (var i: u32 = 0u; i < 7u; i = i + 1u) {
      fout[i] = WI[i] * 0.8;
    }
  } else if (isBoundary) {
    for (var i: u32 = 0u; i < 7u; i = i + 1u) {
      fout[i] = f[OPP[i]] * 0.85 + WI[i] * 0.8 * 0.15;
    }
  }

  storeF(gid, fout);
  textureStore(velTex, gid, vec4<f32>(v, rho));
}
