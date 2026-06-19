@group(0) @binding(0) var velTex: texture_3d<f32>;
@group(0) @binding(1) var vortexTex: texture_storage_3d<rgba32float, write>;

struct Uniforms {
  gridSize: vec3<u32>,
  pad0: f32,
  pad1: f32,
  pad2: f32,
};
@group(0) @binding(2) var<uniform> u: Uniforms;

fn wrapI(p: vec3<i32>) -> vec3<i32> {
  let s = vec3<i32>(u.gridSize);
  var r = p;
  if (r.x < 0) { r.x = s.x - 1; }
  if (r.x >= s.x) { r.x = 0; }
  if (r.y < 0) { r.y = s.y - 1; }
  if (r.y >= s.y) { r.y = 0; }
  if (r.z < 0) { r.z = s.z - 1; }
  if (r.z >= s.z) { r.z = 0; }
  return r;
}

fn sampleV(p: vec3<i32>) -> vec3<f32> {
  let idx = vec3<u32>(wrapI(p));
  return textureLoad(velTex, idx, 0).rgb;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (any(gid >= u.gridSize)) { return; }

  let p = vec3<i32>(gid);

  let vxp = sampleV(p + vec3<i32>(1, 0, 0));
  let vxn = sampleV(p - vec3<i32>(1, 0, 0));
  let vyp = sampleV(p + vec3<i32>(0, 1, 0));
  let vyn = sampleV(p - vec3<i32>(0, 1, 0));
  let vzp = sampleV(p + vec3<i32>(0, 0, 1));
  let vzn = sampleV(p - vec3<i32>(0, 0, 1));

  let dx = 2.0 / f32(u.gridSize.x);
  let dy = 2.0 / f32(u.gridSize.y);
  let dz = 2.0 / f32(u.gridSize.z);

  let dv_dx = (vxp - vxn) / (2.0 * dx);
  let dv_dy = (vyp - vyn) / (2.0 * dy);
  let dv_dz = (vzp - vzn) / (2.0 * dz);

  let vorticity = vec3<f32>(
    dv_dy.z - dv_dz.y,
    dv_dz.x - dv_dx.z,
    dv_dx.y - dv_dy.x
  );

  let vortMag = length(vorticity);

  textureStore(vortexTex, gid, vec4<f32>(vorticity, vortMag));
}
