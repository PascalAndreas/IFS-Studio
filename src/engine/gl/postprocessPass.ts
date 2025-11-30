import { createProgram } from './glUtils';

export type PostprocessUniforms = {
  timeSec: number;
  width: number;
  height: number;
  exposure: number;
  gamma: number;
};

export class PostprocessPass {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uExposure: WebGLUniformLocation | null = null;
  private uGamma: WebGLUniformLocation | null = null;

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

    gl.uniform1f(this.uTime, u.timeSec);
    gl.uniform2f(this.uResolution, u.width, u.height);
    gl.uniform1f(this.uExposure, u.exposure);
    gl.uniform1f(this.uGamma, u.gamma);

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
      vertexSource: this.vertexSource(),
      fragmentSource: this.fragmentSource(),
    });

    this.uTime = gl.getUniformLocation(this.program, 'u_time');
    this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uExposure = gl.getUniformLocation(this.program, 'u_exposure');
    this.uGamma = gl.getUniformLocation(this.program, 'u_gamma');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    // Fullscreen triangle via gl_VertexID, no buffers needed
    gl.bindVertexArray(null);
  }

  private vertexSource(): string {
    return `#version 300 es
    precision highp float;

    const vec2 verts[3] = vec2[3](
      vec2(-1.0, -1.0),
      vec2(3.0, -1.0),
      vec2(-1.0, 3.0)
    );

    out vec2 v_uv;

    void main() {
      vec2 pos = verts[gl_VertexID];
      v_uv = pos * 0.5 + 0.5;
      gl_Position = vec4(pos, 0.0, 1.0);
    }
    `;
  }

  private fragmentSource(): string {
    return `#version 300 es
    precision highp float;

    in vec2 v_uv;
    out vec4 fragColor;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_exposure;
    uniform float u_gamma;

    // Simple animated stripes and gradient mix
    vec3 palette(vec3 c, float k) {
      return c * (0.6 + 0.4 * sin(k));
    }

    void main() {
      vec2 uv = v_uv;
      vec2 p = (uv * u_resolution) / min(u_resolution.x, u_resolution.y);
      float t = u_time * 0.8;

      float stripes = 0.5 + 0.5 * sin(10.0 * uv.x + t * 2.0);
      float waves = 0.5 + 0.5 * sin(8.0 * uv.y - t * 1.6);
      float radial = length(uv - 0.5);

      vec3 base = mix(vec3(0.1, 0.2, 0.4), vec3(0.8, 0.7, 0.4), uv.y);
      vec3 color = base + 0.2 * palette(vec3(0.3, 0.8, 0.6), stripes) + 0.15 * waves;
      color *= exp(-2.5 * radial);

      // Apply simple exposure and gamma
      color = pow(color * u_exposure, vec3(1.0 / max(0.0001, u_gamma)));

      fragColor = vec4(color, 1.0);
    }
    `;
  }
}
