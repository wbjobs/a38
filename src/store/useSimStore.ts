import { create } from 'zustand';
import { ObstacleType } from '../utils/constants';
import type { BackendMode } from '../gpu/FluidSimulator';

interface SimState {
  isEmitting: boolean;
  viscosity: number;
  emitRate: number;
  obstacleType: ObstacleType;
  obstacleRotationSpeed: number;
  particleCount: number;
  flowSpeed: number;
  fps: number;
  activeParticles: number;
  backendMode: BackendMode | null;

  smokeEnabled: boolean;
  smokeAmount: number;
  smokeDiffusion: number;
  smokeCount: number;
  showVortex: boolean;
  obstaclePos: [number, number, number];

  toggleEmitting: () => void;
  setViscosity: (v: number) => void;
  setEmitRate: (v: number) => void;
  setObstacleType: (t: ObstacleType) => void;
  setObstacleRotationSpeed: (v: number) => void;
  setFlowSpeed: (v: number) => void;
  setFps: (v: number) => void;
  setActiveParticles: (v: number) => void;
  setBackendMode: (m: BackendMode) => void;
  setSmokeEnabled: (v: boolean) => void;
  setSmokeAmount: (v: number) => void;
  setSmokeDiffusion: (v: number) => void;
  setSmokeCount: (v: number) => void;
  setShowVortex: (v: boolean) => void;
  setObstaclePos: (pos: [number, number, number]) => void;
}

export const useSimStore = create<SimState>((set) => ({
  isEmitting: false,
  viscosity: 0.01,
  emitRate: 400,
  obstacleType: 'torus',
  obstacleRotationSpeed: 60,
  particleCount: 8000,
  flowSpeed: 0.15,
  fps: 0,
  activeParticles: 0,
  backendMode: null,

  smokeEnabled: true,
  smokeAmount: 800,
  smokeDiffusion: 0.15,
  smokeCount: 0,
  showVortex: true,
  obstaclePos: [0, 0, 0],

  toggleEmitting: () => set((s) => ({ isEmitting: !s.isEmitting })),
  setViscosity: (v) => set({ viscosity: v }),
  setEmitRate: (v) => set({ emitRate: v }),
  setObstacleType: (t) => set({ obstacleType: t }),
  setObstacleRotationSpeed: (v) => set({ obstacleRotationSpeed: v }),
  setFlowSpeed: (v) => set({ flowSpeed: v }),
  setFps: (v) => set({ fps: v }),
  setActiveParticles: (v) => set({ activeParticles: v }),
  setBackendMode: (m) => set({ backendMode: m }),
  setSmokeEnabled: (v) => set({ smokeEnabled: v }),
  setSmokeAmount: (v) => set({ smokeAmount: v }),
  setSmokeDiffusion: (v) => set({ smokeDiffusion: v }),
  setSmokeCount: (v) => set({ smokeCount: v }),
  setShowVortex: (v) => set({ showVortex: v }),
  setObstaclePos: (pos) => set({ obstaclePos: pos }),
}));
