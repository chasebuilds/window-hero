// Measurements for the README. Writes docs/MEASURED.md.
//   Frame rate, two setups, 1280 x 720 at device pixel ratio 1, dust motion on, eye sweeping:
//     gpu:      headed Chromium on this machine's GPU with vsync and the frame cap off (throughput)
//     software: headless Chromium on SwiftShader (CPU only, no GPU), the slowest case a browser can hit
//   Download size: our modules raw and gzipped, three.js and MediaPipe as served by the CDN.
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { serve } from './preview.mjs';
import { TASKS_VISION, DEFAULT_MODEL } from '../src/tracker.js';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const gpu = { headless: false, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist'] };
const soft = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const setups = [
  { name: 'GPU, uncapped, full resolution', launch: gpu, query: '?fixed' },
  { name: 'Software only (SwiftShader), full resolution', launch: soft, query: '?fixed' },
  { name: 'Software only (SwiftShader), adaptive resolution', launch: soft, query: '', warm: 6000 },
];
const rows = [];
let scene = null;
for (const s of setups) {
  const browser = await chromium.launch(s.launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(base + s.query);
  await page.waitForFunction(() => window.__hero?.ready);
  await page.waitForTimeout(s.warm || 1500);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const r = await page.evaluate(() => new Promise((done) => {
    const times = [];
    const start = performance.now();
    const step = (now) => {
      times.push(now);
      const t = (now - start) / 1000;
      window.__hero.setEye(1.5 * Math.sin(t), 0.5 * Math.sin(2 * t), 4 - 0.6 * Math.cos(t));
      window.__hero.state.mode = 'manual';
      if (now - start < 8000) requestAnimationFrame(step);
      else {
        const gaps = times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b);
        done({ fps: (times.length - 1) / ((times.at(-1) - times[0]) / 1000), p95: gaps[Math.floor(gaps.length * 0.95)], ...window.__hero.stats });
      }
    };
    requestAnimationFrame(step);
  }));
  rows.push({ setup: s.name, renderer: renderer.replace(/\|/g, '/'), ...r });
  scene ??= r;
  console.log(s.name, r.fps.toFixed(0), 'fps', r.p95.toFixed(2), 'ms p95');
  await browser.close();
}
server.close();

const ours = ['src/window-hero.js', 'src/room.js', 'src/math.js', 'src/tracker.js'].map((f) => {
  const buf = fs.readFileSync(new URL(`../${f}`, import.meta.url));
  return { f, raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length };
});
async function remote(url) {
  const res = await fetch(url, { headers: { 'accept-encoding': 'br, gzip' } });
  const wire = Number(res.headers.get('content-length')) || (await res.arrayBuffer()).byteLength;
  return { url, wire, encoding: res.headers.get('content-encoding') || 'none' };
}
const three = await remote('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js');
const mp = await Promise.all([`${TASKS_VISION}/vision_bundle.mjs`, `${TASKS_VISION}/wasm/vision_wasm_internal.js`, `${TASKS_VISION}/wasm/vision_wasm_internal.wasm`, DEFAULT_MODEL].map(remote));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
const loadOurs = ours.filter((o) => o.f !== 'src/tracker.js').reduce((a, o) => a + o.gz, 0);

const lines = [
  '# Measured',
  '',
  `Run with \`npm run measure\` on ${new Date().toISOString().slice(0, 10)}. CPU: ${os.cpus()[0].model.trim()}.`,
  '',
  '## Frame rate',
  '',
  'Window 1280 x 720, device pixel ratio 1, dust motion on, the eye sweeping a figure eight through the test hook, 8 seconds.',
  '',
  '| Setup | Renderer | Frames per second | 95th percentile frame time |',
  '|---|---|---:|---:|',
  ...rows.map((r) => `| ${r.setup} | ${r.renderer} | ${r.fps.toFixed(0)} | ${r.p95.toFixed(1)} ms |`),
  '',
  `Adaptive resolution: when the frame rate stays under 40, the hero renders at a lower pixel ratio, in steps down to half. In the adaptive row it settled at ${(rows.at(-1).renderScale * 100).toFixed(0)}% of full resolution after a 6 second warm-up. Turn it off with \`adaptive: false\`.`,
  '',
  `Scene per frame: ${scene.calls} draw calls, ${scene.triangles.toLocaleString('en-US')} triangles. Shadows are drawn once per resize, not every frame.`,
  '',
  'Face tracking cost is not in these numbers: it needs a real camera (see the README).',
  '',
  '## Download size',
  '',
  '| File | Raw | Gzipped |',
  '|---|---:|---:|',
  ...ours.map((o) => `| ${o.f} | ${kb(o.raw)} | ${kb(o.gz)} |`),
  '',
  `On page load: our three modules (${kb(loadOurs)} gzipped) plus three.js r170 minified from jsDelivr (${kb(three.wire)} over the wire, ${three.encoding}).`,
  '',
  'Only after the visitor turns on window mode and allows the camera:',
  '',
  '| File | Over the wire |',
  '|---|---:|',
  ...mp.map((m) => `| ${m.url.replace(/^https:\/\/[^/]+\//, '')} | ${mb(m.wire)} (${m.encoding}) |`),
  '',
];
fs.writeFileSync(new URL('../docs/MEASURED.md', import.meta.url), lines.join('\n'));
console.log('wrote docs/MEASURED.md');
