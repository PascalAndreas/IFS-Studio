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

// UI defaults
export const DEFAULT_GAIN = 1;
