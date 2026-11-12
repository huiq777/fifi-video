import { HEAD } from './glsl_common.js';

const FS_DOWN = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uKaris;
vec3 T(vec2 o){ return texture(uTex, vUV + o*uTexel).rgb; }
float kw(vec3 c){ return 1.0/(1.0 + luma(c)*uKaris); }
void main(){
  vec3 a = T(vec2(-2, 2)), b = T(vec2(0, 2)), c = T(vec2(2, 2));
  vec3 d = T(vec2(-2, 0)), e = T(vec2(0, 0)), f = T(vec2(2, 0));
  vec3 g = T(vec2(-2, -2)), h = T(vec2(0, -2)), i = T(vec2(2, -2));
  vec3 j = T(vec2(-1, 1)), k = T(vec2(1, 1)), l = T(vec2(-1, -1)), m = T(vec2(1, -1));
  vec3 g0 = (j + k + l + m)*0.25, g1 = (a + b + d + e)*0.25, g2 = (b + c + e + f)*0.25, g3 = (d + e + g + h)*0.25, g4 = (e + f + h + i)*0.25;
  float w0 = 0.5*kw(g0), w1 = 0.125*kw(g1), w2 = 0.125*kw(g2), w3 = 0.125*kw(g3), w4 = 0.125*kw(g4);
  fragColor = vec4((g0*w0 + g1*w1 + g2*w2 + g3*w3 + g4*w4)/(w0 + w1 + w2 + w3 + w4), 1.0);
}`;

const FS_UP = HEAD + `
uniform sampler2D uTex; uniform sampler2D uBase; uniform vec2 uTexel; uniform float uW; uniform float uR;
vec3 T(vec2 o){ return texture(uTex, vUV + o*uTexel*uR).rgb; }
void main(){
  vec3 s = (T(vec2(-1,-1)) + T(vec2(1,-1)) + T(vec2(-1,1)) + T(vec2(1,1)))
         + (T(vec2(0,-1)) + T(vec2(-1,0)) + T(vec2(1,0)) + T(vec2(0,1)))*2.0 + T(vec2(0,0))*4.0;
  fragColor = vec4(texture(uBase, vUV).rgb*uW + s/16.0, 1.0);
}`;

// anamorphic streak: wide horizontal blur of the brightest parts
const FS_STREAK = HEAD + `
uniform sampler2D uTex; uniform vec2 uDir; uniform float uThresh;
void main(){
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int i = -12; i <= 12; i++){
    float w = exp(-float(i*i)/50.0);
    vec3 c = texture(uTex, vUV + uDir*float(i)).rgb;
    if (uThresh > 0.0) c = max(c - uThresh, 0.0);
    s += c*w; ws += w;
  }
  fragColor = vec4(s/ws, 1.0);
}`;

const FS_TONE = HEAD + `
uniform sampler2D uHDR; uniform sampler2D uBloom; uniform sampler2D uStreak;
uniform vec2 uRes; uniform float uExposure; uniform float uBloomAmt; uniform float uStreakAmt; uniform float uCA;
uniform vec3 uWB; uniform float uSat; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGain; uniform float uVig; uniform float uHalation;
uniform float uFade; uniform vec3 uFadeCol;
const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 rrt(vec3 v){ vec3 a = v*(v + 0.0245786) - 0.000090537; vec3 b = v*(0.983729*v + 0.4329510) + 0.238081; return a/b; }
vec3 aces(vec3 c){ return clamp(ACESOut*rrt(ACESIn*c), 0.0, 1.0); }
vec3 oetf(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 hdrAt(vec2 uv){ return texture(uHDR, uv).rgb; }
// AgX (Troy Sobotka), minimal fit after B. Wrensch
uniform float uTM; uniform float uAgxPow; uniform float uAgxSat; uniform float uDemag;
vec3 agxCurve(vec3 x){
  vec3 x2 = x*x; vec3 x4 = x2*x2;
  return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232;
}
vec3 agx(vec3 v){
  const mat3 M = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 Mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438, -0.0980208811401368, 1.15190312990417, -0.0980434501171241, -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  v = M*max(v, vec3(1e-10));
  v = clamp(log2(v), -12.47393, 4.026069);
  v = (v + 12.47393)/(4.026069 + 12.47393);
  v = agxCurve(v);
  float l = luma(v);
  v = pow(max(v, vec3(0.0)), vec3(uAgxPow));
  v = l + uAgxSat*(v - l);
  v = Mi*v;
  return saturate(v);   // display encoded (2.2)
}
void main(){
  vec2 uv = vUV; vec2 cc = uv - 0.5; float r2 = dot(cc*vec2(uRes.x/uRes.y, 1.0), cc*vec2(uRes.x/uRes.y, 1.0));
  vec3 c;
  if (uCA > 0.0){
    vec2 o = cc*r2*uCA;
    c = vec3(hdrAt(uv + o).r, hdrAt(uv).g, hdrAt(uv - o).b);
  } else c = hdrAt(uv);
  vec3 bl = texture(uBloom, uv).rgb;
  c = mix(c, bl, uBloomAmt);
  c += bl*uHalation*vec3(1.0, 0.32, 0.12);
  c += texture(uStreak, uv).rgb*uStreakAmt*vec3(1.0, 0.72, 0.5);
  // twilight mauve -> blue: take the magenta excess out of red, only where the colour is already cool
  { float m = max(min(c.r, c.b) - c.g, 0.0); c.r -= uDemag*m*smoothstep(1.7, 0.95, c.r/max(c.b, 1e-7)); }
  c *= uExposure*uWB;
  c *= 1.0 - uVig*smoothstep(0.15, 1.1, r2*1.6);
  vec3 d;
  if (uTM > 0.5) d = agx(c*0.55);
  else d = oetf(aces(c*1.6));
  // display-referred grade
  d = pow(d, vec3(uContrast));
  d = d*uGain + uLift*(1.0 - d);
  float l = luma(d);
  d = mix(vec3(l), d, uSat);
  d = mix(d, uFadeCol, uFade);
  fragColor = vec4(saturate(d), 1.0);
}`;

export const POST_DEFAULTS = {
  exposure: 14, bloom: 0.07, halation: 0.012, streak: 0.0, ca: 0.003,
  wb: [1, 1, 1], sat: 1.06, contrast: 1.06, lift: [0.0, 0.0, 0.0], gain: [1, 1, 1], vig: 0.22,
  fade: 0, fadeCol: [0, 0, 0], tm: 0, agxPow: 1.3, agxSat: 1.35, demag: 0,
};

export class Post {
  constructor(glx, W, H) {
    this.g = glx; this.W = W; this.H = H;
    const gl = glx.gl;
    this.pDown = glx.program(FS_DOWN, 'down');
    this.pUp = glx.program(FS_UP, 'up');
    this.pStreak = glx.program(FS_STREAK, 'streak');
    this.pTone = glx.program(FS_TONE, 'tone');
    this.down = []; this.up = [];
    let w = W, h = H;
    for (let i = 0; i < 8; i++) {
      w = Math.max(2, Math.round(w / 2)); h = Math.max(2, Math.round(h / 2));
      this.down.push(glx.target(w, h)); this.up.push(glx.target(w, h));
    }
    this.streakA = glx.target(Math.round(W / 4), Math.round(H / 4));
    this.streakB = glx.target(Math.round(W / 4), Math.round(H / 4));
    this.ldr = glx.target(W, H, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, mips: true });
  }

  // HDR accum -> LDR texture (this.ldr), tone mapped + graded (display-referred, sRGB encoded)
  tone(hdr, Q, outTarget = this.ldr) {
    const g = this.g, n = this.down.length;
    let src = hdr;
    for (let i = 0; i < n; i++) {
      g.draw(this.pDown, this.down[i], { uTex: src, uTexel: [1 / src.w, 1 / src.h], uKaris: i === 0 ? 0.6 : 0.0 });
      src = this.down[i];
    }
    // per-level weights: small levels = tight glow, large = atmosphere
    const wts = [1.0, 1.0, 0.95, 0.9, 0.9, 0.95, 1.1, 1.3];
    let prev = null;
    for (let i = n - 1; i >= 0; i--) {
      if (prev === null) g.draw(this.pUp, this.up[i], { uTex: this.down[i], uBase: this.down[i], uTexel: [0, 0], uW: wts[i] - 1.0 + 1e-6, uR: 0 });
      else g.draw(this.pUp, this.up[i], { uTex: prev, uBase: this.down[i], uTexel: [1 / prev.w, 1 / prev.h], uW: wts[i], uR: 1.0 });
      prev = this.up[i];
    }
    if (Q.streak > 0) {
      g.draw(this.pStreak, this.streakA, { uTex: this.down[1], uDir: [1.6 / this.streakA.w, 0], uThresh: 1.2 / Q.exposure * 10 });
      g.draw(this.pStreak, this.streakB, { uTex: this.streakA, uDir: [5.0 / this.streakA.w, 0], uThresh: 0 });
      g.draw(this.pStreak, this.streakA, { uTex: this.streakB, uDir: [14.0 / this.streakA.w, 0], uThresh: 0 });
    }
    let sum = 0; for (const w of wts) sum += w;
    g.draw(this.pTone, outTarget, {
      uHDR: hdr, uBloom: this.up[0], uStreak: this.streakA, uRes: [this.W, this.H],
      uExposure: Q.exposure, uBloomAmt: Q.bloom / sum, uStreakAmt: Q.streak, uCA: Q.ca,
      uWB: Q.wb, uSat: Q.sat, uContrast: Q.contrast, uLift: Q.lift, uGain: Q.gain, uVig: Q.vig, uHalation: Q.halation / sum,
      uFade: Q.fade, uFadeCol: Q.fadeCol, uTM: Q.tm ?? 0, uDemag: Q.demag ?? 0, uAgxPow: Q.agxPow ?? 1.3, uAgxSat: Q.agxSat ?? 1.35,
    });
    if (outTarget && outTarget.mips) g.genMips(outTarget);
  }
}
