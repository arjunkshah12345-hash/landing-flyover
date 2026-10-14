// Capture the page as a base plate (lifted pieces hidden) plus each lifted piece alone on transparency.
import { launch } from './browser.mjs';
import fs from 'fs';
import path from 'path';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const ROLE_DEFAULTS = {
  chip:        { z: 4,  zMax: 64,  stand: 30 },
  button:      { z: 6,  zMax: 28,  stand: 0 },
  mockup:      { z: 10, zMax: 24,  stand: 0 },
  card:        { z: 6,  zMax: 30,  stand: 0 },
  photo:       { z: 8,  zMax: 115, stand: 46 },
  flychip:     { z: 4,  zMax: 200, stand: 54 },
  testimonial: { z: 22, zMax: 112, stand: 30 },
};
const LAYERS = (cfg.layers || []).map(l => ({ ...ROLE_DEFAULTS[l.role] || ROLE_DEFAULTS.card, ...l }));
const PAD = 28, CHUNK = 4096;   // 4096 css px = 8192 device px per base-plate tile (Chrome caps one capture at 16384)

fs.mkdirSync('capture', { recursive: true });
for (const f of fs.readdirSync('capture')) if (/^(page|layer)_\d+\.png$/.test(f)) fs.unlinkSync(path.join('capture', f));
fs.copyFileSync(cfg.logo, 'capture/logo.png');

const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const r of cfg.routes || []) await p.route(r.match, route => route.fulfill({ path: r.file }));
await p.goto(cfg.url, { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(1500);

// scroll to the bottom once so lazy images, counters and scroll reveals finish
const H0 = await p.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H0; y += 300) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(140); }
await p.waitForTimeout(2500);
// live numbers (counters fed by an API) must have loaded before anything is frozen
for (const sel of cfg.waitFor || []) {
  await p.waitForFunction(sel => { const e = document.querySelector(sel); return e && /[1-9]/.test(e.textContent); }, sel, { timeout: 15000 })
    .catch(() => console.warn(`waitFor: "${sel}" never showed a non-zero value; it will film as-is`));
}

// lock the page: finish animations, freeze video, collapse pinned scroll runways, unfix fixed bars
await p.evaluate(async ({ hide, css, videoTime }) => {
  for (const a of document.getAnimations()) { try { a.finish(); } catch { a.pause(); } }
  const st = document.createElement('style');
  st.textContent = `*,*::before,*::after{transition:none!important;caret-color:transparent!important}
    ${(hide || []).join(',') || '.__none'}{display:none!important}
    ${css || ''}`;
  document.head.appendChild(st);
  document.querySelectorAll('[class*=reveal],[data-aos],[data-reveal],[data-animate]').forEach(e => e.classList.add('is-visible', 'in-view', 'aos-animate', 'revealed'));
  // videos: show a real frame, or the poster if the source fails
  await Promise.all([...document.querySelectorAll('video')].map(v => new Promise(res => {
    v.pause();
    const usePoster = () => {
      if (v.poster) { const i = new Image(); i.src = v.poster; i.style.cssText = getComputedStyle(v).cssText; i.className = v.className; v.replaceWith(i); }
      res();
    };
    if (v.error || v.networkState === 3) return usePoster();
    v.addEventListener('error', usePoster, { once: true });
    if (v.readyState >= 1) { v.currentTime = Math.min(videoTime ?? 1, (v.duration || 2) / 2); v.addEventListener('seeked', res, { once: true }); }
    else v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(videoTime ?? 1, v.duration / 2); v.addEventListener('seeked', res, { once: true }); }, { once: true });
    setTimeout(() => { if (v.readyState < 2) usePoster(); else res(); }, 6000);
  })));
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') el.style.setProperty('position', 'absolute', 'important');
    if (cs.position === 'sticky') {
      const before = el.getBoundingClientRect().height;
      el.style.setProperty('position', 'relative', 'important');
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('min-height', '0', 'important');
      if (parseFloat(cs.paddingTop) < 72) el.style.setProperty('padding-top', '72px', 'important');
      if (parseFloat(cs.paddingBottom) < 72) el.style.setProperty('padding-bottom', '72px', 'important');
      const parent = el.parentElement;
      if (parent && parent !== document.body && parent.getBoundingClientRect().height > before * 1.3) parent.style.setProperty('height', 'auto', 'important');
    }
  }
  await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
  // stop anything that ticks
  const hi = setTimeout(() => {}, 0); for (let i = 0; i <= hi; i++) { clearInterval(i); clearTimeout(i); }
  window.requestAnimationFrame = () => 0;
  scrollTo(0, 0);
}, { hide: cfg.hide, css: cfg.css, videoTime: cfg.videoTime });
await p.waitForTimeout(1200);

// mark layers and measure everything
const meta = await p.evaluate(({ LAYERS, PAD, hero }) => {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
  const first = sel => { try { return sel ? document.querySelector(sel) : null; } catch { return null; } };
  const layers = []; let id = 0;
  for (const L of LAYERS) {
    let els = []; try { els = [...document.querySelectorAll(L.sel)]; } catch {}
    for (const el of els) {
      if (el.closest('[data-layer]') && L.role !== 'photo') continue;
      const b = box(el); if (b.w < 8 || b.h < 8) continue;
      el.setAttribute('data-layer', String(id));
      layers.push({ id, sel: L.sel, role: L.role, z: L.z, zMax: L.zMax, stand: L.stand, ...b, pad: PAD,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, file: `layer_${id}.png` });
      id++;
    }
  }
  const sec = first(hero.section) || document.querySelector('header + *, main > *:first-child') || document.body.firstElementChild;
  const s = box(sec), m = first(hero.mockup), a = first(hero.tileAnchor), f = first(hero.footerTitle);
  const H = document.documentElement.scrollHeight;
  return {
    layers, W: document.documentElement.scrollWidth, H,
    hero: {
      y: s.y, h: s.h,
      frameY: m ? box(m).y : s.y + s.h * 0.45, frameH: m ? box(m).h : s.h * 0.5,
      tileAnchor: a ? box(a) : { x: 360, y: Math.min(400, s.y + s.h * 0.4), w: 120, h: 44 },
      ctaTitleY: f ? box(f).y + box(f).h / 2 : H - 700,
    },
  };
}, { LAYERS, PAD, hero: cfg.hero || {} });
console.log(`page ${meta.W}x${meta.H} · ${meta.layers.length} lifted pieces`);
if (meta.layers.length === 0) console.warn('no layers matched: edit "layers" in config.json (see dom.txt from inspect.mjs)');

// base plate, layers hidden, in chunks
await p.addStyleTag({ content: '[data-layer]{visibility:hidden!important}' });
for (let i = 0; i * CHUNK < meta.H; i++) {
  const y = i * CHUNK, h = Math.min(CHUNK, meta.H - y);
  await p.screenshot({ path: `capture/page_${i}.png`, fullPage: true, clip: { x: 0, y, width: 1440, height: h } });
}
meta.tiles = Math.ceil(meta.H / CHUNK); meta.chunk = CHUNK;
// each piece alone on transparency, nested pieces hidden
await p.addStyleTag({ content: 'html,body{background:transparent!important} body{visibility:hidden!important} [data-solo]{visibility:visible!important} [data-solo] [data-layer]{visibility:hidden!important}' });
for (const L of meta.layers) {
  await p.evaluate(id => { document.querySelectorAll('[data-solo]').forEach(e => e.removeAttribute('data-solo')); document.querySelector(`[data-layer="${id}"]`).setAttribute('data-solo', ''); }, L.id);
  await p.screenshot({ path: `capture/${L.file}`, fullPage: true, omitBackground: true, clip: { x: L.x - PAD, y: L.y - PAD, width: L.w + 2 * PAD, height: L.h + 2 * PAD } });
}
fs.writeFileSync('capture/layers.json', JSON.stringify(meta, null, 1));
await b.close();
console.log('capture/ ready');
