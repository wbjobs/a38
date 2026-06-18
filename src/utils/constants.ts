export const GRID_SIZE = 32;
export const GRID_VOLUME = GRID_SIZE * GRID_SIZE * GRID_SIZE;

export const PARTICLE_COUNT = 8000;
export const PARTICLE_MAX = 16000;

export const WORLD_SIZE = 4.0;
export const HALF_WORLD = WORLD_SIZE / 2;

export const OBSTACLE_RADIUS = 0.7;
export const OBSTACLE_CENTER: [number, number, number] = [0, 0, 0];

export type ObstacleType = 'sphere' | 'torus' | 'torusKnot';

export const OBSTACLE_TYPE_MAP: Record<ObstacleType, number> = {
  sphere: 0,
  torus: 1,
  torusKnot: 2,
};
