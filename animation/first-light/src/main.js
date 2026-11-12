import { GLX } from './glx.js';
import { World, WORLD_DEFAULTS } from './world.js';
function geo(P) { // horizon height and sun disc in screen space, for the print style
  const tf = Math.tan(P.fov * Math.PI / 360), sd = World.sunDir(P), q = World.project(P, sd, W, H);
  fin.horizonV = 0.5 - Math.tan(P.camPitch * Math.PI / 180) / tf * 0.5;
  fin.sunUV = [q.x / W, 1 - q.y / H, Math.tan((P.sunAngR ?? 1.1) * Math.PI / 180) / tf * 0.5];
}
import { Post, POST_DEFAULTS } from './post.js';
import { Final } from './final.js';
import { UI } from './ui.js';
import { T, FPS, BAR, E, ramp, worldAt, postAt, STYLE_OF } from './timeline.js';

let glx, world, post, fin, ui, accum, W, H, lastKey = null, lastTone = null, px = null;

function sampleLDR(xf, yf) { // read one pixel of the graded scene (fractions, origin top-left)
  const gl = glx.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, glx.fboOf(post.ldr));
  const b = new Uint8Array(4); gl.readPixels(Math.floor(xf * W), Math.floor((1 - yf) * H), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
  return [b[0], b[1], b[2]];
}

window.FL = {
  ready: false,
  async init({ w = 1920, h = 1080 } = {}) {
    const t0 = performance.now();
    const canvas = document.getElementById('c');
    canvas.width = W = w; canvas.height = H = h;
    glx = new GLX(canvas);
    world = new World(glx);
    post = new Post(glx, W, H);
    fin = new Final(glx, W, H);
    accum = glx.target(W, H, { internal: glx.gl.RGBA32F, format: glx.gl.RGBA, type: glx.gl.FLOAT, filter: glx.gl.LINEAR });
    ui = new UI(W, H, world.waves);
    await ui.load();
    // the four colours of step 1 are sampled from the real sky, so the bands hand over seamlessly
    const P = worldAt(T.sky), Q = postAt(T.sky, P);
    world.render(P, accum, { samples: 1 }); post.tone(accum, Q);
    const hy = 0.5 + Math.tan(6 * Math.PI / 180) / Math.tan(23 * Math.PI / 180) * 0.5;
    ui.palette = [0, 1, 2, 3].map(b => sampleLDR(0.5, (b + 0.5) / 4 * hy));
    ui.palLin = ui.palette.map(p => p.map(x => x / 255));
    px = new Uint8Array(W * H * 4);
    glx.sync();
    this.ready = true;
    return { initMs: performance.now() - t0, w: W, h: H, palette: ui.palette };
  },
  // look-dev: one still with raw parameter overrides (no UI)
  still(over = {}, opts = {}) {
    const t0 = performance.now();
    const P = { ...WORLD_DEFAULTS, ...(over.world || {}) };
    const Q = { ...POST_DEFAULTS, ...(over.post || {}) };
    world.render(P, accum, { samples: 4, ...opts });
    post.tone(accum, Q);
    ui.c.clearRect(0, 0, W, H); fin.uploadUI(ui.cv);
    fin.draw(post.ldr, { sceneOn: true, seed: 1, grain: over.grain ?? 0 });
    glx.sync(); lastKey = null;
    return { ms: performance.now() - t0 };
  },
  // the film at time t (seconds); over = optional {world, post} overrides for look-dev
  frameAt(t, { samples = 4, shutter = 0.5, over = null, grain = 0.035, noUI = false } = {}) {
    const t0 = performance.now();
    const f = Math.round(t * FPS);
    if (noUI) ui.c.clearRect(0, 0, W, H); else ui.draw(t);
    fin.uploadUI(ui.cv);
    if (t >= T.rewind && t < T.end) { // rewind: a strip of the eight worlds whips past, back to the first
      const still = (j) => { // strip frame j: 0..7 = variants 8..1, 8 = the original
        const key = 'v' + j; if (fin.stills.has(key)) return fin.stills.get(key);
        const v = 8 - j, tt = v > 0 ? T.rewind - 1e-3 : T.end;
        const P = worldAt(tt, v), Q = postAt(tt, P);
        world.render(P, accum, { samples: Math.max(samples, 4), seed: 7 + j }); post.tone(accum, Q); lastKey = null; lastTone = null; geo(P);
        return fin.bake(key, post.ldr, STYLE_OF[v]);
      };
      const u = (t - T.rewind) / (T.end - T.rewind), s = 8 * E.io5(u);
      const j = Math.min(7, Math.floor(s)), fr = Math.min(0.9999, s - j);
      const ds = 8 * (E.io5(Math.min(1, u + 0.5 / (FPS * (T.end - T.rewind)))) - E.io5(Math.max(0, u - 0.5 / (FPS * (T.end - T.rewind)))));
      const A = still(j), B = still(j + 1);
      fin.draw(A, { b: B, mode: 2, scroll: fr, blur: Math.min(0.9, ds * 0.6), seed: f, grain, sceneOn: true });
      return { ms: performance.now() - t0 };
    }
    let P = worldAt(t);
    if (P && over && over.world) P = { ...P, ...over.world };
    let Q = postAt(t, P);
    if (over && over.post) Q = { ...Q, ...over.post };
    if (P) {
      const dtS = shutter / FPS;
      // motion-blur sub-frames never reach across a cut
      const cuts = [T.sky, T.drop, T.shotB, T.shotC, T.twist, T.mont, T.rewind, T.end], shot = (x) => cuts.filter(c => x >= c).length;
      const sub = (i, n) => { let ts = t + ((i + 0.5) / n - 0.5) * dtS; if (shot(ts) !== shot(t)) ts = t; const Pi = worldAt(ts, P.variant || 0); return over && over.world ? { ...Pi, ...over.world } : Pi; };
      const moving = JSON.stringify(sub(0, 2)) !== JSON.stringify(sub(1, 2));
      const key = moving ? null : JSON.stringify(P) + samples;
      if (key === null || key !== lastKey) { world.render(P, accum, { samples, seed: f, sub: moving ? sub : null }); lastKey = key; lastTone = null; }
      const tk = JSON.stringify(Q);
      if (tk !== lastTone) { post.tone(accum, Q); lastTone = tk; }
    }
    if (P) geo(P);
    fin.draw(post.ldr, { sceneOn: !!P, seed: f, grain, style: Q.style || 0 });
    return { ms: performance.now() - t0 };
  },
  async renderRange(f0, n, fps, opts = {}) {
    const gl = glx.gl;
    if (!this.ws) {
      this.ws = new WebSocket(`ws://${location.host}/`); this.ws.binaryType = 'arraybuffer';
      await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    }
    const tm = { frame: 0, read: 0, send: 0 };
    for (let i = 0; i < n; i++) {
      let t0 = performance.now();
      this.frameAt((f0 + i) / fps, opts);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      tm.frame += performance.now() - t0; t0 = performance.now();
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      tm.read += performance.now() - t0; t0 = performance.now();
      const ack = new Promise(res => { this.ws.onmessage = (e) => res(e.data); });
      this.ws.send(px);
      const r = await ack;
      tm.send += performance.now() - t0;
      if (r !== 'ok') throw new Error('frame sink: ' + r);
    }
    return { ok: true, tm: `frame ${(tm.frame / n).toFixed(0)} read ${(tm.read / n).toFixed(0)} send ${(tm.send / n).toFixed(0)}` };
  },
  dataURL(type = 'image/jpeg', q = 0.93) { return document.getElementById('c').toDataURL(type, q); },
};
