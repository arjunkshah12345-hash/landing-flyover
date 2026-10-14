// usage: node render.mjs stills 0,1.6,2.5 | node render.mjs video out.mp4 [fps] [subframes] | node render.mjs cam
import { launch, gpuArgs } from './browser.mjs';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [mode, arg, fpsArg, nArg] = process.argv.slice(2);
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const b = await launch(gpuArgs());
const p = await b.newPage({ viewport: { width: 1440, height: 1152 }, deviceScaleFactor: 1 });
p.on('console', m => console.log('[page]', m.text()));
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${port}/film.html`);
await p.waitForFunction(() => window.filmReady || window.filmError, null, { timeout: 240000 });
const err = await p.evaluate(() => window.filmError);
if (err) { console.error(err); process.exit(1); }
const gpu = await p.evaluate(() => window.glInfo);
console.log('GPU:', gpu, JSON.stringify(await p.evaluate(() => window.filmMeta)));
if (/swiftshader|llvmpipe|software/i.test(gpu)) console.warn('WARNING: rendering on a software rasterizer. Run on a machine with a GPU, or expect slow renders.');

const grab = async (t, N, fps) => {
  const url = await p.evaluate(([t, N, fps]) => { seek(t, N, fps); return document.getElementById('c').toDataURL('image/png'); }, [t, N, fps]);
  return Buffer.from(url.split(',')[1], 'base64');
};

if (mode === 'stills') {
  fs.mkdirSync(path.join(root, 'stills'), { recursive: true });
  for (const t of arg.split(',').map(Number)) {
    const t0 = Date.now();
    fs.writeFileSync(path.join(root, 'stills', `still_${t.toFixed(2)}.png`), await grab(t, 16, 60));
    console.log('still', t, Date.now() - t0, 'ms');
  }
  // contact sheet, 4 across at half size
  const names = arg.split(',').map(t => `stills/still_${Number(t).toFixed(2)}.png`);
  const sheet = await p.evaluate(async names => {
    const c = document.createElement('canvas'); c.width = 4 * 720; c.height = Math.ceil(names.length / 4) * 576;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < names.length; i++) {
      const im = new Image(); im.src = names[i] + '?' + Date.now(); await im.decode();
      x.drawImage(im, (i % 4) * 720, Math.floor(i / 4) * 576, 720, 576);
      x.fillStyle = '#e11'; x.font = '600 20px sans-serif'; x.fillText(names[i].match(/still_(.*)\.png/)[1] + 's', (i % 4) * 720 + 14, Math.floor(i / 4) * 576 + 30);
    }
    return c.toDataURL('image/png');
  }, names);
  fs.writeFileSync(path.join(root, 'stills', 'contact_sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('stills/contact_sheet.png');
} else if (mode === 'video') {
  const fps = Number(fpsArg || 60), N = Number(nArg || 16), frames = Math.round(14.5 * fps);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(root, arg)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await grab(i / fps, N, fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('done', arg);
  const score = path.join(root, 'audio', 'score.wav');
  if (fs.existsSync(score)) {
    const out = arg.replace(/\.mp4$/, '') + '-audio.mp4';
    await new Promise(r => spawn('ffmpeg', ['-y', '-v', 'error', '-i', path.join(root, arg), '-i', score, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', path.join(root, out)], { stdio: 'inherit' }).on('close', r));
    console.log('with score:', out);
  }
} else if (mode === 'cam') {
  const out = await p.evaluate(() => { const r = []; for (let t = 0; t <= 14.5; t += 0.05) r.push([+t.toFixed(2), camAt(t)]); return r; });
  fs.writeFileSync(path.join(root, 'cam.json'), JSON.stringify(out));
}
await b.close(); server.close();
