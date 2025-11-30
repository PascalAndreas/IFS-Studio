/**
 * Transform Feedback-based IFS simulation
 * Updates particle positions using GPU compute via transform feedback
 */

import { createProgram, createBuffer } from './glUtils';
import { Preset, MAX_MAPS } from '../types';

export class TransformFeedbackSim {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  
  // Ping-pong buffers
  private buffers: [WebGLBuffer, WebGLBuffer] | null = null;
  private vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] | null = null;
  
  // Transform feedback objects
  private transformFeedbacks: [WebGLTransformFeedback, WebGLTransformFeedback] | null = null;
  
  private currentBuffer = 0;
  private numPoints = 0;
  
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  init(preset: Preset): void {
    this.numPoints = preset.sim.numPoints;
    
    // Create shader program with transform feedback
    this.program = createProgram(this.gl, {
      vertexSource: this.generateVertexShader(),
      fragmentSource: this.generateFragmentShader(),
      transformFeedbackVaryings: ['v_PositionOut'],
    });
    
    // Initialize buffers with random positions
    this.initBuffers();
    
    // TODO: Upload preset uniforms
  }

  private generateVertexShader(): string {
    return `#version 300 es
    precision highp float;
    
    // Input position
    in vec2 a_Position;
    
    // Output position (for transform feedback)
    out vec2 v_PositionOut;
    
    // Uniforms
    uniform int u_Seed;
    uniform int u_FrameIndex;
    uniform int u_NumMaps;
    
    // Per-map uniforms (MAX_MAPS = ${MAX_MAPS})
    uniform mat2 u_A[${MAX_MAPS}];
    uniform vec2 u_B[${MAX_MAPS}];
    uniform float u_Probs[${MAX_MAPS}];
    
    // Nonlinear warp params
    uniform bool u_WarpEnabled[${MAX_MAPS}];
    uniform vec4 u_WarpA[${MAX_MAPS}];  // a1, a2, a3, a4
    uniform vec4 u_WarpK[${MAX_MAPS}];  // k1, k2, k3, k4
    
    // Hash function for deterministic RNG
    uint hash(uint x) {
      x += (x << 10u);
      x ^= (x >> 6u);
      x += (x << 3u);
      x ^= (x >> 11u);
      x += (x << 15u);
      return x;
    }
    
    float random(uint seed) {
      return float(hash(seed)) / 4294967295.0;
    }
    
    void main() {
      // Generate deterministic random number based on seed, frame, and vertex ID
      uint rngSeed = uint(u_Seed) + uint(u_FrameIndex) * 1000u + uint(gl_VertexID);
      float u = random(rngSeed);
      
      // Select map based on cumulative probabilities
      int selectedMap = 0;
      float cumProb = 0.0;
      for (int i = 0; i < u_NumMaps; i++) {
        cumProb += u_Probs[i];
        if (u < cumProb) {
          selectedMap = i;
          break;
        }
      }
      
      // Apply affine transformation
      vec2 pos = u_A[selectedMap] * a_Position + u_B[selectedMap];
      
      // Apply nonlinear warp if enabled
      if (u_WarpEnabled[selectedMap]) {
        vec4 warpA = u_WarpA[selectedMap];
        vec4 warpK = u_WarpK[selectedMap];
        pos.x += warpA.x * sin(warpK.x * a_Position.x) + warpA.y * sin(warpK.y * a_Position.y);
        pos.y += warpA.z * sin(warpK.z * a_Position.x) + warpA.w * sin(warpK.w * a_Position.y);
      }
      
      v_PositionOut = pos;
    }
    `;
  }

  private generateFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    out vec4 fragColor;
    
    void main() {
      // No rendering in this pass
      fragColor = vec4(0.0);
    }
    `;
  }

  private initBuffers(): void {
    const gl = this.gl;
    
    // Initialize random positions
    const positions = new Float32Array(this.numPoints * 2);
    for (let i = 0; i < this.numPoints * 2; i++) {
      positions[i] = (Math.random() - 0.5) * 2.0;
    }
    
    // Create ping-pong buffers
    const buffer0 = createBuffer(gl, positions, gl.DYNAMIC_COPY);
    const buffer1 = createBuffer(gl, new Float32Array(positions.length), gl.DYNAMIC_COPY);
    this.buffers = [buffer0, buffer1];
    
    // Create VAOs for each buffer
    const vao0 = gl.createVertexArray()!;
    const vao1 = gl.createVertexArray()!;
    this.vaos = [vao0, vao1];
    
    // Setup VAO 0
    gl.bindVertexArray(vao0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    
    // Setup VAO 1
    gl.bindVertexArray(vao1);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer1);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    
    gl.bindVertexArray(null);
    
    // Create transform feedback objects
    const tf0 = gl.createTransformFeedback()!;
    const tf1 = gl.createTransformFeedback()!;
    this.transformFeedbacks = [tf0, tf1];
    
    // Bind transform feedback buffers
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf0);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer1);
    
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf1);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer0);
    
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  }

  update(_frameIndex: number): void {
    // TODO: Implement simulation update step
    // 1. Bind correct VAO and transform feedback
    // 2. Update uniforms (frameIndex, etc.)
    // 3. Disable rasterization
    // 4. Run transform feedback
    // 5. Swap buffers
  }
  
  getCurrentBuffer(): WebGLBuffer {
    return this.buffers![this.currentBuffer];
  }
  
  getNumPoints(): number {
    return this.numPoints;
  }

  updatePreset(_preset: Preset): void {
    // TODO: Update uniforms from preset
  }

  destroy(): void {
    const gl = this.gl;
    
    if (this.buffers) {
      gl.deleteBuffer(this.buffers[0]);
      gl.deleteBuffer(this.buffers[1]);
    }
    
    if (this.vaos) {
      gl.deleteVertexArray(this.vaos[0]);
      gl.deleteVertexArray(this.vaos[1]);
    }
    
    if (this.transformFeedbacks) {
      gl.deleteTransformFeedback(this.transformFeedbacks[0]);
      gl.deleteTransformFeedback(this.transformFeedbacks[1]);
    }
    
    if (this.program) {
      gl.deleteProgram(this.program);
    }
  }
}
