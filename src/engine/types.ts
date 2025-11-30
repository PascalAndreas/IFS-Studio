/**
 * Core types for IFS Studio
 * Defines the Preset structure and worker message protocol
 */

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
}

/**
 * Simulation parameters
 */
export interface SimParams {
  numPoints: number;    // Number of particles
  burnIn: number;       // Frames to run before accumulating
  seed: number;         // RNG seed
}

/**
 * Complete preset definition
 */
export interface Preset {
  name: string;
  sim: SimParams;
  render: RenderParams;
  maps: IFSMap[];       // Length must be <= MAX_MAPS
  view?: {
    scale: number;      // Uniform scale applied in point render
    offset: { x: number; y: number }; // Offset in clip space
  };
}

/**
 * Default preset - Sierpinski-like triangle
 */
export function createDefaultPreset(): Preset {
  return {
    name: "Barnsley Fern (fit)",
    sim: {
      numPoints: 80000,
      burnIn: 0,
      seed: 42,
    },
    render: {
      decay: 0.99,
      exposure: 1.0,
      gamma: 2.2,
    },
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

export type MainToWorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; preset: Preset }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'updatePreset'; preset: Preset }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'dispose' };

export type WorkerToMainMsg =
  | { type: 'ready'; capabilities: GLCapabilities }
  | { type: 'error'; message: string; stack?: string };
