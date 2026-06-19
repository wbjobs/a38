import { webgpuCtx } from './WebGPUContext';
import { SDFGenerator } from './SDFGenerator';
import { LBMSolver } from './LBMSolver';
import { ParticleSystem } from './ParticleSystem';
import { SmokeSystem, SMOKE_COUNT } from './SmokeSystem';
import { VortexSolver, type VortexCenter } from './VortexSolver';
import type { ObstacleType } from '../utils/constants';
import type { FluidBackend, SimStepResult } from './types';

export class WebGPUBackend implements FluidBackend {
  mode = 'webgpu' as const;
  private sdf!: SDFGenerator;
  private lbm!: LBMSolver;
  private particles!: ParticleSystem;
  private smoke!: SmokeSystem;
  private vortex!: VortexSolver;

  time = 0;
  rotationAngle = 0;
  frame = 0;
  obstacleCenter: [number, number, number] = [0, 0, 0];

  async init(): Promise<boolean> {
    const ok = await webgpuCtx.init();
    if (!ok) return false;
    try {
      this.sdf = new SDFGenerator();
      this.lbm = new LBMSolver();
      this.particles = new ParticleSystem();
      this.smoke = new SmokeSystem();
      this.vortex = new VortexSolver();
      await this.sdf.init();
      await this.lbm.init(this.sdf);
      await this.particles.init();
      await this.smoke.init();
      await this.vortex.init();
      this.sdf.generate('torus', 0, this.obstacleCenter);
      return true;
    } catch (e) {
      console.error('WebGPU backend init error:', e);
      return false;
    }
  }

  regenerateSDF(type: ObstacleType, angle: number, center?: [number, number, number]) {
    if (center) this.obstacleCenter = center;
    this.sdf.generate(type, angle, this.obstacleCenter);
  }

  setObstacleCenter(center: [number, number, number]) {
    this.obstacleCenter = [...center] as [number, number, number];
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
    this.time += params.dt;
    this.frame++;
    this.rotationAngle += (params.obstacleRotationSpeed * Math.PI / 180) * params.dt;

    if (this.frame % 90 === 1) {
      this.regenerateSDF(params.obstacleType, this.rotationAngle);
    }

    this.lbm.step({
      viscosity: params.viscosity,
      flowSpeed: params.flowSpeed,
      isEmitting: params.isEmitting || params.smokeEnabled,
      time: this.time,
      sdf: this.sdf,
    });

    this.vortex.step(this.lbm);

    this.particles.step({
      dt: Math.min(params.dt, 0.016),
      isEmitting: params.isEmitting,
      emitRate: params.emitRate,
      time: this.time,
      rotationAngle: this.rotationAngle,
      lbm: this.lbm,
      sdf: this.sdf,
    });

    this.smoke.step({
      dt: Math.min(params.dt, 0.016),
      time: this.time,
      smokeAmount: params.smokeEnabled ? params.smokeAmount : 0,
      smokeDiffusion: params.smokeDiffusion,
      smokeSource: params.smokeSource,
      smokeSourceRadius: params.smokeSourceRadius,
      lbm: this.lbm,
      sdf: this.sdf,
    });

    let positionData: Float32Array | null = null;
    let smokeData: Float32Array | null = null;
    let activeCount = 0;
    let smokeCount = 0;

    try {
      positionData = await this.particles.readPositions();
      activeCount = 0;
      for (let i = 0; i < positionData.length; i += 4) {
        if (positionData[i + 3] > 0 && positionData[i] < 50) activeCount++;
      }
    } catch {
      positionData = null;
    }

    try {
      smokeData = await this.smoke.readPositions();
      smokeCount = 0;
      for (let i = 0; i < smokeData.length; i += 4) {
        if (smokeData[i + 3] > 0.01 && Math.abs(smokeData[i]) < 50) smokeCount++;
      }
    } catch {
      smokeData = null;
    }

    return { positionData, activeCount, smokeData, smokeCount };
  }

  getVortexCenters(): VortexCenter[] {
    if (!this.vortex) return [];
    return this.vortex.getVortexCenters();
  }
}
