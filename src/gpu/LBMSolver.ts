import lbmWgsl from './shaders/lbm_step.wgsl?raw';
import { webgpuCtx } from './WebGPUContext';
import { GRID_SIZE } from '../utils/constants';
import type { SDFGenerator } from './SDFGenerator';

export class LBMSolver {
  private fTextures: GPUTexture[] = [];
  private velTexture!: GPUTexture;
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private uniformBuffer!: GPUBuffer;
  private pingpong = 0;
  private initialized = false;

  get velocityView(): GPUTextureView {
    return this.velTexture.createView();
  }

  async init(sdf: SDFGenerator) {
    const { device } = webgpuCtx;

    const texDesc: GPUTextureDescriptor = {
      dimension: '3d',
      size: [GRID_SIZE, GRID_SIZE, GRID_SIZE],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
    };
    this.fTextures = [
      device.createTexture(texDesc),
      device.createTexture(texDesc),
      device.createTexture(texDesc),
      device.createTexture(texDesc),
    ];

    this.velTexture = device.createTexture(texDesc);

    this.uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const module = device.createShaderModule({ code: lbmWgsl });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: 'main' },
    });

    this.initFields(sdf);
    this.initialized = true;
  }

  private initFields(sdf: SDFGenerator) {
    const { device, queue } = webgpuCtx;
    const total = GRID_SIZE * GRID_SIZE * GRID_SIZE;
    const initA = new Float32Array(total * 4);
    const initB = new Float32Array(total * 4);

    for (let i = 0; i < total; i++) {
      initA[i * 4 + 0] = 0.25;
      initA[i * 4 + 1] = 0.125;
      initA[i * 4 + 2] = 0.125;
      initA[i * 4 + 3] = 0.125;
      initB[i * 4 + 0] = 0.125;
      initB[i * 4 + 1] = 0.125;
      initB[i * 4 + 2] = 0.125;
      initB[i * 4 + 3] = 1.0;
    }

    const bytesPerRow = GRID_SIZE * 4 * 4;
    const rowsPerImage = GRID_SIZE;

    for (let t = 0; t < 2; t++) {
      queue.writeTexture(
        { texture: this.fTextures[t * 2] },
        initA.buffer,
        { bytesPerRow, rowsPerImage },
        { width: GRID_SIZE, height: GRID_SIZE, depthOrArrayLayers: GRID_SIZE }
      );
      queue.writeTexture(
        { texture: this.fTextures[t * 2 + 1] },
        initB.buffer,
        { bytesPerRow, rowsPerImage },
        { width: GRID_SIZE, height: GRID_SIZE, depthOrArrayLayers: GRID_SIZE }
      );
    }
  }

  step(params: { viscosity: number; flowSpeed: number; isEmitting: boolean; time: number; sdf: SDFGenerator }) {
    if (!this.initialized) return;
    const { device } = webgpuCtx;

    const data = new ArrayBuffer(256);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);
    u32[0] = GRID_SIZE; u32[1] = GRID_SIZE; u32[2] = GRID_SIZE;
    f32[3] = params.viscosity;
    f32[4] = params.flowSpeed;
    u32[5] = params.isEmitting ? 1 : 0;
    f32[6] = params.time;

    webgpuCtx.queue.writeBuffer(this.uniformBuffer, 0, data);

    const readIdx = this.pingpong;
    const writeIdx = 1 - this.pingpong;

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.fTextures[readIdx * 2].createView() },
        { binding: 1, resource: this.fTextures[readIdx * 2 + 1].createView() },
        { binding: 2, resource: this.fTextures[writeIdx * 2].createView() },
        { binding: 3, resource: this.fTextures[writeIdx * 2 + 1].createView() },
        { binding: 4, resource: params.sdf.textureView },
        { binding: 5, resource: this.velocityView },
        { binding: 6, resource: this.uniformBuffer },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    const g = Math.ceil(GRID_SIZE / 4);
    pass.dispatchWorkgroups(g, g, g);
    pass.end();
    device.queue.submit([encoder.finish()]);

    this.pingpong = writeIdx;
  }
}
