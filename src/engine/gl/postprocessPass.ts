/**
 * Postprocess pass - displays accumulated density with log/exposure + gamma
 */

import { createProgram, createBuffer } from './glUtils';

export class PostprocessPass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private quadVAO!: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  init(): void {
    const gl = this.gl;
    
    // Create shader program
    this.program = createProgram(gl, {
      vertexSource: this.generateVertexShader(),
      fragmentSource: this.generateFragmentShader(),
    });
    
    // Create fullscreen quad
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    
    const quadBuffer = createBuffer(gl, quadVertices, gl.STATIC_DRAW);
    
    this.quadVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private generateVertexShader(): string {
    return `#version 300 es
    precision highp float;
    
    in vec2 a_Position;
    out vec2 v_TexCoord;
    
    void main() {
      gl_Position = vec4(a_Position, 0.0, 1.0);
      v_TexCoord = a_Position * 0.5 + 0.5;
    }
    `;
  }

  private generateFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    
    in vec2 v_TexCoord;
    out vec4 fragColor;
    
    uniform sampler2D u_AccumulationTexture;
    uniform float u_Exposure;
    uniform float u_Gamma;
    
    void main() {
      vec4 accumulated = texture(u_AccumulationTexture, v_TexCoord);
      
      // Log tone mapping for density visualization
      float density = accumulated.r;
      float mapped = log(1.0 + density * u_Exposure);
      
      // Gamma correction
      mapped = pow(mapped, 1.0 / u_Gamma);
      
      // Output grayscale (can add palette here later)
      fragColor = vec4(vec3(mapped), 1.0);
    }
    `;
  }

  render(accumulationTexture: WebGLTexture, exposure: number, gamma: number): void {
    const gl = this.gl;
    
    gl.useProgram(this.program);
    
    // Bind accumulation texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumulationTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_AccumulationTexture'), 0);
    
    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_Exposure'), exposure);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_Gamma'), gamma);
    
    // Draw fullscreen quad to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    const gl = this.gl;
    
    if (this.quadVAO) {
      gl.deleteVertexArray(this.quadVAO);
    }
    
    if (this.program) {
      gl.deleteProgram(this.program);
    }
  }
}

