// Window Hero: a landing-page hero where the screen acts like a window into a 3D room.
//
// Use it two ways:
//   <div id="hero"></div>
//   <script type="module" src=".../window-hero.js" data-title="..." data-text="..." data-cta-text="..." data-cta-href="..."></script>
// or
//   import { mount } from '.../window-hero.js';
//   mount(document.querySelector('#hero'), { title, text, cta: { label, href } });
//
// The camera is off until the visitor asks for window mode. Face tracking runs on the device
// (MediaPipe in WebAssembly) and is downloaded only at that moment.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
import { BASE_Z, offAxisFrustum, faceToEye, averageSamples, OneEuro, clamp } from './math.js';
import { buildRoom } from './room.js';

const NEAR = 0.05;
const FAR = 120;

const DEFAULTS = {
  eyebrow: '',
  title: 'Step up to the glass.',
  text: 'Move your mouse, tilt your phone, or turn on window mode and move your head. The room behind the headline shifts like a real one.',
  cta: { label: 'See how it works', href: '#' },
  scene: 'room',
  sensitivity: 1,
  height: '100svh',
  headingLevel: 1,
  motion: 'auto', // 'auto' follows prefers-reduced-motion, true or false forces it
  adaptive: true, // lower the resolution on slow devices
  modelUrl: undefined,
};

const CSS = `
.wh-root{position:relative;overflow:hidden;width:100%;min-height:320px;background:#2a2018;color:#fff;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;isolation:isolate}
.wh-root *{box-sizing:border-box}
.wh-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.wh-glass{background:rgba(24,17,12,.68);-webkit-backdrop-filter:blur(14px) saturate(1.15);backdrop-filter:blur(14px) saturate(1.15);border:1px solid rgba(255,240,220,.2);box-shadow:0 10px 40px rgba(0,0,0,.28)}
.wh-copy{position:absolute;left:clamp(16px,5vw,64px);bottom:clamp(16px,6vh,72px);max-width:min(34rem,calc(100% - 32px));padding:clamp(18px,3vw,32px);border-radius:24px}
.wh-eyebrow{margin:0 0 .4rem;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:#ffd9a3}
.wh-title{margin:0 0 .6rem;font:600 clamp(2rem,6.5vw,4.4rem)/1.02 "Iowan Old Style","Palatino Linotype",Georgia,serif;letter-spacing:-.01em;text-wrap:balance}
.wh-text{margin:0 0 1.2rem;font-size:clamp(1rem,1.6vw,1.15rem);color:#f6ece0;max-width:30rem}
.wh-cta{display:inline-block;padding:.8rem 1.4rem;border-radius:999px;background:#ffd28a;color:#241a10;font-weight:650;text-decoration:none}
.wh-cta:hover{background:#ffe2b0}
.wh-top{position:absolute;top:16px;left:16px;right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
.wh-top>*{pointer-events:auto}
.wh-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;max-width:100%;padding:8px;border-radius:999px}
.wh-btn{font:inherit;font-size:.9rem;font-weight:600;padding:.5rem .95rem;border-radius:999px;border:1px solid rgba(255,240,220,.35);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;min-height:40px}
.wh-btn:hover{background:rgba(255,255,255,.2)}
.wh-btn.primary{background:#ffd28a;color:#241a10;border-color:#ffd28a}
.wh-root :focus-visible{outline:3px solid #ffd28a;outline-offset:2px}
.wh-sens{display:flex;align-items:center;gap:6px;font-size:.85rem;padding:0 .5rem;color:#f6ece0}
.wh-sens input{width:90px;accent-color:#ffd28a}
.wh-status{margin:0;max-width:26rem;padding:.55rem .9rem;border-radius:14px;font-size:.88rem}
.wh-status:empty{display:none}
.wh-dialog{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(26rem,calc(100% - 32px));padding:22px;border-radius:22px;z-index:3}
.wh-dialog h2{margin:0 0 .5rem;font-size:1.15rem}
.wh-dialog p{margin:0 0 1rem;color:#f6ece0}
.wh-dialog .wh-row{display:flex;gap:8px;flex-wrap:wrap}
.wh-count{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:2}
.wh-count div{padding:18px 26px;border-radius:24px;text-align:center}
.wh-count strong{display:block;font-size:3.4rem;line-height:1}
.wh-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff6b5a;margin-right:6px;vertical-align:middle}
[hidden]{display:none!important}
@media (max-width:640px){.wh-top{align-items:stretch}.wh-bar{justify-content:flex-start;border-radius:20px}.wh-copy{left:16px;right:16px;bottom:16px;max-width:none}}
`;

function injectCss() {
  if (document.getElementById('wh-style')) return;
  const s = document.createElement('style');
  s.id = 'wh-style';
  s.textContent = CSS;
  document.head.append(s);
}

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

export function mount(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('WindowHero: mount target not found');
  const opts = { ...DEFAULTS, ...options, cta: { ...DEFAULTS.cta, ...options.cta } };
  injectCss();

  // DOM: real text for the headline and link, canvas behind it, hidden from screen readers.
  const root = el('section', { class: 'wh-root', 'aria-label': opts.title });
  root.style.height = opts.height;
  const canvas = el('canvas', { class: 'wh-canvas', 'aria-hidden': 'true' });
  const copy = el('div', { class: 'wh-copy wh-glass' });
  if (opts.eyebrow) copy.append(el('p', { class: 'wh-eyebrow' }, opts.eyebrow));
  copy.append(el(`h${clamp(opts.headingLevel | 0, 1, 6)}`, { class: 'wh-title' }, opts.title));
  if (opts.text) copy.append(el('p', { class: 'wh-text' }, opts.text));
  if (opts.cta?.label) copy.append(el('a', { class: 'wh-cta', href: opts.cta.href || '#' }, opts.cta.label));

  const bar = el('div', { class: 'wh-bar wh-glass', role: 'group', 'aria-label': 'Window view controls' });
  const btn = (label, act, cls = 'wh-btn') => el('button', { type: 'button', class: cls, 'data-act': act }, label);
  const bEnable = btn('Enable window mode', 'enable', 'wh-btn primary');
  const bRecal = btn('Recalibrate', 'recal');
  const bOff = btn('Turn off camera', 'off');
  const bTilt = btn('Tilt to look', 'tilt');
  const bMotion = btn('Turn on motion', 'motion');
  const sens = el('label', { class: 'wh-sens' });
  const sensInput = el('input', { type: 'range', min: '0.3', max: '2', step: '0.1', value: String(opts.sensitivity), 'aria-label': 'Sensitivity' });
  sens.append('Sensitivity', sensInput);
  bar.append(bEnable, bRecal, bOff, bTilt, bMotion, sens);
  const status = el('p', { class: 'wh-status wh-glass', role: 'status', 'aria-live': 'polite' });

  const dialog = el('div', { class: 'wh-dialog wh-glass', role: 'dialog', 'aria-labelledby': 'wh-dlg-title', hidden: '' });
  dialog.append(
    el('h2', { id: 'wh-dlg-title' }, 'Use your camera for window mode?'),
    el('p', {}, 'Window mode uses your camera on this device to track where your head is, so the view moves like a real window. Nothing is recorded or sent. The video stays in this page and you can turn it off at any time.'),
  );
  const dRow = el('div', { class: 'wh-row' });
  const dYes = btn('Use my camera', 'yes', 'wh-btn primary');
  const dNo = btn('Not now', 'no');
  dRow.append(dYes, dNo);
  dialog.append(dRow);

  const count = el('div', { class: 'wh-count', 'aria-live': 'assertive', hidden: '' });
  const countBox = el('div', { class: 'wh-glass' });
  count.append(countBox);
  const top = el('div', { class: 'wh-top' });
  top.append(bar, status);
  root.append(canvas, copy, top, dialog, count);
  host.replaceChildren(root);

  // Three.js
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Resolution drops in steps (down to half) if the frame rate stays under 40 on a slow device.
  const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
  let renderScale = 1;
  renderer.setPixelRatio(maxRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the shadow casters do not move, so draw shadows once per layout
  const scene = typeof opts.scene === 'function' ? opts.scene(THREE) : buildRoom();
  const camera = new THREE.PerspectiveCamera();
  camera.matrixAutoUpdate = true;

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const needsTiltPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

  const state = {
    mode: 'pointer', // pointer | tilt | face | manual | still
    motion: opts.motion === 'auto' ? !reducedQuery.matches : !!opts.motion,
    reduced: reducedQuery.matches,
    eye: { x: 0, y: 0, z: BASE_Z },
    target: { x: 0, y: 0, z: BASE_Z },
    aspect: 1,
    camera: 'off', // off | asking | starting | calibrating | on
    calibrated: false,
    renders: 0,
  };
  let stream = null;
  let tracker = null;
  let startToken = 0;
  let neutral = null;
  let calibSamples = null;
  let lastFaceAt = 0;
  let tiltNeutral = null;
  let tiltOn = false;
  const filters = { x: new OneEuro(), y: new OneEuro(), z: new OneEuro({ minCutoff: 0.6, beta: 0.2 }) };

  const say = (msg) => { status.textContent = msg; };

  function defaultMode() {
    if (!state.motion) return 'still';
    if (coarse && tiltOn) return 'tilt';
    return coarse ? 'still' : 'pointer';
  }
  function syncUi() {
    const cam = state.camera !== 'off';
    bEnable.hidden = cam;
    bOff.hidden = !cam;
    bRecal.hidden = state.camera !== 'on';
    bTilt.hidden = !(coarse && state.motion && !tiltOn && !cam);
    bMotion.hidden = !(state.reduced || opts.motion === false) || cam;
    bMotion.textContent = state.motion ? 'Stop motion' : 'Turn on motion';
    if (state.camera === 'on') {
      bOff.replaceChildren(el('span', { class: 'wh-dot', 'aria-hidden': 'true' }), 'Turn off camera');
    }
  }

  // Rendering
  const clock = { last: performance.now(), frames: 0, fps: 0, windowStart: performance.now() };
  let raf = 0;
  let visible = true;

  function resize() {
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    state.aspect = w / h;
    scene.layout?.(state.aspect);
    renderer.shadowMap.needsUpdate = true;
    request();
  }

  function draw(now) {
    const { eye } = state;
    const f = offAxisFrustum(eye, state.aspect, 1, NEAR);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.updateMatrixWorld();
    camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    if (state.motion) scene.update?.(now / 1000);
    renderer.render(scene.scene, camera);
    state.renders++;
  }

  function animating() {
    return visible && !document.hidden && (state.motion || state.mode === 'face' || state.camera !== 'off');
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - clock.last) / 1000, 0.1);
    clock.last = now;
    clock.frames++;
    if (now - clock.windowStart > 1000) {
      clock.fps = (clock.frames * 1000) / (now - clock.windowStart);
      if (clock.fps < 40 && renderScale > 0.5 && clock.frames > 5 && now - clock.windowStart < 1500 && opts.adaptive !== false) {
        renderScale = Math.max(0.5, renderScale - 0.15);
        renderer.setPixelRatio(maxRatio * renderScale);
        renderer.setSize(root.clientWidth || 1, root.clientHeight || 1, false);
      }
      clock.frames = 0;
      clock.windowStart = now;
    }
    if (state.mode === 'pointer' || state.mode === 'tilt' || state.mode === 'still') {
      const goal = state.mode === 'still' ? { x: 0, y: 0, z: BASE_Z } : state.target;
      const k = 1 - Math.exp(-dt * (state.mode === 'tilt' ? 10 : 6));
      for (const a of ['x', 'y', 'z']) state.eye[a] += (goal[a] - state.eye[a]) * k;
    }
    draw(now);
    if (animating() || settling()) request();
  }
  function settling() {
    if (state.mode === 'face' || state.mode === 'manual') return false;
    const goal = state.mode === 'still' ? { x: 0, y: 0, z: BASE_Z } : state.target;
    return Math.abs(goal.x - state.eye.x) + Math.abs(goal.y - state.eye.y) + Math.abs(goal.z - state.eye.z) > 1e-3;
  }
  function request() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // Pointer fallback (desktop): the eye follows the mouse across the hero.
  function onPointer(e) {
    if (e.pointerType !== 'mouse' || state.mode !== 'pointer') return;
    const r = root.getBoundingClientRect();
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1) - 0.5;
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1) - 0.5;
    const range = 1.6 * opts.sensitivity;
    state.target = { x: nx * 2 * range, y: -ny * 2 * range * 0.6, z: BASE_Z };
    request();
  }
  window.addEventListener('pointermove', onPointer, { passive: true });

  // Tilt fallback (phones): turning the phone is like moving your head the other way.
  function onTilt(e) {
    if (state.mode !== 'tilt' || e.beta == null) return;
    if (!tiltNeutral) tiltNeutral = { beta: e.beta, gamma: e.gamma };
    const range = 1.3 * opts.sensitivity;
    state.target = {
      x: clamp(-(e.gamma - tiltNeutral.gamma) / 25, -1, 1) * range,
      y: clamp((e.beta - tiltNeutral.beta) / 25, -1, 1) * range * 0.8,
      z: BASE_Z,
    };
    request();
  }
  async function enableTilt() {
    try {
      if (needsTiltPermission && (await DeviceOrientationEvent.requestPermission()) !== 'granted') {
        say('Motion access was declined, so the view stays still.');
        return;
      }
    } catch {
      say('Motion access is not available here, so the view stays still.');
      return;
    }
    tiltOn = true;
    tiltNeutral = null;
    window.addEventListener('deviceorientation', onTilt);
    if (state.camera === 'off') state.mode = defaultMode();
    syncUi();
    request();
  }
  if (coarse && !needsTiltPermission && state.motion && 'DeviceOrientationEvent' in window) enableTilt();

  // Camera and face tracking
  function openDialog() {
    dialog.hidden = false;
    state.camera = 'asking';
    syncUi();
    dYes.focus();
  }
  function closeDialog() {
    dialog.hidden = true;
    if (state.camera === 'asking') state.camera = 'off';
    syncUi();
    bEnable.focus();
  }

  async function startCamera() {
    dialog.hidden = true;
    const token = ++startToken;
    if (!navigator.mediaDevices?.getUserMedia) {
      state.camera = 'off';
      say('This browser cannot use a camera here. The view follows your mouse or tilt instead.');
      syncUi();
      return;
    }
    state.camera = 'starting';
    syncUi();
    bOff.focus();
    say('Waiting for camera permission...');
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      if (token !== startToken) return;
      state.camera = 'off';
      syncUi();
      bEnable.focus();
      say(e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
        ? 'Camera permission was declined. No problem: the view follows your mouse or tilt instead.'
        : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError'
          ? 'No camera was found. The view follows your mouse or tilt instead.'
          : 'The camera could not start. The view follows your mouse or tilt instead.');
      return;
    }
    if (token !== startToken) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    say('Loading the face tracker. It runs on this device.');
    try {
      const { startTracker } = await import('./tracker.js');
      const t = await startTracker(s, { onSample: faceSampleIn, modelUrl: opts.modelUrl });
      if (token !== startToken) {
        t.stop();
        return;
      }
      tracker = t;
    } catch {
      if (token !== startToken) return;
      stopCamera();
      say('The face tracker could not load. The view follows your mouse or tilt instead.');
      return;
    }
    state.camera = 'on';
    state.mode = 'face';
    syncUi();
    calibrate();
  }

  function stopCamera() {
    startToken++;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    tracker?.stop();
    tracker = null;
    calibSamples = null;
    count.hidden = true;
    state.camera = 'off';
    state.calibrated = false;
    neutral = null;
    state.mode = defaultMode();
    state.target = { x: 0, y: 0, z: BASE_Z };
    syncUi();
    say('Camera is off.');
    request();
  }

  let countTimer = 0;
  function calibrate() {
    clearTimeout(countTimer);
    neutral = null;
    state.calibrated = false;
    count.hidden = false;
    let n = 3;
    const tick = () => {
      if (state.camera !== 'on') return;
      if (n > 0) {
        countBox.replaceChildren('Look straight at the screen', el('strong', {}, String(n)));
        n--;
        countTimer = setTimeout(tick, 1000);
      } else {
        countBox.replaceChildren('Hold still', el('strong', {}, '...'));
        calibSamples = [];
        countTimer = setTimeout(finishCalibration, 600);
      }
    };
    tick();
  }
  function finishCalibration() {
    count.hidden = true;
    const samples = calibSamples || [];
    calibSamples = null;
    if (!samples.length) {
      say('Could not see your face. Check the light, face the screen, then press Recalibrate.');
      return;
    }
    setNeutral(averageSamples(samples));
    say('Window mode is on. Move your head to look around the room.');
  }
  function setNeutral(sample) {
    neutral = sample;
    state.calibrated = true;
    Object.values(filters).forEach((f) => f.reset());
  }
  function faceSampleIn(sample, seconds) {
    if (!sample) {
      if (state.calibrated && seconds - lastFaceAt > 1.5) say('Cannot find your face right now. Holding the last view.');
      return;
    }
    if (state.calibrated && seconds - lastFaceAt > 1.5) say('Window mode is on. Move your head to look around the room.');
    lastFaceAt = seconds;
    calibSamples?.push(sample);
    if (!neutral) return;
    const e = faceToEye(sample, neutral, { sensitivity: opts.sensitivity });
    state.eye = { x: filters.x.filter(e.x, seconds), y: filters.y.filter(e.y, seconds), z: filters.z.filter(e.z, seconds) };
    request();
  }

  // Controls
  bEnable.addEventListener('click', openDialog);
  dNo.addEventListener('click', closeDialog);
  dYes.addEventListener('click', startCamera);
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialog(); });
  bOff.addEventListener('click', () => { stopCamera(); bEnable.focus(); });
  bRecal.addEventListener('click', calibrate);
  bTilt.addEventListener('click', enableTilt);
  bMotion.addEventListener('click', () => {
    state.motion = !state.motion;
    if (state.camera === 'off') state.mode = defaultMode();
    syncUi();
    request();
  });
  sensInput.addEventListener('input', () => { opts.sensitivity = Number(sensInput.value); });
  reducedQuery.addEventListener?.('change', (e) => {
    state.reduced = e.matches;
    if (opts.motion === 'auto') state.motion = !e.matches;
    if (state.camera === 'off') state.mode = defaultMode();
    syncUi();
    request();
  });

  const ro = new ResizeObserver(resize);
  ro.observe(root);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) request();
  });
  io.observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });

  state.mode = defaultMode();
  syncUi();
  resize();

  const api = {
    root,
    state,
    options: opts,
    get ready() { return state.renders > 0; },
    get cameraLive() { return !!stream?.getTracks().some((t) => t.readyState === 'live'); },
    get stats() {
      return { fps: clock.fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), renderScale };
    },
    // Test and demo hooks: drive the eye directly, or feed face samples through the real
    // calibration, mapping and smoothing path without a camera.
    setEye(x, y, z = BASE_Z) {
      state.mode = 'manual';
      state.eye = { x, y, z };
      request();
    },
    setNeutral,
    feedFace(sample, seconds = performance.now() / 1000) {
      state.mode = 'face';
      faceSampleIn(sample, seconds);
    },
    setSensitivity(v) {
      opts.sensitivity = v;
      sensInput.value = String(v);
    },
    stopCamera,
    destroy() {
      stopCamera();
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onTilt);
      renderer.dispose();
      root.remove();
    },
  };
  return api;
}

// Drop-in: a <script type="module" src=".../window-hero.js" data-...> tag mounts itself.
const instances = [];
for (const s of document.querySelectorAll('script[type="module"][src]')) {
  if (s.src.split('?')[0] !== import.meta.url.split('?')[0] || s.dataset.whMounted) continue;
  const d = s.dataset;
  if (!('title' in d || 'target' in d)) continue;
  s.dataset.whMounted = '1';
  const target = document.querySelector(d.target || '#hero');
  if (!target) continue;
  instances.push(mount(target, {
    eyebrow: d.eyebrow,
    title: d.title ?? DEFAULTS.title,
    text: d.text ?? DEFAULTS.text,
    cta: { label: d.ctaText ?? DEFAULTS.cta.label, href: d.ctaHref ?? DEFAULTS.cta.href },
    height: d.height || DEFAULTS.height,
    sensitivity: d.sensitivity ? Number(d.sensitivity) : 1,
    modelUrl: d.modelUrl,
  }));
}
window.WindowHero = { mount, instances };
