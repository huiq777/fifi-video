import { FS_TRANS, FS_MS, FS_SKY, FS_NOISE_A, FS_NOISE_B, FS_WEATHER } from './glsl_luts.js';
import { worldFS, waveConsts, waveParams } from './glsl_world.js';

const D2R = Math.PI / 180;

export const WORLD_DEFAULTS = {
  // camera
  camPos: [0, 4.0, 0], camYaw: 0, camPitch: 6, camRoll: 0, fov: 46,
  // sun
  sunElev: 0.4, sunAzim: 0, sunAngR: 0.62, sunDiscI: 40, sunGlow: 0.5,
  mie: 1.0, mieG: 0.8, ozone: 1.0,
  // time
  time: 0, cloudTime: 0,
  // sea
  seaOn: 1, seaReveal: 2, seaWire: 0, seaShade: 1,
  steep: 0.062, chop: 0.36, waterDeep: [0.025, 0.085, 0.115], waterSSS: [0.0, 0.085, 0.07], glitter: 1.0, fogDist: 9000,
  // clouds
  cloudBase: 2100, cloudTop: 3500, coverage: 0.52, covContrast: 1.0, cloudSigma: 0.028,
  slot: 0.85, slotNear: 26000, slotFar: 60000,
  noiseScale: 7400, detailScale: 950, erode: 0.28, cloudSun: 5.0, cloudAmb: 1.0,
  wind: [9, 0, -4], cloudSteps: 96, hazeDist: 42000,
  cirrus: 0.7, stars: 0, void: [0, 0, 0],
  ambTint: [0.8, 1.0, 1.35], topVar: 0.55, lightStep: 70, bands: 0, bandMix: 0,
  variant: 0, sun2Dir: [0, 1, 0], sun2Col: [0, 0, 0], sun2AngR: 0.5, sun2Disc: 0, aurora: 0, nightSky: [0, 0, 0],
  birds: null, shimmer: 0,
  planetDir: [0, 1, 0], planetR: 10, bhDir: [0, 0.2, 1], bhSize: 3.3, bhGlow: 0,
};

function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

export class World {
  constructor(glx) {
    this.g = glx; const gl = glx.gl;
    const F32 = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    this.pTrans = glx.program(FS_TRANS, 'trans');
    this.pMS = glx.program(FS_MS, 'ms');
    this.pSky = glx.program(FS_SKY, 'sky');
    this.waves = waveParams();
    this.pWorld = glx.program(worldFS(waveConsts(this.waves)), 'world');
    this.trans = glx.target(256, 64, F32);
    this.ms = glx.target(32, 32, F32);
    this.sky = glx.target(256, 192, F32);
    this.env = glx.target(512, 128, { mips: true, wrap: [gl.REPEAT, gl.CLAMP_TO_EDGE] });
    // noise volumes
    this.noiseA = glx.tex3D({ size: 128, mips: true });
    this.noiseB = glx.tex3D({ size: 64, mips: true });
    glx.draw3D(glx.program(FS_NOISE_A, 'noiseA'), this.noiseA);
    glx.draw3D(glx.program(FS_NOISE_B, 'noiseB'), this.noiseB);
    this.weather = glx.target(1024, 1024, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, wrap: gl.REPEAT, mips: true });
    glx.draw(glx.program(FS_WEATHER, 'weather'), this.weather);
    glx.genMips(this.weather);
    this._mie = null;
    this._skyKey = null;
  }

  _atmo(mie, oz) {
    if (this._mie === mie && this._oz === oz) return;
    this._oz = oz;
    const g = this.g;
    g.draw(this.pTrans, this.trans, { uRes: [256, 64], uMie: mie, uOzone: oz });
    g.draw(this.pMS, this.ms, { uRes: [32, 32], uMie: mie, uOzone: oz, uTrans: this.trans });
    this._mie = mie; this._skyKey = null;
  }

  static camera(P) {
    const yaw = P.camYaw * D2R, pitch = P.camPitch * D2R, roll = P.camRoll * D2R;
    const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    let r = [f[2], 0, -f[0]]; const rl = Math.hypot(r[0], r[2]); r = [r[0] / rl, 0, r[2] / rl];
    let u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    if (roll !== 0) {
      const c = Math.cos(roll), s = Math.sin(roll);
      const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      const u2 = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
      r = r2; u = u2;
    }
    return { mat: new Float32Array([...r, ...u, ...f]), f, r, u };
  }

  static sunDir(P) {
    const el = P.sunElev * D2R, az = P.sunAzim * D2R;
    return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  }

  // project a world direction to pixel coords (origin top-left) for UI overlays
  static project(P, dir, W, H) {
    const cam = World.camera(P);
    const x = dir[0] * cam.r[0] + dir[1] * cam.r[1] + dir[2] * cam.r[2];
    const y = dir[0] * cam.u[0] + dir[1] * cam.u[1] + dir[2] * cam.u[2];
    const z = dir[0] * cam.f[0] + dir[1] * cam.f[1] + dir[2] * cam.f[2];
    const tf = Math.tan(P.fov * D2R / 2);
    return { x: W / 2 + (x / z) / (tf * W / H) * W / 2, y: H / 2 - (y / z) / tf * H / 2, z };
  }

  uniforms(P0, W, H) {
    const P = { ...WORLD_DEFAULTS, ...P0 };
    const cam = World.camera(P), sd = World.sunDir(P);
    const azl = Math.hypot(sd[0], sd[2]) || 1;
    const tf = Math.tan(P.fov * D2R / 2);
    return {
      uRes: [W, H], uCamPos: P.camPos, uCamMat: cam.mat, uTanFov: tf, uPixAng: 2 * tf / H,
      uTime: P.time, uCloudTime: P.cloudTime,
      uSunDir: sd, uSunAz: [sd[0] / azl, sd[2] / azl], uSunAngR: P.sunAngR * D2R, uSunDiscI: P.sunDiscI, uSunGlow: P.sunGlow,
      uSky: this.sky, uEnv: this.env, uWeather: this.weather, uNoiseA: this.noiseA, uNoiseB: this.noiseB, uTrans: this.trans,
      uCamHkm: P.camPos[1] * 1e-3, uMie: P.mie, uOzone: P.ozone ?? 1,
      uSeaOn: P.seaOn, uSeaReveal: P.seaReveal, uSeaWire: P.seaWire, uSeaShade: P.seaShade,
      uSteep: P.steep, uChop: P.chop, uWaterDeep: P.waterDeep, uWaterSSS: P.waterSSS, uGlitter: P.glitter, uFogDist: P.fogDist,
      uCloudBase: P.cloudBase, uCloudTop: P.cloudTop, uCoverage: P.coverage, uCovContrast: P.covContrast, uCloudSigma: P.cloudSigma,
      uSlot: P.slot, uSlotNear: P.slotNear, uSlotFar: P.slotFar,
      uNoiseScale: P.noiseScale, uDetailScale: P.detailScale, uErode: P.erode, uCloudSun: P.cloudSun, uCloudAmb: P.cloudAmb,
      uWind: P.wind, uCloudSteps: P.cloudSteps, uHazeDist: P.hazeDist,
      uCirrus: P.cirrus, uStars: P.stars, uVoid: P.void,
      uAmbTint: P.ambTint, uTopVar: P.topVar, uLightStep: P.lightStep,
      uBirds: P.birds ? new Float32Array(64).fill(0).map((_, i) => P.birds[i] ?? 0) : new Float32Array(64), uBirdN: P.birds ? P.birds.length / 4 : 0, uShimmer: P.shimmer || 0,
      uVar: P.variant || 0, uSun2Dir: P.sun2Dir, uSun2Col: P.sun2Col, uSun2AngR: P.sun2AngR * D2R, uSun2Disc: P.sun2Disc, uAurora: P.aurora, uNightSky: P.nightSky,
      uPlanetDir: P.planetDir, uPlanetR: P.planetR * D2R, uBHDir: P.bhDir, uBHSize: P.bhSize * D2R, uBHGlow: P.bhGlow,
      uBands: P.bands || 1, uBandMix: P.bandMix || 0, uHorizonN: -Math.tan(P.camPitch * D2R) / tf,
    };
  }

  // Render P into `accum` (float target) with `samples` jittered sub-frames spread over `shutter` seconds.
  render(P0, accum, { samples = 4, seed = 0, sub = null, tiles = 4 } = {}) {
    const P = { ...WORLD_DEFAULTS, ...P0 };
    const g = this.g, W = accum.w, H = accum.h;
    this._atmo(P.mie, P.ozone ?? 1);
    const skyKey = `${P.sunElev.toFixed(5)}|${P.camPos[1].toFixed(1)}|${P.mieG}|${P.mie}|${P.ozone}`;
    if (skyKey !== this._skyKey) {
      g.draw(this.pSky, this.sky, { uRes: [256, 192], uMie: P.mie, uOzone: P.ozone ?? 1, uMieG: P.mieG, uTrans: this.trans, uMS: this.ms, uSunElev: P.sunElev * D2R, uCamHkm: P.camPos[1] * 1e-3 });
      this._skyKey = skyKey;
    }
    const U = this.uniforms(P, W, H);
    g.draw(this.pWorld, this.env, { ...U, uEnv: this.sky, uPass: 1, uRes: [512, 128], uJitter: [0, 0], uSeed: seed, uWeight: 1, uCloudSteps: 40, uBandMix: 0 });
    g.genMips(this.env);
    for (let i = 0; i < samples; i++) {
      const jx = halton(i + 1, 2) - 0.5, jy = halton(i + 1, 3) - 0.5;
      const Ui = sub ? this.uniforms(sub(i, samples), W, H) : U;
      g.draw(this.pWorld, accum, { ...Ui, uPass: 0, uJitter: [jx, jy], uSeed: (seed % 64) * 16 + i, uWeight: 1 / samples },
        { blend: 'add', clear: i === 0 ? [0, 0, 0, 0] : null, tiles });
    }
  }
}
