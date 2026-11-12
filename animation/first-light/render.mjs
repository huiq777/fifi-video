// Offline render driver: serves the project to headless Chrome (Metal GPU), steps frames, pipes raw RGBA to ffmpeg.
//   node render.mjs stills '<json array of {out, over, opts}>' [--w 960 --h 540]
//   node render.mjs video --from 0 --to 100 --out out/seg/a.mp4 [--w 1920 --h 1080 --fps 60 --samples 4]
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const W = +flag('w', cmd === 'video' ? 1920 : 960), H = +flag('h', cmd === 'video' ? 1080 : 540);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };

let frameSink = null; // (Buffer) => Promise
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/frame')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => { try { await frameSink(Buffer.concat(chunks)); res.writeHead(200); res.end('ok'); } catch (e) { res.writeHead(500); res.end(String(e)); } });
    return;
  }
  const u = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
// frames travel over a WebSocket: ~40 ms per 8 MB frame (HTTP POST from the page took ~500 ms)
const wss = new WebSocketServer({ server, maxPayload: 1 << 30, perMessageDeflate: false });
let sinkMs = 0, sinkN = 0;
wss.on('connection', ws => ws.on('message', async (data) => { const t0 = performance.now(); try { await frameSink(data); sinkMs += performance.now() - t0; sinkN++; ws.send('ok'); } catch (e) { ws.send('err ' + e); } }));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 0,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('console', m => { const t = m.text(); if (!/Failed to load resource/.test(t)) console.log('[page]', t.slice(0, 2000)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 4000)));

async function boot() {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.FL !== undefined', { timeout: 30000 });
  const info = await page.evaluate(async (w, h) => { try { return await window.FL.init({ w, h }); } catch (e) { return { error: String(e.message || e) }; } }, W, H);
  if (info.error) { console.log('INIT ERROR\n' + info.error); await browser.close(); server.close(); process.exit(1); }
  console.log('init', JSON.stringify(info));
}

try {
  await boot();
  if (cmd === 'stills') {
    let jobs = argv[1];
    jobs = JSON.parse(fs.existsSync(jobs) ? fs.readFileSync(jobs, 'utf8') : jobs);
    for (const job of jobs) {
      const r = await page.evaluate(async (job) => {
        try {
          const r = job.t !== undefined ? await window.FL.frameAt(job.t, job.opts || {}) : await window.FL.still(job.over || {}, job.opts || {});
          return { ...r, url: window.FL.dataURL(job.out.endsWith('.png') ? 'image/png' : 'image/jpeg', 0.93) };
        } catch (e) { return { error: String(e.stack || e) }; }
      }, job);
      if (r.error) { console.log('ERR', job.out, r.error); continue; }
      const out = path.resolve(ROOT, job.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
      console.log(`${job.out}  ${r.ms.toFixed(0)} ms`);
    }
  } else if (cmd === 'video') {
    const fps = +flag('fps', 60), from = +flag('from', 0), to = +flag('to', 1);
    const out = path.resolve(ROOT, flag('out', 'out/seg/test.mp4'));
    const samples = +flag('samples', 4);
    const crf = flag('crf', '12');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // picture goes to a fast intermediate (hardware ProRes HQ); the delivery encode happens afterwards, off the render loop
    const VF = 'vflip,scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=';
    const TAGS = ['-color_range', 'tv', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709'];
    const enc = out.endsWith('.mov')
      ? ['-vf', VF + 'yuv422p10le', '-c:v', 'prores_videotoolbox', '-profile:v', 'hq', ...TAGS]
      : ['-vf', VF + flag('pix', 'yuv420p'), '-c:v', 'libx264', '-preset', flag('preset', 'medium'), '-crf', crf, '-g', '60', '-bf', '2', ...TAGS, '-movflags', '+faststart'];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0', ...enc, out], { stdio: ['pipe', 'inherit', 'inherit'] });
    frameSink = (buf) => new Promise((res, rej) => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', res); else res(); });
    const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
    const t0 = Date.now();
    let done = 0;
    const CH = 30;
    for (let f = f0; f < f1; f += CH) {
      const n = Math.min(CH, f1 - f);
      const r = await page.evaluate(async (f, n, fps, samples) => {
        try { return await window.FL.renderRange(f, n, fps, { samples }); } catch (e) { return { error: String(e.stack || e) }; }
      }, f, n, fps, samples);
      if (r && r.error) { console.log('ERR', r.error); break; }
      done += n;
      const el = (Date.now() - t0) / 1000;
      console.log(`frames ${f0 + done}/${f1}  ${(el / done * 1000).toFixed(0)} ms/f  eta ${((f1 - f0 - done) * el / done / 60).toFixed(1)} min  [${r.tm} sink ${(sinkMs / Math.max(1, sinkN)).toFixed(0)}]`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('wrote', out);
  }
} finally {
  await browser.close();
  wss.close(); server.close();
}
