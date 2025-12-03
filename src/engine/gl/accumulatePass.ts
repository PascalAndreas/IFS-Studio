import { createProgram } from './glUtils';
import decayVertSrc from '../../shaders/accumulateDecay.vert.glsl?raw';
import decayFragSrc from '../../shaders/accumulateDecay.frag.glsl?raw';

export type AccumulateSettings = {
  width: number;
  height: number;
  useFloat: boolean;
};

export class AccumulatePass {
  private gl: WebGL2RenderingContext;
  private textures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private readIndex = 0;
  private width: number;
  private height: number;
  private useFloat: boolean;
  private decayProgram: WebGLProgram | null = null;
  private uDecay: WebGLUniformLocation | null = null;
  private uPrev: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext, settings: AccumulateSettings) {
    this.gl = gl;
    this.width = settings.width;
    this.height = settings.height;
    this.useFloat = settings.useFloat;
    this.init();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.disposeTextures();
    this.createTargets();
  }

  setUseFloat(useFloat: boolean): boolean {
    if (useFloat === this.useFloat) return false;
    this.useFloat = useFloat;
    this.disposeTextures();
    this.createTargets();
    return true;
  }

  isFloat(): boolean {
    return this.useFloat;
  }

  beginFrame(decay: number): void {
    const gl = this.gl;
    if (!this.textures || !this.fbos || !this.decayProgram) return;
    const writeIndex = (this.readIndex + 1) % 2;
    gl.viewport(0, 0, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[writeIndex]);
    gl.disable(gl.BLEND);

    gl.useProgram(this.decayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.readIndex]);
    gl.uniform1i(this.uPrev, 0);
    gl.uniform1f(this.uDecay, decay);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  drawPoints(numPoints: number, _pointSizePx: number): void {
    const gl = this.gl;
    if (!this.textures || !this.fbos) return;
    const writeIndex = (this.readIndex + 1) % 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[writeIndex]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.FUNC_ADD);

    gl.drawArrays(gl.POINTS, 0, numPoints);
  }

  endFrame(): void {
    this.readIndex = (this.readIndex + 1) % 2;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.disable(this.gl.BLEND);
  }

  getTexture(): WebGLTexture {
    if (!this.textures) throw new Error('AccumulatePass not initialized');
    return this.textures[this.readIndex];
  }

  clear(): void {
    if (!this.fbos) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[0]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    this.disposeTextures();
    if (this.decayProgram) {
      this.gl.deleteProgram(this.decayProgram);
      this.decayProgram = null;
    }
  }

  private init(): void {
    this.createDecayProgram();
    this.createTargets();
  }

  private createDecayProgram(): void {
    const gl = this.gl;
    this.decayProgram = createProgram(gl, {
      vertexSource: decayVertSrc,
      fragmentSource: decayFragSrc,
    });
    this.uDecay = gl.getUniformLocation(this.decayProgram, 'u_decay');
    this.uPrev = gl.getUniformLocation(this.decayProgram, 'u_prev');
  }

  private createTargets(): void {
    const textures: [WebGLTexture, WebGLTexture] = [this.createTexture(), this.createTexture()];
    const fbos: [WebGLFramebuffer, WebGLFramebuffer] = [this.createFbo(textures[0]), this.createFbo(textures[1])];
    this.textures = textures;
    this.fbos = fbos;
    this.readIndex = 0;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create accumulation texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internalFormat = this.useFloat ? gl.R16F : gl.R8;
    const format = gl.RED;
    const type = this.useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, this.width, this.height, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  private createFbo(tex: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Failed to create accumulation FBO');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Accumulation FBO incomplete: ${status}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  private disposeTextures(): void {
    if (this.textures) {
      this.gl.deleteTexture(this.textures[0]);
      this.gl.deleteTexture(this.textures[1]);
      this.textures = null;
    }
    if (this.fbos) {
      this.gl.deleteFramebuffer(this.fbos[0]);
      this.gl.deleteFramebuffer(this.fbos[1]);
      this.fbos = null;
    }
  }

  prepareForSampling(): void {
    if (!this.textures) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.readIndex]);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
