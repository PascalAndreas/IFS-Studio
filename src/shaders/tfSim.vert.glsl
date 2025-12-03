#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
out vec2 v_nextPosition;

uniform uint u_seed;
uniform uint u_frame;
uniform int u_numMaps;
uniform float u_cdf[__MAX_MAPS__];
uniform mat2 u_A[__MAX_MAPS__];
uniform vec2 u_b[__MAX_MAPS__];
uniform int u_warpEnabled[__MAX_MAPS__];
uniform vec4 u_warpA[__MAX_MAPS__];
uniform vec4 u_warpK[__MAX_MAPS__];
uniform float u_viewScale;
uniform vec2 u_viewOffset;
uniform int u_iterCount;
uniform int u_useGuard;

uint hash3(uvec3 v) {
  uint h = v.x * 374761393u + v.y * 668265263u + v.z * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return h;
}

float rand(uvec3 x) {
  return float(hash3(x)) / 4294967295.0;
}

void main() {
  vec2 p = a_position;

  int iterCount = max(1, u_iterCount);
  for (int iter = 0; iter < 64; iter++) { // safety cap
    if (iter >= iterCount) break;
    float r = rand(uvec3(uint(gl_VertexID) + uint(iter) * 9187u, u_frame, u_seed));

    int chosen = 0;
    for (int i = 0; i < __MAX_MAPS__; i++) {
      if (i >= u_numMaps) break;
      if (r < u_cdf[i]) {
        chosen = i;
        break;
      }
    }

    p = u_A[chosen] * p + u_b[chosen];

    if (u_warpEnabled[chosen] != 0) {
      vec4 a = u_warpA[chosen];
      vec4 k = u_warpK[chosen];
      p.x += a.x * sin(k.x * p.x) + a.y * cos(k.y * p.y);
      p.y += a.z * sin(k.z * p.y) + a.w * cos(k.w * p.x);
    }

    if (u_useGuard == 1 && any(isnan(p))) {
      float r1 = rand(uvec3(uint(gl_VertexID) + 17u + uint(iter), u_frame, u_seed)) * 2.0 - 1.0;
      float r2 = rand(uvec3(uint(gl_VertexID) + 31u + uint(iter), u_frame, u_seed)) * 2.0 - 1.0;
      vec2 clipSpawn = vec2(r1, r2);
      p = (clipSpawn - u_viewOffset) / u_viewScale;
    }
  }

  v_nextPosition = p;
}
