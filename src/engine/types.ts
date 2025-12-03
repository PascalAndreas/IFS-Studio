/**
 * Core types for IFS Studio
 * Defines the Preset structure and worker message protocol
 */

import {
  DEFAULT_BURN_IN,
  DEFAULT_DECAY,
  DEFAULT_EXPOSURE,
  DEFAULT_GAMMA,
  DEFAULT_PALETTE,
  DEFAULT_NUM_POINTS,
  DEFAULT_SEED,
  DEFAULT_ITERS_PER_STEP,
  DEFAULT_SIM_STEPS_PER_TICK,
  DEFAULT_MAX_POST_FPS,
  DEFAULT_USE_GUARD,
  DEFAULT_AUTO_EXPOSURE,
} from './constants';

export const MAX_MAPS = 8;

/**
 * Affine transformation: x' = A * x + b
 */
export interface AffineParams {
  a11: number;
  a12: number;
  a21: number;
  a22: number;
  b1: number;
  b2: number;
}

/**
 * Nonlinear warp parameters
 * Applies sinusoidal warping: x' += a1*sin(k1*x) + a2*sin(k2*y) + ...
 */
export interface WarpParams {
  enabled: boolean;
  a1: number;
  a2: number;
  a3: number;
  a4: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
}

/**
 * Single IFS map with affine + nonlinear warp + probability
 */
export interface IFSMap {
  affine: AffineParams;
  warp: WarpParams;
  probability: number;
}

/**
 * Rendering parameters
 */
export interface RenderParams {
  decay: number;        // Accumulation decay factor per frame (0-1)
  exposure: number;     // Brightness multiplier for display
  gamma: number;        // Gamma correction for display
  palette: 'grayscale' | 'magma' | 'viridis' | 'turbo';
  invert?: boolean;
  autoExposure?: boolean;
}

/**
 * Simulation parameters
 */
export interface SimParams {
  numPoints: number;    // Number of particles
  burnIn: number;       // Frames to run before accumulating
  seed: number;         // RNG seed
  itersPerStep?: number;
  useGuard?: boolean;
  simStepsPerTick?: number; // How many sim/accum steps per loop tick
  maxPostFps?: number;      // Cap postprocess output FPS
}

/**
 * Complete preset definition
 */
export interface ViewParams {
  scale: number;
  offset: { x: number; y: number };
}

/**
 * Map preset: name + maps + view transform
 */
export interface Preset {
  name: string;
  maps: IFSMap[];       // Length must be <= MAX_MAPS
  view?: ViewParams;
}

/**
 * Default preset - Barnsley Fern
 */
export function createDefaultPreset(): Preset {
  return {
    name: "Barnsley Fern (fit)",
    view: {
      scale: 0.18,
      offset: { x: 0, y: -0.9 },
    },
    maps: [
      {
        affine: { a11: 0, a12: 0, a21: 0, a22: 0.16, b1: 0, b2: 0 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.01,
      },
      {
        affine: { a11: 0.85, a12: 0.04, a21: -0.04, a22: 0.85, b1: 0, b2: 1.6 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.85,
      },
      {
        affine: { a11: 0.2, a12: -0.26, a21: 0.23, a22: 0.22, b1: 0, b2: 1.6 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.07,
      },
      {
        affine: { a11: -0.15, a12: 0.28, a21: 0.26, a22: 0.24, b1: 0, b2: 0.44 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.07,
      },
    ],
  };
}

export function createDefaultSimParams(): SimParams {
  return {
    numPoints: DEFAULT_NUM_POINTS,
    burnIn: DEFAULT_BURN_IN,
    seed: DEFAULT_SEED,
    itersPerStep: DEFAULT_ITERS_PER_STEP,
    useGuard: DEFAULT_USE_GUARD,
    simStepsPerTick: DEFAULT_SIM_STEPS_PER_TICK,
    maxPostFps: DEFAULT_MAX_POST_FPS,
  };
}

export function createDefaultRenderParams(): RenderParams {
  return {
    decay: DEFAULT_DECAY,
    exposure: DEFAULT_EXPOSURE,
    gamma: DEFAULT_GAMMA,
    palette: DEFAULT_PALETTE,
    invert: false,
    autoExposure: DEFAULT_AUTO_EXPOSURE,
  };
}

export interface GLCapabilities {
  hasFloatTextures: boolean;
  hasColorBufferFloat: boolean;
  hasFloatBlend: boolean;
  maxTextureSize: number;
  maxTransformFeedbackBuffers: number;
  supportedExtensions: string[];
}

export function computeNormalizedCdf(maps: IFSMap[]): { cdf: number[]; numMaps: number } {
  const n = Math.min(maps.length, MAX_MAPS);
  const probs: number[] = new Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, maps[i].probability);
    probs[i] = p;
    sum += p;
  }
  if (sum <= 0) {
    for (let i = 0; i < n; i++) probs[i] = 1 / n;
    sum = 1;
  } else {
    for (let i = 0; i < n; i++) probs[i] /= sum;
  }
  const cdf = new Array(MAX_MAPS).fill(1);
  let accum = 0;
  for (let i = 0; i < n; i++) {
    accum += probs[i];
    if (i === n - 1) accum = 1; // ensure last is 1
    cdf[i] = accum;
  }
  for (let i = n; i < MAX_MAPS; i++) {
    cdf[i] = 1;
  }
  return { cdf, numMaps: n };
}

/**
 * Convert palette name to numeric ID for shader uniforms
 */
export function paletteToId(palette: RenderParams['palette']): number {
  switch (palette) {
    case 'magma':
      return 1;
    case 'viridis':
      return 2;
    case 'turbo':
      return 3;
    default:
      return 0;
  }
}

export type MainToWorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; preset: Preset; sim: SimParams; render: RenderParams }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'updateConfig'; preset: Preset; sim: SimParams; render: RenderParams }
  | { type: 'resetAccum' }
  | { type: 'fitView'; warmup: number }
  | { type: 'dispose' };

export type WorkerToMainMsg =
  | { type: 'ready'; capabilities: GLCapabilities }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'fitResult'; view: { scale: number; offset: { x: number; y: number } } }
  | { type: 'diag'; data: WorkerDiagnostics };

export interface WorkerDiagnostics {
  frame: number;
  fps: number;
  drawnPoints: number;
  frameMs: number;
  gpuSimMs?: number;
  gpuAccumMs?: number;
  gpuDecayMs?: number;
  gpuAccumEndMs?: number;
  gpuPostMs?: number;
  accumClears?: number;
}

const safeNumber = (v: any, fallback: number) => (Number.isFinite(v) ? v : fallback);

export function clampPreset(preset: Preset): Preset {
  const maps = preset.maps.slice(0, MAX_MAPS).map((m) => ({
    ...m,
    probability: safeNumber(m.probability, 1),
    affine: {
      a11: safeNumber(m.affine.a11, 1),
      a12: safeNumber(m.affine.a12, 0),
      a21: safeNumber(m.affine.a21, 0),
      a22: safeNumber(m.affine.a22, 1),
      b1: safeNumber(m.affine.b1, 0),
      b2: safeNumber(m.affine.b2, 0),
    },
    warp: {
      enabled: !!m.warp.enabled,
      a1: safeNumber(m.warp.a1, 0),
      a2: safeNumber(m.warp.a2, 0),
      a3: safeNumber(m.warp.a3, 0),
      a4: safeNumber(m.warp.a4, 0),
      k1: safeNumber(m.warp.k1, 1),
      k2: safeNumber(m.warp.k2, 1),
      k3: safeNumber(m.warp.k3, 1),
      k4: safeNumber(m.warp.k4, 1),
    },
  }));

  return {
    ...preset,
    name: preset.name || 'Preset',
    view: preset.view ?? { scale: 1, offset: { x: 0, y: 0 } },
    maps,
  };
}

export function clampSim(sim: SimParams): SimParams {
  return {
    numPoints: Math.round(Math.max(100, safeNumber(sim.numPoints, DEFAULT_NUM_POINTS))),
    burnIn: Math.max(0, Math.round(safeNumber(sim.burnIn, DEFAULT_BURN_IN))),
    seed: Math.round(safeNumber(sim.seed, DEFAULT_SEED)),
    itersPerStep: Math.max(1, Math.round(safeNumber(sim.itersPerStep, DEFAULT_ITERS_PER_STEP))),
    useGuard: sim.useGuard ?? DEFAULT_USE_GUARD,
    simStepsPerTick: Math.max(1, Math.round(safeNumber(sim.simStepsPerTick, DEFAULT_SIM_STEPS_PER_TICK))),
    maxPostFps: Math.max(1, Math.round(safeNumber(sim.maxPostFps, DEFAULT_MAX_POST_FPS))),
  };
}

export function clampRender(render: RenderParams): RenderParams {
  return {
    decay: Math.max(0, Math.min(1, safeNumber(render.decay, DEFAULT_DECAY))),
    exposure: Math.max(0, safeNumber(render.exposure, DEFAULT_EXPOSURE)),
    gamma: Math.max(0.0001, safeNumber(render.gamma, DEFAULT_GAMMA)),
    palette: render.palette,
    invert: !!render.invert,
    autoExposure: render.autoExposure ?? DEFAULT_AUTO_EXPOSURE,
  };
}
