import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams } from '../engine/types';
import { PostprocessPass } from '../engine/gl/postprocessPass';
import { TransformFeedbackSim } from '../engine/gl/transformFeedbackSim';
import { AccumulatePass } from '../engine/gl/accumulatePass';
import pointVertSrc from '../shaders/points.vert.glsl?raw';
import pointFragSrc from '../shaders/points.frag.glsl?raw';

type RafHandle = number | null;

const requestFrame: (cb: FrameRequestCallback) => number =
  (self as any).requestAnimationFrame?.bind(self) ??
  ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));

const cancelFrame: (handle: number) => void =
  (self as any).cancelAnimationFrame?.bind(self) ?? ((handle: number) => clearTimeout(handle));

class RenderWorker {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: OffscreenCanvas | null = null;
  private capabilities: GLCapabilities | null = null;
  private preset: Preset | null = null;
  private simParams: SimParams | null = null;
  private renderParams: RenderParams | null = null;
  private loopHandle: RafHandle = null;
  private isPaused = false;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private animationSpeed = 1;
  private postprocess: PostprocessPass | null = null;
  private sim: TransformFeedbackSim | null = null;
  private pointProgram: WebGLProgram | null = null;
  private pointColorLoc: WebGLUniformLocation | null = null;
  private pointSizeLoc: WebGLUniformLocation | null = null;
  private pointViewScaleLoc: WebGLUniformLocation | null = null;
  private pointViewOffsetLoc: WebGLUniformLocation | null = null;
  private accumulate: AccumulatePass | null = null;
  private frameIndex = 0;

  init(msg: Extract<MainToWorkerMsg, { type: 'init' }>) {
    this.canvas = msg.canvas;
    this.preset = msg.preset;
    this.simParams = msg.sim;
    this.renderParams = msg.render;
    this.animationSpeed = this.computeAnimationSpeed();
    this.setSize(msg.width, msg.height, msg.dpr);

    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      this.postError(new Error('WebGL2 not supported'));
      return;
    }

    this.gl = gl;

    try {
      this.capabilities = detectCapabilities(gl);
      logCapabilities(this.capabilities);

      this.postprocess = new PostprocessPass(gl);
      this.postprocess.resize(this.pixelWidth, this.pixelHeight);

      const useFloat = !!(this.capabilities.hasColorBufferFloat && this.capabilities.hasFloatBlend);
      this.accumulate = new AccumulatePass(gl, {
        width: this.pixelWidth,
        height: this.pixelHeight,
        useFloat,
      });

      this.sim = new TransformFeedbackSim(gl, {
        numPoints: this.simParams!.numPoints,
        seed: this.simParams!.seed,
      });
      this.sim.setMaps(this.preset.maps);
      this.initPointProgram();

      this.postMessage({ type: 'ready', capabilities: this.capabilities });
      this.startLoop();
    } catch (error) {
      this.postError(error);
    }
  }

  updateConfig(preset: Preset, sim: SimParams, render: RenderParams) {
    const prevPreset = this.preset;
    const prevSim = this.simParams;
    const mapsChanged = JSON.stringify(prevPreset?.maps || []) !== JSON.stringify(preset.maps);
    const viewChanged = JSON.stringify(prevPreset?.view) !== JSON.stringify(preset.view);
    const simChanged =
      !prevSim || prevSim.numPoints !== sim.numPoints || prevSim.seed !== sim.seed || prevSim.burnIn !== sim.burnIn;

    this.preset = preset;
    this.simParams = sim;
    this.renderParams = render;
    this.animationSpeed = this.computeAnimationSpeed();

    if (this.sim) {
      this.sim.setParams(sim);
      if (mapsChanged) this.sim.setMaps(preset.maps);
    }

    if (mapsChanged || simChanged || viewChanged) {
      this.resetAccumulation();
    }
  }

  setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) {
      this.stopLoop();
    } else {
      this.startLoop();
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.setSize(width, height, dpr);
    if (this.gl) {
      this.gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    }
    this.postprocess?.resize(this.pixelWidth, this.pixelHeight);
    this.accumulate?.resize(this.pixelWidth, this.pixelHeight);
  }

  dispose() {
    this.stopLoop();
    this.postprocess?.dispose();
    this.sim?.dispose();
    this.accumulate?.dispose();
    if (this.pointProgram && this.gl) {
      this.gl.deleteProgram(this.pointProgram);
    }
    const loseContext = this.gl?.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
    this.gl = null;
    this.canvas = null;
  }

  private startLoop() {
    if (this.loopHandle !== null || !this.gl) {
      return;
    }
    const tick = (time: number) => {
      if (this.isPaused || !this.gl) {
        this.loopHandle = null;
        return;
      }
      this.render(time);
      this.loopHandle = requestFrame(tick);
    };
    this.loopHandle = requestFrame(tick);
  }

  private stopLoop() {
    if (this.loopHandle !== null) {
      cancelFrame(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private render(time: number) {
    if (!this.gl || !this.postprocess || !this.sim || !this.pointProgram || !this.accumulate) {
      return;
    }
    const gl = this.gl;

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const exposure = this.renderParams?.exposure ?? 1.0;
    const gamma = this.renderParams?.gamma ?? 2.2;
    const paletteId = this.paletteToId(this.renderParams?.palette ?? 'grayscale');
    const invert = !!this.renderParams?.invert;
    const timeSec = (time * 0.001) * this.animationSpeed;

    // Update simulation
    this.sim.step(this.frameIndex++);

    // Begin accumulation: decay previous frame into write target
    this.accumulate.beginFrame(this.renderParams?.decay ?? 0.99);

    // Render points additively into accumulation target
    gl.useProgram(this.pointProgram);
    const posLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    if (posLoc < 0) return;
    this.sim.bindForRender(posLoc);

    if (this.pointColorLoc) gl.uniform3f(this.pointColorLoc, 1.0, 1.0, 1.0);
    const viewScale = this.preset?.view?.scale ?? 1.0;
    const viewOffset = this.preset?.view?.offset ?? { x: 0, y: 0 };
    if (this.pointViewScaleLoc) gl.uniform2f(this.pointViewScaleLoc, viewScale, viewScale);
    if (this.pointViewOffsetLoc) gl.uniform2f(this.pointViewOffsetLoc, viewOffset.x, viewOffset.y);
    if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, 1.5);

    if (this.frameIndex >= (this.simParams?.burnIn ?? 0)) {
      this.accumulate.drawPoints(this.sim.getNumPoints(), 1.5);
    }
    this.accumulate.endFrame();

    const densityTex = this.accumulate.getTexture();
    this.postprocess.render({
      timeSec,
      width: this.pixelWidth,
      height: this.pixelHeight,
      exposure,
      gamma,
      paletteId,
      invert,
      densityTex,
    });

    gl.bindVertexArray(null);
  }

  private setSize(width: number, height: number, dpr: number) {
    this.pixelWidth = Math.max(1, Math.floor(width * dpr));
    this.pixelHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas) {
      this.canvas.width = this.pixelWidth;
      this.canvas.height = this.pixelHeight;
    }
  }

  private computeAnimationSpeed(): number {
    // Tie the simple animation to preset values so preset updates are observable.
    return this.renderParams ? 0.5 + Math.min(1.5, Math.max(0.2, this.renderParams.decay)) : 1;
  }

  private paletteToId(p: string): number {
    switch (p) {
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

  resetAccumulation() {
    this.frameIndex = 0;
    this.accumulate?.clear();
  }

  fitView(bounds: { min: { x: number; y: number }; max: { x: number; y: number } }) {
    if (!this.preset) return;
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    const cx = (bounds.max.x + bounds.min.x) * 0.5;
    const cy = (bounds.max.y + bounds.min.y) * 0.5;
    const margin = 1.2;
    const scale = 2 / Math.max(width, height || 1e-6) / margin;
    this.preset = {
      ...this.preset,
      view: {
        scale,
        offset: { x: -cx * scale, y: -cy * scale },
      },
    };
  }

  handleFitRequest(warmup: number) {
    if (!this.sim || !this.preset) return;
    for (let i = 0; i < warmup; i++) {
      this.sim.step(this.frameIndex++);
    }
    const bounds = this.sim.sampleBounds(4096);
    const prevView = this.preset.view;
    this.fitView(bounds);
    if (
      !prevView ||
      prevView.scale !== this.preset.view?.scale ||
      prevView.offset.x !== this.preset.view?.offset.x ||
      prevView.offset.y !== this.preset.view?.offset.y
    ) {
      this.resetAccumulation();
      this.postMessage({ type: 'fitResult', view: this.preset.view! });
    }
  }

  private initPointProgram() {
    if (!this.gl) return;
    const gl = this.gl;
    this.pointProgram = gl.createProgram();
    if (!this.pointProgram) throw new Error('Failed to create point program');

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, pointVertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error(`Point VS compile error: ${gl.getShaderInfoLog(vs) || ''}`);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, pointFragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error(`Point FS compile error: ${gl.getShaderInfoLog(fs) || ''}`);
    }

    gl.attachShader(this.pointProgram, vs);
    gl.attachShader(this.pointProgram, fs);
    gl.linkProgram(this.pointProgram);
    if (!gl.getProgramParameter(this.pointProgram, gl.LINK_STATUS)) {
      throw new Error(`Point program link error: ${gl.getProgramInfoLog(this.pointProgram) || ''}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.pointColorLoc = gl.getUniformLocation(this.pointProgram, 'u_color');
    this.pointSizeLoc = gl.getUniformLocation(this.pointProgram, 'u_pointSize');
    this.pointViewScaleLoc = gl.getUniformLocation(this.pointProgram, 'u_viewScale');
    this.pointViewOffsetLoc = gl.getUniformLocation(this.pointProgram, 'u_viewOffset');
  }

  private postMessage(msg: WorkerToMainMsg) {
    self.postMessage(msg);
  }

  private postError(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Worker]', err);
    this.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
}

const worker = new RenderWorker();

self.onmessage = (event: MessageEvent<MainToWorkerMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
      worker.init(msg);
      break;
    case 'resize':
      worker.resize(msg.width, msg.height, msg.dpr);
      break;
    case 'updateConfig':
      worker.updateConfig(msg.preset, msg.sim, msg.render);
      break;
    case 'fitView':
      worker.handleFitRequest(msg.warmup);
      break;
    case 'setPaused':
      worker.setPaused(msg.paused);
      break;
    case 'resetAccum':
      worker['resetAccumulation']();
      break;
    case 'dispose':
      worker.dispose();
      break;
  }
};
