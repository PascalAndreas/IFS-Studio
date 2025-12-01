# IFS Studio – Nonlinear IFS Synth/Lab

GPU worker-driven Iterated Function Systems playground with transform feedback simulation, additive accumulation, palette-based tone mapping, and live editing.

## Current capabilities
- **Worker + OffscreenCanvas**: All WebGL runs in a dedicated worker; UI stays responsive.
- **Transform Feedback sim**: GPU updates positions via map CDF selection, affine A/b, and optional sinusoidal warp.
- **Accumulation pipeline**: Ping-pong FBOs with decay pass + additive point draw (float targets when supported).
- **Postprocess**: Log/exposure/gamma, palettes (grayscale/magma/viridis/turbo), invert toggle.
- **Interaction**: Pan (drag), zoom (wheel), fit-to-view (double-click/button), axis overlays that track view.
- **Editing**: Map editor (probability, A/b, warp a1–a4 k1–k4, add/dup/remove up to 8), randomize/mutate maps, burn-in respected, sim/render kept as separate settings.
- **IO**: Export/import JSON (bundle of preset + sim + render), auto-fit on randomize.

## Quick start
```bash
npm install
npm run dev   # http://localhost:5173
npm run build
```

## Controls
- Pan: click-drag on canvas
- Zoom: mouse wheel (centers on cursor)
- Fit view: double-click canvas or button in panel
- Pause/Play: sidebar toggle
- Randomize/Mutate: map-only changes; sim/render preserved

## Data model
- **Preset**: `{ name, maps[], view? }` where `maps` contain affine A/b, warp, probability. `view` holds `scale/offset`.
- **SimParams**: `{ numPoints, burnIn, seed }`
- **RenderParams**: `{ decay, exposure, gamma, palette, invert? }`
- Export/import JSON packs `{ preset, sim, render }` (legacy preset-only still loads).

## Project structure (selected)
```
src/
  engine/
    gl/           # capabilities, utils, accumulation, postprocess, TF sim
    types.ts      # preset (maps/view), sim/render params, messaging
  shaders/        # GLSL sources (TF sim, points, accumulation, postprocess)
  worker/         # renderWorker.ts (loop + messaging)
  ui/             # Canvas bridge, overlay panels, preset utils
  App.tsx         # state wiring (preset/sim/render)
```

## Pipeline details
- **Sim (TF)**: Per-particle map selection via CDF; affine transform; optional warp (`p.x += a1 sin(k1 p.x)+a2 cos(k2 p.y)`, `p.y += a3 sin(k3 p.y)+a4 cos(k4 p.x)`); ping-pong buffers.
- **Accumulation**: `next = decay * prev` fullscreen pass, then additive GL_POINTS into `next`; swap each frame.
- **Postprocess**: Sample density.r → log/exposure/gamma → palette → screen quad.
- **View**: Point shader applies `p*scale + offset`; fit samples TF buffer to compute bounds with margin.

## TODO / next directions
- Screenshots for docs.
- Infinite zoom: simulate only visible region, spawn/retire particles as view changes.
- OffscreenCanvas fallback for browsers without support.
- Postprocess rework: adaptive tone mapping, better dynamic range.
- By-map coloring (RGB accumulation) to highlight structure.
- Better randomize/mutate strategies and curated presets.

## License
MIT
