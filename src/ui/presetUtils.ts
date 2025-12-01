import { IFSMap, MAX_MAPS, Preset, clampPreset, clampSim, clampRender, SimParams, RenderParams } from '../engine/types';

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const sampleProbabilities = (n: number) => {
  const arr = Array.from({ length: n }, () => Math.max(0.0001, Math.random()));
  const sum = arr.reduce((s, v) => s + v, 0);
  return arr.map((v) => v / sum);
};

export function randomizePreset(base: { sim: SimParams; render: RenderParams }): { preset: Preset; sim: SimParams; render: RenderParams } {
  const numMaps = Math.min(MAX_MAPS, Math.floor(rand(3, 6)));
  const probs = sampleProbabilities(numMaps);
  const maps: IFSMap[] = [];
  for (let i = 0; i < numMaps; i++) {
    const scale = rand(0.3, 0.8);
    const angle = rand(-0.5, 0.5);
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const a11 = c * scale;
    const a12 = -s * scale;
    const a21 = s * scale;
    const a22 = c * scale;
    maps.push({
      affine: {
        a11,
        a12,
        a21,
        a22,
        b1: rand(-0.8, 0.8),
        b2: rand(-0.8, 0.8),
      },
      warp: {
        enabled: Math.random() < 0.2,
        a1: rand(0, 0.2),
        a2: rand(0, 0.2),
        a3: rand(0, 0.2),
        a4: rand(0, 0.2),
        k1: rand(0, 6),
        k2: rand(0, 6),
        k3: rand(0, 6),
        k4: rand(0, 6),
      },
      probability: probs[i],
    });
  }

  const preset: Preset = clampPreset({
    name: 'Random',
    view: {
      scale: 0.18,
      offset: { x: 0, y: -0.9 },
    },
    maps,
  });

  return {
    preset,
    sim: clampSim(base.sim),
    render: clampRender(base.render),
  };
}

export function mutatePreset(p: { preset: Preset; sim: SimParams; render: RenderParams }): { preset: Preset; sim: SimParams; render: RenderParams } {
  const next: Preset = JSON.parse(JSON.stringify(p.preset));
  next.maps = next.maps.slice(0, MAX_MAPS).map((m) => {
    const jitter = () => rand(-0.05, 0.05);
    const warpJitter = () => rand(-0.1, 0.1);
    return {
      ...m,
      probability: Math.max(0.0001, m.probability + jitter()),
      affine: {
        a11: m.affine.a11 + jitter(),
        a12: m.affine.a12 + jitter(),
        a21: m.affine.a21 + jitter(),
        a22: m.affine.a22 + jitter(),
        b1: m.affine.b1 + jitter(),
        b2: m.affine.b2 + jitter(),
      },
      warp: {
        ...m.warp,
        a1: m.warp.a1 + warpJitter(),
        a2: m.warp.a2 + warpJitter(),
        a3: m.warp.a3 + warpJitter(),
        a4: m.warp.a4 + warpJitter(),
        k1: m.warp.k1 + warpJitter(),
        k2: m.warp.k2 + warpJitter(),
        k3: m.warp.k3 + warpJitter(),
        k4: m.warp.k4 + warpJitter(),
      },
    };
  });

  return {
    preset: clampPreset(next),
    sim: clampSim(p.sim),
    render: clampRender(p.render),
  };
}
