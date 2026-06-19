import vortexWgsl from './shaders/vortex_comp.wgsl?raw';
import { webgpuCtx } from './WebGPUContext';
import { GRID_SIZE } from '../utils/constants';
import type { LBMSolver } from './LBMSolver';

export interface VortexCenter {
  position: [number, number, number];
  axis: [number, number, number];
  magnitude: number;
}

export class VortexSolver {
  texture!: GPUTexture;
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private uniformBuffer!: GPUBuffer;
  private readbackBuffer!: GPUBuffer;
  private initialized = false;
  private readbackPending = false;
  private cachedCenters: VortexCenter[] = [];
  private cacheFrame = 0;
  private frameCount = 0;

  get textureView(): GPUTextureView {
    return this.texture.createView();
  }

  async init() {
    const { device } = webgpuCtx;

    this.texture = device.createTexture({
      dimension: '3d',
      size: [GRID_SIZE, GRID_SIZE, GRID_SIZE],
      format: 'rgba32float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    const bytesPerPixel = 16;
    const rowPitch = Math.ceil((GRID_SIZE * bytesPerPixel) / 256) * 256;
    const totalSize = rowPitch * GRID_SIZE * GRID_SIZE;

    this.readbackBuffer = device.createBuffer({
      size: totalSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { viewDimension: '3d', sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const module = device.createShaderModule({ code: vortexWgsl });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint: 'main' },
    });

    this.initialized = true;
  }

  step(lbm: LBMSolver) {
    if (!this.initialized) return;
    const { device } = webgpuCtx;
    this.frameCount++;

    const data = new ArrayBuffer(64);
    const u32 = new Uint32Array(data);
    u32[0] = GRID_SIZE; u32[1] = GRID_SIZE; u32[2] = GRID_SIZE;

    webgpuCtx.queue.writeBuffer(this.uniformBuffer, 0, data);

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: lbm.velocityView },
        { binding: 1, resource: this.textureView },
        { binding: 2, resource: this.uniformBuffer },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    const g = Math.ceil(GRID_SIZE / 4);
    pass.dispatchWorkgroups(g, g, g);
    pass.end();

    if (!this.readbackPending && this.frameCount % 6 === 0) {
      const bytesPerPixel = 16;
      const rowPitch = Math.ceil((GRID_SIZE * bytesPerPixel) / 256) * 256;
      encoder.copyTextureToBuffer(
        { texture: this.texture },
        { buffer: this.readbackBuffer, bytesPerRow: rowPitch, rowsPerImage: GRID_SIZE },
        { width: GRID_SIZE, height: GRID_SIZE, depthOrArrayLayers: GRID_SIZE }
      );
      this.readbackPending = true;
    }

    device.queue.submit([encoder.finish()]);

    if (this.readbackPending) {
      this.readbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const arrayBuffer = this.readbackBuffer.getMappedRange();
        this.cachedCenters = this._findVortexCentersFromData(arrayBuffer);
        this.readbackBuffer.unmap();
        this.readbackPending = false;
        this.cacheFrame = this.frameCount;
      }).catch(() => {
        this.readbackPending = false;
      });
    }
  }

  private _findVortexCentersFromData(buffer: ArrayBuffer): VortexCenter[] {
    const centers: VortexCenter[] = [];
    const bytesPerPixel = 16;
    const rowPitch = Math.ceil((GRID_SIZE * bytesPerPixel) / 256) * 256;
    const data = new Float32Array(buffer);

    const getVorticity = (x: number, y: number, z: number): [number, number, number, number] => {
      const rowOffset = rowPitch / 4;
      const sliceOffset = rowOffset * GRID_SIZE;
      const idx = z * sliceOffset + y * rowOffset + x * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    };

    const candidates: { pos: [number, number, number]; axis: [number, number, number]; mag: number }[] = [];

    for (let z = 2; z < GRID_SIZE - 2; z++) {
      for (let y = 2; y < GRID_SIZE - 2; y++) {
        for (let x = 2; x < GRID_SIZE - 2; x++) {
          const v = getVorticity(x, y, z);
          const mag = v[3];
          if (mag < 0.008) continue;

          let isLocalMax = true;
          for (let dz = -1; dz <= 1 && isLocalMax; dz++) {
            for (let dy = -1; dy <= 1 && isLocalMax; dy++) {
              for (let dx = -1; dx <= 1 && isLocalMax; dx++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const nv = getVorticity(x + dx, y + dy, z + dz);
                if (nv[3] > mag) {
                  isLocalMax = false;
                }
              }
            }
          }

          if (isLocalMax) {
            const axisLen = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
            if (axisLen > 0.001) {
              candidates.push({
                pos: [
                  (x / GRID_SIZE) * 2 - 1,
                  (y / GRID_SIZE) * 2 - 1,
                  (z / GRID_SIZE) * 2 - 1,
                ],
                axis: [v[0] / axisLen, v[1] / axisLen, v[2] / axisLen],
                mag,
              });
            }
          }
        }
      }
    }

    candidates.sort((a, b) => b.mag - a.mag);

    const minDist = 0.25;
    for (const c of candidates) {
      let tooClose = false;
      for (const s of centers) {
        const dx = c.pos[0] - s.position[0];
        const dy = c.pos[1] - s.position[1];
        const dz = c.pos[2] - s.position[2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        centers.push({
          position: c.pos,
          axis: c.axis,
          magnitude: c.mag,
        });
        if (centers.length >= 6) break;
      }
    }

    return centers;
  }

  getVortexCenters(): VortexCenter[] {
    return this.cachedCenters;
  }
}
