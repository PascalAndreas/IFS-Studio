import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams, paletteToId, WorkerDiagnostics } from '../engine/types';
import { FIT_VIEW_MARGIN, BOUNDS_SAMPLE_SIZE, DEFAULT_EXPOSURE, DEFAULT_GAMMA, DEFAULT_DECAY, DEFAULT_BURN_IN } from '../engine/constants';
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
  private pixelWidth = 0;
  private pixelHeight = 0;
  private animationSpeed = 1;
  private postprocess: PostprocessPass | null = null;
  private simGlobal: TransformFeedbackSim | null = null;
  private simLocal: TransformFeedbackSim | null = null;
  private pointProgram: WebGLProgram | null = null;
  private pointColorLoc: WebGLUniformLocation | null = null;
  private pointSizeLoc: WebGLUniformLocation | null = null;
  private pointViewScaleLoc: WebGLUniformLocation | null = null;
  private pointViewOffsetLoc: WebGLUniformLocation | null = null;
  private pointBurnInLoc: WebGLUniformLocation | null = null;
  private accumulate: AccumulatePass | null = null;
  private frameIndex = 0;
  private respawnBoostFrames = 0;
  private readonly localFrac = 0.85;
  private readonly baseRespawnProbMin = 0.005;
  private readonly baseRespawnProbMax = 0.6;
  private readonly respawnGain = 1.2;
  private readonly boostRespawnProb = 0.8;
  private readonly boostDurationFrames = 30;
  private readonly respawnSampleCount = 16384;
  private readonly respawnMaxSeeds = 1024;
  private readonly respawnUpdateInterval = 4;
  private respawnInViewFraction = 0;
  private respawnSeedsCache: { x: number; y: number }[] = [];
  private lastView: { scale: number; offset: { x: number; y: number } } | null = null;
  private diagLastSent = 0;
  private fpsEstimate = 0;
  private lastRenderTime = 0;
  private currentRespawnProb = 0;
  private lastRespawnDiag: {
    localSample: number;
    localInView: number;
    seeds: number;
    seedsSource: 'local' | 'global' | 'cache' | 'none';
    localAgeGeBurn: number;
    globalAgeGeBurn: number;
    localAgeGeBurnInView: number;
    globalAgeGeBurnInView: number;
  } = {
    localSample: 0,
    localInView: 0,
    seeds: 0,
    seedsSource: 'none',
    localAgeGeBurn: 0,
    globalAgeGeBurn: 0,
    localAgeGeBurnInView: 0,
    globalAgeGeBurnInView: 0,
  };

  init(msg: Extract<MainToWorkerMsg, { type: 'init' }>) {
    this.canvas = msg.canvas;
    this.preset = msg.preset;
    this.simParams = msg.sim;
    this.renderParams = msg.render;
    this.animationSpeed = this.computeAnimationSpeed();
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

      this.recreateSims();
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
    const prevView = this.preset?.view;
    const mapsChanged = JSON.stringify(prevPreset?.maps || []) !== JSON.stringify(preset.maps);
    const viewChanged = JSON.stringify(prevPreset?.view) !== JSON.stringify(preset.view);
    const simChanged =
      !prevSim || prevSim.numPoints !== sim.numPoints || prevSim.seed !== sim.seed || prevSim.burnIn !== sim.burnIn;

    this.preset = preset;
    this.simParams = sim;
    this.renderParams = render;
    this.animationSpeed = this.computeAnimationSpeed();

    if (simChanged || !this.simGlobal || !this.simLocal) {
      this.recreateSims();
    } else {
      const total = sim.numPoints;
      const desiredLocal = Math.max(1, Math.floor(total * this.localFrac));
      const desiredGlobal = Math.max(1, total - desiredLocal);
      const globalPointsMismatch = this.simGlobal.getNumPoints() !== desiredGlobal;
      const localPointsMismatch = this.simLocal.getNumPoints() !== desiredLocal;
      if (globalPointsMismatch || localPointsMismatch) {
        this.recreateSims();
      } else {
        this.simGlobal.setParams({ numPoints: desiredGlobal, seed: sim.seed, population: 'global', itersPerStep: 1 });
        this.simLocal.setParams({ numPoints: desiredLocal, seed: (sim.seed ^ 0x9e3779b9) >>> 0, population: 'local', itersPerStep: 8 });
      }
    }

    if (this.simGlobal && this.simLocal) {
      if (mapsChanged) {
        this.simGlobal.setMaps(preset.maps);
        this.simLocal.setMaps(preset.maps);
      }
      const viewScale = this.preset.view?.scale ?? 1;
      const viewOffset = this.preset.view?.offset ?? { x: 0, y: 0 };
      this.simGlobal.setView(viewScale, viewOffset);
      this.simLocal.setView(viewScale, viewOffset);
      if (viewChanged) {
        this.updateRespawnControl(prevView ?? undefined);
      }
    }

    if (mapsChanged || simChanged || viewChanged) {
      if (viewChanged) {
        this.startRespawnBoost();
      }
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
    this.simGlobal?.dispose();
    this.simLocal?.dispose();
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
      if (!this.gl) {
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
    if (!this.gl || !this.postprocess || !this.simGlobal || !this.simLocal || !this.pointProgram || !this.accumulate) {
      return;
    }
    const gl = this.gl;

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (this.lastRenderTime > 0) {
      const dt = time - this.lastRenderTime;
      if (dt > 0) {
        const instFps = 1000 / dt;
        this.fpsEstimate = this.fpsEstimate === 0 ? instFps : this.fpsEstimate * 0.9 + instFps * 0.1;
      }
    }
    this.lastRenderTime = time;

    const exposure = this.renderParams?.exposure ?? DEFAULT_EXPOSURE;
    const gamma = this.renderParams?.gamma ?? DEFAULT_GAMMA;
    const paletteId = paletteToId(this.renderParams?.palette ?? 'grayscale');
    const invert = !!this.renderParams?.invert;
    const timeSec = (time * 0.001) * this.animationSpeed;

    if (this.frameIndex % this.respawnUpdateInterval === 0) {
      this.updateRespawnControl();
    } else if (this.respawnBoostFrames > 0) {
      // Ensure boost still applies even if we skipped the sampling frame.
      this.simLocal.setRespawnProb(this.boostRespawnProb);
      this.currentRespawnProb = this.boostRespawnProb;
    }
    if (this.respawnBoostFrames > 0) this.respawnBoostFrames--;

    // Update simulation
    this.simGlobal.step(this.frameIndex);
    this.simLocal.step(this.frameIndex);
    this.frameIndex++;

    // Begin accumulation: decay previous frame into write target
    this.accumulate.beginFrame(this.renderParams?.decay ?? DEFAULT_DECAY);

    // Render points additively into accumulation target
    gl.useProgram(this.pointProgram);
    const posLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    const ageLoc = gl.getAttribLocation(this.pointProgram, 'a_age');
    if (posLoc < 0) return;
    this.simGlobal.bindForRender(posLoc, ageLoc);

    if (this.pointColorLoc) gl.uniform3f(this.pointColorLoc, 1.0, 1.0, 1.0);
    const viewScale = this.preset?.view?.scale ?? 1.0;
    const viewOffset = this.preset?.view?.offset ?? { x: 0, y: 0 };
    if (this.pointViewScaleLoc) gl.uniform2f(this.pointViewScaleLoc, viewScale, viewScale);
    if (this.pointViewOffsetLoc) gl.uniform2f(this.pointViewOffsetLoc, viewOffset.x, viewOffset.y);
    if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, 1.5);
    const burnInFrames = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    if (this.pointBurnInLoc) gl.uniform1f(this.pointBurnInLoc, burnInFrames);

    if (this.frameIndex >= (this.simParams?.burnIn ?? DEFAULT_BURN_IN)) {
      this.accumulate.drawPoints(this.simGlobal.getNumPoints(), 1.5);
      this.simLocal.bindForRender(posLoc, ageLoc);
      this.accumulate.drawPoints(this.simLocal.getNumPoints(), 1.5);
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

  private computeAnimationSpeed(): number {
    // Tie the simple animation to preset values so preset updates are observable.
    const decay = this.renderParams?.decay ?? DEFAULT_DECAY;
    return 0.5 + Math.min(1.5, Math.max(0.2, decay));
  }

  private startRespawnBoost() {
    this.respawnBoostFrames = this.boostDurationFrames;
  }

  private updateRespawnControl(prevViewOverride?: { scale: number; offset: { x: number; y: number } }) {
    if (!this.simLocal || !this.preset) return;
    const currentView = this.preset.view ?? { scale: 1, offset: { x: 0, y: 0 } };
    const prevView = prevViewOverride ?? this.lastView;
    const currentBounds = this.viewBounds(currentView);
    const prevBounds = prevView ? this.viewBounds(prevView) : null;

    const sampleLocal = this.simLocal.samplePositions(this.respawnSampleCount);
    const sampleGlobal = this.simGlobal?.samplePositions(this.respawnSampleCount) ?? new Float32Array(0);
    const seedsLocal: { x: number; y: number; age: number }[] = [];
    const seedsGlobal: { x: number; y: number; age: number }[] = [];
    let inView = 0;
    let localAgeGeBurn = 0;
    let localAgeGeBurnInView = 0;
    const burnIn = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    const total = sampleLocal.length / 3;
    for (let i = 0; i < total; i++) {
      const x = sampleLocal[i * 3];
      const y = sampleLocal[i * 3 + 1];
      const age = sampleLocal[i * 3 + 2];
      const visible = this.inView(x, y, currentBounds);
      const ageOk = age >= burnIn;
      if (ageOk) localAgeGeBurn++;
      if (visible) {
        inView++;
        if (ageOk) localAgeGeBurnInView++;
        if (seedsLocal.length < this.respawnMaxSeeds) {
          seedsLocal.push({ x, y, age });
        }
      }
    }

    let globalAgeGeBurn = 0;
    let globalAgeGeBurnInView = 0;
    const totalGlobal = sampleGlobal.length / 3;
    for (let i = 0; i < totalGlobal; i++) {
      const x = sampleGlobal[i * 3];
      const y = sampleGlobal[i * 3 + 1];
      const age = sampleGlobal[i * 3 + 2];
      const ageOk = age >= burnIn;
      if (ageOk) globalAgeGeBurn++;
      const inCurrent = this.inView(x, y, currentBounds);
      if (inCurrent && ageOk) globalAgeGeBurnInView++;
      if (!inCurrent) continue;
      const inPrev = prevBounds ? this.inView(x, y, prevBounds) : false;
      if (prevBounds && !inPrev) {
        if (seedsGlobal.length < this.respawnMaxSeeds) seedsGlobal.push({ x, y, age });
      }
    }
    if (seedsGlobal.length === 0 && totalGlobal > 0 && seedsGlobal.length < this.respawnMaxSeeds) {
      for (let i = 0; i < totalGlobal && seedsGlobal.length < this.respawnMaxSeeds; i++) {
        const x = sampleGlobal[i * 3];
        const y = sampleGlobal[i * 3 + 1];
        const age = sampleGlobal[i * 3 + 2];
        if (this.inView(x, y, currentBounds)) {
          seedsGlobal.push({ x, y, age });
        }
      }
    }

    let seedsSource: 'local' | 'global' | 'cache' | 'none' = 'none';
    const seeds = seedsLocal.length > 0 ? seedsLocal : seedsGlobal;
    if (seedsLocal.length > 0) seedsSource = 'local';
    else if (seedsGlobal.length > 0) seedsSource = 'global';
    if (seeds.length > 0) {
      this.respawnSeedsCache = seeds;
      this.simLocal.setRespawnSeeds(seeds);
    } else if (this.respawnSeedsCache.length > 0) {
      this.simLocal.setRespawnSeeds(this.respawnSeedsCache);
      seedsSource = 'cache';
    }
    this.respawnInViewFraction = total > 0 ? inView / total : 0;
    const hasSeeds = this.respawnSeedsCache.length > 0;
    if (!hasSeeds) {
      this.simLocal.setRespawnProb(0);
      this.currentRespawnProb = 0;
      this.lastRespawnDiag = { localSample: total, localInView: inView, seeds: 0, seedsSource, localAgeGeBurn, globalAgeGeBurn, localAgeGeBurnInView, globalAgeGeBurnInView };
      return;
    }
    const targetFill = 0.995;
    const deficit = Math.max(0, targetFill - this.respawnInViewFraction);
    const desired = this.respawnGain * deficit;
    const clamped = Math.min(this.baseRespawnProbMax, Math.max(this.baseRespawnProbMin, desired));
    const prob = this.respawnBoostFrames > 0 ? Math.max(clamped, this.boostRespawnProb) : clamped;
    this.simLocal.setRespawnProb(prob);
    this.currentRespawnProb = prob;
    this.lastRespawnDiag = {
      localSample: total,
      localInView: inView,
      seeds: this.respawnSeedsCache.length,
      seedsSource,
      localAgeGeBurn,
      globalAgeGeBurn,
      localAgeGeBurnInView,
      globalAgeGeBurnInView,
    };
  }

  private viewBounds(view: { scale: number; offset: { x: number; y: number } }) {
    const { scale, offset } = view;
    const minX = (-1 - offset.x) / scale;
    const maxX = (1 - offset.x) / scale;
    const minY = (-1 - offset.y) / scale;
    const maxY = (1 - offset.y) / scale;
    return { minX, maxX, minY, maxY };
  }

  private inView(x: number, y: number, b: { minX: number; maxX: number; minY: number; maxY: number }) {
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  private maybeSendDiagnostics(timeMs: number) {
    if (!this.simGlobal || !this.simLocal || !this.preset) return;
    if (timeMs - this.diagLastSent < 500) return;
    const burnIn = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    const decay = this.renderParams?.decay ?? DEFAULT_DECAY;
    const exposure = this.renderParams?.exposure ?? DEFAULT_EXPOSURE;
    const gamma = this.renderParams?.gamma ?? DEFAULT_GAMMA;
    const drawnPoints = this.frameIndex >= burnIn ? this.simGlobal.getNumPoints() + this.simLocal.getNumPoints() : 0;
    const diag: WorkerDiagnostics = {
      frame: this.frameIndex,
      fps: this.fpsEstimate,
      viewScale: this.preset.view?.scale ?? 1,
      viewOffset: this.preset.view?.offset ?? { x: 0, y: 0 },
      numPointsGlobal: this.simGlobal.getNumPoints(),
      numPointsLocal: this.simLocal.getNumPoints(),
      localSampleCount: this.lastRespawnDiag.localSample,
      localInViewCount: this.lastRespawnDiag.localInView,
      respawnSeeds: this.lastRespawnDiag.seeds,
      respawnSeedsSource: this.lastRespawnDiag.seedsSource,
      respawnProb: this.currentRespawnProb,
      respawnBoostFrames: this.respawnBoostFrames,
      decay,
      exposure,
      gamma,
      burnIn,
      drawnPoints,
      localAgeGeBurn: this.lastRespawnDiag.localAgeGeBurn,
      globalAgeGeBurn: this.lastRespawnDiag.globalAgeGeBurn,
      localAgeGeBurnInView: this.lastRespawnDiag.localAgeGeBurnInView,
      globalAgeGeBurnInView: this.lastRespawnDiag.globalAgeGeBurnInView,
    };
    this.postMessage({ type: 'diag', data: diag });
    this.diagLastSent = timeMs;
  }

  private recreateSims() {
    if (!this.gl || !this.simParams || !this.preset) return;
    this.simGlobal?.dispose();
    this.simLocal?.dispose();

    const total = Math.max(2, this.simParams.numPoints);
    const numLocal = Math.max(1, Math.floor(total * this.localFrac));
    const numGlobal = Math.max(1, total - numLocal);
    const viewScale = this.preset.view?.scale ?? 1;
    const viewOffset = this.preset.view?.offset ?? { x: 0, y: 0 };

    this.simGlobal = new TransformFeedbackSim(this.gl, {
      numPoints: numGlobal,
      seed: this.simParams.seed >>> 0,
      population: 'global',
      itersPerStep: 1,
    });
    this.simLocal = new TransformFeedbackSim(this.gl, {
      numPoints: numLocal,
      seed: (this.simParams.seed ^ 0x9e3779b9) >>> 0,
      population: 'local',
      itersPerStep: 8,
    });
    this.respawnSeedsCache = [];

    this.simGlobal.setMaps(this.preset.maps);
    this.simLocal.setMaps(this.preset.maps);
    this.simGlobal.setView(viewScale, viewOffset);
    this.simLocal.setView(viewScale, viewOffset);
    this.simLocal.setRespawnProb(this.baseRespawnProbMax);
    this.startRespawnBoost();
    this.lastView = this.preset.view ?? { scale: 1, offset: { x: 0, y: 0 } };
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
    if (this.simGlobal && this.simLocal) {
      this.simGlobal.setView(scale, { x: -cx * scale, y: -cy * scale });
      this.simLocal.setView(scale, { x: -cx * scale, y: -cy * scale });
    }
    this.lastView = this.preset.view ?? { scale, offset: { x: -cx * scale, y: -cy * scale } };
  }

  handleFitRequest(warmup: number) {
    if (!this.simGlobal || !this.simLocal || !this.preset) return;
    for (let i = 0; i < warmup; i++) {
      this.simGlobal.step(this.frameIndex);
      this.simLocal.step(this.frameIndex);
      this.frameIndex++;
    }
    const bounds = this.simGlobal.sampleBounds(BOUNDS_SAMPLE_SIZE);
    const prevView = this.preset.view;
    this.fitView(bounds);
    if (
      !prevView ||
      prevView.scale !== this.preset.view?.scale ||
      prevView.offset.x !== this.preset.view?.offset.x ||
      prevView.offset.y !== this.preset.view?.offset.y
    ) {
      this.resetAccumulation();
      this.startRespawnBoost();
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
    case 'resetAccum':
      worker.resetAccumulation();
      break;
    case 'dispose':
      worker.dispose();
      break;
  }
};
