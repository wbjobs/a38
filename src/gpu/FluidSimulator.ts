import { WebGPUBackend } from './WebGPUBackend';
import { WebGL2Backend } from './WebGL2Backend';
import type { FluidBackend, SimStepResult, VortexCenter } from './types';
import type { ObstacleType } from '../utils/constants';

export type BackendMode = 'webgpu' | 'webgl2';

export type { SimStepResult, VortexCenter };

export class FluidSimulator {
  backend!: FluidBackend;
  private _mode: BackendMode = 'webgpu';

  get mode(): BackendMode {
    return this._mode;
  }

  async init(): Promise<boolean> {
    const webgpu = new WebGPUBackend();
    const webgpuOk = await webgpu.init();
    if (webgpuOk) {
      this.backend = webgpu;
      this._mode = 'webgpu';
      return true;
    }
    console.warn('[FluidSim] WebGPU not available, falling back to WebGL2');
    const webgl2 = new WebGL2Backend();
    const webgl2Ok = await webgl2.init();
    if (webgl2Ok) {
      this.backend = webgl2;
      this._mode = 'webgl2';
      return true;
    }
    console.error('[FluidSim] Neither WebGPU nor WebGL2 available');
    return false;
  }

  regenerateSDF(type: ObstacleType, angle: number, center?: [number, number, number]) {
    this.backend?.regenerateSDF(type, angle, center);
  }

  setObstacleCenter(center: [number, number, number]) {
    this.backend?.setObstacleCenter(center);
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
    if (!this.backend) return { positionData: null, activeCount: 0 };
    return this.backend.step(params);
  }

  getVortexCenters(): VortexCenter[] {
    if (!this.backend?.getVortexCenters) return [];
    return this.backend.getVortexCenters();
  }
}

export const fluidSim = new FluidSimulator();
