import { webgpuCtx } from './WebGPUContext';
import { SDFGenerator } from './SDFGenerator';
import { LBMSolver } from './LBMSolver';
import { ParticleSystem } from './ParticleSystem';
import type { ObstacleType } from '../utils/constants';

export interface SimStepResult {
  positionData: Float32Array | null;
  activeCount: number;
}

export class FluidSimulator {
  sdf!: SDFGenerator;
  lbm!: LBMSolver;
  particles!: ParticleSystem;

  time = 0;
  rotationAngle = 0;
  frame = 0;

  async init(): Promise<boolean> {
    const ok = await webgpuCtx.init();
    if (!ok) return false;

    this.sdf = new SDFGenerator();
    this.lbm = new LBMSolver();
    this.particles = new ParticleSystem();

    await this.sdf.init();
    await this.lbm.init(this.sdf);
    await this.particles.init();

    this.sdf.generate('torus', 0);
    return true;
  }

  regenerateSDF(type: ObstacleType, angle: number) {
    this.sdf.generate(type, angle);
  }

  async step(params: {
    dt: number;
    viscosity: number;
    flowSpeed: number;
    isEmitting: boolean;
    emitRate: number;
    obstacleType: ObstacleType;
    obstacleRotationSpeed: number;
  }): Promise<SimStepResult> {
    this.time += params.dt;
    this.frame++;
    this.rotationAngle += (params.obstacleRotationSpeed * Math.PI / 180) * params.dt;

    if (this.frame % 90 === 1) {
      this.regenerateSDF(params.obstacleType, this.rotationAngle);
    }

    this.lbm.step({
      viscosity: params.viscosity,
      flowSpeed: params.flowSpeed,
      isEmitting: params.isEmitting,
      time: this.time,
      sdf: this.sdf,
    });

    this.particles.step({
      dt: Math.min(params.dt, 0.016),
      isEmitting: params.isEmitting,
      emitRate: params.emitRate,
      time: this.time,
      rotationAngle: this.rotationAngle,
      lbm: this.lbm,
      sdf: this.sdf,
    });

    let positionData: Float32Array | null = null;
    let activeCount = 0;

    if (this.frame % 1 === 0) {
      try {
        positionData = await this.particles.readPositions();
        activeCount = 0;
        for (let i = 0; i < positionData.length; i += 4) {
          if (positionData[i + 3] > 0 && positionData[i] < 50) activeCount++;
        }
      } catch (e) {
        positionData = null;
      }
    }

    return { positionData, activeCount };
  }
}

export const fluidSim = new FluidSimulator();
