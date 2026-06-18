import sdfWgsl from './shaders/sdf_generate.wgsl?raw';
import { webgpuCtx } from './WebGPUContext';
import { GRID_SIZE, OBSTACLE_RADIUS, ObstacleType, OBSTACLE_TYPE_MAP } from '../utils/constants';

export class SDFGenerator {
  texture!: GPUTexture;
  sampler!: GPUSampler;
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private uniformBuffer!: GPUBuffer;

  get textureView(): GPUTextureView {
    return this.texture.createView();
  }

  async init() {
    const { device } = webgpuCtx;

    this.texture = device.createTexture({
      dimension: '3d',
      size: [GRID_SIZE, GRID_SIZE, GRID_SIZE],
      format: 'r32float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });

    this.uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'r32float',
            viewDimension: '3d',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const module = device.createShaderModule({ code: sdfWgsl });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: 'main' },
    });
  }

  generate(obstacleType: ObstacleType, rotationAngle: number = 0) {
    const { device, queue } = webgpuCtx;

    const c = Math.cos(rotationAngle);
    const s = Math.sin(rotationAngle);
    const rotMat = new Float32Array([
      c, 0, s,
      0, 1, 0,
      -s, 0, c,
    ]);

    const data = new ArrayBuffer(256);
    const view = new DataView(data);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);

    u32[0] = GRID_SIZE;
    u32[1] = GRID_SIZE;
    u32[2] = GRID_SIZE;
    u32[3] = OBSTACLE_TYPE_MAP[obstacleType];
    f32[4] = OBSTACLE_RADIUS;
    u32[5] = 0;
    for (let i = 0; i < 9; i++) f32[6 + i] = rotMat[i];

    queue.writeBuffer(this.uniformBuffer, 0, data);

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.textureView },
        { binding: 1, resource: this.uniformBuffer },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    const groups = Math.ceil(GRID_SIZE / 4);
    pass.dispatchWorkgroups(groups, groups, groups);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }
}
