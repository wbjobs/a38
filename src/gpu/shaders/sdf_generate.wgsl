@group(0) @binding(0) var sdfTex: texture_storage_3d<r32float, write>;

struct Uniforms {
  gridSize: vec3<u32>,
  obstacleType: u32,
  obstacleRadius: f32,
  pad0: u32,
  obstacleRotation: mat3x3<f32>,
  obstacleCenter: vec3<f32>,
  pad1: f32,
};
@group(0) @binding(1) var<uniform> u: Uniforms;

fn sdSphere(p: vec3<f32>, r: f32) -> f32 {
  return length(p) - r;
}

fn sdTorus(p: vec3<f32>, r: f32, R: f32) -> f32 {
  let q = vec2<f32>(length(p.xy) - R, p.z);
  return length(q) - r;
}

fn sdTorusKnot(p: vec3<f32>, r: f32) -> f32 {
  let p2 = p * 0.9;
  let q = vec2<f32>(length(p2.xy) - 0.5, p2.z);
  let a = atan2(p2.y, p2.x);
  let twist = sin(a * 2.0) * 0.12;
  let q2 = q + vec2<f32>(0.0, twist);
  return length(q2) - r * 0.65;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (any(gid >= u.gridSize)) { return; }

  let npos = (vec3<f32>(gid) + 0.5) / vec3<f32>(u.gridSize);
  let p = (npos - 0.5) * 2.0;
  let pc = p - u.obstacleCenter;
  let pr = u.obstacleRotation * pc;

  var dist: f32;
  switch (u.obstacleType) {
    case 0u: { dist = sdSphere(pr, u.obstacleRadius); }
    case 1u: { dist = sdTorus(pr, u.obstacleRadius * 0.35, u.obstacleRadius); }
    default: { dist = sdTorusKnot(pr, u.obstacleRadius); }
  }

  textureStore(sdfTex, gid, vec4<f32>(dist, 0.0, 0.0, 0.0));
}
