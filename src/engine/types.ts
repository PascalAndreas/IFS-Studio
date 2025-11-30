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
}

/**
 * Default preset - Sierpinski-like triangle
 */
export function createDefaultPreset(): Preset {
  return {
    name: "Default",
    sim: {
      numPoints: 100000,
      burnIn: 100,
      seed: 42,
    },
    render: {
      decay: 0.995,
      exposure: 1.2,
      gamma: 2.2,
    },
    maps: [
      {
        affine: { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: -0.5, b2: -0.5 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.33,
      },
      {
        affine: { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0.5, b2: -0.5 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.33,
      },
      {
        affine: { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0.5 },
        warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
        probability: 0.34,
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

export type MainToWorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; preset: Preset }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'updatePreset'; preset: Preset }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'dispose' };

export type WorkerToMainMsg =
  | { type: 'ready'; capabilities: GLCapabilities }
  | { type: 'error'; message: string; stack?: string };
