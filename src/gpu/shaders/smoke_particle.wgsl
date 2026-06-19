@group(0) @binding(0) var<storage, read_write> posBuf: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> velBuf: array<vec4<f32>>;
@group(0) @binding(2) var velField: texture_3d<f32>;
@group(0) @binding(3) var sdfTex: texture_3d<f32>;

struct Uniforms {
  gridSize: vec3<u32>,
  deltaTime: f32,
  time: f32,
  particleCount: u32,
  smokeAmount: f32,
  smokeDiffusion: f32,
  smokeSourceX: f32,
  smokeSourceY: f32,
  smokeSourceZ: f32,
  smokeSourceRadius: f32,
};
@group(0) @binding(4) var<uniform> u: Uniforms;

fn hash11(p: f32) -> f32 {
  var x = fract(p * 0.1031);
  x = x * (x + 33.33);
  x = x * (x + x);
  return fract(x);
}

fn hash31(p: f32) -> vec3<f32> {
  return vec3<f32>(
    hash11(p + 1.7),
    hash11(p + 5.3),
    hash11(p + 9.1)
  );
}

fn sampleVel(p: vec3<f32>) -> vec3<f32> {
  let gs = vec3<f32>(u.gridSize);
  let uvw = clamp(p * 0.5 + 0.5, vec3<f32>(0.0), vec3<f32>(1.0 - 1.0 / gs));
  let coord = uvw * (gs - vec3<f32>(1.0));
  let i0 = vec3<u32>(floor(coord));
  let i1 = min(i0 + vec3<u32>(1u), u.gridSize - vec3<u32>(1u));
  let f = coord - vec3<f32>(i0);

  let v000 = textureLoad(velField, i0, 0).rgb;
  let v100 = textureLoad(velField, vec3<u32>(i1.x, i0.y, i0.z), 0).rgb;
  let v010 = textureLoad(velField, vec3<u32>(i0.x, i1.y, i0.z), 0).rgb;
  let v110 = textureLoad(velField, vec3<u32>(i1.x, i1.y, i0.z), 0).rgb;
  let v001 = textureLoad(velField, vec3<u32>(i0.x, i0.y, i1.z), 0).rgb;
  let v101 = textureLoad(velField, vec3<u32>(i1.x, i0.y, i1.z), 0).rgb;
  let v011 = textureLoad(velField, vec3<u32>(i0.x, i1.y, i1.z), 0).rgb;
  let v111 = textureLoad(velField, i1, 0).rgb;

  let x00 = mix(v000, v100, f.x);
  let x10 = mix(v010, v110, f.x);
  let x01 = mix(v001, v101, f.x);
  let x11 = mix(v011, v111, f.x);
  let y0 = mix(x00, x10, f.y);
  let y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

fn sampleSDF(p: vec3<f32>) -> f32 {
  let gs = vec3<f32>(u.gridSize);
  let uvw = clamp(p * 0.5 + 0.5, vec3<f32>(0.0), vec3<f32>(1.0 - 1.0 / gs));
  let coord = uvw * (gs - vec3<f32>(1.0));
  let i0 = vec3<u32>(floor(coord));
  let i1 = min(i0 + vec3<u32>(1u), u.gridSize - vec3<u32>(1u));
  let f = coord - vec3<f32>(i0);

  let v000 = textureLoad(sdfTex, i0, 0).r;
  let v100 = textureLoad(sdfTex, vec3<u32>(i1.x, i0.y, i0.z), 0).r;
  let v010 = textureLoad(sdfTex, vec3<u32>(i0.x, i1.y, i0.z), 0).r;
  let v110 = textureLoad(sdfTex, vec3<u32>(i1.x, i1.y, i0.z), 0).r;
  let v001 = textureLoad(sdfTex, vec3<u32>(i0.x, i0.y, i1.z), 0).r;
  let v101 = textureLoad(sdfTex, vec3<u32>(i1.x, i0.y, i1.z), 0).r;
  let v011 = textureLoad(sdfTex, vec3<u32>(i0.x, i1.y, i1.z), 0).r;
  let v111 = textureLoad(sdfTex, i1, 0).r;

  let x00 = mix(v000, v100, f.x);
  let x10 = mix(v010, v110, f.x);
  let x01 = mix(v001, v101, f.x);
  let x11 = mix(v011, v111, f.x);
  let y0 = mix(x00, x10, f.y);
  let y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

fn sampleSDFGrad(p: vec3<f32>) -> vec3<f32> {
  let h = 0.015;
  return normalize(vec3<f32>(
    sampleSDF(p + vec3<f32>(h, 0.0, 0.0)) - sampleSDF(p - vec3<f32>(h, 0.0, 0.0)),
    sampleSDF(p + vec3<f32>(0.0, h, 0.0)) - sampleSDF(p - vec3<f32>(0.0, h, 0.0)),
    sampleSDF(p + vec3<f32>(0.0, 0.0, h)) - sampleSDF(p - vec3<f32>(0.0, 0.0, h))
  ) / (2.0 * h) + vec3<f32>(1e-6));
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= u.particleCount) { return; }

  var pos = posBuf[id];
  var vel = velBuf[id];
  let density = pos.w;

  if (density <= 0.0) {
    if (u.smokeAmount > 0.0) {
      let spawnProb = u.smokeAmount / f32(u.particleCount) * 60.0 * u.deltaTime;
      if (hash11(f32(id) * 2.73 + u.time * 41.0) < spawnProb) {
        let rnd = hash31(f32(id) + u.time * 7.3 + vel.w * 3.1);
        let src = vec3<f32>(u.smokeSourceX, u.smokeSourceY, u.smokeSourceZ);
        let offset = normalize(rnd * 2.0 - 1.0 + vec3<f32>(1e-3)) * u.smokeSourceRadius * sqrt(rnd.x);
        pos = vec4<f32>(src + offset, 0.4 + rnd.y * 0.4);
        vel = vec4<f32>(0.0);
        vel.w = fract(vel.w + 0.137);
      } else {
        pos.w = 0.0;
      }
    }
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  let sdf = sampleSDF(pos.xyz);
  if (sdf < -0.015) {
    pos.w = 0.0;
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  let fVel = sampleVel(pos.xyz);
  vel.xyz = vel.xyz * 0.85 + fVel * u.deltaTime * 8.0;
  vel.xyz = vel.xyz * 0.98;

  if (sdf < 0.03) {
    let grad = sampleSDFGrad(pos.xyz);
    let pushDist = max(0.03 - sdf, 0.0);
    let pushStrength = select(5.0, 2.5, sdf > 0.0);
    pos.xyz = pos.xyz + grad * pushDist * pushStrength;
    let vDotN = dot(vel.xyz, grad);
    if (vDotN < 0.0) {
      vel.xyz = vel.xyz - grad * vDotN * 1.8;
    }
    vel.xyz = vel.xyz * 0.6;
  }

  pos.xyz = pos.xyz + vel.xyz * u.deltaTime;

  let diffuseNoise = (hash31(f32(id) * 0.17 + u.time * 3.3) - 0.5) * 2.0;
  pos.xyz = pos.xyz + diffuseNoise * u.smokeDiffusion * u.deltaTime;

  let sdfAfter = sampleSDF(pos.xyz);
  if (sdfAfter < -0.01) {
    pos.w = 0.0;
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  pos.w = pos.w - u.deltaTime * 0.06;
  if (pos.w < 0.0) { pos.w = 0.0; }

  let boundary = 0.97;
  if (abs(pos.x) > boundary || abs(pos.y) > boundary || abs(pos.z) > boundary) {
    pos.w = pos.w - u.deltaTime * 0.4;
    if (pos.w < 0.0) { pos.w = 0.0; }
  }

  let vm = length(vel.xyz);
  if (vm > 1.5) { vel.xyz = vel.xyz * (1.5 / vm); }

  posBuf[id] = pos;
  velBuf[id] = vel;
}
