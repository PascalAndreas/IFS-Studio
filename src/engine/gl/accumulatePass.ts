/**
 * Accumulation pass - renders points to FBO with additive blending
 */

import { createProgram, createTexture, createFramebuffer } from './glUtils';
import { GLCapabilities } from '../types';

export class AccumulatePass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  
  // Ping-pong accumulation textures and FBOs
  private textures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  
  private currentTexture = 0;
  private useFloatFormat: boolean;

  constructor(gl: WebGL2RenderingContext, capabilities: GLCapabilities) {
    this.gl = gl;
    this.useFloatFormat = capabilities.hasColorBufferFloat && capabilities.hasFloatBlend;
  }

  init(width: number, height: number): void {
    const gl = this.gl;
    
    // Create shader program
    this.program = createProgram(gl, {
      vertexSource: this.generateVertexShader(),
      fragmentSource: this.generateFragmentShader(),
    });
    
    // Create accumulation textures
    const internalFormat = this.useFloatFormat ? gl.RGBA32F : gl.RGBA8;
    const format = gl.RGBA;
    const type = this.useFloatFormat ? gl.FLOAT : gl.UNSIGNED_BYTE;
    
    const tex0 = createTexture(gl, width, height, internalFormat, format, type);
    const tex1 = createTexture(gl, width, height, internalFormat, format, type);
    this.textures = [tex0, tex1];
    
    // Create FBOs
    const fbo0 = createFramebuffer(gl, tex0);
    const fbo1 = createFramebuffer(gl, tex1);
    this.fbos = [fbo0, fbo1];
    
    // Clear both textures
    this.clearTexture(fbo0);
    this.clearTexture(fbo1);
  }

  private generateVertexShader(): string {
    return `#version 300 es
    precision highp float;
    
    in vec2 a_Position;
    
    uniform mat4 u_ViewMatrix;
    
    void main() {
      gl_Position = u_ViewMatrix * vec4(a_Position, 0.0, 1.0);
      gl_PointSize = 1.0;
    }
    `;
  }

  private generateFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    
    out vec4 fragColor;
    
    uniform float u_Intensity;
    
    void main() {
      // Additive contribution
      fragColor = vec4(u_Intensity);
    }
    `;
  }

  private clearTexture(fbo: WebGLFramebuffer): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(_positionBuffer: WebGLBuffer, _numPoints: number, _decay: number): void {
    // TODO: Implement accumulation rendering
    // 1. Bind current FBO
    // 2. Apply decay by blending with previous frame
    // 3. Enable additive blending
    // 4. Render points
    // 5. Swap textures
  }

  getCurrentTexture(): WebGLTexture {
    return this.textures![this.currentTexture];
  }

  clear(): void {
    if (this.fbos) {
      this.clearTexture(this.fbos[0]);
      this.clearTexture(this.fbos[1]);
    }
  }

  resize(width: number, height: number): void {
    this.destroy();
    this.init(width, height);
  }

  destroy(): void {
    const gl = this.gl;
    
    if (this.textures) {
      gl.deleteTexture(this.textures[0]);
      gl.deleteTexture(this.textures[1]);
    }
    
    if (this.fbos) {
      gl.deleteFramebuffer(this.fbos[0]);
      gl.deleteFramebuffer(this.fbos[1]);
    }
    
    if (this.program) {
      gl.deleteProgram(this.program);
    }
  }
}
