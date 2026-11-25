// Headless smoke test in Chromium (SwiftShader WebGL, so it runs on CI machines without a GPU).
// No real webcam: getUserMedia is stubbed to count calls, and one run uses Chromium's fake
// camera (a test pattern, no face) to exercise loading MediaPipe and turning the camera off.
// Set SKIP_FAKE_CAMERA=1 to skip that run (it downloads about 13 MB of MediaPipe files).
import fs from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/preview.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpuArgs });

const failures = [];
const t0 = Date.now();
const check = (ok, label) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
};

// Counts getUserMedia calls and rejects them like a visitor pressing Block.
const stubCamera = () => {
  window.__gum = 0;
  const md = navigator.mediaDevices || {};
  md.getUserMedia = () => {
    window.__gum++;
    return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  };
};

async function open(pathAndQuery = '', options = {}, b = browser, stub = true) {
  const context = await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  if (stub) await page.addInitScript(stubCamera);
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(base + pathAndQuery);
  await page.waitForFunction(() => (window.__hero || window.WindowHero?.instances?.[0])?.ready, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { page, errors, requests, context };
}

// Canvas pixels with the text and controls hidden. The image stays in the page (moving
// millions of numbers back to Node is slow); Node gets a handle and asks for stats.
let shotId = 0;
async function pixels(page) {
  await page.addStyleTag({ content: '.wh-copy, .wh-top { visibility: hidden !important; }' });
  await page.waitForTimeout(200);
  const png = (await page.locator('.wh-canvas').screenshot()).toString('base64');
  await page.addStyleTag({ content: '.wh-copy, .wh-top { visibility: visible !important; }' });
  const id = ++shotId;
  await page.evaluate(async ([b64, key]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    (window.__shots ||= {})[key] = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  }, [png, id]);
  return { page, id };
}
const colors = (img) => img.page.evaluate((key) => {
  const d = window.__shots[key];
  const set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return set.size;
}, img.id);
const diff = (a, b) => a.page.evaluate(([ka, kb]) => {
  const x = window.__shots[ka];
  const y = window.__shots[kb];
  let n = 0;
  for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 6) n++;
  return n / (x.length / 4);
}, [a.id, b.id]);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mediapipe = (urls) => urls.filter((u) => /tasks-vision|face_landmarker|tracker\.js/.test(u));

try {
  for (const f of ['src/window-hero.js', 'src/room.js', 'src/tracker.js']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    check(!/@latest|three@\d+\.\d+\/|three@\d+\//.test(src) && (!/three@/.test(src) || /three@0\.170\.0\/build/.test(src)), `${f}: CDN imports are exact pinned versions`);
  }
  const trackerSrc = fs.readFileSync(new URL('../src/tracker.js', import.meta.url), 'utf8');
  check(/tasks-vision@\d+\.\d+\.\d+'/.test(trackerSrc), 'MediaPipe tasks-vision is pinned to an exact version');

  // 1. Loads cleanly, real text, non-blank canvas, camera untouched, MediaPipe not loaded.
  {
    const { page, errors, requests, context } = await open();
    const img = await pixels(page);
    check(await colors(img) > 500, `canvas renders a scene (${await colors(img)} distinct colors)`);
    check(await page.locator('h1.wh-title').innerText() === 'Step up to the glass.', 'title is real text in an h1');
    check(await page.locator('a.wh-cta').getAttribute('href') === '#how', 'CTA is a real link');
    await page.mouse.move(100, 100);
    await page.mouse.move(800, 500, { steps: 5 });
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__gum) === 0, 'getUserMedia is not called on load or on mouse moves');
    check(mediapipe(requests).length === 0, 'MediaPipe and the tracker module are not downloaded on load');
    check(errors.length === 0, `no console errors on load${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }

  // 2. Driving the eye through the test hook changes the projection.
  {
    const { page, context } = await open('?still=1');
    await page.evaluate(() => window.__hero.setEye(0, 0, 4));
    const center = await pixels(page);
    await page.evaluate(() => window.__hero.setEye(-1.4, 0.6, 3));
    const moved = await pixels(page);
    check(await diff(center, moved) > 0.2, `moving the eye changes the view (${pct(await diff(center, moved))} of pixels)`);
    await page.evaluate(() => window.__hero.setEye(0, 0, 4));
    const back = await pixels(page);
    check(await diff(center, back) < 0.001, `returning the eye restores the same frame (${pct(await diff(center, back))} differ)`);

    // Face samples through the real calibration, mapping and One Euro path.
    const eye = await page.evaluate(async () => {
      const h = window.__hero;
      h.setNeutral({ mx: 0.5, my: 0.5, ipd: 0.1 });
      let t = 100;
      for (let i = 0; i < 30; i++) h.feedFace({ mx: 0.42, my: 0.47, ipd: 0.11 }, (t += 1 / 30));
      await new Promise((r) => setTimeout(r, 200));
      return { ...h.state.eye };
    });
    check(eye.x > 0.2 && eye.y > 0.05 && eye.z < 4, `simulated head right, up and closer moves the eye (${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)})`);
    const faceImg = await pixels(page);
    check(await diff(center, faceImg) > 0.1, `simulated face changes the view (${pct(await diff(center, faceImg))} of pixels)`);
    await context.close();
  }

  // 3. Mouse fallback moves the view.
  {
    const { page, context } = await open();
    check(await page.evaluate(() => window.__hero.state.mode) === 'pointer', 'desktop starts in mouse mode');
    await page.mouse.move(20, 300);
    await page.waitForTimeout(900);
    const left = await pixels(page);
    const xl = await page.evaluate(() => window.__hero.state.eye.x);
    await page.mouse.move(940, 300, { steps: 4 });
    await page.waitForTimeout(900);
    const right = await pixels(page);
    const xr = await page.evaluate(() => window.__hero.state.eye.x);
    check(xl < -1 && xr > 1, `mouse moves the eye (x ${xl.toFixed(2)} to ${xr.toFixed(2)})`);
    check(await diff(left, right) > 0.2, `mouse fallback changes the view (${pct(await diff(left, right))} of pixels)`);
    await context.close();
  }

  // 4. Reduced motion: nothing moves, even with the mouse, until the visitor opts in.
  {
    const { page, context } = await open('', { reducedMotion: 'reduce' });
    const a = await pixels(page);
    await page.mouse.move(20, 300);
    await page.mouse.move(900, 100, { steps: 4 });
    await page.waitForTimeout(900);
    const b = await pixels(page);
    const s = await page.evaluate(() => ({ ...window.__hero.state }));
    check(s.mode === 'still' && !s.motion && await diff(a, b) === 0, `reduced motion: still frame (${pct(await diff(a, b))} changed, mode ${s.mode})`);
    check(await page.locator('[data-act="motion"]').isVisible(), 'reduced motion: Turn on motion button is offered');
    await page.locator('[data-act="motion"]').click();
    await page.mouse.move(20, 300, { steps: 4 });
    await page.waitForTimeout(900);
    check(await page.evaluate(() => window.__hero.state.eye.x) < -1, 'opting in turns mouse parallax on');
    await context.close();
  }

  // 5. Keyboard: buttons are reachable, the explainer comes first, denial falls back cleanly.
  {
    const { page, errors, context } = await open();
    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.dataset?.act === 'enable');
    }
    check(reached, 'Enable window mode is reachable with Tab');
    await page.keyboard.press('Enter');
    check(await page.locator('.wh-dialog').isVisible(), 'explainer shows before any camera request');
    const text = await page.locator('.wh-dialog').innerText();
    check(/Nothing is recorded or sent/.test(text), 'explainer says nothing is recorded or sent');
    check(await page.evaluate(() => window.__gum) === 0, 'explainer alone does not request the camera');
    await page.keyboard.press('Escape');
    check(!(await page.locator('.wh-dialog').isVisible()) && await page.evaluate(() => document.activeElement?.dataset?.act === 'enable'), 'Escape closes the explainer and returns focus');
    await page.locator('[data-act="enable"]').click();
    await page.locator('[data-act="yes"]').click();
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__gum) === 1, 'Use my camera calls getUserMedia once');
    check(/declined/.test(await page.locator('.wh-status').innerText()), 'denied permission shows a plain message');
    check(await page.locator('[data-act="enable"]').isVisible() && await page.evaluate(() => window.__hero.state.mode) === 'pointer', 'after denial: back to mouse mode, Enable offered again');
    check(errors.length === 0, `denial causes no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }

  // 6. Phone width: no sideways scroll, controls on screen.
  {
    const { page, errors, context } = await open('', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });
    const m = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.wh-btn:not([hidden]), .wh-cta, .wh-title')].map((n) => n.getBoundingClientRect());
      return { sw: document.documentElement.scrollWidth, w: innerWidth, inside: r.every((b) => b.left >= 0 && b.right <= innerWidth), mode: window.__hero.state.mode };
    });
    check(m.sw <= m.w && m.inside, `375 px: no horizontal overflow (scrollWidth ${m.sw}), controls and text on screen`);
    // Browsers that ask for motion permission (iOS Safari, recent Chromium) get a Tilt button;
    // the others start in tilt mode on their own.
    const asks = await page.evaluate(() => typeof DeviceOrientationEvent?.requestPermission === 'function');
    if (asks) {
      check(m.mode === 'still' && await page.locator('[data-act="tilt"]').isVisible(), 'phone: Tilt to look button is offered before asking for motion access');
      await page.locator('[data-act="tilt"]').tap();
      await page.waitForTimeout(300);
    }
    const tilt = await page.evaluate(async () => {
      const fire = (beta, gamma) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma }));
      fire(40, 0);
      fire(40, -20);
      // The eye eases toward the tilt target a little each frame, so how far it gets in a fixed
      // time depends on the frame rate. Wait for it to arrive (or 10 s) instead of a fixed 800 ms.
      const t0 = performance.now();
      while (window.__hero.state.eye.x <= 0.5 && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
      return { mode: window.__hero.state.mode, x: window.__hero.state.eye.x, target: window.__hero.state.target?.x ?? NaN };
    });
    check(tilt.mode === 'tilt' && Math.abs(tilt.target - 1.04) < 0.01 && tilt.x > 0.5, `phone: tilting moves the view (mode ${tilt.mode}, target x ${tilt.target.toFixed(2)}, eye x ${tilt.x.toFixed(2)})`);
    check(errors.length === 0, 'phone: no console errors');
    await context.close();
  }

  // 7. Drop-in script on a bare page.
  {
    const { page, errors, requests, context } = await open('examples/embed.html');
    const img = await pixels(page);
    check(await page.locator('h1').innerText() === 'Fresh bread, every morning.', 'embed: data-title becomes the h1');
    check(await page.locator('a.wh-cta').getAttribute('href') === '#order' && await page.locator('a.wh-cta').innerText() === 'Order ahead', 'embed: data-cta-text and data-cta-href become the link');
    check(await colors(img) > 500 && await page.evaluate(() => window.WindowHero.instances.length) === 1, 'embed: one instance mounted and the canvas renders');
    check(mediapipe(requests).length === 0 && errors.length === 0, 'embed: no MediaPipe download and no errors');
    await context.close();
  }

  // 8. Chromium's fake camera: MediaPipe loads only now, no face is handled, Turn off stops the tracks.
  if (!process.env.SKIP_FAKE_CAMERA) {
    const camBrowser = await chromium.launch({ args: [...gpuArgs, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const { page, errors, requests, context } = await open('?still=1', { permissions: ['camera'] }, camBrowser, false);
    check(mediapipe(requests).length === 0, 'fake camera: nothing from MediaPipe before the click');
    await page.locator('[data-act="enable"]').click();
    await page.locator('[data-act="yes"]').click();
    const outcome = await page.waitForFunction(() => {
      const t = document.querySelector('.wh-status').textContent;
      return /Could not see your face|could not load|Window mode is on/.test(t) && t;
    }, null, { timeout: 120000 }).then((h) => h.jsonValue()).catch(() => 'timeout');
    check(/Could not see your face/.test(outcome), `fake camera: tracker loaded, countdown ran, no face handled ("${outcome}")`);
    check(mediapipe(requests).some((u) => u.includes('face_landmarker')), 'fake camera: MediaPipe model fetched only after consent');
    check(await page.evaluate(() => window.__hero.cameraLive), 'fake camera: tracks are live while on');
    await page.locator('[data-act="off"]').click();
    check(!(await page.evaluate(() => window.__hero.cameraLive)) && await page.evaluate(() => window.__hero.state.camera) === 'off', 'Turn off camera stops every track');
    // MediaPipe's WebAssembly prints its own INFO lines through console.error; those are not failures.
    const real = errors.filter((e) => !/^(INFO|I\d{4}|W\d{4}):?\s|XNNPACK|Graph successfully started/.test(e));
    check(real.length === 0, `fake camera: no console errors${real.length ? `: ${real.join(' | ')}` : ''}`);
    await context.close();
    await camBrowser.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall smoke checks passed');
