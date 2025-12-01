#version 300 es

const vec2 verts[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
out vec2 v_uv;
void main() {
  vec2 p = verts[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0., 1.);
}
