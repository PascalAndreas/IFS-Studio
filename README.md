# IFS Studio - Nonlinear IFS Synth/Lab

A generative art web application for creating and exploring Iterated Function Systems (IFS) with nonlinear warping, powered by WebGL2.

## Features

- **GPU-Accelerated Simulation**: All computation runs on the GPU using WebGL2 transform feedback
- **Web Worker Rendering**: WebGL runs in a dedicated worker thread using OffscreenCanvas for zero UI jank
- **Nonlinear IFS**: Support for affine transformations + sinusoidal warping parameters
- **Real-time Controls**: Adjust parameters on the fly with immediate visual feedback
- **Preset System**: Export and import preset configurations as JSON

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React** - UI framework
- **TypeScript** - Type-safe development
- **WebGL2** - GPU-accelerated rendering with transform feedback
- **Web Workers** - Offscreen rendering thread

## Project Structure

```
src/
├── engine/
│   ├── gl/
│   │   ├── capabilities.ts          # WebGL capability detection
│   │   ├── glUtils.ts               # Shader compilation, buffer/texture helpers
│   │   ├── transformFeedbackSim.ts  # GPU particle simulation with transform feedback
│   │   ├── accumulatePass.ts        # Additive accumulation rendering
│   │   └── postprocessPass.ts       # Tone mapping and display
│   └── types.ts                     # Type definitions and preset schema
├── worker/
│   └── renderWorker.ts              # WebGL worker thread
├── ui/
│   ├── ControlPanel.tsx             # Left sidebar controls
│   └── Canvas.tsx                   # Canvas element and worker bridge
├── App.tsx                          # Main application component
└── main.tsx                         # Entry point
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## How It Works

### Transform Feedback Simulation

Each particle follows an IFS trajectory by repeatedly applying one of N transformation maps. Each frame:

1. For each particle, select a random map (weighted by probabilities)
2. Apply affine transformation: `x' = A * x + b`
3. Apply optional nonlinear warp: `x' += a1*sin(k1*x) + a2*sin(k2*y) + ...`
4. Write updated position to output buffer via transform feedback

### Accumulation Rendering

Points are rendered to an offscreen framebuffer with:
- Additive blending to build up density
- Per-frame decay for temporal fade
- Float texture format (if supported) for high dynamic range

### Postprocessing

Final display applies:
- Logarithmic tone mapping for density visualization
- Exposure and gamma controls
- Optional color palette (TODO)

## Preset Format

Presets are JSON files with the following structure:

```json
{
  "name": "My Preset",
  "sim": {
    "numPoints": 100000,
    "burnIn": 100,
    "seed": 42
  },
  "render": {
    "decay": 0.995,
    "exposure": 1.2,
    "gamma": 2.2
  },
  "maps": [
    {
      "affine": {
        "a11": 0.5, "a12": 0, "a21": 0, "a22": 0.5,
        "b1": 0, "b2": 0
      },
      "warp": {
        "enabled": false,
        "a1": 0, "a2": 0, "a3": 0, "a4": 0,
        "k1": 1, "k2": 1, "k3": 1, "k4": 1
      },
      "probability": 0.5
    }
  ]
}
```

## TODO

- [ ] Implement full transform feedback simulation loop
- [ ] Implement accumulation pass rendering
- [ ] Add map editor UI
- [ ] Add randomization presets
- [ ] Add color palette support
- [ ] Add zoom/pan controls
- [ ] Add screenshot export
- [ ] Add more example presets
- [ ] Add map visualization

## License

MIT

