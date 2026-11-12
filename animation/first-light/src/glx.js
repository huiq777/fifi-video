// Minimal WebGL2 helper: programs with typed uniform setters, float targets, fullscreen passes.
const VS = `#version 300 es
out vec2 vUV;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

export class GLX {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl; this.canvas = canvas;
    for (const e of ['EXT_color_buffer_float', 'OES_texture_float_linear', 'EXT_float_blend', 'EXT_color_buffer_half_float'])
      if (!gl.getExtension(e)) console.warn('missing ext', e);
    this.vs = this._shader(gl.VERTEX_SHADER, VS, 'vs');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  }

  _shader(type, src, name) {
    const gl = this.gl, sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const lines = src.split('\n');
      const ctx = [];
      for (const m of log.matchAll(/ERROR: \d+:(\d+)/g)) {
        const n = +m[1];
        for (let i = Math.max(1, n - 2); i <= Math.min(lines.length, n + 1); i++) ctx.push(`${i}: ${lines[i - 1]}`);
        ctx.push('--');
        if (ctx.length > 60) break;
      }
      throw new Error(`shader compile failed [${name}]\n${log}\n${ctx.join('\n')}`);
    }
    return sh;
  }

  program(fs, name = 'prog') {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.vs);
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link failed [${name}] ` + gl.getProgramInfoLog(p));
    const uni = new Map();
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      uni.set(base, { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size });
    }
    return { p, uni, name };
  }

  tex2D({ w, h, internal, format, type, filter, wrap, mips = false, data = null }) {
    const gl = this.gl, t = gl.createTexture();
    internal ??= gl.RGBA16F; format ??= gl.RGBA; type ??= gl.HALF_FLOAT; filter ??= gl.LINEAR; wrap ??= gl.CLAMP_TO_EDGE;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, Array.isArray(wrap) ? wrap[0] : wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, Array.isArray(wrap) ? wrap[1] : wrap);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    const o = { t, w, h, target: gl.TEXTURE_2D, mips };
    o.fbo = null;
    return o;
  }

  tex3D({ size, internal, format, type, filter, mips = false }) {
    const gl = this.gl, t = gl.createTexture();
    internal ??= gl.RGBA8; format ??= gl.RGBA; type ??= gl.UNSIGNED_BYTE; filter ??= gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, internal, size, size, size, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    return { t, w: size, h: size, d: size, target: gl.TEXTURE_3D, mips };
  }

  // framebuffer for a 2D texture (cached on the texture object)
  fboOf(tex) {
    const gl = this.gl;
    if (!tex.fbo) {
      tex.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, tex.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.t, 0);
      const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete ' + st);
    }
    return tex.fbo;
  }

  target(w, h, opts = {}) { const t = this.tex2D({ w, h, ...opts }); this.fboOf(t); return t; }

  genMips(tex) { const gl = this.gl; gl.bindTexture(tex.target, tex.t); gl.generateMipmap(tex.target); }

  _set(prog, uniforms) {
    const gl = this.gl;
    let unit = 0;
    for (const k in uniforms) {
      const u = prog.uni.get(k); if (!u) continue;
      const v = uniforms[k];
      switch (u.type) {
        case gl.FLOAT: if (u.size > 1) gl.uniform1fv(u.loc, v); else gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
        case gl.SAMPLER_2D: case gl.SAMPLER_3D:
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(v.target, v.t); gl.uniform1i(u.loc, unit); unit++; break;
        default: throw new Error(`uniform type ${u.type} for ${k}`);
      }
    }
  }

  // Draw fullscreen pass into `target` (texture object or null for canvas).
  // opts: {viewport:[x,y,w,h], blend:'add'|null, clear:[r,g,b,a]|null, tiles:n, layer (for 3D)}
  draw(prog, target, uniforms = {}, opts = {}) {
    const gl = this.gl;
    if (opts.fbo) gl.bindFramebuffer(gl.FRAMEBUFFER, opts.fbo);
    else gl.bindFramebuffer(gl.FRAMEBUFFER, target ? this.fboOf(target) : null);
    const W = target ? target.w : this.canvas.width, H = target ? target.h : this.canvas.height;
    const vp = opts.viewport || [0, 0, W, H];
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.useProgram(prog.p);
    this._set(prog, uniforms);
    if (opts.clear) { gl.disable(gl.SCISSOR_TEST); gl.clearColor(...opts.clear); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (opts.blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
    else if (opts.blend === 'over') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
    else gl.disable(gl.BLEND);
    const tiles = opts.tiles || 1;
    if (tiles > 1) {
      gl.enable(gl.SCISSOR_TEST);
      const th = Math.ceil(vp[3] / tiles);
      for (let i = 0; i < tiles; i++) {
        gl.scissor(vp[0], vp[1] + i * th, vp[2], Math.min(th, vp[3] - i * th));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
      }
      gl.disable(gl.SCISSOR_TEST);
    } else {
      gl.disable(gl.SCISSOR_TEST);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  // Render each z-slice of a 3D texture with uniform uZ.
  draw3D(prog, tex3d, uniforms = {}) {
    const gl = this.gl, fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.useProgram(prog.p);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, tex3d.w, tex3d.h);
    for (let z = 0; z < tex3d.d; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex3d.t, 0, z);
      this._set(prog, { ...uniforms, uZ: (z + 0.5) / tex3d.d });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    if (tex3d.mips) this.genMips(tex3d);
  }

  sync() { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
}
