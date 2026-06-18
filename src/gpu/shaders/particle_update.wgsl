@group(0) @binding(0) var<storage, read_write> posBuf: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> velBuf: array<vec4<f32>>;
@group(0) @binding(2) var velField: texture_3d<f32>;
@group(0) @binding(3) var sdfTex: texture_3d<f32>;

struct Uniforms {
  gridSize: vec3<u32>,
  deltaTime: f32,
  isEmitting: u32,
  emitRate: f32,
  time: f32,
  particleCount: u32,
  pad0: vec2<u32>,
  obstacleRotation: mat3x3<f32>,
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

fn emitParticle(id: u32, seedOffset: f32) -> vec4<f32> {
  let rnd = hash31(f32(id) + u.time * 13.0 + seedOffset);
  let rnd2 = hash31(f32(id) * 7.77 + u.time * 3.1 + seedOffset * 2.0);
  let face = u32(floor(rnd.x * 5.99));
  var pos: vec3<f32>;
  let inspeed = 0.4 + rnd2.y * 0.3;

  switch (face) {
    case 0u: {
      pos = vec3<f32>(-0.95, rnd.y * 1.8 - 0.9, rnd.z * 1.8 - 0.9);
    }
    case 1u: {
      pos = vec3<f32>(0.95, rnd.y * 1.8 - 0.9, rnd.z * 1.8 - 0.9);
    }
    case 2u: {
      pos = vec3<f32>(rnd.x * 1.8 - 0.9, -0.95, rnd.z * 1.8 - 0.9);
    }
    case 3u: {
      pos = vec3<f32>(rnd.x * 1.8 - 0.9, 0.95, rnd.z * 1.8 - 0.9);
    }
    case 4u: {
      pos = vec3<f32>(rnd.x * 1.8 - 0.9, rnd.y * 1.8 - 0.9, -0.95);
    }
    default: {
      pos = vec3<f32>(rnd.x * 1.8 - 0.9, rnd.y * 1.8 - 0.9, 0.95);
    }
  }
  return vec4<f32>(pos, 1.0);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= u.particleCount) { return; }

  var pos = posBuf[id];
  var vel = velBuf[id];

  if (pos.w <= 0.0 || pos.w > 6.0) {
    if (u.isEmitting == 1u) {
      let emitProb = u.emitRate / f32(u.particleCount) * 60.0 * u.deltaTime;
      if (hash11(f32(id) * 3.33 + u.time * 99.0) < emitProb) {
        pos = emitParticle(id, vel.w);
        vel = vec4<f32>(0.0);
        vel.w = fract(vel.w + 0.137);
      } else {
        pos.w = 0.0;
      }
    } else {
      pos.w = 0.0;
    }
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  let sdf = sampleSDF(pos.xyz);

  if (sdf < -0.02) {
    pos.w = 0.0;
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  let p = pos.xyz;
  let fVel = sampleVel(p);

  vel.xyz = vel.xyz + fVel * u.deltaTime * 4.0;
  vel.xyz = vel.xyz * 0.96;

  if (sdf < 0.04) {
    let grad = sampleSDFGrad(p);
    let pushDist = max(0.04 - sdf, 0.0);
    let pushStrength = select(6.0, 3.0, sdf > 0.0);
    pos.xyz = pos.xyz + grad * pushDist * pushStrength;
    let vDotN = dot(vel.xyz, grad);
    if (vDotN < 0.0) {
      vel.xyz = vel.xyz - grad * vDotN * 2.0;
    }
    vel.xyz = vel.xyz - grad * max(0.0, -sdf) * 12.0;
    vel.xyz = vel.xyz * 0.55;
  }

  pos.xyz = pos.xyz + vel.xyz * u.deltaTime;
  pos.w = pos.w + u.deltaTime;

  let sdfAfter = sampleSDF(pos.xyz);
  if (sdfAfter < -0.01) {
    pos.w = 0.0;
    posBuf[id] = pos;
    velBuf[id] = vel;
    return;
  }

  let boundary = 0.98;
  if (pos.w > 5.5 ||
      abs(pos.x) > boundary || abs(pos.y) > boundary || abs(pos.z) > boundary) {
    pos.w = 0.0;
  }

  let vm = length(vel.xyz);
  if (vm > 1.2) { vel.xyz = vel.xyz * (1.2 / vm); }

  posBuf[id] = pos;
  velBuf[id] = vel;
}
