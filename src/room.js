// "Reading room": an original procedural scene built to sell the window effect.
// Things sit at many depths: the window reveal and sill right at the glass, a hanging plant
// and a fern just inside, pendant lamps and dust in the sun shafts mid-room, a bookcase and
// armchair along the walls, and a garden through the far window.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const DEPTH = 9; // back wall distance behind the glass
const FLOOR = -1;
const CEIL = 1.25;

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function instanced(geometry, material, items) {
  const m = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach(([matrix, color], i) => {
    m.setMatrixAt(i, matrix);
    if (color) m.setColorAt(i, color);
  });
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, material, x, y, z, shadows = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function buildRoom() {
  const rand = rng(7);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9b79c');
  scene.fog = new THREE.Fog('#d9c4a2', 14, 46);

  // Light: warm sky fill, a low sun through the far window, two lamp bulbs.
  scene.add(new THREE.HemisphereLight('#ffe9c9', '#a88a6c', 1.15));
  const sun = new THREE.DirectionalLight('#ffd49a', 4.2);
  // Aimed through the far window at the floor, so the patch of sun and the shafts agree.
  sun.position.set(2.7, 4.4, -26.4);
  sun.target.position.set(-0.9, FLOOR, -3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 10, far: 32 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Surfaces
  const plaster = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#efe2cc';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '120,90,60' : '255,250,240'},${0.04 + rand() * 0.05})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
  });
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  const wallMat = mat('#ffffff', { map: plaster });
  const planks = canvasTexture(512, 512, (g, w, h) => {
    const tones = ['#8a5a36', '#7b4f2f', '#93633c', '#6f4529', '#855733'];
    const pw = w / 8;
    for (let i = 0; i < 8; i++) {
      let y = -rand() * 200;
      while (y < h) {
        const len = 160 + rand() * 220;
        g.fillStyle = tones[Math.floor(rand() * tones.length)];
        g.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 14; k++) {
          g.fillStyle = `rgba(40,20,10,${0.05 + rand() * 0.08})`;
          g.fillRect(i * pw + rand() * pw, y, 1, len);
        }
        g.fillStyle = 'rgba(30,15,5,0.55)';
        g.fillRect(i * pw, y, pw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(30,15,5,0.6)';
      g.fillRect(i * pw, 0, 2, h);
    }
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  const floorMat = mat('#ffffff', { map: planks, roughness: 0.6 });
  const wood = mat('#6e4326', { roughness: 0.55 });
  const darkWood = mat('#3f2617', { roughness: 0.6 });
  const trim = mat('#f6eddc', { roughness: 0.7 });

  const room = new THREE.Group();
  scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat('#f4ead8'));
  ceil.rotation.x = Math.PI / 2;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
  left.rotation.y = Math.PI / 2;
  left.receiveShadow = true;
  const right = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.receiveShadow = true;
  room.add(floor, ceil, left, right);

  // Back wall with a tall window opening, panes and a view of a garden and hills.
  const back = new THREE.Group();
  const winW = 1.5;
  const winB = -0.35;
  const winT = 1.0;
  const backMat = wallMat.clone();
  back.add(
    box(1, 1, 0.2, backMat, 0, 0, 0), // left part, resized in layout
    box(1, 1, 0.2, backMat, 0, 0, 0), // right part
    box(winW, winB - FLOOR, 0.2, backMat, 0, (winB + FLOOR) / 2, 0),
    box(winW, CEIL - winT, 0.2, backMat, 0, (CEIL + winT) / 2, 0),
  );
  const frameMat = mat('#2f3a33', { roughness: 0.5 });
  back.add(box(winW + 0.12, 0.08, 0.32, trim, 0, winB - 0.02, 0.06));
  for (const x of [-winW / 2, 0, winW / 2]) back.add(box(0.05, winT - winB, 0.12, frameMat, x, (winT + winB) / 2, 0, true));
  for (const y of [winB, (winB + winT) / 2, winT]) back.add(box(winW, 0.05, 0.12, frameMat, 0, y, 0, true));
  back.position.z = -DEPTH;
  scene.add(back);

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 40),
    new THREE.MeshBasicMaterial({
      fog: false,
      map: canvasTexture(4, 256, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#7fa9c9');
        grad.addColorStop(0.55, '#f4d6a6');
        grad.addColorStop(0.7, '#ffcf8a');
        grad.addColorStop(1, '#f0b878');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }),
    }),
  );
  sky.position.set(0, 6, -44);
  scene.add(sky);
  const hill = (z, color, amp, seed, y) => {
    const r = rng(seed);
    const pts = [new THREE.Vector2(-40, -6)];
    for (let x = -40; x <= 40; x += 2) pts.push(new THREE.Vector2(x, y + Math.sin(x * 0.18 + seed) * amp + r() * amp * 0.4));
    pts.push(new THREE.Vector2(40, -6));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshBasicMaterial({ color }));
    m.position.z = z;
    scene.add(m);
  };
  hill(-38, '#a9b48f', 1.2, 3, 0.6);
  hill(-30, '#7f9468', 0.8, 5, -0.2);
  hill(-20, '#5d7a4b', 0.5, 9, -0.7);
  // A tree and a hedge in the garden, flat shaded, catching the sun.
  const leafy = mat('#4f7a3a', { roughness: 0.9, flatShading: true });
  const tree = new THREE.Group();
  tree.add(box(0.18, 1.8, 0.18, darkWood, 0, -0.1, 0, false));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + rand() * 0.35, 0), leafy);
    s.position.set((rand() - 0.5) * 1.3, 1.1 + rand() * 0.8, (rand() - 0.5) * 0.8);
    tree.add(s);
  }
  tree.position.set(1.6, FLOOR, -15);
  scene.add(tree);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), leafy);
    s.position.set(-4 + i * 0.85, FLOOR - 0.05, -12.5 - rand() * 0.4);
    s.scale.y = 0.8;
    scene.add(s);
  }

  // Rug
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 3.2),
    mat('#ffffff', {
      map: canvasTexture(256, 340, (g, w, h) => {
        g.fillStyle = '#9c3f2b';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#e8c48a';
        g.lineWidth = 10;
        g.strokeRect(14, 14, w - 28, h - 28);
        g.strokeStyle = '#2f4a5a';
        g.lineWidth = 6;
        g.strokeRect(34, 34, w - 68, h - 68);
        g.fillStyle = '#e8c48a';
        for (let y = 70; y < h - 60; y += 44) {
          g.beginPath();
          g.moveTo(w / 2, y);
          g.lineTo(w / 2 + 40, y + 22);
          g.lineTo(w / 2, y + 44);
          g.lineTo(w / 2 - 40, y + 22);
          g.fill();
        }
      }),
      roughness: 1,
    }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.15, FLOOR + 0.005, -5.2);
  rug.receiveShadow = true;
  scene.add(rug);

  // Bookcase on the left wall (repositioned in layout).
  const shelf = new THREE.Group();
  const shelfD = 0.42;
  const shelfL = 2.6;
  const shelfH = 2.0;
  shelf.add(box(shelfD, shelfH, 0.06, wood, 0, shelfH / 2, -shelfL / 2));
  shelf.add(box(shelfD, shelfH, 0.06, wood, 0, shelfH / 2, shelfL / 2));
  shelf.add(box(0.03, shelfH, shelfL, darkWood, -shelfD / 2, shelfH / 2, 0));
  const bookColors = ['#7d2f2a', '#2f4f6b', '#c9a24a', '#40624a', '#d9cbb0', '#5b3a5e', '#b5562f', '#1f2a36', '#8a8f5a'];
  // Books, vine leaves and fern fronds are instanced: one draw call each instead of hundreds.
  const books = [];
  for (let k = 0; k < 5; k++) {
    const y = 0.06 + k * 0.42;
    shelf.add(box(shelfD, 0.035, shelfL, wood, 0, y, 0));
    if (k === 4) break;
    let z = -shelfL / 2 + 0.06;
    while (z < shelfL / 2 - 0.12) {
      const t = 0.04 + rand() * 0.05;
      if (rand() < 0.08) {
        z += 0.12;
        continue;
      }
      const h = 0.24 + rand() * 0.12;
      const o = new THREE.Object3D();
      o.position.set(-0.02, y + 0.02 + h / 2, z + t / 2);
      o.scale.set(0.26 + rand() * 0.08, h, t);
      if (rand() < 0.06) o.rotation.x = 0.18;
      o.updateMatrix();
      books.push([o.matrix.clone(), new THREE.Color(bookColors[Math.floor(rand() * bookColors.length)])]);
      z += t + 0.004;
    }
  }
  shelf.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.75 }), books));
  scene.add(shelf);

  // Armchair, side table, floor lamp on the right (repositioned in layout).
  const chairSet = new THREE.Group();
  const fabric = mat('#3f6b63', { roughness: 0.95 });
  const chair = new THREE.Group();
  chair.add(box(0.9, 0.38, 0.85, fabric, 0, 0.32, 0));
  chair.add(box(0.9, 0.75, 0.18, fabric, 0, 0.75, -0.38));
  chair.add(box(0.16, 0.32, 0.85, fabric, -0.45, 0.6, 0));
  chair.add(box(0.16, 0.32, 0.85, fabric, 0.45, 0.6, 0));
  chair.add(box(0.7, 0.1, 0.62, mat('#d8b46a'), 0, 0.56, 0.04));
  for (const [x, z] of [[-0.38, -0.35], [0.38, -0.35], [-0.38, 0.35], [0.38, 0.35]]) chair.add(box(0.06, 0.14, 0.06, darkWood, x, 0.07, z));
  chair.rotation.y = -0.55;
  chairSet.add(chair);
  const table = new THREE.Group();
  table.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), wood));
  table.children[0].position.y = 0.6;
  table.add(box(0.05, 0.6, 0.05, darkWood, 0, 0.3, 0));
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 16), mat('#e9e2d3', { roughness: 0.4 }));
  mug.position.set(0.08, 0.67, 0.05);
  const stack = box(0.22, 0.07, 0.3, mat('#2f4f6b'), -0.05, 0.655, -0.06);
  table.add(mug, stack, box(0.2, 0.05, 0.27, mat('#c9a24a'), -0.04, 0.715, -0.05));
  table.children.forEach((c) => { c.castShadow = true; });
  table.position.set(-0.75, 0, 0.35);
  chairSet.add(table);
  const lampPole = box(0.03, 1.5, 0.03, mat('#2b2b2b', { metalness: 0.6, roughness: 0.4 }), 0.55, 0.75, -0.55);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.24, 24, 1, true), mat('#f3e4c4', { side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0.6 }));
  lampShade.position.set(0.55, 1.55, -0.55);
  chairSet.add(lampPole, lampShade);
  const floorLamp = new THREE.PointLight('#ffc77a', 1.6, 4, 1.6);
  floorLamp.position.set(0.55, 1.45, -0.55);
  chairSet.add(floorLamp);
  scene.add(chairSet);

  // Reading table in the middle back with a desk lamp and an open book.
  const desk = new THREE.Group();
  desk.add(box(1.2, 0.05, 0.6, wood, 0, 0.72, 0));
  for (const [x, z] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) desk.add(box(0.05, 0.72, 0.05, darkWood, x, 0.36, z));
  const page = mat('#f7f0e1', { roughness: 0.9 });
  const leftPage = box(0.22, 0.012, 0.3, page, -0.115, 0.755, 0.05);
  leftPage.rotation.z = 0.06;
  const rightPage = box(0.22, 0.012, 0.3, page, 0.115, 0.755, 0.05);
  rightPage.rotation.z = -0.06;
  desk.add(leftPage, rightPage);
  const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 16), mat('#b5562f'));
  plantPot.position.set(0.42, 0.82, -0.1);
  desk.add(plantPot);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), leafy);
    leaf.scale.set(1, 0.4, 0.6);
    leaf.position.set(0.42 + (rand() - 0.5) * 0.16, 0.92 + rand() * 0.1, -0.1 + (rand() - 0.5) * 0.16);
    desk.add(leaf);
  }
  desk.position.set(0.35, FLOOR, -6.8);
  desk.rotation.y = 0.12;
  scene.add(desk);

  // Pendant lamps at three depths: strong parallax against the ceiling and back wall.
  const pendants = [];
  const brass = mat('#b08a4a', { metalness: 0.7, roughness: 0.35 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffd38a', emissiveIntensity: 2.2 });
  for (const [x, z, len] of [[-0.55, -2.2, 0.55], [0.6, -4.3, 0.75], [-0.1, -7.2, 0.6]]) {
    const g = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), mat('#222'));
    cord.position.y = -len / 2;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.16, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2f3a33', side: THREE.DoubleSide, roughness: 0.5 }));
    shade.position.y = -len - 0.04;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulbMat);
    bulb.position.y = -len - 0.1;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), brass);
    cap.position.y = -len + 0.04;
    g.add(cord, shade, bulb, cap);
    g.position.set(x, CEIL, z);
    scene.add(g);
    pendants.push(g);
  }
  const pendantLight = new THREE.PointLight('#ffcf8a', 1.2, 5, 1.8);
  pendantLight.position.set(0.6, CEIL - 0.9, -4.3);
  scene.add(pendantLight);

  // Sun shafts: additive gradient planes along the light direction, crossed so they read
  // as a volume from any head position.
  const shaftTex = canvasTexture(64, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const across = Math.sin((x / (w - 1)) * Math.PI) ** 2;
      const along = Math.min(1, y / (h * 0.15)) * (1 - y / h) ** 0.6;
      const v = across * along * 255;
      const i = (y * w + x) * 4;
      img.data.set([255, 224, 170, v], i);
    }
    g.putImageData(img, 0, 0);
  });
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const from = new THREE.Vector3(0, 0.35, -DEPTH);
  const to = new THREE.Vector3(-0.9, FLOOR, -3.2);
  const dir = to.clone().sub(from);
  const shafts = new THREE.Group();
  for (const [dx, w, rot] of [[-0.38, 0.62, 0], [0.38, 0.62, 0], [-0.38, 0.62, Math.PI / 2], [0.38, 0.62, Math.PI / 2], [0, 1.4, Math.PI / 4]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, dir.length()), shaftMat);
    p.rotation.y = rot;
    const holder = new THREE.Group();
    holder.add(p);
    holder.position.copy(from.clone().add(to).multiplyScalar(0.5)).add(new THREE.Vector3(dx, 0, 0));
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    shafts.add(holder);
  }
  scene.add(shafts);

  // Dust motes: most in the shafts, some floating near the glass for foreground depth.
  const MOTES = 420;
  const motePos = new Float32Array(MOTES * 3);
  const moteBase = [];
  for (let i = 0; i < MOTES; i++) {
    let p;
    if (i < MOTES * 0.75) {
      p = from.clone().lerp(to, rand()).add(new THREE.Vector3((rand() - 0.5) * 1.3, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.9));
    } else {
      p = new THREE.Vector3((rand() - 0.5) * 2.4, -0.8 + rand() * 1.9, -0.4 - rand() * 2.2);
    }
    moteBase.push(p, rand() * Math.PI * 2, 0.4 + rand() * 0.8);
    motePos.set([p.x, p.y, p.z], i * 3);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteTex = canvasTexture(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,240,210,1)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  });
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.028, map: moteTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, fog: false }));
  scene.add(motes);

  // Right at the glass: the window reveal (a short tunnel at the screen edge that only shows
  // when you look at an angle), a sill with a mug and a succulent, a hanging plant, a fern.
  const reveal = new THREE.Group();
  const revealDepth = 0.32;
  const revealMat = mat('#efe5d2', { roughness: 0.8 });
  const rTop = box(1, 0.6, revealDepth, revealMat, 0, 0, -revealDepth / 2, false);
  const rBottom = box(1, 0.6, revealDepth, revealMat, 0, 0, -revealDepth / 2, false);
  const rLeft = box(0.6, 1, revealDepth, revealMat, 0, 0, -revealDepth / 2, false);
  const rRight = box(0.6, 1, revealDepth, revealMat, 0, 0, -revealDepth / 2, false);
  reveal.add(rTop, rBottom, rLeft, rRight);
  scene.add(reveal);

  const sill = new THREE.Group();
  const sillBoard = box(1, 0.05, 0.5, trim, 0, -0.025, -0.25);
  sill.add(sillBoard);
  const sillMug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.15, 20), mat('#2f4f6b', { roughness: 0.35 }));
  sillMug.position.set(0, 0.075, -0.22);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16), sillMug.material);
  handle.position.set(0.075, 0.08, -0.22);
  const succPot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.1, 16), mat('#c96f4a'));
  succPot.position.set(0, 0.05, -0.3);
  const succ = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.11, 6), mat('#7fa37a', { roughness: 0.6 }));
    const a = (i / 9) * Math.PI * 2;
    l.position.set(Math.cos(a) * 0.03, 0.14, -0.3 + Math.sin(a) * 0.03);
    l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    succ.add(l);
  }
  sill.add(sillMug, handle, succPot, succ);
  sill.traverse((o) => { o.castShadow = true; });
  scene.add(sill);

  const hanging = new THREE.Group();
  const hpot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#d9cbb0', { side: THREE.DoubleSide }));
  hanging.add(hpot);
  for (const a of [0, 2.1, 4.2]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 4), mat('#8a7a5a'));
    rope.position.set(Math.cos(a) * 0.06, 0.36, Math.sin(a) * 0.06);
    rope.rotation.set(Math.sin(a) * 0.17, 0, -Math.cos(a) * 0.17);
    hanging.add(rope);
  }
  const vineMat = mat('#4e7d3c', { roughness: 0.8, side: THREE.DoubleSide });
  const leafGeo = new THREE.CircleGeometry(0.045, 8);
  leafGeo.scale(1, 1.6, 1);
  const vine = [];
  for (let v = 0; v < 7; v++) {
    const a = (v / 7) * Math.PI * 2;
    const len = 4 + Math.floor(rand() * 7);
    for (let k = 0; k < len; k++) {
      const leaf = new THREE.Object3D();
      const r = 0.13 + k * 0.012;
      leaf.position.set(Math.cos(a) * r + (rand() - 0.5) * 0.04, -0.02 - k * 0.075, Math.sin(a) * r);
      leaf.rotation.set(rand() * 0.8, a + rand(), rand() - 0.5);
      leaf.updateMatrix();
      vine.push([leaf.matrix.clone()]);
    }
  }
  hanging.add(instanced(leafGeo, vineMat, vine));
  scene.add(hanging);

  const fern = new THREE.Group();
  const fpot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 24), mat('#b5562f'));
  fpot.position.y = 0.18;
  fern.add(fpot);
  const frondGeo = new THREE.PlaneGeometry(0.11, 0.55);
  frondGeo.translate(0, 0.275, 0);
  const frondMat = mat('#5d8a45', { side: THREE.DoubleSide, roughness: 0.8 });
  const fronds = [];
  for (let i = 0; i < 22; i++) {
    const f = new THREE.Object3D();
    const a = rand() * Math.PI * 2;
    f.position.set(0, 0.34, 0);
    f.rotation.set(0.3 + rand() * 0.9, a, 0, 'YXZ');
    f.scale.setScalar(0.8 + rand() * 0.7);
    f.updateMatrix();
    fronds.push([f.matrix.clone()]);
  }
  fern.add(instanced(frondGeo, frondMat, fronds));
  scene.add(fern);

  // Everything that hugs a wall or the frame is placed here so it fits any aspect ratio.
  function layout(aspect) {
    // On a tall phone screen the room stays wider than the glass, like a narrow window
    // onto a normal room; its side walls come into view further back.
    const W = Math.max(aspect, 1.1) + 0.02;
    floor.scale.set(2 * W, DEPTH, 1);
    floor.position.set(0, FLOOR, -DEPTH / 2);
    planks.repeat.set(W * 0.9, DEPTH / 2.2);
    ceil.scale.set(2 * W, DEPTH, 1);
    ceil.position.set(0, CEIL, -DEPTH / 2);
    for (const [wall, s] of [[left, -1], [right, 1]]) {
      wall.scale.set(DEPTH, CEIL - FLOOR, 1);
      wall.position.set(s * W, (CEIL + FLOOR) / 2, -DEPTH / 2);
    }
    plaster.repeat.set(3, 1);
    const side = Math.max(W - winW / 2, 0.01);
    const [bl, br] = back.children;
    bl.scale.set(side, CEIL - FLOOR, 1);
    bl.position.set(-(winW / 2 + side / 2), (CEIL + FLOOR) / 2, 0);
    br.scale.copy(bl.scale);
    br.position.set(winW / 2 + side / 2, (CEIL + FLOOR) / 2, 0);

    shelf.position.set(-W + shelfD / 2 + 0.01, FLOOR, -4.6);
    chairSet.position.set(W - 0.75, FLOOR, -4.9);

    // Reveal tunnel: its inner faces line up with the screen edges.
    const half = aspect;
    rTop.scale.set((half + 0.6) * 2, 1, 1);
    rTop.position.set(0, 1 + 0.3, -revealDepth / 2);
    rBottom.scale.copy(rTop.scale);
    rBottom.position.set(0, -1 - 0.3, -revealDepth / 2);
    rLeft.scale.set(1, 2, 1);
    rLeft.position.set(-half - 0.3, 0, -revealDepth / 2);
    rRight.scale.set(1, 2, 1);
    rRight.position.set(half + 0.3, 0, -revealDepth / 2);

    sill.position.set(0, -1, -revealDepth + 0.02);
    sillBoard.scale.x = half * 2 + 0.3;
    const narrow = aspect < 0.9;
    sillMug.position.x = half * (narrow ? 0.45 : 0.55);
    handle.position.x = sillMug.position.x + 0.075;
    succPot.position.x = -half * (narrow ? 0.5 : 0.62);
    succ.position.x = succPot.position.x;
    hanging.position.set(-half * (narrow ? 0.4 : 0.72), narrow ? 0.78 : 0.62, narrow ? -1.1 : -0.75);
    fern.position.set(half * (narrow ? 0.5 : 0.78), FLOOR, narrow ? -1.8 : -1.25);
  }

  function update(t) {
    const pos = moteGeo.attributes.position;
    for (let i = 0; i < MOTES; i++) {
      const base = moteBase[i * 3];
      const ph = moteBase[i * 3 + 1];
      const sp = moteBase[i * 3 + 2];
      pos.setXYZ(i, base.x + Math.sin(t * 0.21 * sp + ph) * 0.09, base.y + Math.sin(t * 0.13 * sp + ph * 1.7) * 0.07, base.z + Math.cos(t * 0.17 * sp + ph) * 0.07);
    }
    pos.needsUpdate = true;
    hanging.rotation.y = Math.sin(t * 0.35) * 0.08;
    pendants.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.6 + i * 1.3) * 0.012; });
  }

  return { scene, layout, update };
}
