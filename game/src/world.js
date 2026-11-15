// RUSTLINE — the map: "Foundry Yard". Builds the meshes, the AABB colliders
// bots and bullets use, the waypoint graph bots walk, and the two bombsites.
// Attackers spawn south (z +), defenders north (z -). Site A (Furnace) is
// north-east, site B (Storehouse) north-west, with three lanes between them.

import * as THREE from 'three';
import { MAP, PALETTE } from './config.js';

// A collider is { x0, z0, x1, z1, top } — an axis-aligned box from y=0.
function box(x, z, w, d, h) {
  return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, top: h };
}

// Ground texture: dark foundry floor with a painted grid and hazard dashes.
// Generated on a canvas at runtime — no external asset.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a453d'; g.fillRect(0, 0, 256, 256);
  // speckle
  for (let i = 0; i < 900; i++) {
    const v = 62 + Math.floor(Math.random() * 34);
    g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // grid lines
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  const W = MAP.width, D = MAP.depth, H = MAP.wallHeight;
  const colliders = [];
  const solids = [];   // meshes bullets and sight rays hit
  const group = new THREE.Group();
  group.name = 'world';

  const mat = (color, rough = 0.9) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });

  const addBox = (x, y, z, w, h, d, material, collide = true, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, top: y + h });
    if (solid) solids.push(m);
    return m;
  };

  // --- ground ----------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 8, D + 8),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // --- perimeter walls ---------------------------------------------------------
  const wallMat = mat(PALETTE.wall);
  const wallDark = mat(PALETTE.wallDark);
  addBox(0, 0, -D / 2 - 0.5, W + 2, H, 1, wallMat);          // north
  addBox(0, 0, D / 2 + 0.5, W + 2, H, 1, wallMat);           // south
  addBox(-W / 2 - 0.5, 0, 0, 1, H, D + 2, wallDark);         // west
  addBox(W / 2 + 0.5, 0, 0, 1, H, D + 2, wallDark);          // east

  // --- site A: the Furnace (north-east) ----------------------------------------
  const furnace = addBox(24, 0, -17, 8, 3.4, 3, mat(0x5a4a3a));
  furnace.name = 'furnace';
  // furnace chimney
  addBox(26.5, 3.4, -17, 1.6, 5.5, 1.6, mat(0x3f3a35));
  // glowing furnace mouth (emissive)
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.6, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff6a1a, emissiveIntensity: 2.2 }),
  );
  mouth.position.set(24, 1.1, -15.4);
  group.add(mouth);
  // A-site crates
  addBox(18, 0, -13, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  addBox(20.5, 0, -13, 2.2, 1.2, 2.2, mat(PALETTE.crateDark));
  addBox(20.5, 1.2, -13, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  addBox(27, 0, -10, 2.4, 1.4, 1.2, mat(PALETTE.crateDark));
  // A-site floor marking
  const siteARing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.6, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.siteA, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  siteARing.rotation.x = -Math.PI / 2;
  siteARing.position.set(22, 0.03, -14);
  group.add(siteARing);

  // --- site B: the Storehouse (north-west) -------------------------------------
  addBox(-24, 0, -17, 8, 3.0, 3, mat(0x46505a));
  addBox(-27, 3.0, -17, 1.6, 4.5, 1.6, mat(0x3a424c));
  // storage racks
  addBox(-20, 0, -16, 1.2, 2.6, 4, mat(PALETTE.pipe));
  addBox(-23, 0, -12, 2.2, 1.2, 2.2, mat(PALETTE.crateDark));
  addBox(-19, 0, -11, 2.2, 2.4, 2.2, mat(PALETTE.crate));
  addBox(-26.5, 0, -10.5, 2.4, 1.2, 1.2, mat(PALETTE.crate));
  const siteBRing = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.6, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.siteB, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  siteBRing.rotation.x = -Math.PI / 2;
  siteBRing.position.set(-22, 0.03, -14);
  group.add(siteBRing);

  // --- mid: the foundry hall ---------------------------------------------------
  // A furnace wall splits mid: it breaks the spawn-to-spawn sightline so
  // neither team is shot walking out of spawn, and fights happen around it.
  addBox(0, 0, 0, 6, 4.2, 1, mat(PALETTE.wallDark));
  // two pillars framing mid, a low block off the centre line, and pipe runs
  addBox(-6, 0, -2, 2, 4.2, 2, mat(PALETTE.wallDark));
  addBox(6, 0, -2, 2, 4.2, 2, mat(PALETTE.wallDark));
  addBox(8, 0, 5, 5, 1.1, 2.4, mat(PALETTE.crateDark));
  addBox(-12, 0, 4, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  addBox(12, 0, 4, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  addBox(12, 1.2, 4, 2.2, 1.2, 2.2, mat(PALETTE.crateDark));
  // overhead pipe (visual only, above head height)
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 40, 10),
    mat(PALETTE.pipe, 0.6),
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, 5.6, -2);
  pipe.castShadow = true;
  group.add(pipe);

  // --- lane cover ---------------------------------------------------------------
  // A Long (east lane) — crates hug the wall, clear of the waypoint line
  addBox(29, 0, 2, 2.2, 1.3, 3.2, mat(PALETTE.crate));
  addBox(29, 0, 10, 3.2, 1.3, 2.2, mat(PALETTE.crateDark));
  addBox(22, 0, 14, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  // B Short (west lane)
  addBox(-29, 0, 2, 2.2, 1.3, 3.2, mat(PALETTE.crateDark));
  addBox(-29, 0, 10, 3.2, 1.3, 2.2, mat(PALETTE.crate));
  addBox(-22, 0, 14, 2.2, 1.2, 2.2, mat(PALETTE.crateDark));
  // attacker side cover (kept off the spawn -> mid line)
  addBox(-8, 0, 13, 3, 1.2, 1.6, mat(PALETTE.crate));
  addBox(8, 0, 13, 3, 1.2, 1.6, mat(PALETTE.crateDark));
  addBox(5, 0, 16, 2.2, 1.1, 2.2, mat(PALETTE.crate));
  // defender side cover (kept off the spawn -> mid line)
  addBox(-12, 0, -8, 2.2, 1.2, 2.2, mat(PALETTE.crate));
  addBox(12, 0, -8, 2.2, 1.2, 2.2, mat(PALETTE.crateDark));
  addBox(7, 0, -9, 4, 1.1, 1.6, mat(PALETTE.crate));

  // --- lights -------------------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 42, 110);
  const hemi = new THREE.HemisphereLight(0xa89a80, 0x2a211a, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(24, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 90;
  scene.add(sun);
  // warm point light over the furnace mouth
  const furnaceLight = new THREE.PointLight(0xff6a1a, 18, 16, 1.8);
  furnaceLight.position.set(24, 2.2, -15);
  scene.add(furnaceLight);
  // cool light over the storehouse
  const storeLight = new THREE.PointLight(0x5a9ad8, 10, 14, 1.8);
  storeLight.position.set(-22, 2.5, -14);
  scene.add(storeLight);

  scene.add(group);

  // --- waypoints: node graph bots walk -------------------------------------------
  // nodes: id -> [x, z]; edges: pairs of ids. Bots BFS over this graph.
  const nodes = {
    atkSpawn: [0, 18],
    atkLeft: [-14, 16], atkRight: [14, 16],
    midLow: [0, 10], midWest: [-9, 2], midEast: [9, 2], midHigh: [0, -4],
    aLong1: [24, 12], aLong2: [27, 0], aLong3: [24, -8],
    bShort1: [-24, 12], bShort2: [-27, 0], bShort3: [-24, -8],
    siteA: [22, -14], siteA2: [17, -11],
    siteB: [-22, -14], siteB2: [-17, -11],
    defSpawn: [0, -18],
    defA: [16, -17], defB: [-16, -17],
    midHold: [0, -7],
  };
  const edges = [
    ['atkSpawn', 'atkLeft'], ['atkSpawn', 'midLow'], ['atkSpawn', 'atkRight'],
    ['atkLeft', 'bShort1'], ['atkRight', 'aLong1'],
    ['midLow', 'midWest'], ['midLow', 'midEast'],
    ['midWest', 'midHigh'], ['midEast', 'midHigh'],
    ['midLow', 'aLong1'], ['midLow', 'bShort1'],
    ['aLong1', 'aLong2'], ['aLong2', 'aLong3'], ['aLong3', 'siteA'],
    ['aLong3', 'siteA2'], ['siteA2', 'midHigh'],
    ['bShort1', 'bShort2'], ['bShort2', 'bShort3'], ['bShort3', 'siteB'],
    ['bShort3', 'siteB2'], ['siteB2', 'midHigh'],
    ['siteA', 'defA'], ['siteB', 'defB'],
    ['defA', 'defSpawn'], ['defB', 'defSpawn'],
    ['defSpawn', 'midHold'], ['midHold', 'midHigh'],
    ['siteA', 'siteA2'], ['siteB', 'siteB2'],
    ['midHigh', 'defA'], ['midHigh', 'defB'],
  ];
  const waypoints = { nodes, edges };

  return {
    group,
    colliders,
    solids,
    waypoints,
    sites: {
      A: { center: new THREE.Vector3(22, 0, -14), radius: 4.5, label: 'FURNACE' },
      B: { center: new THREE.Vector3(-22, 0, -14), radius: 4.5, label: 'STOREHOUSE' },
    },
    spawns: {
      attack: [
        new THREE.Vector3(-6, 0, 17), new THREE.Vector3(-3, 0, 18),
        new THREE.Vector3(0, 0, 19), new THREE.Vector3(3, 0, 18),
        new THREE.Vector3(6, 0, 17),
      ],
      defend: [
        new THREE.Vector3(-6, 0, -18), new THREE.Vector3(-2, 0, -19),
        new THREE.Vector3(2, 0, -19), new THREE.Vector3(6, 0, -18),
        new THREE.Vector3(0, 0, -16),
      ],
    },
  };
}

// AABB collision: push a circle (x, z, radius) out of every collider it
// overlaps. Returns true when a push happened. Cheap and allocation-free.
export function collideCircle(colliders, pos, radius) {
  let pushed = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const cx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const cz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const pl = pos.x - c.x0, pr = c.x1 - pos.x;
        const pt = pos.z - c.z0, pb = c.z1 - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.x0 - radius;
        else if (m === pr) pos.x = c.x1 + radius;
        else if (m === pt) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
      }
      pushed = true;
    }
  }
  // clamp to the arena
  const bx = MAP.width / 2 - radius, bz = MAP.depth / 2 - radius;
  if (pos.x < -bx) { pos.x = -bx; pushed = true; }
  if (pos.x > bx) { pos.x = bx; pushed = true; }
  if (pos.z < -bz) { pos.z = -bz; pushed = true; }
  if (pos.z > bz) { pos.z = bz; pushed = true; }
  return pushed;
}

// BFS shortest path over the waypoint graph. Returns an array of node ids.
export function findPath(waypoints, from, to) {
  const { nodes, edges } = waypoints;
  const adj = {};
  for (const [a, b] of edges) {
    (adj[a] = adj[a] || []).push(b);
    (adj[b] = adj[b] || []).push(a);
  }
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of adj[cur] || []) {
      if (!(n in prev)) { prev[n] = cur; queue.push(n); }
    }
  }
  if (!(to in prev)) return [to];
  const path = [];
  let cur = to;
  while (cur !== null) { path.unshift(cur); cur = prev[cur]; }
  return path;
}

// Nearest waypoint node to a world position.
export function nearestNode(waypoints, x, z) {
  let best = null, bestD = Infinity;
  for (const [id, p] of Object.entries(waypoints.nodes)) {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
