// Landing-page 3D fly-over. Every frame is a pure function of t via seek(t).
(async () => {
const W = 1440, H = 1152, FOC = 1880, DEG = Math.PI / 180;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutCubic = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOutCubic = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const quadInOut = x => { x = clamp(x); return x < .5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x); };

// ---------- data ----------
const cfg = await (await fetch('config.json')).json();
const LINE1 = cfg.title.line1.trim().split(/\s+/);
const TAIL = cfg.title.tail.trim().split(/\s+/);
const BRAND = cfg.brand;
const meta = await (await fetch('capture/layers.json')).json();
const PAGE_W = 1440, PAGE_H = meta.H;
const HERO_BOTTOM = Math.min(1225, Math.round(meta.hero.frameY + meta.hero.frameH + 8));   // the part of the page that becomes the end card (must fit under the title)
const CARD_TOP = 283, CARD_W = 1018;
const S_CARD = CARD_W / PAGE_W;
const L0 = Math.min(meta.hero.frameY + meta.hero.frameH * 0.55, meta.hero.y + 900);   // start over the hero with the mockup in focus
const TARGET_Y = meta.hero.ctaTitleY;     // footer title sharp at 8.0s
const layers = meta.layers.map(L => ({ ...L }));

// ---------- camera: one speed curve, integrated ----------
const DT = 1 / 2000;
function integ(f, a, b) {
  const n = Math.ceil((b - a) / DT), arr = new Float64Array(n + 1);
  let s = 0; for (let i = 0; i < n; i++) { s += f(a + (i + .5) * DT) * DT; arr[i + 1] = s; }
  return t => { if (t <= a) return 0; if (t >= b) return arr[n]; const x = (t - a) / DT, i = Math.floor(x); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };
}
function share(t) {                       // speed down the page as a share of cruise
  if (t < 0.6) return 0.5 * sstep(0, 0.6, t);
  if (t < 1.25) return 0.5;
  if (t < 1.6) return 0.5 + 0.5 * sstep(1.25, 1.6, t);
  if (t < 7.3) return 1.0;
  return lerp(1.0, 0.12, sstep(7.3, 8.3, t));
}
const S = integ(share, 0, 15);
const CRUISE = (TARGET_Y - L0) / S(8.0);
const glideY = t => L0 + CRUISE * S(t);
const dGlide = t => 1360 + 340 * easeOutCubic(t / 8.2);

// rise: log zoom with trapezoid speed
const riseV = t => sstep(7.75, 8.35, t) * (1 - sstep(8.95, 9.25, t));
const RI = integ(riseV, 7.75, 9.25), RTOT = RI(9.25);
const D_END = FOC * PAGE_H / (H - 84);   // page fills the frame with 42px top and bottom
const A_RISE = Math.log(D_END / dGlide(9.25));
const S_END = FOC / D_END;

// overhead creep 3.5%, then the dive on a quadratic ease in-out, then 2% creep under the title
const creepV = t => sstep(9.25, 9.33, t) * (1 - sstep(9.47, 9.62, t));
const CI = integ(creepV, 9.25, 9.7);
const CREEP_K = Math.log(1.035) / CI(9.47);
const creep = t => CREEP_K * CI(t);
const DIVE_AMP = Math.log(S_CARD) - Math.log(S_END) - creep(9.97);
const TI = integ(t => sstep(9.97, 10.45, t), 9.97, 14.6), TTOT = TI(14.5);
const logS = t => Math.log(S_END) + creep(t) + DIVE_AMP * quadInOut((t - 9.47) / 0.5) + Math.log(1.02) * TI(t) / TTOT;

function cam(t) {
  if (t < 9.25) {
    const th = 56 * DEG * (1 - sstep(8.15, 8.95, t));
    const d = dGlide(t) * Math.exp(A_RISE * RI(t) / RTOT);
    const k = (H - 42 - H / 2) / FOC;
    const u = k * d / (Math.cos(th) + k * Math.sin(th));
    const pinY = PAGE_H - u;                 // look-at that holds the page's bottom edge on the 42px line
    return { x: PAGE_W / 2, y: lerp(glideY(t), pinY, sstep(8.3, 8.65, t)), d, th };
  }
  if (t > 9.97) { const c = cam(9.97); return { x: c.x, y: c.y, d: FOC / Math.exp(logS(t)), th: 0 }; }
  const s = Math.exp(logS(t));
  const yCentred = H / 2 - s * PAGE_H / 2;
  const yPinned = H / 2 - Math.exp(logS(9.47)) * PAGE_H / 2;
  let ytop = lerp(yCentred, yPinned, sstep(9.40, 9.54, t));
  ytop = lerp(ytop, CARD_TOP, sstep(9.62, 9.97, t));
  return { x: PAGE_W / 2, y: (H / 2 - ytop) / s, d: FOC / s, th: 0 };
}

// ---------- GL ----------
const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, premultipliedAlpha: false });
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
window.glInfo = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

function compile(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aUV');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const locs = {};
  p.u = name => (name in locs) ? locs[name] : (locs[name] = gl.getUniformLocation(p, name));
  return p;
}

const SCENE_VS = `#version 300 es
in vec3 aPos; in vec2 aUV;
uniform vec3 uC, uF, uU; uniform vec2 uJit; uniform int uScreen; uniform float uSDepth;
out vec2 vUV; out float vZ; out vec3 vW;
void main(){
  vUV = aUV; vW = aPos;
  vec2 j = uJit * vec2(2.0/1440.0, 2.0/1152.0);
  if (uScreen == 1) {
    gl_Position = vec4(aPos.x/720.0 - 1.0 + j.x, 1.0 - aPos.y/576.0 + j.y, 0.0, 1.0);
    vZ = uSDepth; return;
  }
  vec3 v = aPos - uC;
  float zc = dot(v, uF), xc = v.x, yc = dot(v, uU);
  vZ = zc;
  vec4 p = vec4(xc*1880.0/720.0, yc*1880.0/576.0, zc - 20.0, zc);
  p.xy += j * zc;
  gl_Position = p;
}`;
const SCENE_FS = `#version 300 es
precision highp float;
in vec2 vUV; in float vZ; in vec3 vW;
uniform int uMode; uniform sampler2D uTex;
uniform vec4 uMask; uniform float uRad, uFadeY, uFade, uAlphaMul, uHazeMix;
uniform vec4 uColor; uniform vec2 uBlurUV; uniform float uLod, uOpacity;
layout(location=0) out vec4 oCol; layout(location=1) out vec4 oDep;
vec3 haze(){
  vec2 q = (gl_FragCoord.xy - vec2(720.0, 576.0)) / vec2(720.0, 576.0);
  float r = clamp(length(q) / 1.41421, 0.0, 1.0);
  return mix(vec3(0.9765, 0.9843, 0.9843), vec3(0.9490, 0.9529, 0.9647), smoothstep(0.0, 1.0, r));
}
float sdRR(vec2 p, vec4 r, float rad){
  vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5;
  vec2 q = abs(p - c) - h + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}
void main(){
  vec4 col;
  if (uMode == 1) {                       // studio floor
    col = vec4(haze(), 1.0);
  } else if (uMode == 0) {                // the page
    col = texture(uTex, vUV);
    float sd = sdRR(vW.xy, uMask, uRad);
    float aa = max(fwidth(sd), 1e-3);
    float a = 1.0 - smoothstep(-0.5*aa, 0.5*aa, sd);
    if (vW.y > uFadeY) col.rgb = mix(col.rgb, haze(), uFade);
    col = vec4(col.rgb * a, a);
  } else if (uMode == 4) {                // soft wide shadow around the page
    float sd = sdRR(vW.xy - vec2(0.0, 22.0), uMask, uRad);
    float a = pow(1.0 - smoothstep(-40.0, 170.0, sd), 2.0) * 0.10;
    if (vW.y > uFadeY) a *= 1.0 - uFade;
    col = vec4(vec3(0.102, 0.129, 0.2) * a, a);
  } else if (uMode == 2) {                // lifted piece (premultiplied)
    col = texture(uTex, vUV);
    col.rgb = mix(col.rgb, haze() * col.a, uHazeMix);
    col *= uAlphaMul;
  } else if (uMode == 3) {                // its shadow: same picture, flat #1a2133, blurred
    float s = 0.0;
    for (int i = 0; i < 13; i++) {
      vec2 o = vec2(0.0);
      if (i > 0) { float k = float(i); float ang = k * 2.39996; o = vec2(cos(ang), sin(ang)) * sqrt(k / 12.0); }
      vec2 uv = vUV + o * uBlurUV;
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      s += textureLod(uTex, uv, uLod).a * inside;
    }
    float a = s / 13.0 * uOpacity * uAlphaMul;
    col = vec4(vec3(0.102, 0.129, 0.2) * a, a);
  } else {                                // solid
    col = vec4(uColor.rgb, 1.0) * uColor.a * uAlphaMul;
  }
  oCol = col;
  oDep = vec4(vZ * col.a, 0.0, 0.0, col.a);
}`;
const FS_VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const COC = `
uniform float uFocus;
float coc(float z){ return z < uFocus ? min(120.0, 75.0 * (uFocus - z) / z) : min(120.0, 6.0 * (z - uFocus) / z); }`;
const NEAR_FS = `#version 300 es
precision highp float; uniform sampler2D uDep; ${COC}
out vec4 o;
void main(){
  ivec2 b = ivec2(gl_FragCoord.xy) * 8; float m = 0.0;
  for (int j = 0; j < 8; j++) for (int i = 0; i < 8; i++) {
    float z = texelFetch(uDep, b + ivec2(i, j), 0).r;
    if (z < uFocus) m = max(m, coc(z));
  }
  o = vec4(m);
}`;
const DILATE_FS = `#version 300 es
precision highp float; uniform sampler2D uSrc; uniform ivec2 uDir; out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 sz = textureSize(uSrc, 0); float m = 0.0;
  for (int i = -16; i <= 16; i++) { ivec2 q = clamp(p + uDir * i, ivec2(0), sz - 1); m = max(m, texelFetch(uSrc, q, 0).r); }
  o = vec4(m);
}`;
const DOF_FS = `#version 300 es
precision highp float;
uniform sampler2D uCol, uDep, uNear, uOvl; uniform float uInvN, uOvlOn, uRot; ${COC}
out vec4 o;
void main(){
  vec2 res = vec2(1440.0, 1152.0);
  vec2 px = gl_FragCoord.xy;
  float zc = texelFetch(uDep, ivec2(px), 0).r;
  float cc = coc(zc);
  float R = max(cc, texture(uNear, px / res).r);
  vec4 c0 = texelFetch(uCol, ivec2(px), 0);
  vec3 col;
  if (R < 0.5) col = c0.rgb;
  else {
    vec3 acc = c0.rgb; float ws = 1.0;
    float lod = log2(max(1.0, R * 1.8 / sqrt(40.0)));
    for (int i = 0; i < 40; i++) {
      float r = sqrt((float(i) + fract(0.5 + uRot * 0.1591549)) / 40.0) * R;
      float a = float(i) * 2.39996323 + uRot;
      vec2 uv = (px + vec2(cos(a), sin(a)) * r) / res;
      float zt = textureLod(uDep, uv, 0.0).r;
      float ct = coc(zt);
      float eff = zt < zc ? ct : min(ct, cc);
      float w = clamp(eff - r + 1.0, 0.0, 1.0);
      acc += textureLod(uCol, uv, lod).rgb * w; ws += w;
    }
    col = acc / ws;
  }
  if (uOvlOn > 0.5) { vec4 ov = texture(uOvl, vec2(px.x, res.y - px.y) / res); col = col * (1.0 - ov.a) + ov.rgb; }
  o = vec4(col * uInvN, uInvN);
}`;
const PRESENT_FS = `#version 300 es
precision highp float; uniform sampler2D uSrc; out vec4 o;
void main(){ o = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }`;

const sceneP = compile(SCENE_VS, SCENE_FS);
const nearP = compile(FS_VS, NEAR_FS);
const dilP = compile(FS_VS, DILATE_FS);
const dofP = compile(FS_VS, DOF_FS);
const preP = compile(FS_VS, PRESENT_FS);

function mkTex(w, h, ifmt, fmt, type, filter, levels = 1) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, levels, ifmt, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function mkFBO(texs) {
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
  return f;
}
const LEVELS = Math.floor(Math.log2(W)) + 1;
const colTex = mkTex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, LEVELS);
const depTex = mkTex(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const sceneFBO = mkFBO([colTex, depTex]);
const nearA = mkTex(W / 8, H / 8, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR), nearB = mkTex(W / 8, H / 8, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const nearAF = mkFBO([nearA]), nearBF = mkFBO([nearB]);
const accTex = mkTex(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const accF = mkFBO([accTex]);

function texFrom(src) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 16);
  t.w = src.width; t.h = src.height;
  return t;
}
async function loadBitmap(url) {
  const b = await (await fetch(url)).blob();
  return createImageBitmap(b, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
}
const loadTex = async url => texFrom(await loadBitmap(url));

// page tiles: 8192 device px tall each (= 4096 css px)
const pageTiles = [];
const CH = meta.chunk || 4096;
for (let i = 0; i * CH < PAGE_H; i++) pageTiles.push({ tex: await loadTex(`capture/page_${i}.png`), y0: i * CH, y1: Math.min(PAGE_H, (i + 1) * CH) });
for (const L of layers) L.tex = await loadTex(`capture/${L.file}`);

// logo tile texture and badge logo
const logoBmp = await loadBitmap('capture/logo.png');
const logoImg = new Image(); logoImg.src = 'capture/logo.png'; await logoImg.decode();
const TILE_TEX_PX = 320, TILE_BOX = 256;
const tc = document.createElement('canvas'); tc.width = tc.height = TILE_TEX_PX;
{
  const x = tc.getContext('2d'), m = (TILE_TEX_PX - TILE_BOX) / 2;
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(m, m, TILE_BOX, TILE_BOX, 58); x.fill();
  x.strokeStyle = 'rgba(17,24,39,0.08)'; x.lineWidth = 2; x.stroke();
  x.drawImage(logoImg, m + 28, m + 28, TILE_BOX - 56, TILE_BOX - 56);
}
const tileTex = texFrom(tc);

// overlay (end-card text), drawn in 2D then composited after depth of field
const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
const ox = oc.getContext('2d');
await document.fonts.load('500 74px Geist'); await document.fonts.load('italic 82px "Instrument Serif"'); await document.fonts.load('500 21px Geist');
const ovlTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ovlTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

function drawWords(words, font, color, baseline, t0, step, tracking) {
  ox.font = font; ox.letterSpacing = tracking;
  const space = ox.measureText(' ').width;
  const widths = words.map(w => ox.measureText(w).width);
  let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
  words.forEach((w, i) => {
    const q = easeOutCubic((T - t0 - i * step) / 0.34);
    if (q > 0) {
      ox.save(); ox.globalAlpha = q; ox.filter = q < 1 ? `blur(${(12 * (1 - q)).toFixed(2)}px)` : 'none';
      ox.fillStyle = color; ox.fillText(w, x, baseline + 16 * (1 - q)); ox.restore();
    }
    x += widths[i] + space;
  });
}
let T = 0;
function drawOverlay(t) {
  T = t;
  ox.clearRect(0, 0, W, H);
  if (t < 10.0) return false;
  const ba = sstep(10.02, 10.32, t);
  if (ba > 0) {                                   // white badge pill: logo + brand, 21px
    ox.save(); ox.globalAlpha = ba;
    ox.font = '500 21px Geist'; ox.letterSpacing = '-0.2px';
    const tw = ox.measureText(BRAND).width, ph = 46, logo = 24, gap = 10, pad = 18;
    const pw = pad + logo + gap + tw + pad, px = W / 2 - pw / 2, py = 44;
    ox.shadowColor = 'rgba(26,33,51,0.10)'; ox.shadowBlur = 18; ox.shadowOffsetY = 6;
    ox.fillStyle = '#ffffff'; ox.beginPath(); ox.roundRect(px, py, pw, ph, ph / 2); ox.fill();
    ox.shadowColor = 'transparent';
    ox.strokeStyle = 'rgba(17,24,39,0.07)'; ox.lineWidth = 1; ox.stroke();
    ox.drawImage(logoImg, px + pad, py + (ph - logo) / 2, logo, logo);
    ox.fillStyle = '#111114'; ox.textBaseline = 'middle'; ox.fillText(BRAND, px + pad + logo + gap, py + ph / 2 + 1);
    ox.restore();
  }
  ox.textBaseline = 'alphabetic';
  drawWords(LINE1, '500 74px Geist', '#0b0b0f', 176, 10.12, 0.06, '-2.4px');
  drawWords(TAIL, 'italic 82px "Instrument Serif"', '#8b8b92', 258, 10.36, 0.05, '-0.6px');
  return true;
}

// ---------- geometry ----------
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, 80, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
const qd = new Float32Array(20);
function quad(p00, p10, p01, p11, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const P = [p00, p10, p01, p11], U = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
  for (let i = 0; i < 4; i++) { qd[i * 5] = P[i][0]; qd[i * 5 + 1] = P[i][1]; qd[i * 5 + 2] = P[i][2] || 0; qd[i * 5 + 3] = U[i][0]; qd[i * 5 + 4] = U[i][1]; }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, qd);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
const rect = (x0, y0, x1, y1, z = 0) => [[x0, y0, z], [x1, y0, z], [x0, y1, z], [x1, y1, z]];
const U = (n, ...v) => { const l = sceneP.u(n); if (v.length === 1) gl.uniform1f(l, v[0]); else if (v.length === 2) gl.uniform2f(l, ...v); else if (v.length === 3) gl.uniform3f(l, ...v); else gl.uniform4f(l, ...v); };
const UI = (n, v) => gl.uniform1i(sceneP.u(n), v);
function bindTex(t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); UI('uTex', 0); }

// a flat picture of size (w,h) centred at (cx,cy,z), stood up by `a` about its own middle (top edge toward the lens)
function standing(cx, cy, z, hw, hh, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const P = (dx, dy) => [cx + dx, cy + dy * ca, z - dy * sa];
  return [P(-hw, -hh), P(hw, -hh), P(-hw, hh), P(hw, hh)];
}
// shadow of that picture: flat #1a2133, offset (0.10z, 4 + 0.36z), blurred 7 + 0.5z, 26%
function drawShadow(tex, cx, cy, z, hw, hh, a, texPxPerCss, alphaMul) {
  const r = 7 + 0.5 * z, ox_ = 0.10 * z, oy = 4 + 0.36 * z;
  const hhs = hh * Math.cos(a);
  const ex = r / (2 * hw), ey = r / (2 * hhs);
  bindTex(tex); UI('uMode', 3);
  U('uBlurUV', ex, ey); U('uLod', Math.log2(Math.max(1, r * texPxPerCss / 2.5))); U('uOpacity', 0.26); U('uAlphaMul', alphaMul);
  const x0 = cx + ox_ - hw - r, x1 = cx + ox_ + hw + r, y0 = cy + oy - hhs - r, y1 = cy + oy + hhs + r;
  quad(...rect(x0, y0, x1, y1, 0), -ex, -ey, 1 + ex, 1 + ey);
}

// ---------- logo tiles ----------
const anchor = meta.hero.tileAnchor;   // four tiles sit just right of the hero's last button
const TILE_START = [0, 1, 2, 3].map(i => ({ x: Math.min(anchor.x + anchor.w + 36 + i * 40, 1240 + i * 40), y: anchor.y + anchor.h / 2, z: 2, s: 32 }));
const TILE_HANG = [
  { x: -150, y: 60, z: 210, s: 190 }, { x: -60, y: 300, z: 120, s: 140 },
  { x: 1590, y: 40, z: 230, s: 200 }, { x: 1500, y: 290, z: 130, s: 150 },
];
function tile3D(i, t) {
  if (i === 1 && t > 2.6) {                         // the one that later drifts past the left edge, close and soft
    if (t < 4.7 || t > 6.4) return null;
    const ly = glideY(5.4);
    return { x: lerp(360, 170, sstep(4.7, 6.2, t)), y: ly + 420, z: 470, s: 210, a: 22 * DEG };
  }
  if (t > 7) return null;
  const p = easeInOutCubic((t - 0.1 - 0.08 * i) / 1.0);
  const A = TILE_START[i], B = TILE_HANG[i];
  return { x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p) + 300 * sstep(1.2, 2.4, t), z: lerp(A.z, B.z, p), s: lerp(A.s, B.s, p), a: 35 * DEG * p };
}
const END_TILES = [
  { x: 182, y: 270, s: 100, b: 3, fx: -280, fy: -240, t0: 9.62 },
  { x: 1229, y: 283, s: 132, b: 0, fx: 280, fy: -260, t0: 9.66 },
  { x: 1400, y: 640, s: 150, b: 0, fx: 320, fy: 0, t0: 9.72 },
  { x: 70, y: 1110, s: 430, b: 95, fx: -320, fy: 320, t0: 9.85 },
  { x: 1390, y: 1125, s: 480, b: 110, fx: 340, fy: 340, t0: 9.9 },
];

// ---------- lifts ----------
function lift(L, t) {
  const hero = L.y < HERO_BOTTOM;
  let p;
  if (hero) p = sstep(0.1, 1.35, t) * (1 - sstep(8.6, 9.9, t));
  else { const u = (L.y + L.h / 2) - glideY(Math.min(t, 8.3)); p = sstep(650, -250, u); }
  let a = L.stand * DEG * p;
  if (!hero) a *= 1 - sstep(8.4, 9.3, t);
  return { z: lerp(L.z, L.zMax, p), a, p, hero };
}

// ---------- scene ----------
let focus = 1360;
function drawScene(t, jit) {
  const c = cam(t);
  const st = Math.sin(c.th), ct = Math.cos(c.th);
  focus = c.d;
  gl.useProgram(sceneP);
  U('uC', c.x, c.y + c.d * st, c.d * ct); U('uF', 0, -st, -ct); U('uU', 0, -ct, st);
  U('uJit', jit[0], jit[1]); UI('uScreen', 0); U('uAlphaMul', 1); U('uHazeMix', 0);

  UI('uMode', 1); quad(...rect(-80000, -80000, 80000, 100000, -0.5));

  const fade = sstep(9.47, 9.74, t);
  const e = sstep(9.5, 9.85, t);
  U('uMask', 0, 0, PAGE_W, lerp(PAGE_H, HERO_BOTTOM, e));
  U('uRad', lerp(24, 38 / S_CARD, sstep(9.5, 9.9, t)));
  U('uFadeY', HERO_BOTTOM); U('uFade', fade);
  UI('uMode', 4); quad(...rect(-300, -300, PAGE_W + 300, PAGE_H + 340));
  UI('uMode', 0);
  for (const pt of pageTiles) { bindTex(pt.tex); quad(...rect(0, pt.y0, PAGE_W, pt.y1)); }

  // movers: lifted pieces and logo tiles, lowest first
  const items = [];
  for (const L of layers) {
    const lf = lift(L, t);
    const below = L.y >= HERO_BOTTOM - 4;
    const alphaMul = below ? 1 - sstep(0.85, 1.0, fade) : 1;
    if (alphaMul <= 0) continue;
    items.push({ z: lf.z, tex: L.tex, cx: L.x + L.w / 2, cy: L.y + L.h / 2, hw: L.w / 2 + L.pad, hh: L.h / 2 + L.pad, a: lf.a, tpc: 2,
      haze: below ? fade : 0, alphaMul, shadowMul: below ? 1 - fade : 1,
      slab: L.role === 'testimonial' && lf.p > 0 ? { L, p: lf.p } : null });
  }
  for (let i = 0; i < 4; i++) {
    const tl = tile3D(i, t); if (!tl) continue;
    const half = tl.s / 2 * TILE_TEX_PX / TILE_BOX;
    items.push({ z: tl.z, tex: tileTex, cx: tl.x, cy: tl.y, hw: half, hh: half, a: tl.a, tpc: TILE_TEX_PX / (2 * half), haze: 0, alphaMul: 1, shadowMul: 1 });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) if (it.z > 0.5) drawShadow(it.tex, it.cx, it.cy, it.z, it.hw, it.hh, it.a, it.tpc, it.shadowMul);
  for (const it of items) {
    if (it.slab) {                                // the testimonial's white edge
      const { L, p } = it.slab, a = it.a, n = [0, Math.sin(a), Math.cos(a)], T = 34 * p, rr = 14;
      const by = it.cy + (L.h / 2) * Math.cos(a), bz = it.z - (L.h / 2) * Math.sin(a);
      const x0 = L.x + rr, x1 = L.x + L.w - rr;
      UI('uMode', 5); U('uColor', 0.965, 0.969, 0.976, 1); U('uAlphaMul', it.alphaMul);
      quad([x0, by, bz], [x1, by, bz], [x0, by - n[1] * T, bz - n[2] * T], [x1, by - n[1] * T, bz - n[2] * T]);
    }
    bindTex(it.tex); UI('uMode', 2); U('uHazeMix', it.haze); U('uAlphaMul', it.alphaMul);
    quad(...standing(it.cx, it.cy, it.z, it.hw, it.hh, it.a));
  }
  U('uHazeMix', 0); U('uAlphaMul', 1);

  // end-card tiles in screen space; blur via the depth that gives it
  if (t > 9.55) {
    UI('uScreen', 1);
    END_TILES.forEach((et, i) => {
      const q = easeOutCubic((t - et.t0) / 0.75);
      if (q <= 0) return;
      const dx = Math.sin(t * 0.55 + i * 1.7) * 3, dy = Math.cos(t * 0.45 + i * 2.3) * 3;
      const x = et.x + et.fx * (1 - q) + dx, y = et.y + et.fy * (1 - q) + dy;
      const half = et.s / 2 * TILE_TEX_PX / TILE_BOX;
      const zf = 75 * focus / (et.b + 75);
      U('uSDepth', zf);
      const r = 18 + et.s * 0.06;
      bindTex(tileTex); UI('uMode', 3);
      const ex = r / (2 * half), ey = r / (2 * half);
      U('uBlurUV', ex, ey); U('uLod', Math.log2(Math.max(1, r * TILE_TEX_PX / (2 * half) / 2.5))); U('uOpacity', 0.2); U('uAlphaMul', 1);
      quad(...rect(x - half - r, y - half - r + 12, x + half + r, y + half + r + 12), -ex, -ey, 1 + ex, 1 + ey);
      UI('uMode', 2);
      quad(...rect(x - half, y - half, x + half, y + half));
    });
    UI('uScreen', 0);
  }
}

// ---------- frame ----------
const fsVAO = gl.createVertexArray();
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
function unbindAll() { for (let i = 3; i >= 0; i--) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); } }
function subframe(t, k, invN) {
  unbindAll();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO); gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  gl.clearBufferfv(gl.COLOR, 0, [0.965, 0.97, 0.975, 1]); gl.clearBufferfv(gl.COLOR, 1, [60000, 0, 0, 1]);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  drawScene(t, [halton(k + 1, 2) - .5, halton(k + 1, 3) - .5]);
  gl.disable(gl.BLEND);
  gl.bindTexture(gl.TEXTURE_2D, colTex); gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindVertexArray(fsVAO);
  // near-field blur radius, max over 8x8 tiles, then dilated
  gl.bindFramebuffer(gl.FRAMEBUFFER, nearAF); gl.viewport(0, 0, W / 8, H / 8);
  gl.useProgram(nearP); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, depTex);
  gl.uniform1i(nearP.u('uDep'), 0); gl.uniform1f(nearP.u('uFocus'), focus); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(dilP); gl.uniform1i(dilP.u('uSrc'), 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, nearBF); gl.bindTexture(gl.TEXTURE_2D, nearA); gl.uniform2i(dilP.u('uDir'), 1, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, nearAF); gl.bindTexture(gl.TEXTURE_2D, nearB); gl.uniform2i(dilP.u('uDir'), 0, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
  // depth of field gather, accumulated for motion blur
  const ovl = drawOverlay(t);
  if (ovl) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ovlTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, oc); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, accF); gl.viewport(0, 0, W, H);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(dofP);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depTex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, nearA);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ovlTex);
  gl.uniform1i(dofP.u('uCol'), 0); gl.uniform1i(dofP.u('uDep'), 1); gl.uniform1i(dofP.u('uNear'), 2); gl.uniform1i(dofP.u('uOvl'), 3);
  gl.uniform1f(dofP.u('uFocus'), focus); gl.uniform1f(dofP.u('uInvN'), invN); gl.uniform1f(dofP.u('uOvlOn'), ovl ? 1 : 0); gl.uniform1f(dofP.u('uRot'), k * 2.39996323 * 0.37 + 0.5);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND);
  unbindAll();
}
// render time t with N motion-blur subframes spread over `shutter` of a frame at `fps`
function seek(t, N = 16, fps = 60, shutter = 0.7) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, accF); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
  const span = shutter / fps;
  for (let k = 0; k < N; k++) subframe(N === 1 ? t : t - span / 2 + span * (k + 0.5) / N, k, 1 / N);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
  gl.useProgram(preP); gl.bindVertexArray(fsVAO);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accTex); gl.uniform1i(preP.u('uSrc'), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
}
window.seek = seek;
window.camAt = t => { const c = cam(t); return { ...c, glide: glideY(Math.min(t, 8.3)), cruise: CRUISE, share: share(t) }; };
window.filmMeta = { CRUISE, D_END, PAGE_H, TARGET_Y };
seek(0, 1);
window.filmReady = true;
})().catch(e => { console.error('FILM ERROR', e && e.stack || e); window.filmError = String(e && e.stack || e); });
