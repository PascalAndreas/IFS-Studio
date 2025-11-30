import { detectCapabilities, logCapabilities } from '../engine/gl/capabilities';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg } from '../engine/types';

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
      this.postMessage({ type: 'ready', capabilities: this.capabilities });
      this.startLoop();
    } catch (error) {
      this.postError(error);
    }
  }

  updatePreset(preset: Preset) {
    this.preset = preset;
    this.animationSpeed = this.computeAnimationSpeed();
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
  }

  dispose() {
    this.stopLoop();
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
    if (!this.gl) return;
    const gl = this.gl;

    const t = (time * 0.001) * this.animationSpeed;
    const r = 0.5 + 0.5 * Math.sin(t * 0.9);
    const g = 0.5 + 0.5 * Math.sin(t * 1.1 + 1.3);
    const b = 0.5 + 0.5 * Math.sin(t * 1.3 + 2.1);

    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
