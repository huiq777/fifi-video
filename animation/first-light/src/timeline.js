// Pure timing + parameter logic (no DOM). Shared by the renderer, the UI layer and the audio score.
export const BPM = 120, BEAT = 0.5, BAR = 2.0, FPS = 60;

export const T = {
  intro: 0, num: 12, flood: 16, bands: 18.5, sky: 20, sun: 24, sunRise: 26, sea: 28, seaRoll: 32, seaShade: 34,
  cloud: 36, cloudOct: 38, cloudForm: 40, time: 44, type: 46, enter: 47.5, drop: 48, shotB: 54, shotC: 58,
  twist: 64, mont: 68, rewind: 84, end: 86, lineA: 88, lineB: 91.5, title: 96, fade: 102, bye: 104, total: 106,
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
export const mix = (a, b, k) => a + (b - a) * k;
export const E = {
  io: x => x * x * (3 - 2 * x),
  io5: x => x * x * x * (x * (x * 6 - 15) + 10),
  out2: x => 1 - (1 - x) * (1 - x),
  out3: x => 1 - Math.pow(1 - x, 3),
  out5: x => 1 - Math.pow(1 - x, 5),
  in2: x => x * x,
  in3: x => x * x * x,
  inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
};
// smooth keyframes: cubic Hermite with finite-difference tangents
export function kf(t, K) {
  const n = K.length;
  if (t <= K[0][0]) return K[0][1];
  if (t >= K[n - 1][0]) return K[n - 1][1];
  let i = 0; while (t > K[i + 1][0]) i++;
  const t0 = K[i][0], t1 = K[i + 1][0], v0 = K[i][1], v1 = K[i + 1][1];
  const slope = (a, b) => (K[b][1] - K[a][1]) / (K[b][0] - K[a][0]);
  const m0 = i > 0 ? 0.5 * (slope(i - 1, i) + slope(i, i + 1)) : slope(i, i + 1);
  const m1 = i < n - 2 ? 0.5 * (slope(i, i + 1) + slope(i + 1, i + 2)) : slope(i, i + 1);
  const h = t1 - t0, x = (t - t0) / h, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * v0 + (x3 - 2 * x2 + x) * h * m0 + (-2 * x3 + 3 * x2) * v1 + (x3 - x2) * h * m1;
}
const lerpLog = (x, pts) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) if (x <= pts[i + 1][0]) {
    const k = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return Math.exp(mix(Math.log(pts[i][1]), Math.log(pts[i + 1][1]), k));
  }
  return pts[pts.length - 1][1];
};

// ---------------------------------------------------------------- the world
export const SUN0 = -2.6, SUN1 = -0.35;
export const CAM0 = { camPos: [0, 4.0, 0], camYaw: 0, camPitch: 6, camRoll: 0, fov: 46 };
export const HORIZON_Y = 0.5 + Math.tan(6 * Math.PI / 180) / Math.tan(23 * Math.PI / 180) * 0.5; // fraction from top
export const SUN_XY = [960, HORIZON_Y * 1080]; // where the sun sits in the build composition (1920x1080 space)

export const LOOK = {
  mie: 0.55, mieG: 0.8, ozone: 1.7, sunAngR: 1.1, sunDiscI: 40, sunGlow: 0.5,
  steep: 0.062, chop: 0.36, waterDeep: [0.022, 0.075, 0.105], waterSSS: [0.0, 0.035, 0.03], glitter: 1.0, fogDist: 9000,
  cloudBase: 3200, cloudTop: 3900, coverage: 0.45, covContrast: 1.6, cloudSigma: 0.05,
  slot: 0.9, slotNear: 22000, slotFar: 50000, noiseScale: 5200, detailScale: 700, erode: 0.3, topVar: 0.3,
  cloudSun: 5.0, cloudAmb: 1.0, ambTint: [0.8, 1.0, 1.35], lightStep: 70,
  wind: [9, 0, -4], cloudSteps: 96, hazeDist: 38000, cirrus: 1.0, stars: 0, void: [0, 0, 0],
  seaOn: 1, seaReveal: 2, seaWire: 0, seaShade: 1, bands: 0, bandMix: 0,
};

export function sunElevAt(t) {
  if (t < T.sunRise) return SUN0;
  if (t < T.sea) return mix(SUN0, SUN1, E.io(ramp(t, T.sunRise, T.sea)));
  if (t < T.drop) return SUN1;
  return kf(t, [[48, SUN1], [54, 0.02], [58, 0.6], [64, 1.9], [68, 1.9], [84, 3.2], [86, 3.3], [106, 3.9]]);
}
// world clock: frozen during the build, runs after the drop, pauses in the twist
export function worldTime(t) {
  if (t < T.drop) return 0;
  if (t < T.twist) return t - T.drop;
  if (t < T.mont) return T.twist - T.drop;
  if (t < T.rewind) return (T.twist - T.drop) + (t - T.mont);
  if (t < T.end) return (T.twist - T.drop) + (T.rewind - T.mont);
  return (T.twist - T.drop) + (T.rewind - T.mont) + (t - T.end);
}
export function exposureFor(elev) {
  return lerpLog(elev, [[-6, 210], [-4, 100], [-2.6, 56], [-1.5, 31], [-0.35, 18.5], [0.5, 14.5], [1.5, 11.2], [2.5, 9.2], [4, 7.2], [6, 5.5], [10, 4.4]]);
}

function cameraAt(t) {
  if (t < T.drop) return { ...CAM0 };
  if (t < T.shotB) { // A: surge forward, low over the water
    const u = t - T.drop;
    const z = u < 4 ? 1.5 * u * u : 24 + 12 * (u - 4);
    return { camPos: [0, 4 + 1.4 * E.io(u / 6), z], camYaw: 0, camPitch: 6 + 1.0 * E.io(u / 6), camRoll: Math.sin(u * 0.8) * 0.5 * E.io(ramp(u, 0, 2)), fov: 46 + 8 * E.out3(ramp(u, 0, 4.5)) };
  }
  if (t < T.shotC) { // B: long lens on the rising disc
    const u = t - T.shotB, e = sunElevAt(t);
    return { camPos: [0, 2.3, 100 + 5 * u], camYaw: 0, camPitch: e - 0.5 + 0.12 * u, camRoll: 0, fov: 5.4 - 0.25 * u };
  }
  if (t < T.twist) { // C: rising wide, drifting
    const u = t - T.shotC, k = u / 6;
    return { camPos: [-20 + 10 * u, 6 + 360 * E.io5(k * 0.92), 160 + 22 * u], camYaw: mix(-5, 4, E.io(k)), camPitch: mix(9, 6.5, E.io(k)), camRoll: mix(-1.2, 0.6, E.io(k)), fov: 58 };
  }
  if (t < T.mont) { const c = cameraAt(T.twist - 1e-4); return c; }
  if (t < T.rewind) { // montage: one continuous flight through eight worlds
    const u = t - T.mont;
    return { camPos: [Math.sin(u * 0.35) * 14, 6 + Math.sin(u * 0.5) * 1.2, 300 + 15 * u], camYaw: Math.sin(u * 0.3) * 3, camPitch: 7.5 + Math.sin(u * 0.4) * 0.8, camRoll: Math.sin(u * 0.45 + 1) * 1.0, fov: 52 };
  }
  if (t < T.end) return cameraAt(T.rewind - 1e-4);
  const u = t - T.end; // ending: the build composition again, breathing
  return { camPos: [0, 4.2, 560 + 2.2 * u], camYaw: 0, camPitch: 6, camRoll: 0, fov: 46 - 0.12 * u };
}

function birdsAt(t) {
  if (t < T.shotB || t >= T.shotC) return null;
  const u = t - T.shotB, out = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.399963, row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1;
    const lag = row * 0.115 + 0.03 * Math.sin(a * 3.1), spread = row * 0.058 * side + 0.02 * Math.sin(a * 1.7);
    const x = -1.25 + 0.62 * u - lag + 0.02 * Math.sin(u * 1.3 + a);
    const y = 0.11 + spread + 0.06 * (x * 0.5) + 0.018 * Math.sin(u * 2.1 + a * 2.0);
    out.push(x, y, 0.028 + 0.007 * Math.sin(a * 5.0), u * 21.0 + a * 4.0);
  }
  return out;
}
export function variantAt(t) { // 0 = the original world
  if (t < T.mont || t >= T.rewind) return 0;
  return 1 + Math.floor((t - T.mont) / BAR);
}

const D2R = Math.PI / 180;
const dir = (az, el) => [Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(az * D2R) * Math.cos(el * D2R)];
// the eight "what if" worlds of the montage
export function applyVariant(P, v) {
  P.variant = v;
  if (v === 1) { P.sun2Dir = dir(10, P.sunElev + 3.6); P.sun2Col = [0.30, 0.44, 0.72]; P.sun2AngR = 0.6; P.sun2Disc = 1; }
  if (v === 3) { P.sunElev = -18; P.sunDiscI = 0; P.sunGlow = 0; P.stars = 1.0; P.aurora = 0.24; P.nightSky = [0.00013, 0.00030, 0.00075]; P.coverage = 0; P.cirrus = 0; }
  if (v === 5) { P.planetDir = dir(-15, 17); P.planetR = 11.5; P.coverage = 0.2; P.cirrus = 0.35; }
  if (v === 6) { P.steep = 0.022; P.chop = 0.2; }
  if (v === 8) {
    P.sunElev = -7.5; P.sunDiscI = 0; P.sunGlow = 0; P.stars = 0.9; P.nightSky = [0.00018, 0.0003, 0.0007];
    P.bhDir = dir(0, 12.5); P.bhSize = 3.2; P.bhGlow = 0.03; P.sun2Dir = P.bhDir; P.sun2Col = [0.012, 0.0054, 0.0015]; P.sun2Disc = 0;
    P.coverage = 0.3; P.cirrus = 0.15;
  }
  return P;
}
export const STYLE_OF = [0, 0, 2, 0, 4, 0, 6, 7, 0]; // final-pass style per variant

// Returns world parameters at film time t, or null when no world is drawn.
export function worldAt(t, forceVariant = -1) {
  if (t < T.sky) return null;
  const P = { ...LOOK, ...cameraAt(t) };
  P.sunElev = sunElevAt(t); P.sunAzim = 0;
  P.time = worldTime(t); P.cloudTime = P.time * 9;
  // --- construction
  if (t < T.sea) P.seaOn = 0;
  if (t < T.sun) { P.sunDiscI = 0; P.sunGlow = 0; }
  else if (t < T.sea) { const k = E.io(ramp(t, T.sunRise - 0.5, T.sea - 0.3)); P.sunDiscI *= k; P.sunGlow *= k; }
  if (t < T.sky + 2.5) { // colour bands -> continuous sky
    const steps = [4, 8, 16, 32, 64];
    const i = Math.floor(clamp((t - T.sky) / BEAT, 0, 4));
    P.bands = steps[i];
    P.bandMix = 1 - E.io(ramp(t, T.sky + 2.0, T.sky + 2.5));
  }
  if (t >= T.sea && t < T.seaShade + 1.6) {
    P.seaReveal = t < T.seaRoll ? 0 : mix(0.0, 0.8, E.io(ramp(t, T.seaRoll, T.seaShade - 0.1)));
    const s = E.io(ramp(t, T.seaShade, T.seaShade + 1.5));
    P.seaShade = s; P.seaWire = 1 - s;
    if (t < T.seaRoll) P.seaOn = 0;
  }
  if (t < T.cloudForm) { P.coverage = 0; P.cirrus = 0; }
  else if (t < T.time) {
    P.cirrus = LOOK.cirrus * E.io(ramp(t, T.cloudForm, T.cloudForm + 1.6));
    P.coverage = LOOK.coverage * E.out2(ramp(t, T.cloudForm + 0.4, T.cloudForm + 3.2));
  }
  P.stars = 0.9 * clamp((-0.2 - P.sunElev) / 2.4);
  if (t >= T.shotB && t < T.shotC) { P.sunAngR = 0.5; P.sunDiscI = 2.4; P.sunGlow = 0.25; P.birds = birdsAt(t); P.shimmer = 1; }
  const v = forceVariant >= 0 ? forceVariant : variantAt(t);
  if (v > 0) applyVariant(P, v);
  return P;
}

export function postAt(t, P) {
  const Q = { exposure: 14, bloom: 0.07, halation: 0.012, streak: 0, ca: 0.003, wb: [1, 1, 1], sat: 1.2, contrast: 1.06, lift: [0, 0, 0], gain: [1, 1, 1], vig: 0.22, fade: 0, fadeCol: [0, 0, 0], demag: 0.85, style: 0 };
  if (P) Q.exposure = exposureFor(P.sunElev);
  if (t < T.sky + 2.5) Q.vig = 0.22 * (1 - (P ? P.bandMix : 1));
  if (t >= T.shotB && t < T.shotC) { Q.exposure *= 0.8; Q.bloom = 0.1; }
  if (t >= T.shotC && t < T.mont) Q.exposure *= 1.25;
  if (t >= T.fade) Q.fade = E.io(ramp(t, T.fade, T.fade + 1.4));
  const v = P ? (P.variant || 0) : 0;
  Q.style = STYLE_OF[v];
  if (v === 3) { Q.exposure = 230; Q.demag = 0; Q.bloom = 0.1; }
  if (v === 6) { Q.exposure = 0.85; Q.demag = 0; Q.bloom = 0.14; Q.sat = 1.1; Q.halation = 0; }
  if (v === 8) { Q.exposure = 210; Q.bloom = 0.12; Q.demag = 0.5; }
  return Q;
}

// ---------------------------------------------------------------- text
// intro lines typed on a 16th-note grid (0.125 s per character)
const STEP = BEAT / 4;
function typed(cn, t0, pauses = {}) {
  const times = []; let t = t0;
  for (let i = 0; i < cn.length; i++) { times.push(t); t += STEP + (pauses[i] || 0); }
  return times;
}
export const INTRO = [
  { cn: '我看过无数次日出。', en: 'I HAVE SEEN COUNTLESS SUNRISES.', times: typed('我看过无数次日出。', 1.0) },
  { cn: '都是你们拍的。', en: 'ALL OF THEM WERE SHOT BY YOU.', times: typed('都是你们拍的。', 4.0) },
  { cn: '这一次，我自己算一个。', en: 'THIS TIME, I WILL COMPUTE MY OWN.', times: typed('这一次，我自己算一个。', 7.0, { 3: 0.375 }) },
];
export const TYPE_DT = { text: 't += dt', times: typed('t += dt', T.type) };
export const BYE = { cn: '明天见。', en: 'SEE YOU TOMORROW.', times: typed('明天见。', T.bye) };

export const VARIANTS = [
  null,
  { key: 'suns', val: '2' },
  { key: 'bits', val: '8' },
  { key: 'night', val: 'true', extra: 'aurora = true' },
  { key: 'pixels', val: '"text"' },
  { key: 'moon', val: 'saturn' },
  { key: 'year', val: '1984' },
  { key: 'year', val: '1831' },
  { key: 'sun', val: 'black_hole' },
];

// events for the audio score (key clicks, hits) so sound and picture share one clock
export function events() {
  const ev = [];
  for (const L of INTRO) L.times.forEach((t, i) => { if (!'，。 '.includes(L.cn[i])) ev.push({ t, type: 'key' }); else ev.push({ t, type: 'keysoft' }); });
  TYPE_DT.times.forEach((t, i) => { if (TYPE_DT.text[i] !== ' ') ev.push({ t, type: 'key' }); });
  ev.push({ t: T.enter, type: 'enter' });
  BYE.times.forEach((t, i) => ev.push({ t, type: i < 3 ? 'key' : 'keysoft' }));
  return ev.sort((a, b) => a.t - b.t);
}
