import { HEAD, ATMO, ATMO_LUT } from './glsl_common.js';

// --- Transmittance LUT: T(r, mu) from a point to the top of the atmosphere.
export const FS_TRANS = HEAD + ATMO + `
uniform vec2 uRes;
void main(){
  vec2 x = (gl_FragCoord.xy - 0.5) / (uRes - 1.0);
  float H = sqrt(Rt*Rt - Rg*Rg);
  float rho = H * x.y;
  float r = sqrt(rho*rho + Rg*Rg);
  float dmin = Rt - r, dmax = rho + H;
  float d = dmin + x.x*(dmax - dmin);
  float mu = d < 1e-5 ? 1.0 : (H*H - rho*rho - d*d)/(2.0*r*d);
  mu = clamp(mu, -1.0, 1.0);
  float tMax = topDist(r, mu);
  const int N = 96;
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++){
    float t = tMax*(float(i) + 0.5)/float(N);
    float h = sqrt(r*r + t*t + 2.0*r*mu*t) - Rg;
    od += atmoExt(atmoDens(max(h, 0.0)));
  }
  od *= tMax/float(N);
  fragColor = vec4(exp(-od), 1.0);
}`;

// --- Multiple scattering LUT (Hillaire 2020 style): Psi(mu_s, h).
export const FS_MS = HEAD + ATMO + ATMO_LUT + `
uniform vec2 uRes;
void main(){
  vec2 x = (gl_FragCoord.xy - 0.5)/(uRes - 1.0);
  float mus = x.x*2.0 - 1.0;
  float r = Rg + 0.01 + x.y*(Rt - Rg - 0.02);
  vec3 sun = vec3(sqrt(max(1.0 - mus*mus, 0.0)), mus, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 Lsum = vec3(0.0), Fsum = vec3(0.0);
  const int SQ = 8;
  for (int i = 0; i < SQ; i++) for (int j = 0; j < SQ; j++){
    float u = (float(i) + 0.5)/float(SQ), v = (float(j) + 0.5)/float(SQ);
    float cosT = 1.0 - 2.0*u; float sinT = sqrt(max(1.0 - cosT*cosT, 0.0)); float ph = 2.0*PI*v;
    vec3 rd = vec3(sinT*cos(ph), cosT, sinT*sin(ph));
    float mu = rd.y;
    bool ground = hitsGround(r, mu);
    float tMax = ground ? groundDist(r, mu) : topDist(r, mu);
    vec3 T = vec3(1.0), L = vec3(0.0), F = vec3(0.0);
    const int N = 20; float dt = tMax/float(N);
    for (int k = 0; k < N; k++){
      float t = (float(k) + 0.3)*dt; vec3 p = ro + rd*t; float pr = length(p); float h = max(pr - Rg, 0.0);
      vec3 dn = atmoDens(h); vec3 ext = max(atmoExt(dn), vec3(1e-9)); vec3 sca = bR*dn.x + vec3(bMs*dn.y);
      vec3 Ts = sunTrans(pr, dot(p/pr, sun));
      vec3 S = sca * Ts * (1.0/(4.0*PI));
      vec3 Tst = exp(-ext*dt);
      L += T*(S - S*Tst)/ext; F += T*(sca - sca*Tst)/ext; T *= Tst;
    }
    if (ground){
      vec3 p = ro + rd*tMax; vec3 n = normalize(p); float nl = saturate(dot(n, sun));
      L += T * sunTrans(Rg, dot(n, sun)) * nl * (0.06/PI);
    }
    Lsum += L; Fsum += F;
  }
  Lsum /= float(SQ*SQ); Fsum /= float(SQ*SQ);
  fragColor = vec4(Lsum/(1.0 - Fsum), 1.0);
}`;

// --- Sky-view LUT: radiance per unit sun irradiance for (azimuth from sun, elevation).
export const SKY_INTEGRATE = `
uniform sampler2D uMS;
uniform float uMieG;
vec3 skyIntegrate(vec3 ro, vec3 rd, vec3 sun){
  float r = length(ro); float mu = dot(ro, rd)/r;
  bool ground = hitsGround(r, mu);
  float tMax = ground ? groundDist(r, mu) : topDist(r, mu);
  float cosT = dot(rd, sun);
  float pR = 3.0/(16.0*PI)*(1.0 + cosT*cosT);
  float g = uMieG;
  float pM = 3.0/(8.0*PI) * ((1.0 - g*g)*(1.0 + cosT*cosT)) / ((2.0 + g*g)*pow(1.0 + g*g - 2.0*g*cosT, 1.5));
  vec3 T = vec3(1.0), L = vec3(0.0);
  const int N = 48; float prevT = 0.0;
  for (int i = 0; i < N; i++){
    float s1 = (float(i) + 1.0)/float(N); float tEnd = tMax*s1*s1; float dt = tEnd - prevT; float t = prevT + dt*0.5; prevT = tEnd;
    vec3 p = ro + rd*t; float pr = length(p); float h = max(pr - Rg, 0.0);
    vec3 dn = atmoDens(h); vec3 ext = max(atmoExt(dn), vec3(1e-9));
    vec3 scaR = bR*dn.x; float scaM = bMs*dn.y;
    float mus = dot(p/pr, sun);
    vec3 Ts = sunTrans(pr, mus);
    vec2 muv = vec2(mus*0.5 + 0.5, saturate(h/(Rt - Rg)));
    vec3 ms = texture(uMS, (muv*31.0 + 0.5)/32.0).rgb;
    vec3 S = Ts*(scaR*pR + scaM*pM) + ms*(scaR + vec3(scaM));
    vec3 Tst = exp(-ext*dt);
    L += T*(S - S*Tst)/ext; T *= Tst;
  }
  return L;
}`;

export const FS_SKY = HEAD + ATMO + ATMO_LUT + SKY_INTEGRATE + `
uniform vec2 uRes;
uniform float uSunElev;
uniform float uCamHkm;
void main(){
  vec2 x = (gl_FragCoord.xy - 0.5)/(uRes - 1.0);
  float az = x.x*PI;
  float vv = x.y*2.0 - 1.0;
  float el = sign(vv)*vv*vv*(0.5*PI);
  vec3 rd = vec3(cos(el)*cos(az), sin(el), cos(el)*sin(az));
  vec3 sun = vec3(cos(uSunElev), sin(uSunElev), 0.0);
  vec3 ro = vec3(0.0, Rg + max(uCamHkm, 0.0005), 0.0);
  fragColor = vec4(skyIntegrate(ro, rd, sun), 1.0);
}`;

// --- Tileable volume noise for clouds.
const NOISE_FN = `
vec3 hg3(vec3 p){ return hash3i(ivec3(p)) * 2.0 - 1.0; }
float gnoise(vec3 x, float freq){
  vec3 p = floor(x), w = fract(x);
  vec3 u = w*w*w*(w*(w*6.0 - 15.0) + 10.0);
  float a = dot(hg3(mod(p + vec3(0,0,0), freq)), w - vec3(0,0,0));
  float b = dot(hg3(mod(p + vec3(1,0,0), freq)), w - vec3(1,0,0));
  float c = dot(hg3(mod(p + vec3(0,1,0), freq)), w - vec3(0,1,0));
  float d = dot(hg3(mod(p + vec3(1,1,0), freq)), w - vec3(1,1,0));
  float e = dot(hg3(mod(p + vec3(0,0,1), freq)), w - vec3(0,0,1));
  float f = dot(hg3(mod(p + vec3(1,0,1), freq)), w - vec3(1,0,1));
  float g = dot(hg3(mod(p + vec3(0,1,1), freq)), w - vec3(0,1,1));
  float h = dot(hg3(mod(p + vec3(1,1,1), freq)), w - vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f, u.x), mix(g, h, u.x), u.y), u.z);
}
float perlinFbm(vec3 p, float freq, int oct){
  float G = exp2(-0.85); float amp = 1.0; float n = 0.0;
  for (int i = 0; i < oct; i++){ n += amp*gnoise(p*freq, freq); freq *= 2.0; amp *= G; }
  return n;
}
float worley(vec3 uv, float freq){
  vec3 x = uv*freq; vec3 id = floor(x); vec3 p = fract(x);
  float md = 1e4;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++){
    vec3 o = vec3(float(a), float(b), float(c));
    vec3 h = hash3i(ivec3(mod(id + o, vec3(freq)))) + o;
    vec3 d = p - h; md = min(md, dot(d, d));
  }
  return 1.0 - min(md, 1.0);
}
float worleyFbm(vec3 p, float freq){
  return worley(p, freq)*0.625 + worley(p, freq*2.0)*0.25 + worley(p, freq*4.0)*0.125;
}`;

export const FS_NOISE_A = HEAD + NOISE_FN + `
uniform float uZ;
void main(){
  vec3 p = vec3(vUV, uZ);
  float pf = mix(1.0, perlinFbm(p, 4.0, 5), 0.5);
  pf = abs(pf*2.0 - 1.0);
  float g = worleyFbm(p, 4.0), b = worleyFbm(p, 8.0), a = worleyFbm(p, 16.0);
  float r = remap(pf, 0.0, 1.0, g, 1.0);
  fragColor = vec4(r, g, b, a);
}`;

export const FS_NOISE_B = HEAD + NOISE_FN + `
uniform float uZ;
void main(){
  vec3 p = vec3(vUV, uZ);
  fragColor = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), saturate(perlinFbm(p, 4.0, 3)*0.62 + 0.5));
}`;

// 2D tileable "weather" map: R = large coverage fbm, G = mid fbm, B = billow/worley mix, A = fine fbm
export const FS_WEATHER = HEAD + NOISE_FN + `
void main(){
  vec3 p = vec3(vUV, 0.37);
  float r = perlinFbm(p, 3.0, 5)*0.5 + 0.5;
  float g = perlinFbm(p + vec3(0.31, 0.17, 0.2), 6.0, 5)*0.5 + 0.5;
  float b = worleyFbm(vec3(vUV, 0.11), 5.0);
  float a = perlinFbm(p + vec3(0.7, 0.4, 0.6), 16.0, 4)*0.5 + 0.5;
  fragColor = vec4(saturate(r), saturate(g), b, saturate(a));
}`;
