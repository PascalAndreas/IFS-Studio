import { GLCapabilities } from '../types';

export function detectCapabilities(gl: WebGL2RenderingContext): GLCapabilities {
  const supportedExtensions = gl.getSupportedExtensions() ?? [];
  const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
  const floatBlend = gl.getExtension('EXT_float_blend');

  const hasFloatTextures = !!colorBufferFloat;
  const hasColorBufferFloat = !!colorBufferFloat;
  const hasFloatBlend = !!floatBlend;

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const maxTransformFeedbackBuffers = gl.getParameter(
    gl.MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS
  ) as number;

  return {
    hasFloatTextures,
    hasColorBufferFloat,
    hasFloatBlend,
    maxTextureSize,
    maxTransformFeedbackBuffers,
    supportedExtensions: supportedExtensions.slice().sort(),
  };
}

export function logCapabilities(caps: GLCapabilities): void {
  console.log('[GL Capabilities]');
  console.log('  Float textures:', caps.hasFloatTextures);
  console.log('  Color buffer float:', caps.hasColorBufferFloat);
  console.log('  Float blend:', caps.hasFloatBlend);
  console.log('  Max texture size:', caps.maxTextureSize);
  console.log('  Max TF buffers:', caps.maxTransformFeedbackBuffers);
  console.log('  Extensions:', caps.supportedExtensions.join(', ') || 'none');
}
