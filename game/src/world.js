// RUSTLINE — round 3. The map: Foundry Yard, a 64 x 44 m industrial foundry
// at dusk. Builds the three.js scene from config: floor, perimeter walls,
// the furnace block, crates, site markers, dusk lighting and embers.
// All textures are generated on canvas at runtime — no external assets.
import * as THREE from 'three';
import { MAP, WALLS, SITES } from './config.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function floorTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#2b2b30';
    g.fillRect(0, 0, w, h);
    // concrete slabs
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
      g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
    }
    // speckle + stains
    for (let i = 0; i < 2600; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // oil stains near the furnace lane
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(10,10,12,0.25)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 18 + Math.random() * 30, 10 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // hazard chevrons along the mid lane
    g.save();
    g.translate(w / 2, h / 2);
    g.fillStyle = '#c9a227';
    for (let i = -3; i <= 3; i++) {
      g.save();
      g.translate(i * 46, 0);
      g.rotate(Math.PI / 4);
      g.fillRect(-14, -4, 28, 8);
      g.restore();
    }
    g.restore();
  });
}

function wallTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3a3f46';
    g.fillRect(0, 0, w, h);
    // panel seams
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 2;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, h - 4); g.stroke();
    // rivets
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14], [w / 2, 14], [w / 2, h - 14]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    // grime at the bottom
    const grad = g.createLinearGradient(0, h - 70, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, h - 70, w, 70);
    // faint rust streaks
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(120,70,30,0.12)';
      const x = Math.random() * w;
      g.fillRect(x, 20 + Math.random() * 40, 3 + Math.random() * 5, 60 + Math.random() * 90);
    }
  });
}

function siteLabelTexture(letter, css) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = css;
    g.lineWidth = 10;
    g.globalAlpha = 0.95;
    g.beginPath(); g.arc(w / 2, h / 2, 100, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 82, 0, Math.PI * 2); g.stroke();
    g.fillStyle = css;
    g.font = 'bold 150px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, w / 2, h / 2 + 6);
  });
}

/** Build the whole map. Returns { group, siteMarkers, furnaceLight, embers }. */
export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const floorTex = floorTexture();
  floorTex.repeat.set(8, 5.5);
  const wallTex = wallTexture();

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.08 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.25 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.7 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b5a33, roughness: 0.9, metalness: 0.1 });
  const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.9, metalness: 0.1 });
  const furnaceMat = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.55, metalness: 0.85, emissive: 0x662200, emissiveIntensity: 0.35 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a0c00, emissive: 0xff6a00, emissiveIntensity: 2.4 });

  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfX * 2 + 2, MAP.halfZ * 2 + 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // walls + crates from config
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const tall = w.h >= 4.5;
    const mat = tall ? wallMat : (w.h <= 1.8 ? crateMat : crateMat2);
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w.w, w.h, w.d);
    m.position.set(w.x, w.h / 2, w.z);
    m.castShadow = tall;
    m.receiveShadow = true;
    group.add(m);
    // low crates get a darker lid so they read as cover, not walls
    if (!tall) {
      const lid = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.08, 0.1, w.d + 0.08), darkMetal);
      lid.position.set(w.x, w.h + 0.05, w.z);
      lid.castShadow = true;
      group.add(lid);
    }
  }

  // furnace: glowing slits + chimney + heat shimmer cone
  const furnace = group.children.find((c) => c.position.x === 0 && c.position.z === 0);
  void furnace;
  const slitGeo = new THREE.BoxGeometry(7.2, 0.5, 0.15);
  for (const z of [-3.05, 3.05]) {
    const slit = new THREE.Mesh(slitGeo, glowMat);
    slit.position.set(0, 1.1, z);
    group.add(slit);
  }
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 9, 10), darkMetal);
  chimney.position.set(0, 5.5 + 4.5, 0);
  chimney.castShadow = true;
  group.add(chimney);
  const chimneyGlow = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 10), glowMat);
  chimneyGlow.position.set(0, 10.1, 0);
  group.add(chimneyGlow);

  // distant silhouettes outside the yard: cranes + chimneys against the dusk
  const silMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1, metalness: 0 });
  const silhouettes = [
    [-46, -30, 2, 16], [46, -28, 2.5, 20], [-48, 26, 3, 12], [48, 30, 2, 18], [-40, 0, 2, 22],
  ];
  for (const [x, z, r, h] of silhouettes) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.4, h, 8), silMat);
    s.position.set(x, h / 2, z);
    group.add(s);
  }
  // crane arm
  const crane = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 1.2), silMat);
  crane.position.set(-38, 19, -18);
  crane.rotation.z = 0.12;
  group.add(crane);

  // ---- site markers: floating hologram letters + glowing ground rings ------
  const siteMarkers = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const tex = siteLabelTexture(key, site.css);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const bill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), mat);
    bill.position.set(site.x, 4.6, site.z);
    group.add(bill);
    // ground ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.7, 40),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    group.add(ring);
    // light pool
    const pool = new THREE.PointLight(site.color, 14, 16, 1.8);
    pool.position.set(site.x, 3.2, site.z);
    group.add(pool);
    siteMarkers[key] = { bill, ring, pool, baseY: 4.6 };
  }

  // ---- lighting: dusk -------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xff9a5c, 0x1a2028, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.position.set(-28, 16, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  // furnace glow, flickers in main.js
  const furnaceLight = new THREE.PointLight(0xff6a00, 60, 26, 1.6);
  furnaceLight.position.set(0, 2.2, 0);
  scene.add(furnaceLight);
  // cool fill from the east so Sentinel's side is not pitch black
  const fill = new THREE.DirectionalLight(0x6a86c8, 0.35);
  fill.position.set(30, 12, 10);
  scene.add(fill);

  // ---- dusk sky dome --------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(220, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x1b2340) },
      mid: { value: new THREE.Color(0xb4552d) },
      low: { value: new THREE.Color(0xff8c3a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(0x2a1c22, 55, 160);

  // ---- embers: drifting sparks above the furnace ----------------------------
  const emberCount = 160;
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPos[i * 3] = (Math.random() - 0.5) * 10;
    emberPos[i * 3 + 1] = Math.random() * 8;
    emberPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    emberSeed[i] = Math.random();
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false });
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);

  return { group, siteMarkers, furnaceLight, embers, emberSeed };
}
