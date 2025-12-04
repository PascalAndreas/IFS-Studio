import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams, paletteToId, WorkerDiagnostics } from '../engine/types';
import {
  FIT_VIEW_MARGIN,
  BOUNDS_SAMPLE_SIZE,
  DEFAULT_EXPOSURE,
  DEFAULT_GAMMA,
  DEFAULT_DECAY,
  DEFAULT_PALETTE,
  DEFAULT_BURN_IN,
  DEFAULT_MAX_POST_FPS,
  DEFAULT_SIM_STEPS_PER_TICK,
  DEFAULT_AUTO_EXPOSURE_KEY,
  DEFAULT_AUTO_EXPOSURE,
  DIAGNOSTICS_EMA_ALPHA,
} from '../engine/constants';
import { PostprocessPass } from '../engine/gl/postprocessPass';
import { TransformFeedbackSim } from '../engine/gl/transformFeedbackSim';
import { AccumulatePass } from '../engine/gl/accumulatePass';
import { createProgram } from '../engine/gl/glUtils';
import pointVertSrc from '../shaders/points.vert.glsl?raw';
import pointFragSrc from '../shaders/points.frag.glsl?raw';

type GpuTimerLabel = 'sim' | 'accum' | 'decay' | 'mipmap' | 'post';

// ------------------------------------------------------------
// RenderWorker: orchestrates sim, accumulation, postprocess
// ------------------------------------------------------------
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
  private pointSizeLoc: WebGLUniformLocation | null = null;
  private pointViewScaleLoc: WebGLUniformLocation | null = null;
  private pointViewOffsetLoc: WebGLUniformLocation | null = null;
  private pointPosLoc = -1;
  private accumulate: AccumulatePass | null = null;
  private frameIndex = 0; // sim frame counter (do not reset on view-only changes)
  private accumClears = 0;
  private timerExt: any = null;
  private gpuTimerLabel = new Map<WebGLQuery, GpuTimerLabel>();
  private pendingTimerQueries: WebGLQuery[] = [];
  private gpuEma: Record<GpuTimerLabel, number> = { sim: 0, accum: 0, decay: 0, mipmap: 0, post: 0 };
  private lastView: { scale: number; offset: { x: number; y: number } } | null = null;
  private diagLastSent = 0;
  private fpsEstimate = 0;
  private lastRenderTime = 0;
  private lastTiming = { frameMs: 0 };
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
      this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

      this.postprocess = new PostprocessPass(gl);

      this.accumulate = new AccumulatePass(gl, {
        width: this.pixelWidth,
        height: this.pixelHeight,
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

    this.ensureAccumulate();

    if (mapsChanged || simChanged) {
      this.resetAccumulation();
      this.resetFrameIndex();
    } else if (viewChanged) {
      this.resetAccumulation();
    }

    this.lastView = this.preset.view ?? this.lastView ?? { scale: 1, offset: { x: 0, y: 0 } };
  }

  resize(width: number, height: number, dpr: number) {
    this.setSize(width, height, dpr);
    if (this.gl) {
      this.gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    }
    this.accumulate?.resize(this.pixelWidth, this.pixelHeight);
  }

  dispose() {
    this.stopLoop();
    this.postprocess?.dispose();
    this.sim?.dispose();
    this.accumulate?.dispose();
    if (this.gl && this.timerExt) {
      for (const query of this.pendingTimerQueries) {
        this.gl.deleteQuery(query);
      }
    }
    this.gpuTimerLabel.clear();
    this.pendingTimerQueries = [];
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
        this.fpsEstimate = this.fpsEstimate === 0 ? instFps : this.fpsEstimate * (1 - DIAGNOSTICS_EMA_ALPHA) + instFps * DIAGNOSTICS_EMA_ALPHA;
        this.lastTiming.frameMs = dt;
      }
    }
    this.lastRenderTime = time;

    const steps = Math.max(1, this.simParams?.simStepsPerTick ?? DEFAULT_SIM_STEPS_PER_TICK);
    const viewScale = this.preset?.view?.scale ?? 1.0;
    const viewOffset = this.preset?.view?.offset ?? { x: 0, y: 0 };
    const burnInFrames = this.simParams?.burnIn ?? DEFAULT_BURN_IN;

    const decayQuery = this.beginGpuTimer('decay');
    this.accumulate.beginFrame(this.renderParams?.decay ?? DEFAULT_DECAY);
    this.endGpuTimer(decayQuery);

    if (this.pointPosLoc < 0) {
      this.pointPosLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    }
    if (this.pointPosLoc < 0) return;
    gl.useProgram(this.pointProgram);
    if (this.pointViewScaleLoc) gl.uniform2f(this.pointViewScaleLoc, viewScale, viewScale);
    if (this.pointViewOffsetLoc) gl.uniform2f(this.pointViewOffsetLoc, viewOffset.x, viewOffset.y);
    if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, 1.5);

    for (let i = 0; i < steps; i++) {
      const simQuery = this.beginGpuTimer('sim');
      this.sim.step(this.frameIndex);
      this.endGpuTimer(simQuery);

      gl.useProgram(this.pointProgram);
      this.sim.bindForRender(this.pointPosLoc);

      const accumQuery = this.beginGpuTimer('accum');
      if (this.frameIndex >= burnInFrames) {
        this.accumulate.drawPoints(this.sim.getNumPoints(), 1.5);
      }
      this.endGpuTimer(accumQuery);

      this.frameIndex++;
    }
    this.accumulate.endFrame();
    gl.bindVertexArray(null);

    // Mipmap generation for auto-exposure
    const mipmapQuery = this.beginGpuTimer('mipmap');
    this.accumulate.prepareForSampling();
    this.endGpuTimer(mipmapQuery);

    // Postprocess every frame to prevent strobing
    const densityTex = this.accumulate.getTexture();
    const maxDim = Math.max(this.pixelWidth, this.pixelHeight);
    const avgMip = Math.max(0, Math.floor(Math.log2(Math.max(1, maxDim))));
    const postQuery = this.beginGpuTimer('post');
    this.postprocess.render({
      exposure: this.renderParams?.exposure ?? DEFAULT_EXPOSURE,
      gamma: this.renderParams?.gamma ?? DEFAULT_GAMMA,
      paletteId: paletteToId(this.renderParams?.palette ?? DEFAULT_PALETTE),
      invert: !!this.renderParams?.invert,
      densityTex,
      autoExposure: this.renderParams?.autoExposure ?? DEFAULT_AUTO_EXPOSURE,
      autoKey: DEFAULT_AUTO_EXPOSURE_KEY,
      avgMip,
    });
    this.endGpuTimer(postQuery);

    this.pollGpuTimers();

    this.maybeSendDiagnostics(time);
  }

  // ------------------------------------------------------------
  // Sizing & view
  // ------------------------------------------------------------
  private setSize(width: number, height: number, dpr: number) {
    this.pixelWidth = Math.max(1, Math.floor(width * dpr));
    this.pixelHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas) {
      this.canvas.width = this.pixelWidth;
      this.canvas.height = this.pixelHeight;
    }
  }
  resetFrameIndex() {
    this.frameIndex = 0;
  }
  resetAccumulation() {
    this.accumClears++;
    this.accumulate?.clear();
  }

  // ------------------------------------------------------------
  // View fitting
  // ------------------------------------------------------------
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

    this.pointProgram = createProgram(gl, {
      vertexSource: pointVertSrc,
      fragmentSource: pointFragSrc,
    });

    this.pointSizeLoc = gl.getUniformLocation(this.pointProgram, 'u_pointSize');
    this.pointViewScaleLoc = gl.getUniformLocation(this.pointProgram, 'u_viewScale');
    this.pointViewOffsetLoc = gl.getUniformLocation(this.pointProgram, 'u_viewOffset');
    this.pointPosLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
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
    this.frameIndex = 0;

    // Recreate accumulation buffers if sim settings demand it (e.g., float toggle).
    this.ensureAccumulate();
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

  // ------------------------------------------------------------
  // Accumulation buffers
  // ------------------------------------------------------------
  private ensureAccumulate() {
    if (!this.gl) return;
    if (!this.accumulate) {
      this.accumulate = new AccumulatePass(this.gl, {
        width: this.pixelWidth,
        height: this.pixelHeight,
      });
    }
  }

  // ------------------------------------------------------------
  // GPU timing helpers (EMA-based)
  // ------------------------------------------------------------
  private beginGpuTimer(label: GpuTimerLabel): WebGLQuery | null {
    if (!this.gl || !this.timerExt) return null;
    const q = this.gl.createQuery();
    if (!q) return null;
    this.gpuTimerLabel.set(q, label);
    this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    return q;
  }

  private endGpuTimer(query: WebGLQuery | null) {
    if (!query || !this.gl || !this.timerExt) return;
    this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    if (this.gpuTimerLabel.has(query)) {
      this.pendingTimerQueries.push(query);
    }
  }

  /**
   * Compute EMA alpha adjusted for update frequency.
   * sim and accum get `steps` updates per frame, so we adjust alpha
   * so they have the same half-life as labels that get 1 update per frame.
   * For same half-life: (1 - alpha_adjusted)^steps = (1 - alpha_base)^1
   * => alpha_adjusted = 1 - (1 - alpha_base)^(1/steps)
   */
  private getAdjustedAlpha(label: GpuTimerLabel): number {
    const steps = Math.max(1, this.simParams?.simStepsPerTick ?? DEFAULT_SIM_STEPS_PER_TICK);
    if (label === 'sim' || label === 'accum') {
      return 1 - Math.pow(1 - DIAGNOSTICS_EMA_ALPHA, 1 / steps);
    }
    return DIAGNOSTICS_EMA_ALPHA;
  }

  private recordGpuTime(label: GpuTimerLabel, ms: number) {
    const alpha = this.getAdjustedAlpha(label);
    const prev = this.gpuEma[label];
    this.gpuEma[label] = prev === 0 ? ms : prev * (1 - alpha) + ms * alpha;
  }

  private pollGpuTimers() {
    if (!this.timerExt || !this.pendingTimerQueries.length || !this.gl) return;
    const ext = this.timerExt;
    const remaining: WebGLQuery[] = [];
    for (const query of this.pendingTimerQueries) {
      const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE);
      const disjoint = this.gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (available && !disjoint) {
        const ns = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT);
        const label = this.gpuTimerLabel.get(query);
        if (typeof ns === 'number' && label) {
          this.recordGpuTime(label, ns / 1e6);
        }
        this.gpuTimerLabel.delete(query);
        this.gl.deleteQuery(query);
      } else if (!available) {
        remaining.push(query);
      } else {
        this.gpuTimerLabel.delete(query);
        this.gl.deleteQuery(query);
      }
    }
    this.pendingTimerQueries = remaining;
  }

  private maybeSendDiagnostics(timeMs: number) {
    if (!this.sim || !this.preset) return;
    if (timeMs - this.diagLastSent < 500) return;
    const burnIn = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    const drawnPoints = this.frameIndex >= burnIn ? this.sim.getNumPoints() : 0;
    const steps = Math.max(1, this.simParams?.simStepsPerTick ?? DEFAULT_SIM_STEPS_PER_TICK);
    // Multiply per-step EMAs by steps to get per-frame totals
    const diag: WorkerDiagnostics = {
      frame: this.frameIndex,
      fps: this.fpsEstimate,
      drawnPoints,
      frameMs: this.lastTiming.frameMs,
      gpuSimMs: this.gpuEma.sim * steps,
      gpuAccumMs: this.gpuEma.accum * steps,
      gpuDecayMs: this.gpuEma.decay,
      gpuMipmapMs: this.gpuEma.mipmap,
      gpuPostMs: this.gpuEma.post,
      accumClears: this.accumClears || undefined,
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
      worker.resetFrameIndex();
      worker.resetAccumulation();
      break;
    case 'dispose':
      worker.dispose();
      break;
  }
};
