#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_prev;
uniform float u_decay;
void main() {
  fragColor = u_decay * texture(u_prev, v_uv);
}
