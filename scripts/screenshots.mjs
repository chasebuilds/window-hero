// README images: a GIF of a simulated head moving in front of the window (driven through the
// setEye test hook, not a real camera), three still eye positions, a phone shot and a
// 1600 x 1000 preview card. Needs ffmpeg on PATH for the GIF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from './preview.mjs';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(w, h, query = '', extra = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...extra });
  await p.goto(base + query);
  await p.waitForFunction(() => window.__hero?.ready);
  await p.waitForTimeout(500);
  return p;
}
const eye = async (p, x, y, z = 4) => {
  await p.evaluate(([a, b, c]) => window.__hero.setEye(a, b, c), [x, y, z]);
  await p.waitForTimeout(150);
};

const card = await open(1600, 1000, '?fixed');
await eye(card, 0.7, 0.2, 3.8);
await card.screenshot({ path: path.join(docs, 'preview.png') });
await card.close();

const v = await open(640, 400, '?still=1');
await v.addStyleTag({ content: '.wh-copy, .wh-top { display: none !important; }' });
for (const [name, x] of [['eye-left', -1.5], ['eye-center', 0], ['eye-right', 1.5]]) {
  await eye(v, x, 0.25);
  await v.screenshot({ path: path.join(docs, `${name}.png`) });
}
await v.close();

const phone = await open(375, 812, '?fixed', { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await phone.screenshot({ path: path.join(docs, 'phone.png') });
await phone.close();

// GIF: the eye traces a slow figure eight and leans in and out, dust drifting.
const g = await open(1120, 700, '?fixed');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'window-hero-'));
const N = 60;
for (let i = 0; i < N; i++) {
  const t = (i / N) * Math.PI * 2;
  await eye(g, 1.5 * Math.sin(t), 0.55 * Math.sin(2 * t), 4 - 0.8 * Math.cos(t));
  await g.screenshot({ path: path.join(tmp, `f${String(i).padStart(3, '0')}.png`) });
}
await g.close();
await browser.close();
server.close();

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', path.join(tmp, 'f%03d.png'),
  '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', path.join(docs, 'window.gif')]);
fs.rmSync(tmp, { recursive: true });
console.log('wrote docs/preview.png, eye-*.png, phone.png, window.gif');
