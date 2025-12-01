#version 300 es
layout(location = 0) in vec2 a_position;
uniform float u_pointSize;
uniform vec2 u_viewScale;
uniform vec2 u_viewOffset;
void main() {
  vec2 p = a_position * u_viewScale + u_viewOffset;
  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}
