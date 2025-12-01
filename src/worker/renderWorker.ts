import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams, paletteToId, WorkerDiagnostics } from '../engine/types';
import {
  FIT_VIEW_MARGIN,
  BOUNDS_SAMPLE_SIZE,
  DEFAULT_EXPOSURE,
  DEFAULT_GAMMA,
  DEFAULT_DECAY,
  DEFAULT_BURN_IN,
  DEFAULT_MAX_POST_FPS,
  DEFAULT_SIM_STEPS_PER_TICK,
} from '../engine/constants';
import { PostprocessPass } from '../engine/gl/postprocessPass';
import { TransformFeedbackSim } from '../engine/gl/transformFeedbackSim';
import { AccumulatePass } from '../engine/gl/accumulatePass';
import pointVertSrc from '../shaders/points.vert.glsl?raw';
import pointFragSrc from '../shaders/points.frag.glsl?raw';

class RenderWorker {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: OffscreenCanvas | null = null;
  private capabilities: GLCapabilities | null = null;
  private preset: Preset | null = null;
  private simParams: SimParams | null = null;
  private renderParams: RenderParams | null = null;
  private loopHandle: number | null = null;
  private pixelWidth = 0;
  private pixelHeight = 0;
  private postprocess: PostprocessPass | null = null;
  private sim: TransformFeedbackSim | null = null;
  private pointProgram: WebGLProgram | null = null;
  private pointColorLoc: WebGLUniformLocation | null = null;
  private pointSizeLoc: WebGLUniformLocation | null = null;
  private pointViewScaleLoc: WebGLUniformLocation | null = null;
  private pointViewOffsetLoc: WebGLUniformLocation | null = null;
  private pointBurnInLoc: WebGLUniformLocation | null = null;
  private pointPosLoc = -1;
  private pointAgeLoc = -1;
  private accumulate: AccumulatePass | null = null;
  private frameIndex = 0;
  private lastView: { scale: number; offset: { x: number; y: number } } | null = null;
  private diagLastSent = 0;
  private fpsEstimate = 0;
  private lastRenderTime = 0;
  private lastTiming = { simMs: 0, drawMs: 0, frameMs: 0 };
  private lastFrameStart = 0;

  init(msg: Extract<MainToWorkerMsg, { type: 'init' }>) {
    this.canvas = msg.canvas;
    this.preset = msg.preset;
    this.simParams = msg.sim;
    this.renderParams = msg.render;
    this.lastView = this.preset.view ?? { scale: 1, offset: { x: 0, y: 0 } };
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

      this.recreateSim();
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
    const viewChanged = JSON.stringify(prevPreset?.view) !== JSON.stringify(preset.view);
    const mapsChanged = JSON.stringify(prevPreset?.maps || []) !== JSON.stringify(preset.maps);
    const simChanged =
      !prevSim ||
      prevSim.numPoints !== sim.numPoints ||
      prevSim.seed !== sim.seed ||
      prevSim.burnIn !== sim.burnIn ||
      (prevSim.itersPerStep ?? 16) !== (sim.itersPerStep ?? 16) ||
      (prevSim.useGuard ?? true) !== (sim.useGuard ?? true);

    this.preset = preset;
    this.simParams = sim;
    this.renderParams = render;

    if (simChanged || !this.sim) {
      this.recreateSim();
    } else if (this.sim) {
      this.sim.setParams({ ...sim, itersPerStep: sim.itersPerStep ?? 16, useGuard: sim.useGuard ?? true });
    }

    if (this.sim) {
      if (mapsChanged) {
        this.sim.setMaps(preset.maps);
      }
      const viewScale = this.preset.view?.scale ?? 1;
      const viewOffset = this.preset.view?.offset ?? { x: 0, y: 0 };
      this.sim.setView(viewScale, viewOffset);
    }

    if (mapsChanged || simChanged || viewChanged) {
      this.resetAccumulation();
    }

    this.lastView = this.preset.view ?? this.lastView ?? { scale: 1, offset: { x: 0, y: 0 } };
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
    const tick = () => {
      if (!this.gl) {
        this.loopHandle = null;
        return;
      }
      const now = performance.now();
      const delay = this.computeFrameDelay(now);
      if (delay > 0) {
        this.loopHandle = setTimeout(tick, delay);
        return;
      }
      this.renderSim(now);
      this.loopHandle = setTimeout(tick, 0);
    };
    this.loopHandle = setTimeout(tick, 0);
  }

  private stopLoop() {
    if (this.loopHandle !== null) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private renderSim(time: number) {
    if (!this.gl || !this.postprocess || !this.sim || !this.pointProgram || !this.accumulate) {
      return;
    }
    this.lastFrameStart = time;
    const gl = this.gl;

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (this.lastRenderTime > 0) {
      const dt = time - this.lastRenderTime;
      if (dt > 0) {
        const instFps = 1000 / dt;
        this.fpsEstimate = this.fpsEstimate === 0 ? instFps : this.fpsEstimate * 0.9 + instFps * 0.1;
        this.lastTiming.frameMs = dt;
      }
    }
    this.lastRenderTime = time;

    const steps = Math.max(1, this.simParams?.simStepsPerTick ?? DEFAULT_SIM_STEPS_PER_TICK);
    const viewScale = this.preset?.view?.scale ?? 1.0;
    const viewOffset = this.preset?.view?.offset ?? { x: 0, y: 0 };
    const burnInFrames = this.simParams?.burnIn ?? DEFAULT_BURN_IN;

    const tSimStart = performance.now();
    const tDrawStart = performance.now();
    this.accumulate.beginFrame(this.renderParams?.decay ?? DEFAULT_DECAY);

    for (let i = 0; i < steps; i++) {
      this.sim.step(this.frameIndex);

      gl.useProgram(this.pointProgram);
      if (this.pointPosLoc < 0) {
        this.pointPosLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
        this.pointAgeLoc = gl.getAttribLocation(this.pointProgram, 'a_age');
      }
      if (this.pointPosLoc < 0) return;
      this.sim.bindForRender(this.pointPosLoc, this.pointAgeLoc);

      if (this.pointColorLoc) gl.uniform3f(this.pointColorLoc, 1.0, 1.0, 1.0);
      if (this.pointViewScaleLoc) gl.uniform2f(this.pointViewScaleLoc, viewScale, viewScale);
      if (this.pointViewOffsetLoc) gl.uniform2f(this.pointViewOffsetLoc, viewOffset.x, viewOffset.y);
      if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, 1.5);
      if (this.pointBurnInLoc) gl.uniform1f(this.pointBurnInLoc, burnInFrames);

      if (this.frameIndex >= (this.simParams?.burnIn ?? DEFAULT_BURN_IN)) {
        this.accumulate.drawPoints(this.sim.getNumPoints(), 1.5);
      }
      this.frameIndex++;
    }
    this.accumulate.endFrame();
    gl.bindVertexArray(null);

    this.lastTiming.drawMs = performance.now() - tDrawStart;
    this.lastTiming.simMs = performance.now() - tSimStart;

    // Postprocess every frame to prevent strobing
    const densityTex = this.accumulate.getTexture();
    this.postprocess.render({
      width: this.pixelWidth,
      height: this.pixelHeight,
      exposure: this.renderParams?.exposure ?? DEFAULT_EXPOSURE,
      gamma: this.renderParams?.gamma ?? DEFAULT_GAMMA,
      paletteId: paletteToId(this.renderParams?.palette ?? 'grayscale'),
      invert: !!this.renderParams?.invert,
      densityTex,
    });

    this.maybeSendDiagnostics(time);
  }

  private setSize(width: number, height: number, dpr: number) {
    this.pixelWidth = Math.max(1, Math.floor(width * dpr));
    this.pixelHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas) {
      this.canvas.width = this.pixelWidth;
      this.canvas.height = this.pixelHeight;
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
    const scale = 2 / Math.max(width, height || 1e-6) / FIT_VIEW_MARGIN;
    this.preset = {
      ...this.preset,
      view: {
        scale,
        offset: { x: -cx * scale, y: -cy * scale },
      },
    };
    if (this.sim) {
      this.sim.setView(scale, { x: -cx * scale, y: -cy * scale });
    }
    this.lastView = this.preset.view ?? { scale, offset: { x: -cx * scale, y: -cy * scale } };
  }

  handleFitRequest(warmup: number) {
    if (!this.sim || !this.preset) return;
    for (let i = 0; i < warmup; i++) {
      this.sim.step(this.frameIndex);
      this.frameIndex++;
    }
    const bounds = this.sim.sampleBounds(BOUNDS_SAMPLE_SIZE);
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
    this.pointBurnInLoc = gl.getUniformLocation(this.pointProgram, 'u_burnInFrames');
    this.pointPosLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    this.pointAgeLoc = gl.getAttribLocation(this.pointProgram, 'a_age');
  }

  private recreateSim() {
    if (!this.gl || !this.simParams || !this.preset) return;
    this.sim?.dispose();

    const iters = this.simParams.itersPerStep ?? 16;
    const useGuard = this.simParams.useGuard ?? true;
    this.sim = new TransformFeedbackSim(this.gl, {
      numPoints: this.simParams.numPoints,
      seed: this.simParams.seed,
      itersPerStep: iters,
      useGuard,
    });

    this.sim.setMaps(this.preset.maps);
    const viewScale = this.preset.view?.scale ?? 1;
    const viewOffset = this.preset.view?.offset ?? { x: 0, y: 0 };
    this.sim.setView(viewScale, viewOffset);
  }

  private postMessage(msg: WorkerToMainMsg) {
    self.postMessage(msg);
  }

  private postError(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Worker]', err);
    this.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }

  private computeFrameDelay(now: number): number {
    const maxFps = Math.max(1, this.simParams?.maxPostFps ?? DEFAULT_MAX_POST_FPS);
    const minInterval = 1000 / maxFps;
    if (this.lastFrameStart <= 0) return 0;
    const elapsed = now - this.lastFrameStart;
    return elapsed < minInterval ? minInterval - elapsed : 0;
  }

  private maybeSendDiagnostics(timeMs: number) {
    if (!this.sim || !this.preset) return;
    if (timeMs - this.diagLastSent < 500) return;
    const burnIn = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    const drawnPoints = this.frameIndex >= burnIn ? this.sim.getNumPoints() : 0;
    const diag: WorkerDiagnostics = {
      frame: this.frameIndex,
      fps: this.fpsEstimate,
      drawnPoints,
      simMs: this.lastTiming.simMs,
      drawMs: this.lastTiming.drawMs,
      frameMs: this.lastTiming.frameMs,
    };
    this.postMessage({ type: 'diag', data: diag });
    this.diagLastSent = timeMs;
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
    case 'resetAccum':
      worker.resetAccumulation();
      break;
    case 'dispose':
      worker.dispose();
      break;
  }
};
