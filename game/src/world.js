// RUSTLINE — the Foundry Yard map: geometry, colliders, sight occlusion, paths.
// The map is built once from CONFIG; collision and line-of-sight are cheap 2D
// tests in the XZ plane, so bots can think every frame without raycasts.

import * as THREE from 'three';
import { CONFIG, WALLS, WAYPOINTS, SITES } from './config.js';

// A ground texture painted on a canvas: concrete slabs, rust stains, lane paint.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#33302b'; g.fillRect(0, 0, 512, 512);
  // Concrete slabs.
  g.strokeStyle = '#2a2723'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
  }
  // Rust stains and scuffs.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 4 + Math.random() * 26;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,66,30,0.16)' : 'rgba(0,0,0,0.14)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Faded lane paint: amber centre line, white site rings.
  g.strokeStyle = 'rgba(210,160,60,0.5)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(256, 40); g.lineTo(256, 472); g.stroke();
  g.strokeStyle = 'rgba(230,230,230,0.35)'; g.lineWidth = 4;
  g.beginPath(); g.arc(96, 96, 46, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(416, 96, 46, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3); tex.anisotropy = 4;
  return tex;
}

function box(w, h, d, color, roughness = 0.85, metalness = 0.15) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// 2D segment vs AABB test (slab method) — used for sight occlusion in XZ.
export function segmentBlocked(ax, az, bx, bz, walls) {
  const dx = bx - ax, dz = bz - az;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const minX = w[0] - w[2], maxX = w[0] + w[2];
    const minZ = w[1] - w[3], maxZ = w[1] + w[3];
    // Only walls tall enough to block sight (crates are low cover).
    if (w[4] < 2.0) continue;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) continue; }
    else {
      let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) continue; }
    else {
      let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}

// Breadth-first search over the waypoint graph; returns an array of node ids.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Int16Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const n of WAYPOINTS[cur].links) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (n === to) {
        const path = [to];
        let p = cur;
        while (p !== from) { path.unshift(p); p = prev[p]; }
        path.unshift(from);
        return path;
      }
      queue.push(n);
    }
  }
  return [from, to];
}

export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x, dz = WAYPOINTS[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Circle (radius r) vs wall AABBs in XZ; returns the corrected position.
export function collideCircle(x, z, r, walls) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const minX = w[0] - w[2] - r, maxX = w[0] + w[2] + r;
    const minZ = w[1] - w[3] - r, maxZ = w[1] + w[3] + r;
    if (x > minX && x < maxX && z > minZ && z < maxZ) {
      const pushL = x - minX, pushR = maxX - x;
      const pushT = z - minZ, pushB = maxZ - z;
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) x = minX; else if (m === pushR) x = maxX;
      else if (m === pushT) z = minZ; else z = maxZ;
    }
  }
  const hx = CONFIG.map.halfX - r, hz = CONFIG.map.halfZ - r;
  x = Math.max(-hx, Math.min(hx, x));
  z = Math.max(-hz, Math.min(hz, z));
  return { x, z };
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Dusk sky: warm horizon fog, cool hemisphere light, low amber sun.
  scene.background = new THREE.Color(0x2b1d16);
  scene.fog = new THREE.Fog(0x2b1d16, 28, 95);
  const hemi = new THREE.HemisphereLight(0x8a7a68, 0x1c1712, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-28, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 90;
  scene.add(sun);
  // Warm point lights over the furnace and the storehouse.
  const glowA = new THREE.PointLight(0xff7a2a, 60, 26, 1.6);
  glowA.position.set(SITES.A.x, 3.4, SITES.A.z);
  scene.add(glowA);
  const glowB = new THREE.PointLight(0xffc46b, 40, 22, 1.6);
  glowB.position.set(SITES.B.x, 3.4, SITES.B.z);
  scene.add(glowB);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 46),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Walls from the layout: outer shell tall and dark, furnace blocks rusted,
  // crates in hazard yellow and olive.
  const palette = [0x3a352f, 0x4a3a28, 0x5a4a20, 0x3c4a2e];
  for (let i = 0; i < WALLS.length; i++) {
    const w = WALLS[i];
    const isShell = i < 4;
    const color = isShell ? 0x35302a : palette[i % palette.length];
    const m = box(w[2] * 2, w[4], w[3] * 2, color);
    m.position.set(w[0], w[4] / 2, w[1]);
    group.add(m);
    // Rust trim on the furnace wall.
    if (i === 4 || i === 5) {
      const trim = box(w[2] * 2, 0.18, w[3] * 2 + 0.1, 0xb05a1e, 0.6, 0.4);
      trim.position.set(w[0], w[4] + 0.09, w[1]);
      group.add(trim);
    }
  }

  // The furnace itself: a glowing mouth on site A, chimney stacks, pipes.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a }),
  );
  mouth.position.set(-24, 1.1, -15.9);
  mouth.rotation.y = 0;
  group.add(mouth);
  const chimney = box(1.6, 7, 1.6, 0x2e2a26, 0.7, 0.5);
  chimney.position.set(-29.5, 3.5, -15);
  group.add(chimney);
  const chimney2 = box(1.2, 5.5, 1.2, 0x2e2a26, 0.7, 0.5);
  chimney2.position.set(29.5, 2.75, -15);
  group.add(chimney2);
  // Overhead pipes along the north edge.
  for (const px of [-16, 0, 16]) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 8, 10),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.5, metalness: 0.7 }),
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(px, 4.6, -20.5);
    pipe.castShadow = true;
    group.add(pipe);
  }
  // Site markers: glowing floor rings.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xff8a3c : 0xffc46b, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    group.add(ring);
  }

  return { group, walls: WALLS };
}
