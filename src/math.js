// Pure math with no three.js import, so Node unit tests can load it.
//
// World units: the screen is the window. Its half-height is 1, its half-width is the aspect
// ratio, it sits in the z = 0 plane, and the room is behind it (negative z). The viewer's eye
// is in front of it at positive z.

export const BASE_Z = 4; // neutral eye distance: a 30 cm tall screen seen from 60 cm

// Asymmetric frustum for an eye at (x, y, z) looking straight at a screen of the given
// half-size. The near-plane rectangle is the screen rectangle scaled by near / z, shifted
// opposite the eye, so the screen edges stay fixed in the image and depth moves behind them.
export function offAxisFrustum(eye, halfW, halfH, near) {
  const s = near / eye.z;
  return {
    left: (-halfW - eye.x) * s,
    right: (halfW - eye.x) * s,
    bottom: (-halfH - eye.y) * s,
    top: (halfH - eye.y) * s,
  };
}

// Column-major 4x4 projection matrix (same layout as three.js Matrix4.elements).
export function frustumMatrix({ left, right, bottom, top }, near, far) {
  const x = (2 * near) / (right - left);
  const y = (2 * near) / (top - bottom);
  const a = (right + left) / (right - left);
  const b = (top + bottom) / (top - bottom);
  const c = -(far + near) / (far - near);
  const d = (-2 * far * near) / (far - near);
  return [x, 0, 0, 0, 0, y, 0, 0, a, b, c, -1, 0, 0, d, 0];
}

// Where a world point lands in normalized device coordinates for a given eye.
export function project(point, eye, halfW, halfH, near = 0.05, far = 100) {
  const m = frustumMatrix(offAxisFrustum(eye, halfW, halfH, near), near, far);
  const p = [point.x - eye.x, point.y - eye.y, point.z - eye.z, 1];
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r] += m[c * 4 + r] * p[c];
  return { x: out[0] / out[3], y: out[1] / out[3] };
}

// Face sample from landmarks: eye midpoint and inter-pupil distance, in image fractions.
// Uses the iris centers (468, 473) when present, else the outer eye corners (33, 263).
export function faceSample(landmarks, videoW = 640, videoH = 480) {
  const [i, j] = landmarks.length > 473 ? [468, 473] : [33, 263];
  const a = landmarks[i];
  const b = landmarks[j];
  return {
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
    ipd: Math.hypot((a.x - b.x) * videoW, (a.y - b.y) * videoH) / videoW,
  };
}

// Head position in world units from a face sample and the calibrated neutral sample.
// Depth: the pupils look further apart as you lean in, so z scales with neutral / current.
// Sideways: an image offset is an angle (about a 60 x 45 degree webcam), times the distance.
// The camera image is not mirrored, so moving to your right moves your face left in it.
export function faceToEye(sample, neutral, { sensitivity = 1, baseZ = BASE_Z, hScale = 1.15, vScale = 0.83 } = {}) {
  const ratio = neutral.ipd / sample.ipd;
  const z = clamp(baseZ * (1 + (ratio - 1) * sensitivity), baseZ * 0.45, baseZ * 2.2);
  return {
    x: clamp(-(sample.mx - neutral.mx) * hScale * z * sensitivity, -4, 4),
    y: clamp(-(sample.my - neutral.my) * vScale * z * sensitivity, -3, 3),
    z,
  };
}

export function averageSamples(samples) {
  const n = samples.length;
  return samples.reduce((acc, s) => ({ mx: acc.mx + s.mx / n, my: acc.my + s.my / n, ipd: acc.ipd + s.ipd / n }), { mx: 0, my: 0, ipd: 0 });
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One Euro filter (Casiez, Roussel, Vogel 2012): heavy smoothing when the head is still,
// little lag when it moves fast.
export class OneEuro {
  constructor({ minCutoff = 1.2, beta = 0.4, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, tSeconds) {
    if (this.x === null) {
      this.x = value;
      this.t = tSeconds;
      return value;
    }
    const dt = Math.max(tSeconds - this.t, 1e-3);
    this.t = tSeconds;
    const dx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
