import { createProgram } from './glUtils';
import vertSrc from '../../shaders/postprocess.vert.glsl?raw';
import fragSrc from '../../shaders/postprocess.frag.glsl?raw';

export type PostprocessUniforms = {
  exposure: number;
  gamma: number;
  paletteId: number;
  invert: boolean;
  densityTex: WebGLTexture;
  autoExposure: boolean;
  autoKey: number;
  avgMip: number;
};

export class PostprocessPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uExposure: WebGLUniformLocation | null = null;
  private uGamma: WebGLUniformLocation | null = null;
  private uDensity: WebGLUniformLocation | null = null;
  private uPaletteId: WebGLUniformLocation | null = null;
  private uInvert: WebGLUniformLocation | null = null;
  private uAvgMip: WebGLUniformLocation | null = null;
  private uAutoKey: WebGLUniformLocation | null = null;
  private uAutoExposure: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initProgram();
  }

  render(u: PostprocessUniforms): void {
    if (!this.program || !this.vao) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform1f(this.uExposure, u.exposure);
    gl.uniform1f(this.uGamma, u.gamma);
    gl.uniform1i(this.uPaletteId, u.paletteId);
    gl.uniform1i(this.uInvert, u.invert ? 1 : 0);
    gl.uniform1f(this.uAvgMip, u.avgMip);
    gl.uniform1f(this.uAutoKey, u.autoKey);
    gl.uniform1i(this.uAutoExposure, u.autoExposure ? 1 : 0);
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

    this.uExposure = gl.getUniformLocation(this.program, 'u_exposure');
    this.uGamma = gl.getUniformLocation(this.program, 'u_gamma');
    this.uDensity = gl.getUniformLocation(this.program, 'u_density');
    this.uPaletteId = gl.getUniformLocation(this.program, 'u_paletteId');
    this.uInvert = gl.getUniformLocation(this.program, 'u_invert');
    this.uAvgMip = gl.getUniformLocation(this.program, 'u_avgMip');
    this.uAutoKey = gl.getUniformLocation(this.program, 'u_autoKey');
    this.uAutoExposure = gl.getUniformLocation(this.program, 'u_autoExposure');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    // Fullscreen triangle via gl_VertexID, no buffers needed
    gl.bindVertexArray(null);
  }

}
