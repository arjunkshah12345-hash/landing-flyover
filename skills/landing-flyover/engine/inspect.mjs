// Dump the page's section tree with positions, so you can pick the pieces that lift.
import { launch } from './browser.mjs';
import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(cfg.url, { waitUntil: 'load', timeout: 90000 });
await p.waitForTimeout(2000);
const H = await p.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H; y += 400) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(100); }
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200);
const lines = await p.evaluate(() => {
  const out = [];
  const path = el => { let s = el.tagName.toLowerCase(); if (el.id) return '#' + el.id; const c = [...el.classList].filter(c => !/^(is-|has-|js-)/.test(c)).slice(0, 2); return s + (c.length ? '.' + c.join('.') : ''); };
  const walk = (el, d, pre) => {
    if (d > 5) return;
    for (const c of el.children) {
      const r = c.getBoundingClientRect(); if (r.width < 24 || r.height < 18) continue;
      const sel = pre ? pre + ' > ' + path(c) : path(c);
      const txt = (c.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push(`${'  '.repeat(d)}${path(c)}  [x ${Math.round(r.left)} y ${Math.round(r.top + scrollY)} w ${Math.round(r.width)} h ${Math.round(r.height)}]  ${c.tagName === 'IMG' || c.tagName === 'VIDEO' || c.tagName === 'CANVAS' ? '<' + c.tagName + '>' : ''} ${txt}`);
      walk(c, d + 1, '');
    }
  };
  walk(document.body, 0, '');
  return out;
});
fs.writeFileSync('dom.txt', lines.join('\n'));
await p.screenshot({ path: 'inspect.png', fullPage: false });
console.log(`page height ${H}px · ${lines.length} nodes → dom.txt, first viewport → inspect.png`);
await b.close();
