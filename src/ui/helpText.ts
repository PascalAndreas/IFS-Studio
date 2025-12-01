export const helpText = {
  'sim.seed': 'Seed for deterministic randomization of initial points and map choices.',
  'sim.numPoints': 'Total particles simulated on GPU. Higher values increase detail but cost GPU time.',
  'sim.burnIn': 'Frames to run before accumulation starts. Helps hide startup transients.',
  'sim.pause': 'Toggle simulation loop without resetting state.',
  'render.decay': 'Decay applied to the accumulation buffer each frame (0-1). Lower = more motion trails.',
  'render.exposure': 'Brightness multiplier before tone mapping.',
  'render.gamma': 'Gamma correction applied after tone mapping.',
  'render.palette': 'Color palette used in postprocess.',
  'render.invert': 'Invert the final color output.',
  'maps.probability': 'Relative probability of selecting this map during simulation.',
  'maps.gain': 'Scales the displayed vector while keeping the underlying coefficients separate.',
  'maps.affine': 'Affine transform coefficients (A matrix and b offset).',
  'maps.warp': 'Optional sinusoidal warp parameters (amplitudes a1..a4, frequencies k1..k4).',
  'menu.import': 'Load preset+sim+render JSON from disk.',
  'menu.export': 'Export current preset+sim+render JSON to disk.',
  'actions.reset': 'Clear accumulation buffer.',
  'actions.randomize': 'Randomize a new preset (maps only).',
  'actions.mutate': 'Jitter the current preset maps.',
  'actions.fit': 'Fit the view to current particle bounds.',
} as const;

export type HelpKey = keyof typeof helpText;
