import { createProgram } from './glUtils';
import { IFSMap, computeNormalizedCdf, MAX_MAPS } from '../types';
import tfVertSrc from '../../shaders/tfSim.vert.glsl?raw';
import tfFragSrc from '../../shaders/tfSim.frag.glsl?raw';

export type SimParams = {
  numPoints: number;
  seed: number;
};

export class TransformFeedbackSim {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffers: [WebGLBuffer, WebGLBuffer] | null = null;
  private vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] | null = null;
  private tf: WebGLTransformFeedback | null = null;
  private readIndex = 0;
  private params: SimParams;
  private numMaps = 0;
  private cdf = new Float32Array(MAX_MAPS);
  private mapA = new Float32Array(MAX_MAPS * 4);
  private mapB = new Float32Array(MAX_MAPS * 2);
  private mapWarpEnabled = new Int32Array(MAX_MAPS);
  private mapWarpA = new Float32Array(MAX_MAPS * 4);
  private mapWarpK = new Float32Array(MAX_MAPS * 4);

  private uSeed: WebGLUniformLocation | null = null;
  private uFrame: WebGLUniformLocation | null = null;
  private uNumMaps: WebGLUniformLocation | null = null;
  private uCdf: WebGLUniformLocation | null = null;
  private uA: WebGLUniformLocation | null = null;
  private uB: WebGLUniformLocation | null = null;
  private uWarpEnabled: WebGLUniformLocation | null = null;
  private uWarpA: WebGLUniformLocation | null = null;
  private uWarpK: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext, params: SimParams) {
    this.gl = gl;
    this.params = params;
    this.initProgram();
    this.initBuffers();
  }

  resize(_width: number, _height: number): void {
    // No-op for now; positions are already in clip space.
  }

  setParams(params: SimParams): void {
    const numChanged = params.numPoints !== this.params.numPoints;
    this.params = params;
    if (numChanged) {
      this.disposeBuffers();
      this.initBuffers();
    }
  }

  setMaps(maps: IFSMap[]): void {
    this.updateMaps(maps);
  }

  step(frameIndex: number): void {
    if (!this.program || !this.buffers || !this.vaos || !this.tf) return;
    const gl = this.gl;

    const writeIndex = (this.readIndex + 1) % 2;

    gl.useProgram(this.program);
    if (this.uSeed) gl.uniform1ui(this.uSeed, this.params.seed >>> 0);
    if (this.uFrame) gl.uniform1ui(this.uFrame, frameIndex >>> 0);

    // Source geometry
    gl.bindVertexArray(this.vaos[this.readIndex]);

    // Transform feedback target
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffers[writeIndex]);

    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.params.numPoints);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);

    this.readIndex = writeIndex;
  }

  bindForRender(positionAttribLocation: number): void {
    if (!this.vaos || !this.buffers) return;
    const gl = this.gl;

    gl.bindVertexArray(this.vaos[this.readIndex]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.readIndex]);
    gl.enableVertexAttribArray(positionAttribLocation);
    gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
  }

  getNumPoints(): number {
    return this.params.numPoints;
  }

  sampleBounds(maxSamples: number): { min: { x: number; y: number }; max: { x: number; y: number } } {
    if (!this.buffers) {
      return { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
    }
    const gl = this.gl;
    const samples = Math.min(maxSamples, this.params.numPoints);
    const array = new Float32Array(samples * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.readIndex]);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, array);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < samples; i++) {
      const x = array[i * 2];
      const y = array[i * 2 + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
    }
    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
  }

  dispose(): void {
    this.disposeBuffers();
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
  }

  private initProgram(): void {
    this.program = createProgram(this.gl, {
      vertexSource: tfVertSrc.replace(/__MAX_MAPS__/g, String(MAX_MAPS)),
      fragmentSource: tfFragSrc,
      transformFeedbackVaryings: ['v_nextPosition'],
    });

    this.uSeed = this.gl.getUniformLocation(this.program, 'u_seed');
    this.uFrame = this.gl.getUniformLocation(this.program, 'u_frame');
    this.uNumMaps = this.gl.getUniformLocation(this.program, 'u_numMaps');
    this.uCdf = this.gl.getUniformLocation(this.program, 'u_cdf');
    this.uA = this.gl.getUniformLocation(this.program, 'u_A');
    this.uB = this.gl.getUniformLocation(this.program, 'u_b');
    this.uWarpEnabled = this.gl.getUniformLocation(this.program, 'u_warpEnabled');
    this.uWarpA = this.gl.getUniformLocation(this.program, 'u_warpA');
    this.uWarpK = this.gl.getUniformLocation(this.program, 'u_warpK');
  }

  private initBuffers(): void {
    const gl = this.gl;
    const count = Math.max(1, this.params.numPoints);
    const positions = new Float32Array(count * 2);
    const rand = this.seededRng(this.params.seed);
    for (let i = 0; i < positions.length; i++) {
      positions[i] = (rand() - 0.5) * 0.1;
    }

    const bufferA = gl.createBuffer();
    const bufferB = gl.createBuffer();
    if (!bufferA || !bufferB) {
      throw new Error('Failed to create transform feedback buffers');
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferA);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferB);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.buffers = [bufferA, bufferB];

    const vaoA = gl.createVertexArray();
    const vaoB = gl.createVertexArray();
    if (!vaoA || !vaoB) {
      throw new Error('Failed to create VAOs');
    }
    this.vaos = [vaoA, vaoB];

    gl.bindVertexArray(vaoA);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferA);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(vaoB);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferB);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.tf = gl.createTransformFeedback();
    if (!this.tf) {
      throw new Error('Failed to create transform feedback');
    }

    this.readIndex = 0;
  }

  private updateMaps(maps: IFSMap[]): void {
    const { cdf, numMaps } = computeNormalizedCdf(maps);
    this.cdf.set(cdf);
    this.numMaps = numMaps || 1;

    // Fill map data
    const fillCount = Math.min(maps.length, MAX_MAPS);
    for (let i = 0; i < MAX_MAPS; i++) {
      const map = i < fillCount ? maps[i] : null;
      const a0 = map?.affine ?? { a11: 1, a12: 0, a21: 0, a22: 1, b1: 0, b2: 0 };
      const warp = map?.warp ?? { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 };
      const baseIndex = i * 4;
      // Column-major for mat2: [m00, m10, m01, m11]
      this.mapA[baseIndex + 0] = a0.a11;
      this.mapA[baseIndex + 1] = a0.a21;
      this.mapA[baseIndex + 2] = a0.a12;
      this.mapA[baseIndex + 3] = a0.a22;
      this.mapB[i * 2 + 0] = a0.b1;
      this.mapB[i * 2 + 1] = a0.b2;
      this.mapWarpEnabled[i] = warp.enabled ? 1 : 0;
      this.mapWarpA[baseIndex + 0] = warp.a1;
      this.mapWarpA[baseIndex + 1] = warp.a2;
      this.mapWarpA[baseIndex + 2] = warp.a3;
      this.mapWarpA[baseIndex + 3] = warp.a4;
      this.mapWarpK[baseIndex + 0] = warp.k1;
      this.mapWarpK[baseIndex + 1] = warp.k2;
      this.mapWarpK[baseIndex + 2] = warp.k3;
      this.mapWarpK[baseIndex + 3] = warp.k4;
    }
    this.uploadMapUniforms();
  }

  private uploadMapUniforms(): void {
    if (!this.program) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1i(this.uNumMaps, this.numMaps);
    gl.uniform1fv(this.uCdf, this.cdf);
    gl.uniformMatrix2fv(this.uA, false, this.mapA);
    gl.uniform2fv(this.uB, this.mapB);
    gl.uniform1iv(this.uWarpEnabled, this.mapWarpEnabled);
    gl.uniform4fv(this.uWarpA, this.mapWarpA);
    gl.uniform4fv(this.uWarpK, this.mapWarpK);
  }

  private disposeBuffers(): void {
    const gl = this.gl;
    if (this.buffers) {
      gl.deleteBuffer(this.buffers[0]);
      gl.deleteBuffer(this.buffers[1]);
      this.buffers = null;
    }
    if (this.vaos) {
      gl.deleteVertexArray(this.vaos[0]);
      gl.deleteVertexArray(this.vaos[1]);
      this.vaos = null;
    }
    if (this.tf) {
      gl.deleteTransformFeedback(this.tf);
      this.tf = null;
    }
  }

  private seededRng(seed: number): () => number {
    let s = (seed || 1) >>> 0;
    return () => {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

}
