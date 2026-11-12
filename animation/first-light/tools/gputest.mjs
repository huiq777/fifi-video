// Check that headless Chrome gets a real GPU (Metal) WebGL2 context.
import puppeteer from 'puppeteer-core';

const headless = process.argv.includes('--headful') ? false : true;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless,
  args: [
    '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
    '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--force-color-profile=srgb',
  ],
});
const page = await browser.newPage();
await page.goto('about:blank');
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const gl = c.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return { error: 'no webgl2' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const exts = ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear', 'EXT_float_blend', 'EXT_texture_filter_anisotropic'];
  const out = {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    max3D: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
    maxRB: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    exts: Object.fromEntries(exts.map(e => [e, !!gl.getExtension(e)])),
  };
  // tiny perf probe: heavy-ish fragment shader, 1080p, measure with readPixels sync
  const vs = `#version 300 es
  void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1.,0.,1.); }`;
  const fs = `#version 300 es
  precision highp float; out vec4 o; uniform float uT;
  void main(){ vec2 p = gl_FragCoord.xy/1080.; float a=0.; for(int i=0;i<400;i++){ a += sin(p.x*float(i)*.37+uT)*cos(p.y*float(i)*.21-uT)/float(i+1); } o = vec4(vec3(.5+.5*a),1.); }`;
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
  const u = gl.getUniformLocation(pr, 'uT');
  const px = new Uint8Array(4);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) { gl.uniform1f(u, i * .1); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  out.msPerFrame400sin = (performance.now() - t0) / 20;
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
