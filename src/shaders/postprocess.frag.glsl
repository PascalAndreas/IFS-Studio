#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_exposure;
uniform float u_gamma;
uniform int u_paletteId;
uniform int u_invert;
uniform float u_avgMip;
uniform float u_autoKey;
uniform int u_autoExposure;
uniform sampler2D u_density;

vec3 paletteGrayscale(float t) {
  return vec3(t);
}

vec3 paletteMagma(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.0014, 0.0005, 0.0139);
  vec3 b = vec3(2.165, 1.559, 0.777);
  vec3 tvec = vec3(t);
  return pow(a + b * pow(tvec, vec3(0.278, 0.365, 0.580)), vec3(1.2));
}

vec3 paletteViridis(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.280, 0.487, 0.738);
  vec3 b = vec3(0.720, 0.349, 0.200);
  return clamp(a + b * vec3(t), 0.0, 1.0);
}

vec3 paletteTurbo(float t) {
  const vec4 c0 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 c1 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  const vec4 c2 = vec4(0.10667330, 1.82860857, 0.27641268, -0.18533632);
  const vec4 c3 = vec4(0.41092694, -5.68919500, 10.44085981, -5.87192550);
  const vec4 c4 = vec4(-0.22977654, 4.13828604, -4.23751394, 1.48401649);
  t = clamp(t, 0.0, 1.0);
  vec4 v = vec4(1.0, t, t * t, t * t * t);
  vec3 col = vec3(dot(c0, v), dot(c1, v), dot(c2, v)) + vec3(dot(c3, v), dot(c4, v), 0.0);
  return clamp(col, 0.0, 1.0);
}

vec3 getPalette(int id, float t) {
  if (id == 1) return paletteMagma(t);
  if (id == 2) return paletteViridis(t);
  if (id == 3) return paletteTurbo(t);
  return paletteGrayscale(t);
}

void main() {
  float d = texture(u_density, v_uv).r;
  float avg = textureLod(u_density, vec2(0.5), u_avgMip).r;
  float exposure = u_exposure;
  if (u_autoExposure == 1) {
    float autoExposure = u_autoKey / max(avg, 1e-6);
    autoExposure = clamp(autoExposure, 0.001, 8192.0);
    exposure *= autoExposure;
  }
  float v = log(1.0 + exposure * d);
  v = v / (v + 1.0);
  v = pow(clamp(v, 0.0, 1.0), 1.0 / max(0.0001, u_gamma));
  if (u_invert == 1) {
    v = 1.0 - v;
  }
  vec3 color = getPalette(u_paletteId, v);
  fragColor = vec4(color, 1.0);
}
