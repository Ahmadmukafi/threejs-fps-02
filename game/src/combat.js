// RUSTLINE — combat resolution. One place where a shot becomes a hit:
// a ray against the map, then against every fighter's hitboxes. Bots and
// the player both fire through here, so a headshot is a headshot for both.
// Also owns grenade flight and the visual tracers / impact sparks.

import * as THREE from 'three';
import { GRENADE } from './config.js';
import { applyDamage } from './weapons.js';
import { collideCircle } from './world.js';

// Reused scratch objects: no allocation in the hot loop.
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();

export function resolveShot(sim, shooter, origin, dir, weapon) {
  // 1) nearest wall hit
  _ray.set(origin, dir);
  _ray.far = weapon.range;
  const wallHits = _ray.intersectObjects(sim.world.solids, false);
  const wallD = wallHits.length ? wallHits[0].distance : Infinity;
  const wallPoint = wallHits.length ? wallHits[0].point : null;

  // 2) nearest fighter hit (head first, then body)
  let best = null; // { fighter, part, distance, point }
  for (const f of sim.fighters) {
    if (f === shooter || !f.alive) continue;
    if (f.team === shooter.team) continue;
    const meshes = f.hitMeshes || [];
    const hits = _ray.intersectObjects(meshes, false);
    for (const h of hits) {
      if (h.distance < wallD && (!best || h.distance < best.distance)) {
        best = { fighter: f, part: h.object.userData.part, distance: h.distance, point: h.point.clone() };
      }
    }
  }

  if (best) {
    const isHead = best.part === 'head';
    let dmg = weapon.damage * (isHead ? weapon.headMult : 1);
    if (best.fighter.loadout) dmg = applyDamage(best.fighter.loadout, dmg);
    const killed = best.fighter.damage(dmg);
    return {
      hit: true, head: isHead, killed, damage: dmg,
      fighter: best.fighter, point: best.point, distance: best.distance,
    };
  }
  return { hit: false, point: wallPoint, distance: wallD, wall: !!wallPoint };
}

// Line of sight between two eye points: true when no solid blocks the ray.
export function hasLOS(sim, a, b) {
  _dir.copy(b).sub(a);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.normalize();
  _ray.set(a, _dir);
  _ray.far = dist;
  return _ray.intersectObjects(sim.world.solids, false).length === 0;
}

// --- tracers ------------------------------------------------------------------
const TRACER_MAX = 24;
export class Tracers {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < TRACER_MAX; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo.clone(), mat);
      line.visible = false;
      scene.add(line);
      this.pool.push({ line, life: 0 });
    }
    this.next = 0;
  }

  fire(from, to, color = 0xfff2b0) {
    const t = this.pool[this.next];
    this.next = (this.next + 1) % TRACER_MAX;
    const p = t.line.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z);
    p.setXYZ(1, to.x, to.y, to.z);
    p.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  tick(dt) {
    for (const t of this.pool) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    }
  }
}

// --- impact sparks --------------------------------------------------------------
const SPARK_MAX = 12;
export class Sparks {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < SPARK_MAX; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      this.pool.push({ mesh: m, life: 0 });
    }
    this.next = 0;
  }

  burst(point) {
    const s = this.pool[this.next];
    this.next = (this.next + 1) % SPARK_MAX;
    s.mesh.position.copy(point);
    s.mesh.material.opacity = 1;
    s.mesh.visible = true;
    s.life = 0.18;
  }

  tick(dt) {
    for (const s of this.pool) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) s.mesh.visible = false;
      else s.mesh.material.opacity = s.life / 0.18;
    }
  }
}

// --- grenades ---------------------------------------------------------------------
export class Grenades {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    const geo = new THREE.SphereGeometry(0.12, 8, 8);
    this.geo = geo;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 });
  }

  throw(origin, dir) {
    const g = {
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(0, 4.5, 0)),
      timer: GRENADE.fuse,
      mesh: new THREE.Mesh(this.geo, this.mat),
    };
    g.mesh.position.copy(g.pos);
    g.mesh.castShadow = true;
    this.scene.add(g.mesh);
    this.list.push(g);
    return g;
  }

  // Step all live grenades. Returns an array of { pos } explosions this step.
  tick(dt, colliders) {
    const booms = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.timer -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      // bounce off the floor
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.6; g.vel.z *= 0.6;
      }
      // bounce off walls: push the point out of colliders, reflect velocity
      const flat = new THREE.Vector3(g.pos.x, 0, g.pos.z);
      const ox = flat.x, oz = flat.z;
      if (collideCircle(colliders, flat, 0.12)) {
        g.pos.x = flat.x; g.pos.z = flat.z;
        if (flat.x !== ox) g.vel.x = -g.vel.x * 0.4;
        if (flat.z !== oz) g.vel.z = -g.vel.z * 0.4;
      }
      g.mesh.position.copy(g.pos);
      if (g.timer <= 0) {
        booms.push({ pos: g.pos.clone() });
        this.scene.remove(g.mesh);
        this.list.splice(i, 1);
      }
    }
    return booms;
  }
}
