// RUSTLINE — round 3. Combat: hitscan shooting with honest raycasts,
// grenades, tracers and damage. A shot is a ray from the shooter's eye with
// an angular error; it hits the first thing it meets — a wall, a body, or a
// head. No dice rolls on hits: the ray decides.
import * as THREE from 'three';
import { WEAPONS, GRENADES, MOVE } from './config.js';
import { rayWalls, segmentBlocked, gaussian } from './util.js';
import { currentSpreadDeg, consumeShot, fireBlockReason } from './weapons.js';

// Ray vs an axis-aligned box. Returns distance or Infinity.
function rayBox(origin, dir, min, max, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const mn = [min.x, min.y, min.z];
  const mx = [max.x, max.y, max.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < mn[a] || o[a] > mx[a]) return Infinity;
    } else {
      let t1 = (mn[a] - o[a]) / d[a];
      let t2 = (mx[a] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// An agent's hitboxes: body (0.15..1.45) and head (1.42..1.78), 0.8 / 0.5 wide.
// The facing only matters for the head offset; boxes are axis-aligned.
function agentHitboxes(agent) {
  const x = agent.pos.x;
  const z = agent.pos.z;
  const hw = 0.42;
  const hh = 0.26;
  return {
    body: { min: { x: x - hw, y: 0.12, z: z - hw }, max: { x: x + hw, y: 1.45, z: z + hw } },
    head: { min: { x: x - hh, y: 1.42, z: z - hh }, max: { x: x + hh, y: 1.78, z: z + hh } },
  };
}

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.tracers = [];
    this.tracerGroup = new THREE.Group();
    scene.add(this.tracerGroup);
    this.grenades = [];
    this.stats = { shots: 0, hits: 0, kills: 0 };
    this._tmpDir = new THREE.Vector3();
    this._tmpOrigin = new THREE.Vector3();
  }

  reset() {
    for (const t of this.tracers) this.tracerGroup.remove(t.line);
    this.tracers.length = 0;
    this.grenades.length = 0;
    this.stats.shots = 0;
    this.stats.hits = 0;
    this.stats.kills = 0;
  }

  addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.tracerGroup.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  tickTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.tracerGroup.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  /**
   * Fire one hitscan shot for `shooter` along `dir` (unit vector).
   * `agents` is every live agent (shooter excluded by id). `walls` for
   * occlusion. `rng` for the angular error. Returns the hit record or null.
   */
  shoot(shooter, dir, agents, walls, rng, now) {
    const loadout = shooter.loadout;
    const def = WEAPONS[loadout.current];
    const blocked = fireBlockReason(loadout, shooter.weaponState, now);
    if (blocked) return { blocked };
    consumeShot(loadout, shooter.weaponState, now);
    this.stats.shots += def.pellets;

    const eye = { x: shooter.pos.x, y: shooter.eyeY(), z: shooter.pos.z };
    const speed = shooter.speed2D || 0;
    const spreadDeg = currentSpreadDeg(def, shooter.weaponState, speed, shooter.crouched, now);
    let hitRecord = null;

    for (let p = 0; p < def.pellets; p++) {
      // Angular error: gaussian in yaw and pitch, scaled by spread. The base
      // direction is rebuilt from yaw/pitch so the error is exact.
      const errYaw = gaussian(rng) * (spreadDeg * Math.PI / 180);
      const errPitch = gaussian(rng) * (spreadDeg * Math.PI / 180);
      const baseYaw = Math.atan2(dir.x, dir.z);
      const basePitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const yaw = baseYaw + errYaw;
      const pitch = basePitch + errPitch;
      const cp = Math.cos(pitch);
      const ray = { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };

      const origin = this._tmpOrigin.set(eye.x, eye.y, eye.z);
      const wallDist = rayWalls(origin, ray, walls, def.range);
      let bestDist = wallDist;
      let bestAgent = null;
      let bestHead = false;
      for (const a of agents) {
        if (a.id === shooter.id || a.health <= 0 || a.team === shooter.team) continue; // no friendly fire
        const boxes = agentHitboxes(a);
        const dh = rayBox(origin, ray, boxes.head.min, boxes.head.max, def.range);
        const db = rayBox(origin, ray, boxes.body.min, boxes.body.max, def.range);
        const dmin = Math.min(dh, db);
        if (dmin < bestDist) {
          bestDist = dmin;
          bestAgent = a;
          bestHead = dh <= db;
        }
      }
      // tracer endpoint: clamp to weapon range so a clean miss never
      // produces an infinite coordinate (NaN bounding sphere in three.js)
      const tracerDist = Math.min(bestDist, def.range);
      const end = {
        x: eye.x + ray.x * tracerDist,
        y: eye.y + ray.y * tracerDist,
        z: eye.z + ray.z * tracerDist,
      };
      this.addTracer(eye, end, shooter.team === 'vanguard' ? 0xffd27a : 0x7ad4ff);
      this.audio.shot(def.kind, 0);
      if (bestAgent) {
        this.stats.hits++;
        const falloff = bestDist > def.range * 0.6 ? 0.7 : 1;
        const dmg = Math.round(def.damage * (bestHead ? def.headMult : 1) * falloff);
        hitRecord = this.damageAgent(bestAgent, dmg, shooter, bestHead, now);
      }
    }
    return hitRecord || { fired: true };
  }

  /** Apply damage with armor; returns the kill record or a hit record. */
  damageAgent(target, dmg, attacker, headshot, now) {
    let remaining = dmg;
    if (target.loadout.armor > 0) {
      const absorbed = Math.min(target.loadout.armor, Math.ceil(dmg * 0.5));
      target.loadout.armor -= absorbed;
      remaining -= absorbed;
    }
    target.health -= remaining;
    target.lastDamageAt = now;
    target.lastAttacker = attacker;
    if (target.health <= 0) {
      target.health = 0;
      this.stats.kills++;
      return { killed: target, by: attacker, headshot, damage: dmg };
    }
    return { hit: target, by: attacker, headshot, damage: dmg };
  }

  throwGrenade(agent, kind, dir, now) {
    const loadout = agent.loadout;
    if (loadout.grenades[kind] <= 0) return false;
    loadout.grenades[kind]--;
    const eye = agent.eyeY();
    this.grenades.push({
      kind,
      owner: agent,
      pos: { x: agent.pos.x, y: eye, z: agent.pos.z },
      vel: { x: dir.x * 13, y: dir.y * 13 + 4.5, z: dir.z * 13 },
      fuse: kind === 'he' ? 1.6 : 1.1,
      thrownAt: now,
    });
    this.audio.grenadeThrow();
    return true;
  }

  /** Grenade physics + detonation. `onKill` receives kill records. */
  tickGrenades(dt, agents, walls, now, onKill) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.pos.z += g.vel.z * dt;
      // bounce off floor and walls, simply
      if (g.pos.y < 0.12) {
        g.pos.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      const hitWall = walls.some((w) => g.pos.x > w.x - w.w / 2 && g.pos.x < w.x + w.w / 2 && g.pos.z > w.z - w.d / 2 && g.pos.z < w.z + w.d / 2 && g.pos.y < w.h);
      if (hitWall) {
        g.vel.x *= -0.4;
        g.vel.z *= -0.4;
      }
      if (g.fuse <= 0) {
        this.detonate(g, agents, walls, now, onKill);
        this.grenades.splice(i, 1);
      }
    }
  }

  detonate(g, agents, walls, now, onKill) {
    if (g.kind === 'he') {
      const def = GRENADES.he;
      this.audio.explosion();
      for (const a of agents) {
        if (a.health <= 0 || a.team === g.owner.team) continue; // no friendly fire
        const d = Math.sqrt((a.pos.x - g.pos.x) ** 2 + (a.pos.z - g.pos.z) ** 2 + (1 - g.pos.y) ** 2);
        if (d > def.radius) continue;
        // walls between the blast and the agent soak it
        if (segmentBlocked(g.pos.x, g.pos.z, a.pos.x, a.pos.z, walls)) continue;
        const dmg = Math.round(def.maxDamage * (1 - d / def.radius) + 10);
        const rec = this.damageAgent(a, dmg, g.owner, false, now);
        if (rec && rec.killed && onKill) onKill(rec);
      }
    } else {
      const def = GRENADES.flash;
      this.audio.flash();
      for (const a of agents) {
        if (a.health <= 0 || a.team === g.owner.team) continue; // no friendly fire
        const d = Math.sqrt((a.pos.x - g.pos.x) ** 2 + (a.pos.z - g.pos.z) ** 2);
        if (d > def.radius) continue;
        if (segmentBlocked(g.pos.x, g.pos.z, a.pos.x, a.pos.z, walls)) continue;
        // blind only when the agent faces the flash (forward = (-sin, -cos))
        const dx = g.pos.x - a.pos.x;
        const dz = g.pos.z - a.pos.z;
        const facing = -Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz;
        if (facing > 0) {
          a.blindedUntil = now + def.blindTime * (1 - d / def.radius * 0.5);
        }
      }
    }
  }
}
