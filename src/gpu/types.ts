import type { ObstacleType } from '../utils/constants';

export interface VortexCenter {
  position: [number, number, number];
  axis: [number, number, number];
  magnitude: number;
}

export interface SimStepResult {
  positionData: Float32Array | null;
  activeCount: number;
  smokeData?: Float32Array | null;
  smokeCount?: number;
}

export interface FluidBackend {
  readonly mode: 'webgpu' | 'webgl2';
  init(): Promise<boolean>;
  regenerateSDF(type: ObstacleType, angle: number, center?: [number, number, number]): void;
  setObstacleCenter(center: [number, number, number]): void;
  step(params: {
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
  }): Promise<SimStepResult>;
  getVortexCenters?(): VortexCenter[];
  dispose?(): void;
}
