import { HEAD } from './glsl_common.js';

// Last pass: (styled) scene + UI layer + film grain -> canvas.
const FS_FINAL = HEAD + `
uniform sampler2D uLDR; uniform sampler2D uB; uniform sampler2D uUI; uniform sampler2D uGlyphs;
uniform vec2 uRes; uniform float uSeed; uniform float uGrain; uniform float uSceneOn; uniform vec3 uBG;
uniform int uStyle; uniform int uMode; uniform float uScroll; uniform float uBlur; uniform float uHorizonV; uniform vec3 uSunUV;
const vec3 PAL[16] = vec3[16](
  vec3(0.051,0.039,0.122), vec3(0.122,0.086,0.251), vec3(0.231,0.165,0.420), vec3(0.373,0.247,0.561),
  vec3(0.561,0.290,0.561), vec3(0.784,0.314,0.478), vec3(0.941,0.416,0.290), vec3(1.000,0.604,0.235),
  vec3(1.000,0.784,0.341), vec3(1.000,0.945,0.659), vec3(1.000,1.000,1.000), vec3(0.137,0.224,0.357),
  vec3(0.227,0.431,0.647), vec3(0.498,0.718,0.851), vec3(0.114,0.290,0.310), vec3(0.478,0.231,0.180));
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
vec3 style8(vec2 uv){
  vec2 grid = vec2(320.0, 180.0); vec2 cell = floor(uv*grid);
  vec3 c = textureLod(uLDR, (cell + 0.5)/grid, log2(uRes.x/grid.x)).rgb;
  int bi = int(mod(cell.y, 4.0))*4 + int(mod(cell.x, 4.0));
  c += ((BAYER[bi] + 0.5)/16.0 - 0.5)*0.17;
  float best = 1e9; vec3 bc = PAL[0];
  for (int i = 0; i < 16; i++){ vec3 e = c - PAL[i]; float d = dot(e*e, vec3(0.30, 0.50, 0.20)); if (d < best){ best = d; bc = PAL[i]; } }
  return bc;
}
vec3 styleAscii(vec2 uv){
  vec2 cellPx = vec2(12.0, 24.0)*uRes.x/1920.0;
  vec2 grid = uRes/cellPx; vec2 cell = floor(uv*grid); vec2 loc = fract(uv*grid);
  vec3 c = textureLod(uLDR, (cell + 0.5)/grid, log2(cellPx.x) + 0.5).rgb;
  float l = clamp(pow(luma(c), 0.6)*1.12, 0.0, 0.999);
  const float n = 14.0; float idx = clamp(floor(l*n + 0.6), 0.0, n - 1.0);
  float m = texture(uGlyphs, vec2((idx + loc.x)/n, loc.y)).r;
  float mx = max(max(c.r, c.g), max(c.b, 0.06));
  vec3 ink = mix(c, c/mx, 0.72)*(0.55 + 0.6*l);
  return ink*m*1.3 + vec3(0.014, 0.012, 0.020);
}
vec3 styleCRT(vec2 uv){
  vec2 o = vec2(2.0/uRes.x, 0.0);
  vec3 c = vec3(texture(uLDR, uv + o).r, texture(uLDR, uv).g, texture(uLDR, uv - o).b);
  float sl = 0.84 + 0.16*sin(uv.y*270.0*2.0*PI);
  return c*sl;
}
vec3 rampCool(float q){
  vec3 a = vec3(0.070, 0.120, 0.235), b = vec3(0.130, 0.270, 0.450), c = vec3(0.400, 0.540, 0.640), d = vec3(0.790, 0.820, 0.740);
  return q < 0.33 ? mix(a, b, q/0.33) : q < 0.66 ? mix(b, c, (q - 0.33)/0.33) : mix(c, d, (q - 0.66)/0.34);
}
vec3 rampWarm(float q){
  vec3 a = vec3(0.300, 0.120, 0.100), b = vec3(0.800, 0.250, 0.150), c = vec3(0.930, 0.570, 0.400), d = vec3(0.960, 0.800, 0.470), e = vec3(0.960, 0.915, 0.790);
  return q < 0.25 ? mix(a, b, q/0.25) : q < 0.5 ? mix(b, c, (q - 0.25)/0.25) : q < 0.75 ? mix(c, d, (q - 0.5)/0.25) : mix(d, e, (q - 0.75)/0.25);
}
float lumAt(vec2 uv){ return luma(textureLod(uLDR, uv, 1.6).rgb); }
float lumB(vec2 uv){ return luma(textureLod(uLDR, uv, 2.2).rgb); }
vec3 styleUkiyo(vec2 uv){
  bool sea = uv.y < uHorizonV;
  vec3 c = textureLod(uLDR, uv, sea ? 2.4 : 1.8).rgb;
  float l = luma(c);
  float n = sea ? 4.0 : 5.0; float lq = pow(l, sea ? 0.7 : 0.85)*n; float fl = floor(lq); float q = clamp((fl + smoothstep(0.42, 0.58, lq - fl))/n, 0.0, 1.0);
  float wk = sea ? 0.0 : smoothstep(-0.03, 0.09, c.r - c.b);
  vec3 col = mix(rampCool(sea ? q*1.05 : q), rampWarm(q), wk);
  if (sea) col = mix(col, vec3(0.955, 0.915, 0.80), smoothstep(0.80, 0.95, q));
  vec2 px = (sea ? 2.6 : 2.0)/uRes;
  float gx = lumB(uv + vec2(px.x, 0.0)) - lumB(uv - vec2(px.x, 0.0));
  float gy = lumB(uv + vec2(0.0, px.y)) - lumB(uv - vec2(0.0, px.y));
  float e = length(vec2(gx, gy));
  col = mix(col, vec3(0.055, 0.085, 0.170), smoothstep(0.05, 0.10, e)*(sea ? 0.5 : 0.85));
  // the sun, printed as one flat vermilion block
  vec2 d = (uv - uSunUV.xy)*vec2(uRes.x/uRes.y, 1.0); float rs = uSunUV.z*1.55;
  if (!sea){
    float dd = length(d);
    col = mix(col, vec3(0.84, 0.21, 0.13), 1.0 - smoothstep(rs - 1.5/uRes.y, rs + 1.5/uRes.y, dd));
    col = mix(col, vec3(0.055, 0.085, 0.170), (1.0 - smoothstep(0.0, 2.2/uRes.y, abs(dd - rs)))*0.8);
  }
  col = mix(col, vec3(0.055, 0.085, 0.170), (1.0 - smoothstep(0.0, 1.6/uRes.y, abs(uv.y - uHorizonV)))*0.8);
  float fib = hash3(vec3(floor(gl_FragCoord.x/3.0), floor(gl_FragCoord.y/1.0), 7.0)).x*0.5 + hash3(vec3(floor(gl_FragCoord.xy/2.0), 9.0)).x*0.5;
  col *= 0.90 + 0.10*fib;
  col = mix(col, vec3(0.94, 0.89, 0.76), 0.06);
  col = mix(col, vec3(0.075, 0.150, 0.320), smoothstep(0.76, 1.02, uv.y)*0.85);
  return col;
}
vec3 styled(vec2 uv){
  if (uStyle == 2) return style8(uv);
  if (uStyle == 4) return styleAscii(uv);
  if (uStyle == 6) return styleCRT(uv);
  if (uStyle == 7) return styleUkiyo(uv);
  return texture(uLDR, uv).rgb;
}
vec3 strip(vec2 uv, float f){ float yy = uv.y + f; return yy < 1.0 ? texture(uLDR, vec2(uv.x, yy)).rgb : texture(uB, vec2(uv.x, yy - 1.0)).rgb; }
void main(){
  vec2 uv = vUV;
  if (uMode == 1){ fragColor = vec4(styled(uv), 1.0); return; }
  vec3 c;
  if (uMode == 2){
    c = vec3(0.0);
    for (int i = 0; i < 12; i++){ float o = (float(i) + 0.5)/12.0 - 0.5; c += strip(uv, clamp(uScroll + o*uBlur, 0.0, 0.9999)); }
    c /= 12.0;
    float bar = smoothstep(0.012, 0.0, abs(fract(uv.y + uScroll) - 0.0) ) + smoothstep(0.012, 0.0, 1.0 - fract(uv.y + uScroll));
    c *= 1.0 - 0.85*bar*step(0.02, uBlur + 0.03);
  } else c = uSceneOn > 0.5 ? styled(uv) : uBG;
  vec4 ui = texture(uUI, uv);
  c = c*(1.0 - ui.a) + ui.rgb;
  vec3 h = hash3(vec3(gl_FragCoord.xy, uSeed));
  vec3 h2 = hash3(vec3(gl_FragCoord.xy + 91.0, uSeed + 3.0));
  float g = (h.x + h.y + h2.x + h2.y - 2.0)*0.5;
  c += g*uGrain*mix(1.0, 0.45, smoothstep(0.45, 1.0, luma(c)));
  c += (h.z - 0.5)/255.0;
  fragColor = vec4(c, 1.0);
}`;

const RAMP = ' .,:;-=+*x#%@$';

export class Final {
  constructor(glx, W, H) {
    this.g = glx; const gl = glx.gl; this.W = W; this.H = H;
    this.p = glx.program(FS_FINAL, 'final');
    this.ui = glx.tex2D({ w: W, h: H, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
    // glyph atlas for the ASCII world
    const cw = 24, ch = 48, cv = document.createElement('canvas'); cv.width = cw * RAMP.length; cv.height = ch;
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, ch);
    c.fillStyle = '#fff'; c.font = '600 38px "Plex", monospace'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let i = 0; i < RAMP.length; i++) c.fillText(RAMP[i], i * cw + cw / 2, 37);
    this.glyphs = glx.tex2D({ w: cv.width, h: ch, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
    gl.bindTexture(gl.TEXTURE_2D, this.glyphs.t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.stills = new Map();
  }
  uploadUI(canvas) {
    const gl = this.g.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.ui.t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  _u(ldr, o) {
    return { uLDR: ldr, uB: o.b || ldr, uUI: this.ui, uGlyphs: this.glyphs, uRes: [this.W, this.H], uSeed: o.seed || 0, uGrain: o.grain ?? 0.035,
      uSceneOn: o.sceneOn ? 1 : 0, uBG: o.bg || [6 / 255, 7 / 255, 9 / 255], uStyle: o.style || 0, uMode: o.mode || 0, uScroll: o.scroll || 0, uBlur: o.blur || 0, uHorizonV: this.horizonV ?? 0.4, uSunUV: this.sunUV || [0.5, 0.4, 0.02] };
  }
  draw(ldr, o) { this.g.draw(this.p, null, this._u(ldr, o)); }
  // bake a styled scene into a cached texture (used by the rewind strip)
  bake(key, ldr, style) {
    const gl = this.g.gl;
    let t = this.stills.get(key);
    if (!t) { t = this.g.target(this.W, this.H, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }); this.stills.set(key, t); }
    this.g.draw(this.p, t, this._u(ldr, { style, mode: 1, sceneOn: true }));
    return t;
  }
}
