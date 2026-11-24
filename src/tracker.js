// Face tracking, loaded only after the visitor turns on window mode.
// Everything runs in this tab: the video element is never attached to the page, frames go
// straight into MediaPipe's WebAssembly model, and only the eye position comes back out.
import { faceSample } from './math.js';

export const TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
export const DEFAULT_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function createLandmarker(vision, modelUrl, delegate) {
  const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

// stream: a MediaStream from getUserMedia. onSample({mx, my, ipd}, seconds) or onSample(null).
export async function startTracker(stream, { onSample, modelUrl = DEFAULT_MODEL }) {
  const vision = await import(`${TASKS_VISION}/vision_bundle.mjs`);
  let landmarker;
  try {
    landmarker = await createLandmarker(vision, modelUrl, 'GPU');
  } catch {
    landmarker = await createLandmarker(vision, modelUrl, 'CPU');
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  let running = true;
  let lastTime = -1;
  const step = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const face = result.faceLandmarks?.[0];
      onSample(face ? faceSample(face, video.videoWidth || 640, video.videoHeight || 480) : null, now / 1000);
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };
  step();

  return {
    stop() {
      running = false;
      video.pause();
      video.srcObject = null;
      landmarker.close();
    },
  };
}
