import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg } from '../engine/types';
import { PostprocessPass } from '../engine/gl/postprocessPass';
import { TransformFeedbackSim } from '../engine/gl/transformFeedbackSim';

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
  private frameIndex = 0;

  init(msg: Extract<MainToWorkerMsg, { type: 'init' }>) {
    this.canvas = msg.canvas;
    this.preset = msg.preset;
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

      this.sim = new TransformFeedbackSim(gl, {
        numPoints: this.preset.sim.numPoints,
        seed: this.preset.sim.seed,
      });
      this.sim.setPreset(this.preset);
      this.initPointProgram();

      this.postMessage({ type: 'ready', capabilities: this.capabilities });
      this.startLoop();
    } catch (error) {
      this.postError(error);
    }
  }

  updatePreset(preset: Preset) {
    this.preset = preset;
    this.animationSpeed = this.computeAnimationSpeed();
    if (this.sim) {
      this.sim.setPreset(preset);
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
    // Draw once immediately to avoid a blank during rapid resize
    if (!this.isPaused) {
      this.render(performance.now());
    }
  }

  dispose() {
    this.stopLoop();
    this.postprocess?.dispose();
    this.sim?.dispose();
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
    if (!this.gl || !this.postprocess || !this.sim || !this.pointProgram) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const exposure = this.preset?.render.exposure ?? 1.0;
    const gamma = this.preset?.render.gamma ?? 2.2;
    const timeSec = (time * 0.001) * this.animationSpeed;
    this.postprocess.render({
      timeSec,
      width: this.pixelWidth,
      height: this.pixelHeight,
      exposure,
      gamma,
    });

    // Update simulation
    this.sim.step(this.frameIndex++);

    // Render points on top
    gl.useProgram(this.pointProgram);
    const posLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    if (posLoc < 0) return;
    this.sim.bindForRender(posLoc);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (this.pointColorLoc) gl.uniform3f(this.pointColorLoc, 1.0, 1.0, 1.0);
    if (this.pointSizeLoc) gl.uniform1f(this.pointSizeLoc, 1.5);
    const viewScale = this.preset?.view?.scale ?? 1.0;
    const viewOffset = this.preset?.view?.offset ?? { x: 0, y: 0 };
    if (this.pointViewScaleLoc) gl.uniform2f(this.pointViewScaleLoc, viewScale, viewScale);
    if (this.pointViewOffsetLoc) gl.uniform2f(this.pointViewOffsetLoc, viewOffset.x, viewOffset.y);

    gl.drawArrays(gl.POINTS, 0, this.sim.getNumPoints());

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
    return this.preset ? 0.5 + Math.min(1.5, Math.max(0.2, this.preset.render.decay)) : 1;
  }

  private initPointProgram() {
    if (!this.gl) return;
    const gl = this.gl;
    const vert = `#version 300 es
    layout(location = 0) in vec2 a_position;
    uniform float u_pointSize;
    uniform vec2 u_viewScale;
    uniform vec2 u_viewOffset;
    void main() {
      vec2 p = a_position * u_viewScale + u_viewOffset;
      gl_Position = vec4(p, 0.0, 1.0);
      gl_PointSize = u_pointSize;
    }`;
    const frag = `#version 300 es
    precision highp float;
    out vec4 fragColor;
    uniform vec3 u_color;
    void main() {
      fragColor = vec4(u_color, 0.15);
    }`;
    this.pointProgram = gl.createProgram();
    if (!this.pointProgram) throw new Error('Failed to create point program');

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vert);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error(`Point VS compile error: ${gl.getShaderInfoLog(vs) || ''}`);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, frag);
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
    case 'updatePreset':
      worker.updatePreset(msg.preset);
      break;
    case 'setPaused':
      worker.setPaused(msg.paused);
      break;
    case 'dispose':
      worker.dispose();
      break;
  }
};
