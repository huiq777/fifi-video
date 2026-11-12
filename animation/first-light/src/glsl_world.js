import { HEAD, ATMO, ATMO_LUT } from './glsl_common.js';

export const NW = 32; // number of sine waves in the sea

// deterministic wave set: directions fan out with frequency; deep-water dispersion w = sqrt(g k)
export function waveParams(seed = 7, windAng = -Math.PI / 2 + 0.3) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  let k = (2 * Math.PI) / 95.0;
  for (let i = 0; i < NW; i++) {
    const spread = 0.22 + 1.15 * (i / NW);
    const th = windAng + (rnd() * 2 - 1) * spread;
    out.push({ dx: Math.cos(th), dz: Math.sin(th), k, om: Math.sqrt(9.81 * k), ph: rnd() * 6.2831853, ik: 1 / k });
    k *= 1.2;
  }
  return out;
}
export function waveConsts(waves = waveParams()) {
  const wv = waves.map(w => `vec4(${w.dx.toFixed(6)}, ${w.dz.toFixed(6)}, ${w.k.toFixed(6)}, ${w.om.toFixed(6)})`);
  const wq = waves.map(w => `vec2(${w.ph.toFixed(5)}, ${w.ik.toFixed(6)})`);
  return `const int NW = ${NW};
const vec4 WV[${NW}] = vec4[${NW}](${wv.join(',\n')});
const vec2 WQ[${NW}] = vec2[${NW}](${wq.join(',\n')});\n`;
}

export const WORLD_BODY = `
uniform vec2 uRes; uniform vec2 uJitter; uniform vec3 uCamPos; uniform mat3 uCamMat; uniform float uTanFov;
uniform float uSeed; uniform float uTime; uniform float uCloudTime; uniform float uWeight; uniform float uPixAng;
uniform vec3 uSunDir; uniform vec2 uSunAz; uniform float uSunAngR; uniform float uSunDiscI; uniform float uSunGlow;
uniform sampler2D uSky; uniform sampler2D uEnv; uniform sampler2D uWeather; uniform sampler3D uNoiseA; uniform sampler3D uNoiseB;
uniform float uCamHkm;
uniform int uPass;            // 0 = camera view, 1 = environment map (sky + clouds, no disc)
uniform float uSeaOn; uniform float uSeaReveal; uniform float uSeaWire; uniform float uSeaShade;
uniform float uSteep; uniform float uChop; uniform vec3 uWaterDeep; uniform vec3 uWaterSSS; uniform float uGlitter; uniform float uFogDist;
uniform float uCloudBase; uniform float uCloudTop; uniform float uCoverage; uniform float uCovContrast; uniform float uCloudSigma;
uniform float uSlot; uniform float uSlotNear; uniform float uSlotFar;
uniform float uNoiseScale; uniform float uDetailScale; uniform float uErode; uniform float uCloudSun; uniform float uCloudAmb;
uniform vec3 uWind; uniform int uCloudSteps; uniform float uHazeDist;
uniform float uCirrus; uniform float uStars; uniform vec3 uVoid;
uniform vec3 uAmbTint; uniform float uTopVar; uniform float uLightStep;
uniform float uBands; uniform float uBandMix; uniform float uHorizonN;
uniform vec4 uBirds[16]; uniform int uBirdN; uniform float uShimmer;
uniform int uVar; uniform vec3 uSun2Dir; uniform vec3 uSun2Col; uniform float uSun2AngR; uniform float uSun2Disc;
uniform float uAurora; uniform vec3 uNightSky; uniform vec3 uPlanetDir; uniform float uPlanetR; uniform vec3 uBHDir; uniform float uBHSize; uniform float uBHGlow;

const float RGM = 6360000.0;
const vec2 SKY_RES = vec2(256.0, 192.0);

vec3 skyLUT(vec3 rd){
  float el = asin(clamp(rd.y, -1.0, 1.0));
  vec2 a = rd.xz / max(length(rd.xz), 1e-5);
  float az = acos(clamp(dot(a, uSunAz), -1.0, 1.0));
  float v = 0.5 + 0.5*sign(el)*sqrt(abs(el)/(0.5*PI));
  vec2 uv = (vec2(az/PI, v)*(SKY_RES - 1.0) + 0.5)/SKY_RES;
  return texture(uSky, uv).rgb;
}
vec2 envUV(vec3 R){
  float az = atan(R.x*uSunAz.y - R.z*uSunAz.x, dot(R.xz, uSunAz));
  float el = asin(clamp(R.y, 0.0, 1.0));
  return vec2(az/(2.0*PI) + 0.5, sqrt(el/(0.5*PI)));
}
float HG(float c, float g){ float g2 = g*g; return (1.0 - g2)/(4.0*PI*pow(1.0 + g2 - 2.0*g*c, 1.5)); }

float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)); }
// distant birds, as silhouettes in front of everything (drawn before bloom so the light wraps them)
float birdMask(vec2 p){
  float m = 0.0;
  for (int i = 0; i < 16; i++){
    if (i >= uBirdN) break;
    vec4 b = uBirds[i]; vec2 q = (p - b.xy)/b.z; q.x = abs(q.x);
    if (q.x > 1.3 || abs(q.y) > 0.8) continue;
    float fl = sin(b.w);
    vec2 c = vec2(0.42, 0.20*fl + 0.13), d = vec2(1.0, 0.40*fl - 0.03);
    float dd = min(sdSeg(q, vec2(0.0), c), sdSeg(q, c, d)) - mix(0.10, 0.03, clamp(q.x, 0.0, 1.0));
    float fw = (2.0/uRes.y)/b.z;
    m = max(m, 1.0 - smoothstep(-fw, fw, dd));
  }
  return m;
}
vec3 sunDisc(vec3 rd0){
  vec3 rd = rd0;
  if (uShimmer > 0.0){
    float e = max(rd0.y, 0.0);
    float wob = (sin(rd0.y*2600.0 + uTime*5.0) + sin(rd0.y*1130.0 - uTime*3.1) + sin(rd0.y*5200.0 + uTime*7.0)*0.5)*0.00030*uShimmer*exp(-e*70.0);
    rd = normalize(rd0 + vec3(wob, (rd0.y - uSunDir.y)*0.16*uShimmer, 0.0));
  }
  float c = dot(rd, uSunDir);
  float ang = acos(clamp(c, -1.0, 1.0));
  float edge = 1.0 - smoothstep(uSunAngR - uPixAng, uSunAngR + uPixAng, ang);
  vec3 col = vec3(0.0);
  vec3 Tv = sunTrans(Rg + uCamHkm, rd.y);
  if (edge > 0.0){
    float m = sqrt(max(1.0 - (ang*ang)/(uSunAngR*uSunAngR), 0.0));
    vec3 limb = vec3(pow(m, 0.22), pow(m, 0.36), pow(m, 0.52));
    col += uSunDiscI * Tv * limb * edge;
  }
  // forward-scattering aureole (tight Mie peak that the LUT can't resolve)
  vec3 Ts = sunTrans(Rg + uCamHkm, max(uSunDir.y, rd.y));
  col += uSunGlow * Ts * (0.9*exp(-ang*60.0) + 0.10*exp(-ang*16.0) + 0.012*exp(-ang*5.0));
  return col;
}

vec3 stars(vec3 rd){
  vec3 d = rd*190.0; vec3 id = floor(d); vec3 f = fract(d) - 0.5;
  vec3 h = hash3i(ivec3(id));
  if (h.z < 0.93) return vec3(0.0);
  vec3 o = (hash3i(ivec3(id) + 17) - 0.5)*0.6;
  float dist = length(f - o);
  float b = (pow(h.x, 7.0)*3.0 + 0.06)*0.006;
  float r = 0.11 + 0.10*h.x;
  vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.7, 0.82, 1.0), h.y);
  return tint * b * smoothstep(r, r*0.25, dist);
}

// ------------------------------------------------------------------ sea
float seaH(vec2 p, int iters, float fp, out float lost){
  float h = 0.0; lost = 0.0;
  for (int i = 0; i < iters; i++){
    vec4 w = WV[i]; vec2 q = WQ[i];
    float x = dot(w.xy, p)*w.z - w.w*uTime + q.x;
    float e = exp(sin(x) - 1.0);
    float dx = e*cos(x);
    float fade = clamp(6.28318*q.y/(fp*3.0) - 0.35, 0.0, 1.0);
    p -= w.xy*(dx*q.y*uChop*fade);
    h += (e - 0.466)*q.y*fade;
    lost += 1.0 - fade*fade;
  }
  lost *= uSteep*uSteep*0.07;
  return h*uSteep;
}
float seaTrace(vec3 ro, vec3 rd){
  float bound = uSteep*34.0;
  float hTop = bound*0.6, hBot = -bound*0.4;
  float tPlane = -ro.y/rd.y;
  if (tPlane > 2600.0) return tPlane;
  float t = max((hTop - ro.y)/rd.y, 0.0);
  float tBot = (hBot - ro.y)/rd.y;
  float den = 0.8*length(rd.xz) - rd.y;
  float lost;
  for (int i = 0; i < 72; i++){
    vec3 p = ro + rd*t;
    float d = p.y - seaH(p.xz, 13, t*uPixAng, lost);
    if (d < 0.0015*t + 0.002) break;
    t += d/den;
    if (t > tBot){ t = tBot; break; }
  }
  return t;
}
float gridLine(vec2 xz, float s, float w){
  vec2 g = abs(fract(xz/s + 0.5) - 0.5)*s;
  return 1.0 - smoothstep(w*0.6, w*1.6, min(g.x, g.y));
}
vec3 shadeSea(vec3 ro, vec3 rd, float t, vec3 ambTop, float sunVis){
  vec3 p = ro + rd*t;
  float fp = t*uPixAng;
  float fpN = fp/sqrt(max(-rd.y, 0.02));
  float e = max(fpN*0.55, 0.012);
  float lost, l2;
  float h0 = seaH(p.xz, NW, fpN, lost);
  float hx = seaH(p.xz + vec2(e, 0.0), NW, fpN, l2);
  float hz = seaH(p.xz + vec2(0.0, e), NW, fpN, l2);
  vec3 N = normalize(vec3(h0 - hx, e, h0 - hz));
  vec3 V = -rd;
  float NV = max(dot(N, V), 1e-3);
  float a2 = 0.00035 + lost*2.2;
  float al = sqrt(a2);
  float F = 0.02 + 0.98*pow(1.0 - NV, 5.0);
  vec3 R = reflect(rd, N); R.y = abs(R.y) + 0.003; R = normalize(R);
  float lod = clamp(log2(al*164.0), 0.0, 6.0);
  vec4 env = textureLod(uEnv, envUV(R), lod);
  vec3 Lv = uSunDir; vec3 Hh = normalize(Lv + V);
  float NH = max(dot(N, Hh), 0.0), NL = max(dot(N, Lv), 0.0), VH = max(dot(V, Hh), 0.0);
  float dd = NH*NH*(a2 - 1.0) + 1.0;
  float D = a2/(PI*dd*dd);
  float Vis = 0.5/max(NL*sqrt(NV*NV*(1.0 - a2) + a2) + NV*sqrt(NL*NL*(1.0 - a2) + a2), 1e-4);
  float Fh = 0.02 + 0.98*pow(1.0 - VH, 5.0);
  vec3 Esun = sunTrans(Rg + 0.002, uSunDir.y + 0.004)*sunVis;
  vec3 spec = Esun*(min(D, 4000.0)*Vis*Fh*NL)*uGlitter;
  if (uSun2Col.r + uSun2Col.g + uSun2Col.b > 0.0){
    vec3 H2 = normalize(uSun2Dir + V);
    float nh = max(dot(N, H2), 0.0), nl = max(dot(N, uSun2Dir), 0.0), vh = max(dot(V, H2), 0.0);
    float d2 = nh*nh*(a2 - 1.0) + 1.0;
    float D2 = a2/(PI*d2*d2);
    float V2 = 0.5/max(nl*sqrt(NV*NV*(1.0 - a2) + a2) + NV*sqrt(nl*nl*(1.0 - a2) + a2), 1e-4);
    spec += uSun2Col*(min(D2, 4000.0)*V2*(0.02 + 0.98*pow(1.0 - vh, 5.0))*nl)*uGlitter;
  }
  vec3 body = uWaterDeep*(luma(ambTop)*2.2 + luma(env.rgb)*0.6);
  float back = pow(saturate(dot(rd, uSunDir)*0.5 + 0.5), 5.0);
  vec3 sss = Esun*uWaterSSS*back*saturate(0.35 + h0/(uSteep*9.0));
  vec3 col = mix(body + sss, env.rgb, F) + spec;
  // construction view: wireframe
  if (uSeaWire > 0.001){
    float s = 2.0;
    float lf = log2(max(fp*16.0/s, 1.0)); float l0 = floor(lf); float fr = lf - l0;
    float s0 = s*exp2(l0);
    float g = mix(gridLine(p.xz, s0, fp*1.2), gridLine(p.xz, s0*2.0, fp*1.2), fr);
    vec3 wcol = vec3(0.75, 0.86, 1.0)*0.034*g*(0.35 + 0.65*exp(-t/600.0));
    col = mix(col*uSeaShade, wcol + col*uSeaShade, uSeaWire);
  } else col *= uSeaShade;
  // aerial perspective into the horizon
  float fog = 1.0 - exp(-t/uFogDist);
  vec3 air = skyLUT(normalize(vec3(rd.x, 0.012, rd.z)));
  col = mix(col, air*mix(uSeaShade, 1.0, 0.0), fog*uSeaShade) ;
  return col;
}

// ------------------------------------------------------------------ clouds
vec3 smoothUV(vec3 uv, float res){ uv = uv*res + 0.5; vec3 i = floor(uv), f = fract(uv); f = f*f*(3.0 - 2.0*f); return (i + f - 0.5)/res; }
float altOf(vec3 p){ vec2 d = p.xz - uCamPos.xz; return p.y + dot(d, d)*(0.5/RGM); }
// distances along the ray where altitude == H (paraboloid earth); returns (near, far) or (-1,-1)
vec2 shellHit(vec3 ro, vec3 rd, float H){
  float a = (1.0 - rd.y*rd.y)*(0.5/RGM); float b = rd.y; float c = ro.y - H;
  if (a < 1e-12) { float t = -c/b; return vec2(t, t); }
  float disc = b*b - 4.0*a*c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2((-b - s)/(2.0*a), (-b + s)/(2.0*a));
}
float cloudDensity(vec3 p, float h01, float lod, bool cheap){
  vec3 q = p + uWind*uCloudTime;
  vec2 rel = p.xz - uCamPos.xz;
  vec4 w = texture(uWeather, q.xz*(1.0/52000.0));
  float cov = uCoverage + (w.r - 0.5)*uCovContrast + (w.g - 0.5)*uCovContrast*0.35;
  float along = dot(rel, uSunAz);
  cov *= 1.0 - smoothstep(uSlotNear, uSlotFar, along)*uSlot;
  cov *= 1.0 - smoothstep(70000.0, 120000.0, length(rel));
  cov = saturate(cov);
  if (cov < 0.02) return 0.0;
  float topH = mix(1.0 - uTopVar, 1.0, smoothstep(0.35, 0.75, texture(uWeather, q.xz*(1.0/19000.0) + 0.43).g));
  float prof = smoothstep(0.0, 0.07, h01)*smoothstep(topH, topH*0.45, h01);
  if (prof <= 0.0) return 0.0;
  vec4 n = textureLod(uNoiseA, smoothUV(q*(1.0/uNoiseScale), 128.0), lod);
  float wf = n.g*0.625 + n.b*0.25 + n.a*0.125;
  float base = remap(n.r, wf - 1.0, 1.0, 0.0, 1.0)*prof;
  float d = remap(base, 1.0 - cov, 1.0, 0.0, 1.0)*cov;
  if (d <= 0.0) return 0.0;
  if (!cheap){
    vec4 hf = textureLod(uNoiseB, smoothUV(q*(1.0/uDetailScale), 64.0), lod);
    float hfb = hf.r*0.625 + hf.g*0.25 + hf.b*0.125;
    float m = mix(hf.a, 1.0 - hfb, 0.28*saturate(h01*4.0));   // smooth erosion; only a little of the creased billow term (it cut hairline cracks)
    d = remap(d, m*uErode, 1.0, 0.0, 1.0);
  }
  return max(d, 0.0)*mix(0.7, 1.25, h01);
}
// returns rgb = in-scattered radiance, a = transmittance
vec4 clouds(vec3 ro, vec3 rd, float tLimit, float dither, vec3 ambTop, vec3 ambSide){
  if (uCoverage <= 0.001) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 hb = shellHit(ro, rd, uCloudBase), ht = shellHit(ro, rd, uCloudTop);
  if (ht.y < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0, t1;
  float alt0 = ro.y;
  if (alt0 < uCloudBase){ t0 = hb.y; t1 = ht.y; }
  else if (alt0 > uCloudTop){
    if (ht.x < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
    t0 = ht.x; t1 = (hb.x > 0.0) ? hb.x : ht.y;
  } else { t0 = 0.0; t1 = (hb.x > 0.0) ? hb.x : ht.y; }
  t1 = min(t1, min(tLimit, 150000.0));
  if (t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);
  float seg = t1 - t0;
  float nC = clamp(seg/110.0, 24.0, float(uCloudSteps));
  float dtL = seg/nC, dtS = dtL*0.25;
  float cosT = dot(rd, uSunDir);
  vec3 L = vec3(0.0); float T = 1.0; float tMean = 0.0, wSum = 0.0;
  float thick = uCloudTop - uCloudBase;
  float t = t0 + dither*dtL;
  bool fine = false; int zero = 0; float tDone = t0;
  int maxIt = uCloudSteps*3;
  for (int i = 0; i < maxIt; i++){
    if (t >= t1 || T < 0.004) break;
    vec3 p = ro + rd*t;
    float alt = altOf(p); float h01 = (alt - uCloudBase)/thick;
    float lod = clamp(log2(t/11000.0), 0.0, 3.0);
    float d = (h01 < 0.0 || h01 > 1.0) ? 0.0 : cloudDensity(p, h01, lod, t > 50000.0);
    if (!fine){
      if (d > 0.0){ fine = true; zero = 0; t = max(t - dtL + dtS*0.5, tDone); }
      else t += dtL;
      continue;
    }
    if (d > 0.002){
      zero = 0;
      float sig = d*uCloudSigma;
      float od = 0.0; float ls = uLightStep; vec3 lp = p;
      for (int j = 0; j < 7; j++){
        lp += uSunDir*ls*(j == 0 ? 0.6 : 1.0);
        float lh = (altOf(lp) - uCloudBase)/thick;
        if (lh >= 0.0 && lh <= 1.0) od += cloudDensity(lp, lh, lod + 0.7, true)*ls;
        ls *= 1.7;
      }
      od *= uCloudSigma;
      float mus = uSunDir.y + dot(p.xz - uCamPos.xz, uSunDir.xz)/RGM;
      vec3 Es = sunTrans(Rg + alt*1e-3, mus);
      float scat = 0.0; float a = 1.0, b = 1.0, c = 1.0;
      for (int o = 0; o < 4; o++){
        float ph = mix(HG(cosT, 0.78*c), HG(cosT, -0.28*c), 0.3);
        scat += b*ph*exp(-od*a);
        a *= 0.4; b *= 0.6; c *= 0.5;
      }
      // sky / horizon fill: tops see the zenith, flanks and bases see the bright horizon ring
      float occl = exp(-d*uCloudSigma*thick*(1.0 - h01)*0.08);
      vec3 amb = (ambTop*mix(0.3, 1.0, occl)*mix(0.45, 1.0, saturate(h01*1.3)) + ambSide*0.22)*uAmbTint;
      vec3 S = (Es*scat*uCloudSun + amb*uCloudAmb)*sig;
      float Tst = exp(-sig*dtS);
      L += T*(S - S*Tst)/sig;
      float w = T*(1.0 - Tst); tMean += t*w; wSum += w;
      T *= Tst;
    } else { zero++; if (zero > 8){ fine = false; tDone = t + dtS; t += dtL; continue; } }
    t += dtS;
  }
  if (T < 0.004) T = 0.0;
  if (wSum > 1e-5){
    float tm = tMean/wSum;
    float f = 1.0 - exp(-tm/uHazeDist);
    L = mix(L, skyLUT(rd)*(1.0 - T), f);
  }
  return vec4(L, T);
}

// thin high ice clouds: one 2D layer, far above the weather
vec4 cirrus(vec3 ro, vec3 rd){
  if (uCirrus <= 0.001) return vec4(0.0);
  const float H = 9500.0;
  vec2 hs = shellHit(ro, rd, H);
  float t = ro.y < H ? hs.y : hs.x;
  if (t <= 0.0 || t > 420000.0) return vec4(0.0);
  vec3 p = ro + rd*t;
  vec2 uv = p.xz + uWind.xz*uCloudTime*2.5;
  // streaks: stretched, warped fbm
  mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
  vec2 q = rot*uv;
  vec2 warp = texture(uWeather, q*vec2(1.0/90000.0, 1.0/61000.0)).rg - 0.5;
  vec2 s = q*vec2(1.0/140000.0, 1.0/30000.0) + warp*0.35;
  vec4 w1 = texture(uWeather, s);
  vec4 w2 = texture(uWeather, s*3.1 + 0.37);
  float n = w1.r*0.55 + w2.g*0.3 + w2.a*0.15;
  float big = texture(uWeather, q*(1.0/260000.0) + 0.21).g;
  float d = smoothstep(0.40, 0.92, n + (big - 0.5)*0.7); d = pow(d, 1.6)*0.6*uCirrus;
  d *= 1.0 - smoothstep(180000.0, 400000.0, t);
  if (d <= 0.0) return vec4(0.0);
  float mus = uSunDir.y + dot(p.xz - uCamPos.xz, uSunDir.xz)/RGM;
  vec3 Es = sunTrans(Rg + H*1e-3, mus);
  float cosT = dot(rd, uSunDir);
  float ph = mix(HG(cosT, 0.7), HG(cosT, -0.2), 0.35) + 0.04;
  vec3 col = (Es*ph*2.4 + skyLUT(vec3(0.0, 1.0, 0.0))*0.8)*d;
  float f = 1.0 - exp(-t/(uHazeDist*4.0));
  col = mix(col, skyLUT(rd)*d, f);
  return vec4(col, d);
}


// ================================================================== variants
float wtex(vec2 uv){ return texture(uWeather, uv).r; }

// ---- 03: aurora curtains, marched through 95..315 km
vec3 aurora(vec3 ro, vec3 rd, float dither){
  if (rd.y < 0.015) return vec3(0.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 44; i++){
    float hk = (float(i) + dither)/44.0;
    float h = 95000.0 + hk*220000.0;
    float t = shellHit(ro, rd, h).y;
    vec3 p = ro + rd*t;
    vec2 q = (p.xz - uCamPos.xz)*1e-5;                 // units of 100 km
    float tt = uTime*0.06;
    float w1 = sin(q.x*0.9 + tt)*0.55 + sin(q.x*2.3 - tt*1.7 + 1.3)*0.22 + (wtex(q*0.07 + vec2(tt*0.02, 0.0)) - 0.5)*1.6;
    float w2 = sin(q.x*0.6 - tt*0.8 + 2.0)*0.7 + (wtex(q*0.05 + 0.4) - 0.5)*2.0;
    float d1 = q.y - 4.2 - w1, d2 = q.y - 7.5 - w2, d3 = q.y - 2.2 - w2*0.6 + w1*0.4;
    float band = exp(-d1*d1*70.0) + 0.7*exp(-d2*d2*34.0) + 0.6*exp(-d3*d3*110.0) + 0.05;
    float rays = 0.35 + 0.65*smoothstep(0.25, 0.8, texture(uWeather, vec2(q.x*0.9 + w1*0.15, q.y*0.02 + tt*0.03)).a);
    float prof = exp(-hk*3.4)*smoothstep(0.0, 0.05, hk);
    vec3 c = mix(vec3(0.08, 1.0, 0.42), vec3(0.55, 0.16, 0.95), smoothstep(0.1, 0.7, hk));
    c = mix(c, vec3(1.0, 0.2, 0.45), smoothstep(0.55, 1.0, hk)*0.6);
    col += c*band*rays*prof;
  }
  return col*uAurora*(0.0045)*smoothstep(0.015, 0.09, rd.y);
}
vec3 milkyWay(vec3 rd){
  vec3 n = normalize(vec3(0.75, 0.35, -0.55));
  float d = dot(rd, n);
  float band = exp(-d*d*22.0);
  vec2 uv = vec2(atan(rd.x, rd.z), rd.y)*0.35;
  float f = wtex(uv*1.3)*0.6 + texture(uWeather, uv*4.0).a*0.4;
  return vec3(0.75, 0.82, 1.0)*band*smoothstep(0.3, 0.9, f)*0.0011;
}

// ---- 05: a ringed giant, back-lit, beyond the atmosphere (additive)
vec3 planet(vec3 rd){
  vec3 C = uPlanetDir; float R = sin(uPlanetR);
  vec3 Nr = normalize(vec3(0.42, 0.88, -0.22));        // ring plane normal
  vec3 L = uSunDir;
  vec3 col = vec3(0.0);
  float b = dot(rd, C); float disc = b*b - (1.0 - R*R);
  float tS = disc > 0.0 ? b - sqrt(disc) : 1e9;
  // rings
  float dn = dot(rd, Nr);
  float tR = abs(dn) > 1e-5 ? dot(C, Nr)/dn : -1.0;
  vec3 ringCol = vec3(0.0); float ringA = 0.0;
  if (tR > 0.0){
    vec3 pr = rd*tR - C; float rr = length(pr)/R;
    if (rr > 1.28 && rr < 2.42){
      float bands = 0.55 + 0.45*sin(rr*42.0 + sin(rr*17.0)*2.0);
      bands *= smoothstep(1.28, 1.34, rr)*smoothstep(2.42, 2.34, rr);
      bands *= 1.0 - 0.85*smoothstep(0.02, 0.0, abs(rr - 1.95) - 0.03);  // a gap
      // planet's shadow on the rings
      float bs = dot(pr, L); float ds = bs*bs - (dot(pr, pr) - R*R);
      float sh = (ds > 0.0 && bs < 0.0) ? 0.0 : 1.0;
      sh = mix(sh, 1.0, 0.0);
      float fwd = 0.35 + 1.6*pow(saturate(dot(rd, L)), 6.0);
      ringCol = vec3(1.0, 0.86, 0.66)*bands*fwd*mix(0.12, 1.0, sh);
      ringA = bands*0.55;
    }
  }
  vec3 Tv = sunTrans(Rg + uCamHkm, max(rd.y, 0.0));
  if (tS < 1e8){
    vec3 n = (rd*tS - C)/R;
    float lam = saturate(dot(n, L)*1.0 + 0.04);
    float lat = dot(n, Nr);
    vec3 alb = mix(vec3(0.95, 0.80, 0.56), vec3(0.78, 0.55, 0.36), 0.5 + 0.5*sin(lat*24.0 + sin(lat*9.0)*1.5));
    float rim = pow(1.0 - saturate(dot(n, -rd)), 3.0);
    vec3 body = alb*(lam*1.6 + 0.05) + vec3(0.5, 0.7, 1.0)*rim*0.10;
    if (tR > 0.0 && tR < tS) col = ringCol + body*(1.0 - ringA);
    else col = body;
  } else col = ringCol;
  return col*0.16*mix(vec3(1.0), Tv, 0.5);
}

// ---- 06: 1984
vec3 synthSky(vec3 rd){
  float e = max(rd.y, 0.0);
  vec3 c = mix(vec3(1.0, 0.22, 0.52), vec3(0.26, 0.03, 0.45), smoothstep(0.0, 0.2, e));
  c = mix(c, vec3(0.02, 0.0, 0.08), smoothstep(0.14, 0.62, e));
  c += vec3(1.0, 0.5, 0.15)*exp(-e*22.0)*0.6;
  c *= 0.9;
  vec3 sd = normalize(vec3(0.0, 0.118, 1.0)); float R = 0.165;
  float ang = acos(clamp(dot(rd, sd), -1.0, 1.0));
  float m = 1.0 - smoothstep(R - uPixAng*1.5, R + uPixAng*1.5, ang);
  if (m > 0.0){
    float y = (rd.y - sd.y)/R;
    vec3 sc = mix(vec3(1.0, 0.12, 0.5), vec3(1.0, 0.9, 0.25), smoothstep(-0.95, 0.75, y));
    float yy = (0.3 - y)/1.3;
    float cut = 0.0;
    if (yy > 0.0){ float f = fract(yy*6.5); float w = 0.16 + 0.42*yy; cut = smoothstep(w + 0.02, w - 0.02, f); }
    c = mix(c, sc*1.35, m*(1.0 - cut));
  }
  c += vec3(1.0, 0.3, 0.6)*exp(-ang*ang*9.0)*0.35;
  c += stars(rd)*90.0*smoothstep(0.1, 0.5, e);
  return c;
}
vec3 synthSea(vec3 ro, vec3 rd){
  float t = seaTrace(ro, rd);
  vec3 p = ro + rd*t; float fp = t*uPixAng;
  float lost, l2; float e = max(fp*0.8, 0.05);
  float h0 = seaH(p.xz, 10, fp, lost), hx = seaH(p.xz + vec2(e, 0.0), 10, fp, l2), hz = seaH(p.xz + vec2(0.0, e), 10, fp, l2);
  vec3 N = normalize(vec3(h0 - hx, e, h0 - hz));
  vec3 R = reflect(rd, N); R.y = abs(R.y) + 0.01; R = normalize(R);
  float F = 0.06 + 0.94*pow(1.0 - max(dot(N, -rd), 0.0), 4.0);
  vec3 col = vec3(0.012, 0.0, 0.035) + synthSky(R)*F*0.55;
  float s = 8.0;
  float lf = log2(max(fp*10.0/s, 1.0)); float l0 = floor(lf); float fr = lf - l0; float s0 = s*exp2(l0);
  float w = max(fp*1.4, 0.09);
  vec2 gq = p.xz - vec2(0.0, uCamPos.z*0.0);
  float g = mix(gridLine(gq, s0, w), gridLine(gq, s0*2.0, w), fr);
  float glowW = w*5.0;
  float gg = mix(gridLine(gq, s0, glowW), gridLine(gq, s0*2.0, glowW), fr);
  vec3 neon = mix(vec3(1.0, 0.15, 0.75), vec3(0.2, 0.9, 1.0), smoothstep(40.0, 900.0, t));
  col += neon*(g*3.2 + gg*0.35)*exp(-t/1500.0);
  col = mix(col, vec3(1.0, 0.25, 0.55)*0.85, 1.0 - exp(-t/5200.0));
  return col;
}

// ---- 08: Schwarzschild black hole with a thin accretion disc (bent rays)
vec4 blackHole(vec3 rd, out vec3 bent, out float captured){
  float D = 2.6/tan(uBHSize);
  vec3 x = -uBHDir*D; vec3 v = rd;
  vec3 hv = cross(x, v); float h2 = dot(hv, hv);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(up, uBHDir));
  vec3 n = normalize(up*0.985 - uBHDir*0.125 + side*0.20);
  vec3 col = vec3(0.0); float alpha = 0.0; captured = 0.0;
  for (int i = 0; i < 150; i++){
    float r2 = dot(x, x); float r = sqrt(r2);
    if (r < 1.0){ captured = 1.0; break; }
    if (r > D*1.3 && dot(x, v) > 0.0) break;
    float dt = clamp(0.11*(r - 0.55), 0.03, 4.0);
    vec3 acc = -1.5*h2*x/(r2*r2*r);
    vec3 v2 = v + acc*dt; vec3 x2 = x + v2*dt;
    float s0 = dot(x, n), s1 = dot(x2, n);
    if (s0*s1 < 0.0){
      vec3 pc = mix(x, x2, s0/(s0 - s1)); float rc = length(pc);
      if (rc > 2.7 && rc < 14.0){
        float prof = pow(3.0/rc, 2.1);
        vec3 tang = normalize(cross(n, pc));
        float beta = sqrt(0.5/rc);
        float dop = 1.0/(1.0 + beta*dot(tang, normalize(v)));
        dop = dop*dop*dop;
        float angc = atan(dot(pc, side), dot(pc, cross(n, side)));
        float streak = 0.55 + 0.45*texture(uWeather, vec2(angc*0.32 + uTime*0.02*pow(3.0/rc, 1.5), rc*0.11)).a;
        streak *= 0.7 + 0.3*texture(uWeather, vec2(angc*0.9, rc*0.5)).g;
        vec3 ec = mix(vec3(1.0, 0.32, 0.07), vec3(1.0, 0.86, 0.62), saturate(prof*0.9*dop));
        float a = saturate(streak*1.4)*smoothstep(14.0, 9.0, rc)*smoothstep(2.7, 3.3, rc)*(1.0 - alpha);
        col += ec*prof*dop*a*uBHGlow;
        alpha += a*0.92;
      }
    }
    x = x2; v = v2;
  }
  bent = normalize(v);
  return vec4(col, alpha);
}

void main(){
  vec3 ro = uCamPos; vec3 rd;
  vec2 px = gl_FragCoord.xy + uJitter;
  if (uPass == 1){
    vec2 x = px/uRes;
    float az = (x.x - 0.5)*2.0*PI; float el = x.y*x.y*0.5*PI;
    vec2 a = vec2(uSunAz.x*cos(az) + uSunAz.y*sin(az), uSunAz.y*cos(az) - uSunAz.x*sin(az));
    rd = vec3(a.x*cos(el), sin(el), a.y*cos(el));
  } else {
    vec2 ndc = (px/uRes)*2.0 - 1.0;
    rd = uCamMat*normalize(vec3(ndc.x*uTanFov*uRes.x/uRes.y, ndc.y*uTanFov, 1.0));
  }
  float dither = fract(ign(gl_FragCoord.xy + 5.588238*uSeed) + uSeed*0.61803399);
  vec3 ambTop = (skyLUT(vec3(0.0, 1.0, 0.0))*3.0 + skyLUT(normalize(vec3(uSunAz.x, 0.9, uSunAz.y)))*0.5 + skyLUT(normalize(vec3(-uSunAz.x, 0.7, -uSunAz.y)))*1.5
               + skyLUT(normalize(vec3(uSunAz.y, 0.7, -uSunAz.x)))*2.0)/7.0;
  vec3 ambSide = (skyLUT(normalize(vec3(-uSunAz.x, 0.07, -uSunAz.y))) + skyLUT(normalize(vec3(uSunAz.y, 0.07, -uSunAz.x)))*2.0)/3.0;
  vec3 col;
  if (uVar == 6 && uPass == 0){
    col = rd.y < 0.0 ? synthSea(ro, rd) : synthSky(rd);
    fragColor = vec4(col*uWeight, uWeight); return;
  }
  bool sea = (uPass == 0) && (uSeaOn > 0.5) && (rd.y < -1e-5);
  if (sea){
    float dep = -rd.y;
    if (dep > uSeaReveal) col = uVoid;
    else {
      float t = seaTrace(ro, rd);
      float sunVis = textureLod(uEnv, envUV(normalize(uSunDir + vec3(0.0, 0.02, 0.0))), 2.0).a;
      col = shadeSea(ro, rd, t, ambTop + uNightSky, mix(1.0, sunVis, 0.85));
      float edge = exp(-(uSeaReveal - dep)/0.004)*step(uSeaReveal, 0.9);
      col += vec3(0.9, 0.95, 1.0)*0.25*edge;
    }
  } else if (uPass == 0 && rd.y < 0.0 && uCamHkm < 0.5){
    col = uVoid;
  } else {
    col = skyLUT(rd) + uNightSky*(0.35 + 0.65*exp(-max(rd.y, 0.0)*5.0));
    if (uPass == 0 && uBandMix > 0.0){
      float ny = (px.y/uRes.y)*2.0 - 1.0;
      float f = clamp((ny - uHorizonN)/(1.0 - uHorizonN), 0.0, 0.9999);
      float nyb = uHorizonN + (floor(f*uBands) + 0.5)/uBands*(1.0 - uHorizonN);
      col = mix(col, skyLUT(uCamMat*normalize(vec3(0.0, nyb*uTanFov, 1.0))), uBandMix);
    }
    vec3 st = vec3(0.0);
    if (uPass == 0) st = stars(rd)*uStars*(1.0 - uBandMix);
    if (uVar == 3){ col += milkyWay(rd) + aurora(ro, rd, dither); }
    if (uVar == 5){ col += planet(rd); }
    if (uVar == 8){
      float ca = dot(rd, uBHDir);
      if (uPass == 0 && ca > 0.90){
        vec3 bent; float cap; vec4 bh = blackHole(rd, bent, cap);
        vec3 bg = cap > 0.5 ? vec3(0.0) : (skyLUT(bent) + uNightSky*(0.35 + 0.65*exp(-max(bent.y, 0.0)*5.0)) + stars(bent)*uStars);
        float edgeW = smoothstep(0.90, 0.93, ca);
        col = mix(col + st, bg*(1.0 - bh.a) + bh.rgb, edgeW); st = vec3(0.0);
      } else if (uPass == 1){
        float ang = acos(clamp(ca, -1.0, 1.0));
        col += vec3(1.0, 0.5, 0.18)*uBHGlow*0.22*exp(-ang*ang/(2.0*0.09*0.09));
      }
    }
    col += st;
    if (uPass == 0){
      col += sunDisc(rd);
      if (uSun2Disc > 0.0){
        float a2 = acos(clamp(dot(rd, uSun2Dir), -1.0, 1.0));
        float m2 = 1.0 - smoothstep(uSun2AngR - uPixAng, uSun2AngR + uPixAng, a2);
        vec3 T2 = sunTrans(Rg + uCamHkm, rd.y);
        col += uSun2Col*uSun2Disc*T2*(m2*30.0 + 0.6*exp(-a2*38.0) + 0.06*exp(-a2*9.0));
      }
    }
    vec4 ci = cirrus(ro, rd);
    col = col*(1.0 - ci.a) + ci.rgb;
    vec4 cl = clouds(ro, rd, 1e9, dither, ambTop + uNightSky*2.0, ambSide + uNightSky);
    col = col*cl.a + cl.rgb;
    if (uPass == 1){ fragColor = vec4(col, cl.a*(1.0 - ci.a*0.6)); return; }
  }
  if (uPass == 0 && uBirdN > 0){ vec2 nd = (px/uRes)*2.0 - 1.0; nd.x *= uRes.x/uRes.y; col *= 1.0 - 0.96*birdMask(nd); }
  fragColor = vec4(col*uWeight, uWeight);
}`;

export function worldFS(waves) { return HEAD + ATMO + ATMO_LUT + waves + WORLD_BODY; }
