# Measured

Run with `npm run measure` on 2026-11-24. CPU: AMD Ryzen 5 7600X 6-Core Processor.

## Frame rate

Window 1280 x 720, device pixel ratio 1, dust motion on, the eye sweeping a figure eight through the test hook, 8 seconds.

| Setup | Renderer | Frames per second | 95th percentile frame time |
|---|---|---:|---:|
| GPU, uncapped, full resolution | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1070 | 2.6 ms |
| Software only (SwiftShader), full resolution | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 8 | 166.6 ms |
| Software only (SwiftShader), adaptive resolution | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | 19 | 66.7 ms |

Adaptive resolution: when the frame rate stays under 40, the hero renders at a lower pixel ratio, in steps down to half. In the adaptive row it settled at 50% of full resolution after a 6 second warm-up. Turn it off with `adaptive: false`.

Scene per frame: 123 draw calls, 5,561 triangles. Shadows are drawn once per resize, not every frame.

Face tracking cost is not in these numbers: it needs a real camera (see the README).

## Download size

| File | Raw | Gzipped |
|---|---:|---:|
| src/window-hero.js | 22.0 KB | 7.3 KB |
| src/room.js | 23.0 KB | 7.1 KB |
| src/math.js | 4.2 KB | 1.8 KB |
| src/tracker.js | 2.2 KB | 1.0 KB |

On page load: our three modules (16.3 KB gzipped) plus three.js r170 minified from jsDelivr (135.9 KB over the wire, br).

Only after the visitor turns on window mode and allows the camera:

| File | Over the wire |
|---|---:|
| npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs | 0.03 MB (br) |
| npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_internal.js | 0.04 MB (br) |
| npm/@mediapipe/tasks-vision@0.10.21/wasm/vision_wasm_internal.wasm | 1.94 MB (br) |
| mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | 3.58 MB (none) |
