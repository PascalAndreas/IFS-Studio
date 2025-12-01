#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_age;
out float v_age;
uniform float u_pointSize;
uniform vec2 u_viewScale;
uniform vec2 u_viewOffset;
uniform float u_burnInFrames;
void main() {
  v_age = a_age;
  vec2 p = a_position * u_viewScale + u_viewOffset;
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  if (a_age < u_burnInFrames) {
    gl_PointSize = 0.0;
  }
}
