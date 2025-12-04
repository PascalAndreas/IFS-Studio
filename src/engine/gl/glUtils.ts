/**
 * WebGL2 utility functions
 */

function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: number
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }

  return shader;
}

export interface ProgramConfig {
  vertexSource: string;
  fragmentSource: string;
  transformFeedbackVaryings?: string[];
}

export function createProgram(
  gl: WebGL2RenderingContext,
  config: ProgramConfig
): WebGLProgram {
  const vertexShader = compileShader(gl, config.vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, config.fragmentSource, gl.FRAGMENT_SHADER);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  if (config.transformFeedbackVaryings) {
    gl.transformFeedbackVaryings(
      program,
      config.transformFeedbackVaryings,
      gl.INTERLEAVED_ATTRIBS
    );
  }

  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Program linking failed: ${info}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}
