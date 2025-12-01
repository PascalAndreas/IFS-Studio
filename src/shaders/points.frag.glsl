#version 300 es
precision highp float;
in float v_age;
out vec4 fragColor;
uniform vec3 u_color;
uniform float u_burnInFrames;
void main() {
  if (v_age < u_burnInFrames) {
    discard;
  }
  fragColor = vec4(u_color, 0.15);
}
