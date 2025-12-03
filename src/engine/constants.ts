/**
 * Application-wide constants
 */

// Canvas and rendering
export const CONFIG_UPDATE_DEBOUNCE_MS = 60;

// View fitting
export const FIT_VIEW_MARGIN = 1.2; // Margin around content when fitting view
export const BOUNDS_SAMPLE_SIZE = 65536; // Number of points to sample for bounds calculation
export const FIT_VIEW_WARMUP_ITERATIONS = 12; // Iterations to run before fitting view after randomize

// Affine safety
export const MAX_FRO_NORM = 2.5; // Max ||A||_Fro for map affine matrices

// Render defaults
export const DEFAULT_EXPOSURE = 1.0;
export const DEFAULT_GAMMA = 0.3;
export const DEFAULT_DECAY = 0.99;
export const DEFAULT_BURN_IN = 2;
export const DEFAULT_NUM_POINTS = 1_000_000;
export const DEFAULT_SEED = 42;
export const DEFAULT_ITERS_PER_STEP = 8;
export const DEFAULT_SIM_STEPS_PER_TICK = 8;
export const DEFAULT_MAX_POST_FPS = 30;
export const DEFAULT_USE_GUARD = true;
export const DEFAULT_AUTO_EXPOSURE = true;
export const DEFAULT_AUTO_EXPOSURE_KEY = 0.18;
export const DEFAULT_PALETTE: 'grayscale' | 'magma' | 'viridis' | 'turbo' = 'magma';

// Diagnostics
export const DIAGNOSTICS_EMA_ALPHA = 0.1;

// UI defaults
export const DEFAULT_GAIN = 1;
