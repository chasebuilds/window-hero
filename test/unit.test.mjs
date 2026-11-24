import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_Z, offAxisFrustum, project, faceSample, faceToEye, averageSamples, OneEuro } from '../src/math.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('centered eye gives a symmetric frustum', () => {
  const f = offAxisFrustum({ x: 0, y: 0, z: BASE_Z }, 1.6, 1, 0.05);
  assert.ok(near(f.left, -f.right) && near(f.bottom, -f.top));
  assert.ok(near(f.right, (1.6 * 0.05) / BASE_Z));
});

test('frustum shifts opposite the eye', () => {
  const f = offAxisFrustum({ x: 0.5, y: -0.3, z: BASE_Z }, 1.6, 1, 0.05);
  assert.ok(Math.abs(f.left) > Math.abs(f.right), 'eye right: more view to the left');
  assert.ok(f.top > Math.abs(f.bottom), 'eye low: more view upward');
});

test('points on the glass stay fixed on screen for any eye position', () => {
  const eyes = [{ x: 0, y: 0, z: 4 }, { x: 1.3, y: -0.7, z: 2.5 }, { x: -2, y: 1, z: 7 }];
  for (const eye of eyes) {
    for (const [px, py] of [[1.6, 1], [-1.6, -1], [0.4, -0.2]]) {
      const p = project({ x: px, y: py, z: 0 }, eye, 1.6, 1);
      assert.ok(near(p.x, px / 1.6, 1e-6) && near(p.y, py, 1e-6), `(${px}, ${py}) from eye ${JSON.stringify(eye)}`);
    }
  }
});

test('parallax grows with depth and follows the eye', () => {
  const shift = (z) => project({ x: 0, y: 0, z }, { x: 1, y: 0, z: 4 }, 1.6, 1).x;
  const nearShift = shift(-0.5);
  const farShift = shift(-9);
  assert.ok(nearShift > 0 && farShift > nearShift, `near ${nearShift.toFixed(3)}, far ${farShift.toFixed(3)}`);
});

test('face sample uses iris centers when present, eye corners otherwise', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  lm[468] = { x: 0.45, y: 0.5 };
  lm[473] = { x: 0.55, y: 0.5 };
  lm[33] = { x: 0.4, y: 0.5 };
  lm[263] = { x: 0.6, y: 0.5 };
  const s = faceSample(lm, 640, 480);
  assert.ok(near(s.mx, 0.5) && near(s.ipd, 0.1, 1e-9));
  const corners = faceSample(lm.slice(0, 468), 640, 480);
  assert.ok(near(corners.ipd, 0.2, 1e-9));
});

test('face mapping: neutral, sideways, lean in, sensitivity', () => {
  const n = { mx: 0.5, my: 0.5, ipd: 0.1 };
  assert.deepEqual(faceToEye(n, n), { x: -0, y: -0, z: BASE_Z });
  const right = faceToEye({ ...n, mx: 0.4 }, n);
  assert.ok(right.x > 0, 'moving to your right moves your face left in the camera image');
  const up = faceToEye({ ...n, my: 0.4 }, n);
  assert.ok(up.y > 0);
  const lean = faceToEye({ ...n, ipd: 0.125 }, n);
  assert.ok(near(lean.z, BASE_Z * 0.8), `lean in gives z ${lean.z}`);
  const double = faceToEye({ ...n, mx: 0.4 }, n, { sensitivity: 2 });
  assert.ok(near(double.x, right.x * 2, 1e-9));
  const extreme = faceToEye({ ...n, ipd: 0.01 }, n);
  assert.ok(extreme.z <= BASE_Z * 2.2, 'depth is clamped');
});

test('calibration average', () => {
  const a = averageSamples([{ mx: 0.4, my: 0.5, ipd: 0.1 }, { mx: 0.6, my: 0.7, ipd: 0.2 }]);
  assert.ok(near(a.mx, 0.5) && near(a.my, 0.6) && near(a.ipd, 0.15));
});

test('One Euro filter: steady input passes, jitter is damped, motion is followed', () => {
  const f = new OneEuro();
  for (let i = 0; i < 30; i++) assert.equal(f.filter(2, i / 30), 2);

  // Jitter of +-0.05 around a still head at 30 Hz.
  const g = new OneEuro();
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.1;
  const raw = [];
  const out = [];
  for (let i = 0; i < 300; i++) {
    const v = noise();
    raw.push(v);
    out.push(g.filter(v, i / 30));
  }
  const sd = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  assert.ok(sd(out.slice(30)) < sd(raw.slice(30)) * 0.5, `jitter ${sd(out.slice(30)).toFixed(4)} vs raw ${sd(raw.slice(30)).toFixed(4)}`);

  // A fast 1-unit move over 0.2 s is followed to within 10% a quarter second later.
  const h = new OneEuro();
  let last = 0;
  for (let i = 0; i <= 45; i++) {
    const t = i / 60;
    last = h.filter(Math.min(1, Math.max(0, (t - 0.25) / 0.2)), t);
  }
  assert.ok(last > 0.9, `after the move: ${last.toFixed(3)}`);
});
