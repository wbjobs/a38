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

  toggleEmitting: () => void;
  setViscosity: (v: number) => void;
  setEmitRate: (v: number) => void;
  setObstacleType: (t: ObstacleType) => void;
  setObstacleRotationSpeed: (v: number) => void;
  setFlowSpeed: (v: number) => void;
  setFps: (v: number) => void;
  setActiveParticles: (v: number) => void;
  setBackendMode: (m: BackendMode) => void;
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

  toggleEmitting: () => set((s) => ({ isEmitting: !s.isEmitting })),
  setViscosity: (v) => set({ viscosity: v }),
  setEmitRate: (v) => set({ emitRate: v }),
  setObstacleType: (t) => set({ obstacleType: t }),
  setObstacleRotationSpeed: (v) => set({ obstacleRotationSpeed: v }),
  setFlowSpeed: (v) => set({ flowSpeed: v }),
  setFps: (v) => set({ fps: v }),
  setActiveParticles: (v) => set({ activeParticles: v }),
  setBackendMode: (m) => set({ backendMode: m }),
}));
