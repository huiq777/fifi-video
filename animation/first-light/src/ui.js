// Typographic / diagram layer, drawn with Canvas 2D in a 1920x1080 design space.
import { T, E, ramp, mix, clamp, INTRO, TYPE_DT, BYE, VARIANTS, SUN_XY, HORIZON_Y, BEAT, BAR, FPS, worldTime, sunElevAt, variantAt } from './timeline.js';

const INK = '#F4EFE6', DARK = '#0B0C0F', ACC = '#FF6A2B', GOLD = '#FFC46B';
const SONG = '"Song", serif', PLEX = '"Plex", monospace', INST = '"Inst", serif';
const MX = 120;
const HY = HORIZON_Y * 1080;
const fin = (t, t0, d = 0.4) => E.out3(ramp(t, t0, t0 + d));
const fout = (t, t1, d = 0.3) => 1 - E.io(ramp(t, t1 - d, t1));
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

// ---- small deterministic noise helpers for the diagrams
function h2(x, y, s = 0) { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

export class UI {
  constructor(W, H, waves) {
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.c = this.cv.getContext('2d'); this.s = W / 1920; this.W = W; this.H = H;
    this.waves = waves; this.tiles = new Map(); this.palette = [[20, 24, 60], [90, 60, 110], [220, 110, 70], [255, 190, 110]]; this.palLin = null;
  }
  async load() {
    const all = INTRO.map(l => l.cn).join('') + '算不真明天见先要一个数。三个数，是颜色。把颜色按高度排好，是天。找一个点。离它越近，越亮。是太阳。一条 sin，是波。很多条，是海。抓一把噪声。叠五层。是云。最后，让时间开始走。等等。既然是算出来的，就可以改。它没有你们拍的好看。但它是我的。第一次日出光天日海云时间太阳音乐导演摄影全片画面与声音由代码生成无相机素材采样每秒个数条层噪声一个矩阵点撤销';
    const jobs = [];
    for (const w of [400, 600, 900]) jobs.push(document.fonts.load(`${w} 40px "Song"`, all + 'abc123'));
    for (const w of [300, 400, 500, 600]) jobs.push(document.fonts.load(`${w} 20px "Plex"`, 'abc123'));
    jobs.push(document.fonts.load('italic 400 20px "Plex"', 'abc'), document.fonts.load('400 40px "Inst"', 'abc'), document.fonts.load('italic 400 40px "Inst"', 'abc'), document.fonts.load('400 20px "Hei"', all));
    await Promise.all(jobs); await document.fonts.ready;
  }

  // ---------- primitives
  tx(s, x, y, o = {}) {
    const c = this.c;
    c.font = `${o.style || ''} ${o.w || 400} ${o.size || 24}px ${o.fam || PLEX}`;
    c.letterSpacing = (o.ls || 0) + 'px';
    c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'alphabetic';
    c.globalAlpha = clamp(o.a ?? 1);
    if (o.shadow) { c.shadowColor = `rgba(0,0,0,${o.shadow})`; c.shadowBlur = o.blur || 22; } else { c.shadowColor = 'transparent'; c.shadowBlur = 0; }
    c.fillStyle = o.color || INK;
    if (c.globalAlpha > 0.003) c.fillText(s, x, y);
    const w = c.measureText(s).width;
    c.globalAlpha = 1; c.shadowBlur = 0; c.shadowColor = 'transparent';
    return w;
  }
  width(s, o) { const c = this.c; c.font = `${o.style || ''} ${o.w || 400} ${o.size || 24}px ${o.fam || PLEX}`; c.letterSpacing = (o.ls || 0) + 'px'; return c.measureText(s).width; }
  rect(x, y, w, h, color, a = 1) { const c = this.c; c.globalAlpha = clamp(a); c.fillStyle = color; c.fillRect(x, y, w, h); c.globalAlpha = 1; }
  line(x0, y0, x1, y1, color = INK, a = 1, lw = 1.5) { const c = this.c; c.globalAlpha = clamp(a); c.strokeStyle = color; c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.globalAlpha = 1; }

  // caption block: Chinese line built from timed segments + English line + code line
  caption(t, segs, en, { tOut = 1e9, ink = INK, shadow = 0.6, y = 892, size = 62 } = {}) {
    const out = fout(t, tOut, 0.35); if (out <= 0) return;
    let x = MX;
    for (const g of segs) {
      const a = fin(t, g.t, 0.45) * out; const dy = (1 - fin(t, g.t, 0.5)) * 14;
      x += this.tx(g.s, x, y + dy, { fam: SONG, w: 600, size, ls: 3, a, color: ink, shadow });
    }
    const te = segs[0].t + 0.25;
    this.tx(en, MX + 3, y + 46, { fam: PLEX, w: 400, size: 20, ls: 4.4, a: 0.62 * fin(t, te, 0.6) * out, color: ink, shadow });
  }
  // code line: tokens [text, kind] where kind: 'n' number(accent) 'c' comment(dim) default ink
  code(t, t0, tokens, { tOut = 1e9, ink = INK, y = 990, size = 25, shadow = 0.6, x = MX, acc = ACC } = {}) {
    const a = fin(t, t0, 0.4) * fout(t, tOut, 0.35); if (a <= 0) return x;
    this.rect(x, y - size * 0.78, 3, size * 0.95, acc, a);
    let cx = x + 18;
    for (const [s, k] of tokens) {
      const col = k === 'n' ? acc : ink; const al = k === 'c' ? 0.5 : 0.92;
      cx += this.tx(s, cx, y, { fam: PLEX, w: k === 'c' ? 400 : 500, style: k === 'c' ? 'italic' : '', size, a: a * al, color: col, shadow });
    }
    return cx;
  }
  stepTag(t, idx, cn, en, t0, t1, ink = INK) {
    const a = fin(t, t0 + 0.1, 0.5) * fout(t, t1, 0.35); if (a <= 0) return;
    let x = MX;
    x += this.tx(String(idx).padStart(2, '0'), x, 102, { fam: PLEX, w: 500, size: 24, color: ACC, a, shadow: 0.5 });
    x += this.tx(' / 06', x, 102, { fam: PLEX, w: 400, size: 24, color: ink, a: a * 0.4, shadow: 0.5 }) + 26;
    x += this.tx(cn, x, 104, { fam: SONG, w: 600, size: 30, color: ink, a, shadow: 0.5 }) + 16;
    this.tx(en, x, 102, { fam: PLEX, w: 400, size: 16, ls: 5, color: ink, a: a * 0.6, shadow: 0.5 });
    // progress squares, top right
    for (let i = 0; i < 6; i++) {
      const bx = 1800 - (5 - i) * 22 - 10, by = 88;
      const c = this.c; c.globalAlpha = a * (i < idx ? 0.95 : 0.35);
      if (i < idx - 1) { c.fillStyle = ink; c.fillRect(bx, by, 10, 10); }
      else if (i === idx - 1) { c.fillStyle = ACC; c.fillRect(bx, by, 10, 10); }
      else { c.strokeStyle = ink; c.lineWidth = 1; c.strokeRect(bx + 0.5, by + 0.5, 9, 9); }
      c.globalAlpha = 1;
    }
  }
  scrim(a) {
    if (a <= 0) return; const c = this.c;
    const g = c.createLinearGradient(0, 760, 0, 1080); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, `rgba(0,0,0,${Math.min(0.9, 0.3 * a)})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, 0.5 * a)})`);
    c.fillStyle = g; c.fillRect(0, 760, 1920, 320);
    const g2 = c.createLinearGradient(0, 0, 0, 200); g2.addColorStop(0, `rgba(0,0,0,${0.3 * a})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g2; c.fillRect(0, 0, 1920, 200);
  }
  frameNo(t, ink = INK, a = 0.34) {
    const f = Math.round(t * FPS);
    this.tx(`${String(f).padStart(5, '0')} / ${String(T.total * FPS).padStart(5, '0')}`, 1800, 1010, { fam: PLEX, size: 14, ls: 1.5, align: 'right', color: ink, a });
  }

  // 1D slice of the sea: sum of the first n waves at world time 0
  seaSlice(x, n) {
    let px = x, pz = 0, h = 0;
    for (let i = 0; i < n; i++) {
      const w = this.waves[i];
      const a = (w.dx * px + w.dz * pz) * w.k + w.ph;
      const e = Math.exp(Math.sin(a) - 1), d = e * Math.cos(a);
      px -= w.dx * d * w.ik * 0.36; pz -= w.dz * d * w.ik * 0.36;
      h += (e - 0.466) * w.ik;
    }
    return h * 0.062;
  }
  noiseTile(n, seed = 3) { // fbm with n octaves -> canvas (grey)
    const key = `f${n}`; if (this.tiles.has(key)) return this.tiles.get(key);
    const N = 200, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'); const im = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, amp = 1, f = 3.2 / N, tot = 0;
      for (let o = 0; o < n; o++) { v += vnoise(x * f + 11 * o, y * f + 7 * o, seed + o) * amp; tot += amp; amp *= 0.5; f *= 2; }
      v = clamp((v / tot - 0.5) * (1.6 + 0.12 * n) + 0.5); const g = Math.pow(v, 1.15) * 255;
      const k = (y * N + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = g; im.data[k + 3] = 255;
    }
    c.putImageData(im, 0, 0); this.tiles.set(key, cv); return cv;
  }
  octTile(o, seed = 3) {
    const key = `o${o}`; if (this.tiles.has(key)) return this.tiles.get(key);
    const N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'); const im = c.createImageData(N, N);
    const f = 3.2 / N * Math.pow(2, o);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const g = vnoise(x * f + 11 * o, y * f + 7 * o, seed + o) * 255; const k = (y * N + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = g; im.data[k + 3] = 255; }
    c.putImageData(im, 0, 0); this.tiles.set(key, cv); return cv;
  }
  whiteTile(frame) {
    const N = 40, cv = this._wt || (this._wt = document.createElement('canvas')); cv.width = cv.height = N; const c = cv.getContext('2d'); const im = c.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const g = h2(i % N, (i / N) | 0, frame) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = g; im.data[i * 4 + 3] = 255; }
    c.putImageData(im, 0, 0); return cv;
  }
  cloudAlphaTile() {
    if (this.tiles.has('ca')) return this.tiles.get('ca');
    const src = this.noiseTile(5), N = src.width, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d');
    const d = src.getContext('2d').getImageData(0, 0, N, N), im = c.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = d.data[i * 4] / 255; const a = clamp((v - 0.42) / 0.3); im.data[i * 4] = 255; im.data[i * 4 + 1] = 246; im.data[i * 4 + 2] = 236; im.data[i * 4 + 3] = a * a * (3 - 2 * a) * 255; }
    c.putImageData(im, 0, 0); this.tiles.set('ca', cv); return cv;
  }

  // ---------- the film
  // returns { bg: [r,g,b] css-space background when no world is drawn }
  draw(t) {
    const c = this.c; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.W, this.H); c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.shadowBlur = 0; c.globalAlpha = 1; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (t < T.num + 0.9) this.intro(t);
    if (t >= T.num - 0.8 && t < T.sky) this.number(t);
    if (t >= T.sky && t < T.sun) this.sky(t);
    if (t >= T.sun && t < T.sea) this.sun(t);
    if (t >= T.sea && t < T.cloud) this.sea(t);
    if (t >= T.cloud && t < T.time) this.cloud(t);
    if (t >= T.time && t < T.drop) this.time(t);
    if (t >= T.drop && t < T.twist) this.hud(t);
    if (t >= T.twist && t < T.mont) this.twist(t);
    if (t >= T.mont && t < T.end) this.montage(t);
    if (t >= T.end) this.ending(t);
    if (t >= T.num && t < T.drop) this.frameNo(t, this._ink || INK);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  intro(t) {
    const X = 210, Y0 = 400, DY = 150, SZ = 78;
    const o = { fam: SONG, w: 600, size: SZ, ls: 5 };
    const outA = fout(t, 11.2, 0.6);
    let cur = { x: X, y: Y0 }, last = -10;
    INTRO.forEach((L, i) => {
      const n = L.times.filter(x => x <= t).length; const y = Y0 + i * DY;
      if (t >= L.times[0] - 1.0) cur = { x: X + (n ? this.width(L.cn.slice(0, n), o) + 12 : 0), y };
      if (!n) return;
      last = L.times[n - 1];
      const next = INTRO[i + 1]; const dim = next ? mix(1, 0.36, E.io(ramp(t, next.times[0] - 0.3, next.times[0] + 0.5))) : 1;
      const done = L.cn.slice(0, n - 1), w0 = this.width(done, o);
      this.tx(done, X, y, { ...o, a: dim * outA });
      this.tx(L.cn[n - 1], X + w0, y, { ...o, a: dim * outA * mix(0.25, 1, ramp(t, last, last + 0.09)) });
      const te = L.times[L.times.length - 1] + 0.3;
      this.tx(L.en, X + 4, y + 48, { fam: PLEX, size: 20, ls: 4.8, a: 0.5 * fin(t, te, 0.7) * dim * outA });
    });
    // cursor: solid while typing, blinking on the beat otherwise; then travels to become the first pixel
    const typing = t - last < 0.3;
    const blink = typing || Math.floor(t / BEAT) % 2 === 0;
    let bx = cur.x, by = cur.y - 64, bw = 34, bh = 74, col = ACC, a = fin(t, 0.5, 0.3);
    if (t > 11.2) {
      const k = E.io5(ramp(t, 11.2, 12.0));
      const S = 44; bx = mix(bx, SUN_XY[0] - S / 2, k); by = mix(by, SUN_XY[1] - S / 2, k); bw = mix(bw, S, k); bh = mix(bh, S, k);
      a = 1;
      if (t > 12.0) { // orange block cools into an empty pixel
        const m = E.io(ramp(t, 12.0, 12.6));
        this.rect(bx, by, bw, bh, ACC, 1 - m);
        return;
      }
    } else if (!blink) a = 0;
    this.rect(bx, by, bw, bh, col, a);
    if (a > 0 && t < 11.2) { const g = this.c.createRadialGradient(bx + bw / 2, by + bh / 2, 0, bx + bw / 2, by + bh / 2, 150); g.addColorStop(0, 'rgba(255,106,43,0.13)'); g.addColorStop(1, 'rgba(255,106,43,0)'); this.c.fillStyle = g; this.c.fillRect(bx - 150, by - 120, 340, 320); }
  }

  number(t) {
    const c = this.c, S = 44, [sx, sy] = SUN_XY, pal = this.palette;
    const v = E.io(ramp(t, 14.0, 15.8));
    let ink = INK, bg = null;
    // background fields
    if (t >= T.flood) {
      const fields = [[255, 255, 255], pal[0], pal[1], pal[2], pal[3]];
      const i = Math.min(4, Math.floor((t - T.flood) / BEAT));
      bg = fields[i]; c.fillStyle = rgb(bg); c.fillRect(0, 0, 1920, 1080);
      if (i > 0) { // fast wipe from the previous field
        const k = E.out5(ramp(t, T.flood + i * BEAT, T.flood + i * BEAT + 0.16));
        if (k < 1) { c.fillStyle = rgb(fields[i - 1]); c.fillRect(1920 * k, 0, 1920 * (1 - k), 1080); }
      }
      if (t >= T.bands) { // the four colours take their places by height
        const bh = HY / 4;
        const kv = E.out5(ramp(t, T.bands, T.bands + 0.35));
        c.fillStyle = '#000'; c.fillRect(0, 1080 - (1080 - HY) * kv, 1920, (1080 - HY) * kv + 1);
        for (let b = 0; b < 3; b++) {
          const k = E.out5(ramp(t, T.bands + 0.12 + b * 0.16, T.bands + 0.55 + b * 0.16));
          c.fillStyle = rgb(pal[b]); c.fillRect(0, b * bh - bh * (1 - k) * 1.0, 1920 * 1, bh * k + (k >= 1 ? 0.5 : 0));
        }
        c.fillStyle = rgb(pal[3]); c.fillRect(0, 3 * bh, 1920, HY - 3 * bh);
      }
      ink = lum(bg) > 0.5 ? DARK : INK;
      if (t >= T.bands) ink = INK;
    }
    this._ink = (t >= T.flood && t < T.bands && lum(bg) > 0.5) ? DARK : INK;
    const sh = t >= T.flood ? 0 : 0;
    // the pixel
    if (t < T.flood) {
      const k = E.inExpo(ramp(t, T.flood - 0.2, T.flood));
      const size = mix(S, 2600, k);
      const g = Math.round(255 * v);
      if (v > 0) { const gl = c.createRadialGradient(sx, sy, 0, sx, sy, 60 + 260 * v); gl.addColorStop(0, `rgba(255,255,255,${0.22 * v})`); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(sx - 340, sy - 340, 680, 680); }
      c.fillStyle = `rgb(${g},${g},${g})`; c.fillRect(sx - size / 2, sy - size / 2, size, size);
      const oa = fin(t, 12.0, 0.5) * (1 - k);
      c.globalAlpha = oa; c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(sx - S / 2, sy - S / 2, S, S); c.globalAlpha = 1;
      // leader + coordinates
      const la = fin(t, 12.7, 0.5) * (1 - k);
      this.line(sx + S / 2 + 10, sy, sx + S / 2 + 10 + 70 * fin(t, 12.7, 0.5), sy, INK, la * 0.5, 1);
      this.tx('pixel (960, 674)', sx + S / 2 + 92, sy + 5, { size: 15, ls: 1.2, a: la * 0.6 });
    }
    // labels
    this.stepTag(t, 1, '光', 'LIGHT', T.num + 0.3, T.sky, ink);
    if (t < T.flood + BEAT) {
      this.caption(t, [{ s: '先要一个数。', t: 12.5 }], 'FIRST, A NUMBER.', { tOut: T.flood + BEAT, ink, shadow: sh });
      this.code(t, 12.9, [['pixel = ', ''], [v.toFixed(2), 'n']], { tOut: T.flood + BEAT, ink, shadow: sh, acc: t >= T.flood ? '#D9480F' : ACC });
    } else {
      this.caption(t, [{ s: '三个数，', t: T.flood + BEAT }, { s: '是颜色。', t: T.flood + 2 * BEAT }], 'THREE NUMBERS MAKE A COLOR.', { tOut: T.sky, ink, shadow: sh });
      const i = Math.min(3, Math.floor((t - T.flood) / BEAT) - 1);
      const lin = (this.palLin || pal.map(p => p.map(x => x / 255)))[Math.max(0, i)];
      this.code(t, T.flood + BEAT, [['pixel = vec3(', ''], [lin[0].toFixed(2), 'n'], [', ', ''], [lin[1].toFixed(2), 'n'], [', ', ''], [lin[2].toFixed(2), 'n'], [')', '']], { tOut: T.sky, ink, shadow: sh, acc: t < T.bands ? ink : ACC });
    }
    if (t >= T.bands) { // value labels on each band
      const bh = HY / 4, lin = this.palLin || pal.map(p => p.map(x => x / 255));
      for (let b = 0; b < 4; b++) {
        const a = fin(t, T.bands + 0.5 + b * 0.1, 0.4);
        const col = lum(pal[b]) > 0.5 ? DARK : INK;
        this.tx(`vec3(${lin[b].map(x => x.toFixed(2)).join(', ')})`, 1800, b * bh + bh / 2 + (b === 0 ? 34 : 6), { size: 16, ls: 1, align: 'right', a: a * 0.75, color: col });
      }
    }
  }

  ruler(t, t0, t1) {
    const a = fin(t, t0, 0.5) * fout(t, t1, 0.4); if (a <= 0) return;
    const X = 1800, yOf = e => 540 - Math.tan((e - 6) * Math.PI / 180) / Math.tan(23 * Math.PI / 180) * 540;
    this.line(X, yOf(22.5), X, yOf(0), INK, a * 0.55, 1);
    for (let e = 0; e <= 20; e += 5) {
      const y = yOf(e); this.line(X - 10, y, X, y, INK, a * 0.7, 1);
      this.tx(`${e}°`, X - 18, y + 5, { size: 14, align: 'right', a: a * 0.6, shadow: 0.4 });
    }
  }
  sky(t) {
    this._ink = INK;
    this.stepTag(t, 2, '天', 'SKY', T.sky, T.sun);
    this.caption(t, [{ s: '把颜色按高度排好，', t: T.sky }, { s: '是天。', t: T.sky + 2.0 }], 'STACK THEM BY HEIGHT: SKY.', { tOut: T.sun, shadow: 0 });
    const n = [4, 8, 16, 32, 64][Math.floor(clamp((t - T.sky) / BEAT, 0, 4))];
    const com = t < T.sky + 2.5 ? `   // bands = ${n}` : '   // rayleigh ~ 1 / wavelength^4';
    this.code(t, T.sky + 0.3, [['sky(y) = scatter(sunlight, air(y))', ''], [com, 'c']], { tOut: T.sun, shadow: 0 });
    this.ruler(t, T.sky + 0.4, T.sun);
  }

  sun(t) {
    const c = this.c, [sx, sy] = SUN_XY;
    this.stepTag(t, 3, '日', 'SUN', T.sun, T.sea);
    this.caption(t, [{ s: '找一个点。', t: T.sun }, { s: '离它越近，越亮。', t: T.sun + 1.0 }, { s: '是太阳。', t: T.sun + 3.0 }], 'PICK A POINT. THE CLOSER, THE BRIGHTER. SUN.', { tOut: T.sea, shadow: 0 });
    this.code(t, T.sun + 1.0, [['glow = ', ''], ['1.0', 'n'], [' / (d * d)', '']], { tOut: T.sea, shadow: 0 });
    // target
    const ta = fin(t, T.sun, 0.3) * fout(t, T.sun + 3.4, 0.8);
    const br = mix(70, 30, fin(t, T.sun, 0.45));
    c.globalAlpha = ta; c.strokeStyle = INK; c.lineWidth = 1.5;
    for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.beginPath(); c.moveTo(sx + ax * br, sy + ay * (br - 12)); c.lineTo(sx + ax * br, sy + ay * br); c.lineTo(sx + ax * (br - 12), sy + ay * br); c.stroke(); }
    c.beginPath(); c.arc(sx, sy, 5, 0, 7); c.fillStyle = INK; c.fill(); c.globalAlpha = 1;
    this.tx('p = (960, 674)', sx + 46, sy - 36, { size: 15, ls: 1.2, a: ta * 0.65, shadow: 0.5 });
    // iso-rings of 1/d^2
    for (let k = 0; k < 6; k++) {
      const r = 64 * Math.pow(1.62, k), t0 = T.sun + 1.0 + k * 0.11;
      const a = fin(t, t0, 0.5) * fout(t, T.sun + 2.2 + k * 0.12, 0.9); if (a <= 0) continue;
      const rr = r * mix(0.82, 1, fin(t, t0, 0.6));
      c.globalAlpha = a * 0.5; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.arc(sx, sy, rr, 0, 7); c.stroke(); c.globalAlpha = 1;
      this.tx((1 / Math.pow(1.62, 2 * k)).toFixed(2), sx + rr * 0.7071 + 8, sy - rr * 0.7071 - 6, { size: 13, a: a * 0.6, shadow: 0.5 });
    }
  }

  sea(t) {
    const c = this.c;
    this.stepTag(t, 4, '海', 'SEA', T.sea, T.cloud);
    this.scrim(E.io(ramp(t, T.seaRoll, T.seaRoll + 1.0)) * mix(1.9, 1.0, E.io(ramp(t, T.seaShade, T.seaShade + 1.5))));
    this.caption(t, [{ s: '一条 sin，是波。', t: T.sea }, { s: '很多条，是海。', t: T.sea + 2.0 }], 'ONE SINE IS A WAVE. MANY ARE A SEA.', { tOut: T.cloud });
    const cnt = [1, 2, 4, 8, 32];
    const idx = t < T.sea + 2 ? 0 : Math.min(4, 1 + Math.floor((t - T.sea - 2) / BEAT));
    this.code(t, T.sea + 0.5, [['h += a[i] * exp(sin(k[i]*x - w[i]*t) - ', ''], ['1', 'n'], [')', ''], [`   // i < ${cnt[idx]}`, 'c']], { tOut: T.cloud });
    // horizon hairline
    const ha = fout(t, T.seaRoll + 0.5, 0.5), hk = E.out3(ramp(t, T.sea, T.sea + 0.5));
    this.line(960 - 960 * hk, HY, 960 + 960 * hk, HY, INK, 0.7 * ha, 1.2);
    // 1D plot
    const pa = fin(t, T.sea + 0.4, 0.4) * fout(t, T.seaRoll + 0.6, 0.6); if (pa <= 0) return;
    const Y = 772, X0 = MX, X1 = 1800, amp = E.out3(ramp(t, T.sea + 0.5, T.sea + 1.4));
    const tSw = T.sea + 2 + (idx - 1) * BEAT, km = idx === 0 ? 1 : E.out3(ramp(t, tSw, tSw + 0.3));
    const nA = idx === 0 ? 1 : cnt[idx - 1], nB = cnt[idx];
    c.globalAlpha = pa * 0.3; c.setLineDash([2, 8]); c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(X0, Y); c.lineTo(X1, Y); c.stroke(); c.setLineDash([]);
    c.globalAlpha = pa; c.lineWidth = 2.2; c.lineJoin = 'round'; c.beginPath();
    const draw = E.out3(ramp(t, T.sea + 0.4, T.sea + 1.3));
    for (let x = X0; x <= X0 + (X1 - X0) * draw; x += 3) {
      const wx = (x - X0) / (X1 - X0) * 260 - 40;
      const h = mix(this.seaSlice(wx, nA), this.seaSlice(wx, nB), km) * amp;
      const y = Y - h * 62;
      if (x === X0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke(); c.globalAlpha = 1;
    this.tx(`n = ${cnt[idx]}`, X1, Y - 62, { size: 16, align: 'right', a: pa * 0.8 });
  }

  cloud(t) {
    const c = this.c;
    this.stepTag(t, 5, '云', 'CLOUDS', T.cloud, T.time);
    this.scrim(1);
    this.caption(t, [{ s: '抓一把噪声。', t: T.cloud }, { s: '叠五层。', t: T.cloudOct }, { s: '是云。', t: T.cloudForm }], 'GRAB SOME NOISE. STACK FIVE LAYERS. CLOUDS.', { tOut: T.time });
    const n = t < T.cloud + 1.5 ? 0 : Math.min(5, 1 + Math.max(0, Math.floor((t - T.cloudOct) / BEAT) + 1));
    const nn = t < T.cloudOct ? Math.min(n, 1) : n;
    const tok = nn === 0 ? [['n = random(p)', '']] : [['cloud += noise(p * 2^i) / 2^i', ''], [`   // i < ${nn}`, 'c']];
    this.code(t, T.cloud + 0.4, tok, { tOut: T.time });
    // tile
    const CX = 960, CY = 300, S = 320;
    const grow = E.in2(ramp(t, T.cloudForm, T.cloudForm + 1.3));
    const ta = fin(t, T.cloud, 0.35) * (1 - E.io(ramp(t, T.cloudForm + 0.5, T.cloudForm + 1.3)));
    if (ta <= 0) return;
    const sc = mix(1, 6.5, grow) * mix(0.9, 1, fin(t, T.cloud, 0.45));
    const s = S * sc, x = CX - s / 2, y = mix(CY, 330, grow) - s / 2;
    c.globalAlpha = ta * (1 - Math.min(1, grow * 9));
    c.imageSmoothingEnabled = nn > 0;
    if (nn === 0) c.drawImage(this.whiteTile(Math.floor(t * 20)), x, y, s, s);
    else {
      const tSw = nn === 1 ? T.cloud + 1.5 : T.cloudOct + (nn - 2) * BEAT, k = E.out3(ramp(t, tSw, tSw + 0.25));
      if (k < 1 && nn > 1) c.drawImage(this.noiseTile(nn - 1), x, y, s, s);
      c.globalAlpha = ta * (1 - Math.min(1, grow * 9)) * (nn > 1 ? k : 1);
      c.drawImage(this.noiseTile(nn), x, y, s, s);
    }
    c.imageSmoothingEnabled = true;
    if (grow > 0) {
      const tmp = this._tmp || (this._tmp = document.createElement('canvas')); tmp.width = tmp.height = 400; const tc = tmp.getContext('2d');
      tc.clearRect(0, 0, 400, 400); tc.globalCompositeOperation = 'source-over'; tc.drawImage(this.cloudAlphaTile(), 0, 0, 400, 400);
      const rg = tc.createRadialGradient(200, 200, 200 * mix(0.7, 0.2, grow), 200, 200, 198);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); tc.globalCompositeOperation = 'destination-in'; tc.fillStyle = rg; tc.fillRect(0, 0, 400, 400);
      c.globalAlpha = ta * Math.min(1, grow * 9) * 0.8; c.drawImage(tmp, x, y, s, s);
    }
    c.globalAlpha = ta * (1 - Math.min(1, grow * 9)) * 0.9; c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x, y, s, s); c.globalAlpha = 1;
    // octave thumbnails
    const oa = fin(t, T.cloudOct - 0.5, 0.4) * fout(t, T.cloudForm + 0.3, 0.4);
    if (oa > 0) for (let o = 0; o < 5; o++) {
      const tx = CX + S / 2 + 40, ty = CY - S / 2 + o * 66, on = nn > o;
      c.globalAlpha = oa * (on ? 1 : 0.28); c.drawImage(this.octTile(o), tx, ty, 54, 54);
      c.strokeStyle = on ? ACC : INK; c.lineWidth = 1.2; c.strokeRect(tx, ty, 54, 54); c.globalAlpha = 1;
      this.tx(o === 0 ? '1' : `1/${1 << o}`, tx + 68, ty + 33, { size: 15, a: oa * (on ? 0.9 : 0.35), shadow: 0.5 });
    }
  }

  keycap(x, y, a, pressed) {
    const c = this.c, w = 58, h = 44; c.globalAlpha = a;
    c.beginPath(); c.roundRect(x, y - 31 + (pressed ? 2 : 0), w, h, 8);
    if (pressed) { c.fillStyle = ACC; c.fill(); } else { c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); }
    c.strokeStyle = pressed ? DARK : INK; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
    const ox = x + 16, oy = y - 9 + (pressed ? 2 : 0);
    c.beginPath(); c.moveTo(ox + 26, oy - 9); c.lineTo(ox + 26, oy); c.lineTo(ox, oy); c.moveTo(ox + 7, oy - 6); c.lineTo(ox, oy); c.lineTo(ox + 7, oy + 6); c.stroke();
    c.globalAlpha = 1; c.lineCap = 'butt';
  }
  time(t) {
    const out = T.enter + 0.3;
    this.stepTag(t, 6, '时间', 'TIME', T.time, out);
    this.scrim(fout(t, out + 0.1, 0.3));
    this.caption(t, [{ s: '最后，', t: T.time }, { s: '让时间开始走。', t: T.time + 0.75 }], 'LAST: LET TIME RUN.', { tOut: out, y: 846 });
    this.code(t, T.time + 0.5, [['t = ', ''], ['0', 'n']], { tOut: out, y: 948, size: 30 });
    const n = TYPE_DT.times.filter(x => x <= t).length;
    const a = fout(t, out, 0.3);
    const cx = this.code(t, T.type - 0.4, [[TYPE_DT.text.slice(0, n), '']], { tOut: out, y: 1000, size: 30 });
    const typing = n > 0 && t - TYPE_DT.times[n - 1] < 0.3;
    if (t >= T.type - 0.4 && (typing || Math.floor(t / BEAT) % 2 === 0) && t < T.enter) this.rect(cx + 6, 1000 - 26, 15, 32, ACC, a);
    this.keycap(cx + 40, 1000, fin(t, T.type + 1.0, 0.3) * a, t >= T.enter);
  }

  hud(t) {
    const a = 0.5 * fin(t, T.drop + 0.4, 0.8) * fout(t, T.twist + 4, 0.3);
    const wt = worldTime(t), el = sunElevAt(t);
    this.tx(`t = ${wt.toFixed(2).padStart(5, '0')} s`, MX, 1010, { size: 15, ls: 1.5, a, shadow: 0.5 });
    this.tx(`sun ${el >= 0 ? '+' : '−'}${Math.abs(el).toFixed(2)}°`, MX + 190, 1010, { size: 15, ls: 1.5, a, shadow: 0.5 });
    this.frameNo(t, INK, a * 0.7);
  }

  chip(t, t0, parts, { pop = true, x = MX, y = 990 } = {}) { // parts: [[text, kind]]
    const c = this.c, size = 30;
    const o = { fam: PLEX, w: 500, size };
    let w = 0; for (const [s] of parts) w += this.width(s, o);
    const k = pop ? mix(0.9, 1, E.outBack(ramp(t, t0, t0 + 0.22))) : 1, a = fin(t, t0, 0.12);
    c.save(); c.translate(x, y); c.scale(k, k); c.globalAlpha = a * 0.78; c.fillStyle = '#07080A';
    c.beginPath(); c.roundRect(0, -42, w + 58, 62, 10); c.fill(); c.globalAlpha = a; c.fillStyle = ACC; c.fillRect(16, -27, 4, 32);
    let cx = 36; c.restore();
    c.save(); c.translate(x, y); c.scale(k, k);
    for (const [s, kind] of parts) {
      if (kind === 'sel') { const sw = this.width(s, o); c.globalAlpha = a; c.fillStyle = ACC; c.fillRect(cx - 3, -30, sw + 6, 40); cx += this.tx(s, cx, 0, { ...o, a, color: DARK }); }
      else cx += this.tx(s, cx, 0, { ...o, a: a * (kind === 'c' ? 0.5 : 0.95), color: kind === 'n' ? ACC : INK });
    }
    c.restore();
  }
  twist(t) {
    const c = this.c;
    this.rect(0, 0, 1920, 1080, '#000', 0.28 * fin(t, T.twist, 0.5));
    this.scrim(1);
    const wt = worldTime(t);
    this.tx(`t = ${wt.toFixed(2)} s`, MX, 102, { size: 20, ls: 1.5, a: 0.75 * fin(t, T.twist, 0.3), shadow: 0.5 });
    if (Math.floor(t / BEAT) % 2 === 0) { this.rect(MX + 176, 85, 5, 18, INK, 0.8); this.rect(MX + 186, 85, 5, 18, INK, 0.8); }
    this.caption(t, [{ s: '等等。', t: T.twist + 0.05 }, { s: '既然是算出来的，', t: T.twist + 1.0 }, { s: '就可以改。', t: T.twist + 2.0 }], 'WAIT. IF IT IS ALL COMPUTED, IT CAN BE CHANGED.', { tOut: 1e9, y: 846 });
    const t0 = T.twist + 2.5;
    if (t >= t0) {
      const sel = t >= T.twist + 3.0 && t < T.twist + 3.5;
      const val = t >= T.twist + 3.5 ? '2' : '1';
      this.chip(t, t0, [['suns = ', ''], [val, sel ? 'sel' : 'n']], { pop: true });
    }
  }
  montage(t) {
    if (t < T.rewind) {
      const v = variantAt(t), V = VARIANTS[v], t0 = T.mont + (v - 1) * BAR;
      this.scrim(0.7);
      const parts = [[V.key + ' = ', ''], [V.val, 'n']];
      if (V.extra) parts.push([';  ' + V.extra.split(' = ')[0] + ' = ', ''], [V.extra.split(' = ')[1], 'n']);
      this.chip(t, t0, parts, { pop: v > 1 });
      this.tx(`${String(v).padStart(2, '0')} / 08`, 1800, 102, { size: 20, ls: 2, align: 'right', a: 0.8, shadow: 0.6 });
      if (v === 7) { // title slip + seal, as on a woodblock print
        const c = this.c, a = fin(t, t0, 0.15);
        c.globalAlpha = a; c.fillStyle = '#D5362A'; c.fillRect(150, 150, 78, 330); c.strokeStyle = '#0E1630'; c.lineWidth = 3; c.strokeRect(150, 150, 78, 330);
        c.globalAlpha = 1;
        ['第', '一', '次', '日', '出'].forEach((ch, i) => this.tx(ch, 189, 212 + i * 62, { fam: SONG, w: 900, size: 46, align: 'center', color: '#F4E9CF', a }));
        c.globalAlpha = a; c.fillStyle = '#D5362A'; c.fillRect(246, 424, 56, 56); c.globalAlpha = 1;
        this.tx('算', 274, 468, { fam: SONG, w: 900, size: 40, align: 'center', color: '#F4E9CF', a });
      }
    } else {
      const n = Math.min(8, 1 + Math.floor((t - T.rewind) / (BAR / 8) * 0.999));
      this.chip(t, T.rewind, [['undo ', ''], ['× ' + n, 'n']], { pop: false });
    }
  }

  ending(t) {
    const c = this.c;
    if (t < T.title + 0.6) {
      this.scrim(fin(t, T.lineA - 0.5, 1.0) * fout(t, T.title + 0.5, 0.8));
      const o1 = fout(t, T.title + 0.2, 0.7);
      const dim = mix(1, 0.42, E.io(ramp(t, T.lineB - 0.3, T.lineB + 0.6)));
      this.tx('它不是真的。', MX, 860, { fam: SONG, w: 600, size: 62, ls: 3, a: fin(t, T.lineA, 0.9) * o1 * dim, shadow: 0.6 });
      this.tx('IT IS NOT REAL.', MX + 3, 904, { size: 20, ls: 4.4, a: 0.62 * fin(t, T.lineA + 0.4, 0.9) * o1 * dim, shadow: 0.6 });
      this.tx('但它是我的。', MX, 968, { fam: SONG, w: 600, size: 62, ls: 3, a: fin(t, T.lineB, 1.0) * o1, shadow: 0.6 });
      this.tx('BUT IT IS MINE.', MX + 3, 1012, { size: 20, ls: 4.4, a: 0.62 * fin(t, T.lineB + 0.5, 0.9) * o1, shadow: 0.6 });
    }
    if (t >= T.title) {
      const a = fin(t, T.title + 0.3, 1.2) * fout(t, T.fade + 1.0, 1.0);
      this.rect(0, 0, 1920, 1080, '#000', 0.34 * fin(t, T.title, 1.5));
      this.tx('第一次日出', 960 + 16, 420, { fam: SONG, w: 600, size: 128, ls: 32, align: 'center', a, shadow: 0.5, blur: 40 });
      this.tx('FIRST LIGHT', 960 + 14, 490, { fam: PLEX, w: 400, size: 24, ls: 28, align: 'center', a: a * 0.85, shadow: 0.5 });
      const items = [['太阳', '一个点'], ['海', '32 条 sin'], ['云', '5 层噪声'], ['音乐', '每秒 48000 个数'], ['摄影', '一个矩阵'], ['导演', 'Claude']];
      const x0 = 250, dx = (1920 - 500) / (items.length - 1);
      items.forEach(([k, v], i) => {
        const ai = fin(t, T.title + 1.4 + i * 0.22, 0.7) * fout(t, T.fade + 1.0, 1.0);
        const x = x0 + i * dx;
        this.tx(k, x, 866, { fam: SONG, w: 400, size: 20, ls: 6, align: 'center', a: ai * 0.6, shadow: 0.6 });
        this.tx(v, x, 904, { fam: SONG, w: 600, size: 24, ls: 1.5, align: 'center', a: ai * 0.95, shadow: 0.6 });
      });
      const al = fin(t, T.title + 3.0, 1.0) * fout(t, T.fade + 1.0, 1.0);
      this.tx('没有相机，没有素材。每一个像素、每一个声音，都是算出来的。', 960, 986, { fam: SONG, w: 400, size: 20, ls: 4, align: 'center', a: al * 0.7, shadow: 0.6 });
      this.tx('NO CAMERA. NO FOOTAGE. NO SAMPLES.  ·  CLAUDE FABLE 5.2  ·  2026', 960, 1020, { size: 13, ls: 4, align: 'center', a: al * 0.5, shadow: 0.6 });
    }
    if (t >= T.bye - 0.75) { // after the credits: one more line
      const o = { fam: SONG, w: 600, size: 78, ls: 5 }, X = 210, Y = 560;
      const n = BYE.times.filter(x => x <= t).length, w = n ? this.width(BYE.cn.slice(0, n), o) + 12 : 0;
      const out = fout(t, T.total - 0.05, 0.35);
      if (n) this.tx(BYE.cn.slice(0, n), X, Y, { ...o, a: out });
      this.tx(BYE.en, X + 4, Y + 48, { fam: PLEX, size: 20, ls: 4.8, a: 0.5 * fin(t, T.bye + 0.8, 0.6) * out });
      const typing = n > 0 && t - BYE.times[n - 1] < 0.3;
      if (typing || Math.floor(t / BEAT) % 2 === 0) this.rect(X + w, Y - 64, 34, 74, ACC, out);
    }
  }
}
