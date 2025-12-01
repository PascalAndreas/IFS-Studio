import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams, paletteToId, WorkerDiagnostics } from '../engine/types';
import { FIT_VIEW_MARGIN, BOUNDS_SAMPLE_SIZE, DEFAULT_EXPOSURE, DEFAULT_GAMMA, DEFAULT_DECAY, DEFAULT_BURN_IN } from '../engine/constants';
import { PostprocessPass } from '../engine/gl/postprocessPass';
import { TransformFeedbackSim } from '../engine/gl/transformFeedbackSim';
import { AccumulatePass } from '../engine/gl/accumulatePass';
import { createProgram } from '../engine/gl/glUtils';
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
  private readonly respawnMaxSeeds = 1024;
  private readonly accumSampleSize = 128;
  private respawnSeedsCache: { x: number; y: number; age?: number }[] = [];
  private lastView: { scale: number; offset: { x: number; y: number } } | null = null;
  private diagLastSent = 0;
  private fpsEstimate = 0;
  private lastRenderTime = 0;
  private currentRespawnProb = 0;
  private lastRespawnDiag: {
    seeds: number;
    seedsSource: 'accum' | 'cache' | 'none';
  } = {
    seeds: 0,
    seedsSource: 'none',
  };
  private respawnSampleFbo: WebGLFramebuffer | null = null;
  private respawnSampleTex: WebGLTexture | null = null;
  private respawnSampleProgram: WebGLProgram | null = null;
  private respawnSampleVao: WebGLVertexArrayObject | null = null;

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
    const gl = this.gl;
    if (gl) {
      if (this.respawnSampleTex) gl.deleteTexture(this.respawnSampleTex);
      if (this.respawnSampleFbo) gl.deleteFramebuffer(this.respawnSampleFbo);
      if (this.respawnSampleProgram) gl.deleteProgram(this.respawnSampleProgram);
      if (this.respawnSampleVao) gl.deleteVertexArray(this.respawnSampleVao);
    }
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
    this.updateRespawnControl();
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

  private startRespawnBoost() {
    this.respawnBoostFrames = this.boostDurationFrames;
  }

  private updateRespawnControl(_prevViewOverride?: { scale: number; offset: { x: number; y: number } }) {
    if (!this.simLocal || !this.preset || !this.accumulate || !this.gl) return;
    const currentView = this.preset.view ?? { scale: 1, offset: { x: 0, y: 0 } };

    const seedsAccum = this.sampleSeedsFromAccum(currentView);

    let seedsSource: 'accum' | 'cache' | 'none' = 'none';
    let seeds = seedsAccum.length > 0 ? seedsAccum : [];
    if (seeds.length > 0) seedsSource = 'accum';
    if (seeds.length > 0) {
      this.respawnSeedsCache = seeds;
      this.simLocal.setRespawnSeeds(seeds);
    } else if (this.respawnSeedsCache.length > 0) {
      this.simLocal.setRespawnSeeds(this.respawnSeedsCache);
      seedsSource = 'cache';
    }
    const fill = seeds.length > 0 ? Math.min(1, seeds.length / this.respawnMaxSeeds) : 0;
    const hasSeeds = this.respawnSeedsCache.length > 0;
    if (!hasSeeds) {
      this.simLocal.setRespawnProb(0);
      this.currentRespawnProb = 0;
      this.lastRespawnDiag = { seeds: 0, seedsSource };
      return;
    }
    const targetFill = 0.995;
    const deficit = Math.max(0, targetFill - fill);
    const desired = this.respawnGain * deficit;
    const clamped = Math.min(this.baseRespawnProbMax, Math.max(this.baseRespawnProbMin, desired));
    const prob = this.respawnBoostFrames > 0 ? Math.max(clamped, this.boostRespawnProb) : clamped;
    this.simLocal.setRespawnProb(prob);
    this.currentRespawnProb = prob;
    this.lastRespawnDiag = { seeds: this.respawnSeedsCache.length, seedsSource };
  }

  private ensureRespawnSampleTargets() {
    if (!this.gl) return;
    const gl = this.gl;
    if (!this.respawnSampleTex) {
      this.respawnSampleTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.respawnSampleTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.accumSampleSize, this.accumSampleSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    if (!this.respawnSampleFbo) {
      this.respawnSampleFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.respawnSampleFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.respawnSampleTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (!this.respawnSampleProgram) {
      const vert = `#version 300 es
      const vec2 pos[3]=vec2[3](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
      void main(){gl_Position=vec4(pos[gl_VertexID],0.0,1.0);}`;
      const frag = `#version 300 es
      precision mediump float;
      uniform sampler2D u_tex;
      in vec2 v_uv;
      out vec4 o;
      void main(){vec2 uv=(gl_FragCoord.xy)/vec2(${this.accumSampleSize}.0, ${this.accumSampleSize}.0); o=texture(u_tex, uv);} `;
      this.respawnSampleProgram = createProgram(gl, { vertexSource: vert, fragmentSource: frag });
      this.respawnSampleVao = gl.createVertexArray();
    }
  }

  private sampleSeedsFromAccum(view: { scale: number; offset: { x: number; y: number } }): { x: number; y: number; age: number }[] {
    if (!this.accumulate || !this.gl) return [];
    this.ensureRespawnSampleTargets();
    if (!this.respawnSampleFbo || !this.respawnSampleTex || !this.respawnSampleProgram || !this.respawnSampleVao) return [];
    const gl = this.gl;
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // Blit accumulation texture into downsample target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.respawnSampleFbo);
    gl.viewport(0, 0, this.accumSampleSize, this.accumSampleSize);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.respawnSampleProgram);
    gl.bindVertexArray(this.respawnSampleVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumulate.getTexture());
    const texLoc = gl.getUniformLocation(this.respawnSampleProgram, 'u_tex');
    if (texLoc) gl.uniform1i(texLoc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8Array(this.accumSampleSize * this.accumSampleSize * 4);
    gl.readPixels(0, 0, this.accumSampleSize, this.accumSampleSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Restore
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);

    const seeds: { x: number; y: number; age: number }[] = [];
    const burnInAge = Math.max(0, (this.simParams?.burnIn ?? DEFAULT_BURN_IN) + 1);
    for (let i = 0; i < this.accumSampleSize * this.accumSampleSize; i++) {
      if (seeds.length >= this.respawnMaxSeeds) break;
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      if (r === 0 && g === 0 && b === 0) continue;
      const px = i % this.accumSampleSize;
      const py = Math.floor(i / this.accumSampleSize);
      const clipX = (px + 0.5) / this.accumSampleSize * 2 - 1;
      const clipY = 1 - (py + 0.5) / this.accumSampleSize * 2;
      const worldX = (clipX - view.offset.x) / view.scale;
      const worldY = (clipY - view.offset.y) / view.scale;
      seeds.push({ x: worldX, y: worldY, age: burnInAge });
    }
    return seeds;
  }

  private maybeSendDiagnostics(timeMs: number) {
    if (!this.simGlobal || !this.simLocal || !this.preset) return;
    if (timeMs - this.diagLastSent < 500) return;
    const burnIn = this.simParams?.burnIn ?? DEFAULT_BURN_IN;
    const drawnPoints = this.frameIndex >= burnIn ? this.simGlobal.getNumPoints() + this.simLocal.getNumPoints() : 0;
    const diag: WorkerDiagnostics = {
      frame: this.frameIndex,
      fps: this.fpsEstimate,
      respawnSeeds: this.lastRespawnDiag.seeds,
      respawnSeedsSource: this.lastRespawnDiag.seedsSource,
      respawnProb: this.currentRespawnProb,
      respawnBoostFrames: this.respawnBoostFrames,
      drawnPoints,
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
    this.respawnSeedsCache = [];
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
