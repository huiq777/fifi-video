// Where does a frame's time go?  node tools/profile.mjs 5 14 50 ...   (run from the project root)
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(); const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  if (req.method === 'POST') { let n = 0; req.on('data', c => n += c.length); req.on('end', () => { res.writeHead(200); res.end('ok'); }); return; }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 0,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--window-size=${W},${H}`] });
const page = await browser.newPage(); await page.setViewport({ width: W, height: H });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`); await page.waitForFunction('window.FL !== undefined');
await page.evaluate((w, h) => window.FL.init({ w, h }), W, H);
const r = await page.evaluate(async (ts, samples) => {
  const out = {};
  for (const t of ts) {
    const c = document.getElementById('c'), gl = c.getContext('webgl2'); const px = new Uint8Array(c.width * c.height * 4);
    let a = 0, b = 0, d = 0; const N = 5;
    for (let i = 0; i < N; i++) {
      let t0 = performance.now(); window.FL.frameAt(t + i / 60, { samples }); gl.finish(); a += performance.now() - t0;
      t0 = performance.now(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px); b += performance.now() - t0;
      t0 = performance.now(); await fetch('/frame', { method: 'POST', body: px }); d += performance.now() - t0;
    }
    out[t] = `${(a / N).toFixed(0)} / ${(b / N).toFixed(0)} / ${(d / N).toFixed(0)}`;
  }
  return out;
}, process.argv.slice(2).map(Number), +(process.env.SAMPLES || 8));
console.log('t: frame / readPixels / post  (ms)'); console.log(JSON.stringify(r, null, 0));
await browser.close(); server.close();
