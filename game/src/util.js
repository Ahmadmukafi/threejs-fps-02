// RUSTLINE — round 3. Small shared helpers: seeded RNG, math, collision.
// Nothing here allocates in hot loops: callers pass scratch objects.

// ---- seeded RNG (mulberry32) -----------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller gaussian from a uniform rng: mean 0, std 1. */
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg2rad = (d) => (d * Math.PI) / 180;

/** Shortest signed angle difference, degrees. */
export function angleDiffDeg(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Distance on the XZ plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ---- AABB collision (2D, XZ plane) -----------------------------------------
// Walls are axis-aligned boxes; agents are circles of MOVE.radius.
// collideCircle resolves a proposed position against every wall, sliding
// along the wall face. Returns true when any wall pushed the agent.
export function collideCircle(px, pz, radius, walls, out) {
  let hit = false;
  let x = px;
  let z = pz;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const minX = w.x - w.w / 2 - radius;
    const maxX = w.x + w.w / 2 + radius;
    const minZ = w.z - w.d / 2 - radius;
    const maxZ = w.z + w.d / 2 + radius;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    // Inside the expanded box: push out along the smallest penetration axis.
    const pushL = x - minX;
    const pushR = maxX - x;
    const pushU = z - minZ;
    const pushD = maxZ - z;
    const m = Math.min(pushL, pushR, pushU, pushD);
    if (m === pushL) x = minX;
    else if (m === pushR) x = maxX;
    else if (m === pushU) z = minZ;
    else z = maxZ;
    hit = true;
  }
  out.x = x;
  out.z = z;
  return hit;
}

/** True when the point is inside any wall (expanded by `pad`). */
export function pointBlocked(x, z, walls, pad) {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (x > w.x - w.w / 2 - pad && x < w.x + w.w / 2 + pad && z > w.z - w.d / 2 - pad && z < w.z + w.d / 2 + pad) return true;
  }
  return false;
}

// ---- ray vs AABB (slab test), 3D -------------------------------------------
// Returns the ray distance to the first wall hit, or Infinity. `origin` and
// `dir` are {x,y,z}; walls are boxes with height h (base at y=0).
export function rayWalls(origin, dir, walls, maxDist) {
  let best = Infinity;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const minX = w.x - w.w / 2;
    const maxX = w.x + w.w / 2;
    const minZ = w.z - w.d / 2;
    const maxZ = w.z + w.d / 2;
    const minY = 0;
    const maxY = w.h;
    let tmin = 0;
    let tmax = maxDist;
    // X slab
    if (Math.abs(dir.x) < 1e-9) {
      if (origin.x < minX || origin.x > maxX) continue;
    } else {
      let t1 = (minX - origin.x) / dir.x;
      let t2 = (maxX - origin.x) / dir.x;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab
    if (Math.abs(dir.y) < 1e-9) {
      if (origin.y < minY || origin.y > maxY) continue;
    } else {
      let t1 = (minY - origin.y) / dir.y;
      let t2 = (maxY - origin.y) / dir.y;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dir.z) < 1e-9) {
      if (origin.z < minZ || origin.z > maxZ) continue;
    } else {
      let t1 = (minZ - origin.z) / dir.z;
      let t2 = (maxZ - origin.z) / dir.z;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

/** True when the segment (ax,az)-(bx,bz) crosses any wall (2D, for LOS). */
export function segmentBlocked(ax, az, bx, bz, walls) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return false;
  const dir = { x: dx / len, y: 0, z: dz / len };
  const origin = { x: ax, y: 1, z: az };
  return rayWalls(origin, dir, walls, len) < len;
}

// ---- waypoint graph ---------------------------------------------------------
export function buildGraph(waypoints, edges) {
  const adj = waypoints.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

/** Breadth-first shortest path of waypoint ids from `from` to `to`. */
export function bfsPath(adj, from, to) {
  if (from === to) return [from];
  const prev = new Array(adj.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nb of adj[cur]) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path = [to];
        let n = to;
        while (n !== from) {
          n = prev[n];
          path.unshift(n);
        }
        return path;
      }
      queue.push(nb);
    }
  }
  return null;
}

/** Nearest waypoint id to (x, z). */
export function nearestWaypoint(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
