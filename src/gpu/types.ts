import type { ObstacleType } from '../utils/constants';

export interface SimStepResult {
  positionData: Float32Array | null;
  activeCount: number;
}

export interface FluidBackend {
  readonly mode: 'webgpu' | 'webgl2';
  init(): Promise<boolean>;
  regenerateSDF(type: ObstacleType, angle: number): void;
  step(params: {
    dt: number;
    viscosity: number;
    flowSpeed: number;
    isEmitting: boolean;
    emitRate: number;
    obstacleType: ObstacleType;
    obstacleRotationSpeed: number;
  }): Promise<SimStepResult>;
  dispose?(): void;
}
