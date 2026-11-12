// Shared GLSL chunks.
export const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
in vec2 vUV; out vec4 fragColor;
const float PI = 3.14159265358979;
float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x){ return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b, float c, float d){ return c + (x - a) / (b - a) * (d - c); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
uvec3 pcg3d(uvec3 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
  v ^= v >> 16u;
  v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
  return v;
}
vec3 hash3i(ivec3 p){ return vec3(pcg3d(uvec3(p + 65536))) * (1.0/4294967295.0); }
vec3 hash3(vec3 p){ return hash3i(ivec3(floor(p))); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// Atmosphere model (units: km). Requires uniforms uTrans (transmittance LUT) for sunTrans().
export const ATMO = `
const float Rg = 6360.0;
const float Rt = 6460.0;
const vec3 bR = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float bMs = 3.996e-3;
const float bMe = 8.396e-3;
const vec3 bO = vec3(0.650e-3, 1.881e-3, 0.085e-3);
const float HR = 8.0;
const float HM = 1.2;
uniform float uMie; uniform float uOzone;
vec3 atmoDens(float h){ return vec3(exp(-h/HR), exp(-h/HM)*uMie, max(0.0, 1.0 - abs(h - 25.0)/15.0)*uOzone); }
vec3 atmoExt(vec3 d){ return bR*d.x + vec3(bMe*d.y) + bO*d.z; }
float topDist(float r, float mu){ return max(-r*mu + sqrt(max(r*r*(mu*mu - 1.0) + Rt*Rt, 0.0)), 0.0); }
bool hitsGround(float r, float mu){ return mu < 0.0 && r*r*(mu*mu - 1.0) + Rg*Rg >= 0.0; }
float groundDist(float r, float mu){ return max(-r*mu - sqrt(max(r*r*(mu*mu - 1.0) + Rg*Rg, 0.0)), 0.0); }
`;

export const ATMO_LUT = `
uniform sampler2D uTrans;
const vec2 TRANS_RES = vec2(256.0, 64.0);
vec3 transLUT(float r, float mu){
  r = clamp(r, Rg, Rt);
  float H = sqrt(Rt*Rt - Rg*Rg);
  float rho = sqrt(max(r*r - Rg*Rg, 0.0));
  float d = topDist(r, mu);
  float dmin = Rt - r, dmax = rho + H;
  vec2 x = vec2((d - dmin)/(dmax - dmin), rho/H);
  vec2 uv = (clamp(x, 0.0, 1.0)*(TRANS_RES - 1.0) + 0.5)/TRANS_RES;
  return texture(uTrans, uv).rgb;
}
// transmittance toward the sun including the planet's shadow (soft over the sun's disc)
vec3 sunTrans(float r, float mu){
  float sinH = Rg / max(r, Rg + 1e-4);
  float cosH = -sqrt(max(1.0 - sinH*sinH, 0.0));
  float vis = smoothstep(cosH - 0.0055, cosH + 0.0055, mu);
  return transLUT(r, max(mu, cosH)) * vis;
}
`;
