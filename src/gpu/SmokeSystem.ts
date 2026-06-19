import smokeWgsl from './shaders/smoke_particle.wgsl?raw';
import { webgpuCtx } from './WebGPUContext';
import { PARTICLE_COUNT, GRID_SIZE } from '../utils/constants';
import type { SDFGenerator } from './SDFGenerator';
import type { LBMSolver } from './LBMSolver';

export const SMOKE_COUNT = 6000;

export class SmokeSystem {
  positionBuffer!: GPUBuffer;
  velocityBuffer!: GPUBuffer;
  readbackBuffer!: GPUBuffer;
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private uniformBuffer!: GPUBuffer;

  get particleCount() {
    return SMOKE_COUNT;
  }

  async init() {
    const { device } = webgpuCtx;

    const posData = new Float32Array(SMOKE_COUNT * 4);
    const velData = new Float32Array(SMOKE_COUNT * 4);
    for (let i = 0; i < SMOKE_COUNT; i++) {
      posData[i * 4 + 0] = 100;
      posData[i * 4 + 1] = 100;
      posData[i * 4 + 2] = 100;
      posData[i * 4 + 3] = 0;
      velData[i * 4 + 3] = Math.random();
    }

    this.positionBuffer = device.createBuffer({
      size: posData.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.positionBuffer.getMappedRange()).set(posData);
    this.positionBuffer.unmap();

    this.velocityBuffer = device.createBuffer({
      size: velData.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.velocityBuffer.getMappedRange()).set(velData);
    this.velocityBuffer.unmap();

    this.readbackBuffer = device.createBuffer({
      size: posData.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const module = device.createShaderModule({ code: smokeWgsl });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    this.pipeline = device.createComputePipeline({
      layout,
      compute: { module, entryPoint: 'main' },
    });
  }

  step(params: {
    dt: number;
    time: number;
    smokeAmount: number;
    smokeDiffusion: number;
    smokeSource: [number, number, number];
    smokeSourceRadius: number;
    lbm: LBMSolver;
    sdf: SDFGenerator;
  }) {
    const { device, queue } = webgpuCtx;

    const data = new ArrayBuffer(256);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);
    u32[0] = GRID_SIZE; u32[1] = GRID_SIZE; u32[2] = GRID_SIZE;
    f32[3] = params.dt;
    f32[4] = params.time;
    u32[5] = SMOKE_COUNT;
    f32[6] = params.smokeAmount;
    f32[7] = params.smokeDiffusion;
    f32[8] = params.smokeSource[0];
    f32[9] = params.smokeSource[1];
    f32[10] = params.smokeSource[2];
    f32[11] = params.smokeSourceRadius;

    queue.writeBuffer(this.uniformBuffer, 0, data);

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.velocityBuffer } },
        { binding: 2, resource: params.lbm.velocityView },
        { binding: 3, resource: params.sdf.textureView },
        { binding: 4, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    const groups = Math.ceil(SMOKE_COUNT / 256);
    pass.dispatchWorkgroups(groups, 1, 1);
    pass.end();

    encoder.copyBufferToBuffer(
      this.positionBuffer, 0,
      this.readbackBuffer, 0,
      this.positionBuffer.size
    );

    device.queue.submit([encoder.finish()]);
  }

  async readPositions(): Promise<Float32Array> {
    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const copy = new Float32Array(this.readbackBuffer.getMappedRange());
    const result = new Float32Array(copy);
    this.readbackBuffer.unmap();
    return result;
  }
}
