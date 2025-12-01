import { createProgram } from './glUtils';
import vertSrc from '../../shaders/postprocess.vert.glsl?raw';
import fragSrc from '../../shaders/postprocess.frag.glsl?raw';

export type PostprocessUniforms = {
  width: number;
  height: number;
  exposure: number;
  gamma: number;
  paletteId: number;
  invert: boolean;
  densityTex: WebGLTexture;
};

export class PostprocessPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uExposure: WebGLUniformLocation | null = null;
  private uGamma: WebGLUniformLocation | null = null;
  private uDensity: WebGLUniformLocation | null = null;
  private uPaletteId: WebGLUniformLocation | null = null;
  private uInvert: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initProgram();
  }

  resize(_width: number, _height: number): void {
    // Rendering uses uniforms only; nothing to resize besides viewport handled by caller.
  }

  render(u: PostprocessUniforms): void {
    if (!this.program || !this.vao) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uResolution, u.width, u.height);
    gl.uniform1f(this.uExposure, u.exposure);
    gl.uniform1f(this.uGamma, u.gamma);
    gl.uniform1i(this.uPaletteId, u.paletteId);
    gl.uniform1i(this.uInvert, u.invert ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, u.densityTex);
    gl.uniform1i(this.uDensity, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
  }

  private initProgram(): void {
    const gl = this.gl;
    this.program = createProgram(gl, {
      vertexSource: vertSrc,
      fragmentSource: fragSrc,
    });

    this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uExposure = gl.getUniformLocation(this.program, 'u_exposure');
    this.uGamma = gl.getUniformLocation(this.program, 'u_gamma');
    this.uDensity = gl.getUniformLocation(this.program, 'u_density');
    this.uPaletteId = gl.getUniformLocation(this.program, 'u_paletteId');
    this.uInvert = gl.getUniformLocation(this.program, 'u_invert');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    // Fullscreen triangle via gl_VertexID, no buffers needed
    gl.bindVertexArray(null);
  }

}
