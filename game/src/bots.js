// RUSTLINE — bots: waypoint navigation, perception, and combat behaviour.
// One bot is one state machine: HOLD / PATROL / ENGAGE / ROTATE / PLANT /
// DEFUSE. Perception is a cheap 2D sight test (distance, field of view and
// the wall occlusion test from world.js), so eight bots think for free.

import * as THREE from 'three';
import { CONFIG, WEAPONS, WAYPOINTS, SITES } from './config.js';
import { buildFighter } from './combat.js';
import { findPath, nearestWaypoint, collideCircle, segmentBlocked } from './world.js';

const NAMES = ['Ash', 'Bram', 'Cy', 'Dara', 'Ember', 'Falk', 'Gwen', 'Hale', 'Ivo', 'Juno'];

export class Bot {
  constructor(scene, team, index, walls, sounds, weapons) {
    this.scene = scene;
    this.team = team; // 'vanguard' | 'sentinel'
    this.name = NAMES[index % NAMES.length];
    this.walls = walls;
    this.sounds = sounds;
    this.weapons = weapons;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.hp = 100;
    this.armor = false;
    this.alive = true;
    this.isPlayer = false;
    this.weaponId = ['p9', 'vex9', 'ar77'][index % 3];
    this.mag = WEAPONS[this.weaponId].mag;
    this.reserve = WEAPONS[this.weaponId].reserve;
    this.bloom = 0;
    this.recoil = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.kills = 0;
    this.state = 'HOLD';
    this.prevState = 'HOLD';
    this.hearCooldown = 0;
    this.rotateTimer = 0;
    this.rotateTarget = null;
    this.path = [];
    this.pathIdx = 0;
    this.wpTimer = 0;
    this.wpBest = Infinity;
    this.target = null; // current visible enemy fighter
    this.reactTimer = 0;
    this.thinkTimer = Math.random() * CONFIG.bot.thinkEvery;
    this.aimError = (Math.random() - 0.5) * 2 * CONFIG.bot.aimError;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.sidestep = 0;
    this.holdPoint = null;
    this.scanBase = null;
    this.scanPhase = Math.random() * Math.PI * 2;
    this.channelTimer = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0.8 + Math.random() * 0.7;
    this.flash = 0;
    this.lastDamageAt = 0;
    this.color = team === 'vanguard' ? CONFIG.colors.vanguard : CONFIG.colors.sentinel;
    this.parts = buildFighter(this.color);
    this.parts.group.visible = false;
    scene.add(this.parts.group);
    this.hitMeshes = this.parts.body;
    for (const m of this.hitMeshes) m.userData.fighter = this;
    this.puff = null;
  }

  reset(x, z, yaw, holdWp) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.hp = 100;
    this.alive = true;
    this.state = 'HOLD';
    this.prevState = 'HOLD';
    this.hearCooldown = 0;
    this.rotateTimer = 0;
    this.rotateTarget = null;
    this.path = [];
    this.pathIdx = 0;
    this.wpTimer = 0;
    this.wpBest = Infinity;
    this.target = null;
    this.channelTimer = 0;
    this.mag = WEAPONS[this.weaponId].mag;
    this.reserve = WEAPONS[this.weaponId].reserve;
    this.holdPoint = holdWp;
    this.parts.group.visible = true;
    this.parts.group.position.set(x, 0, z);
    this.parts.group.rotation.y = yaw;
    this.lastPos.copy(this.pos);
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, 1.55, this.pos.z);
  }

  // 2D sight test: in range, inside a 100-degree cone, and no tall wall between.
  canSee(fighter) {
    if (!fighter.alive) return false;
    const dx = fighter.pos.x - this.pos.x;
    const dz = fighter.pos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > CONFIG.bot.sightRange * CONFIG.bot.sightRange) return false;
    const dist = Math.sqrt(d2);
    const ang = Math.atan2(-dx, -dz);
    let diff = ang - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.95 && dist > 3) return false;
    if (segmentBlocked(this.pos.x, this.pos.z, fighter.pos.x, fighter.pos.z, this.walls)) return false;
    return true;
  }

  // Assign a new route and reset the progress tracker for its first leg.
  setPath(path) {
    this.path = path;
    this.pathIdx = 0;
    this.wpTimer = 0;
    this.wpBest = Infinity;
    this.scanBase = null;
  }

  // Pick a route objective for this round: attackers push a site, defenders
  // hold a lane. The site is chosen once per round so the team splits.
  chooseObjective(game, siteKey) {
    const site = SITES[siteKey];
    const from = nearestWaypoint(this.pos.x, this.pos.z);
    let to;
    if (this.team === 'vanguard') {
      to = nearestWaypoint(site.x, site.z);
    } else {
      // Defenders spread across the three lanes facing south.
      const laneWp = [2, 5, 10, 13, 15, 16];
      to = laneWp[Math.floor(Math.random() * laneWp.length)];
    }
    this.setPath(findPath(from, to));
    this.state = this.team === 'vanguard' ? 'PATROL' : 'HOLD';
  }

  hearShot(pos) {
    if (!this.alive) return;
    // A bot that is already reacting, fighting, or planting ignores the
    // noise; constant re-triggering would pin it in place forever.
    if (this.state === 'ROTATE' || this.state === 'ENGAGE' || this.state === 'PLANT' || this.state === 'DEFUSE') return;
    if (this.hearCooldown > 0) return;
    const dx = pos.x - this.pos.x, dz = pos.z - this.pos.z;
    if (dx * dx + dz * dz > CONFIG.bot.hearRange * CONFIG.bot.hearRange) return;
    this.hearCooldown = 2.0;
    this.prevState = this.state;
    this.state = 'ROTATE';
    this.rotateTarget = { x: pos.x, z: pos.z };
    this.rotateTimer = 1.2;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.hearCooldown = Math.max(0, this.hearCooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 1.2);
    this.flash = Math.max(0, this.flash - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const def = WEAPONS[this.weaponId];
        const take = Math.min(def.mag - this.mag, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    }
    // Think on a slow tick: perception, state choice, re-pathing.
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = CONFIG.bot.thinkEvery;
      this.think(game);
    }
    // Act every tick: move along the path, aim, shoot, channel.
    this.act(dt, game);
    // Animate the body: walk cycle on the legs, lean into the aim.
    const moving = this.pathIdx < this.path.length;
    const t = performance.now() / 1000;
    const swing = moving ? Math.sin(t * 9) * 0.45 : 0;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.group.position.set(this.pos.x, 0, this.pos.z);
    this.parts.group.rotation.y = this.yaw;
    // Flash red briefly when hit.
    this.parts.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.setHex(this.flash > 0 ? 0x881111 : 0x000000);
      }
    });
  }

  think(game) {
    // Find the nearest visible enemy.
    let best = null, bd = Infinity;
    for (const f of game.fighters) {
      if (f === this || f.team === this.team || !f.alive) continue;
      const dx = f.pos.x - this.pos.x, dz = f.pos.z - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd && this.canSee(f)) { bd = d; best = f; }
    }
    if (best) {
      if (this.target !== best) {
        this.target = best;
        this.reactTimer = CONFIG.bot.reactMin + Math.random() * (CONFIG.bot.reactMax - CONFIG.bot.reactMin);
        this.aimError = (Math.random() - 0.5) * 2 * CONFIG.bot.aimError;
      }
      this.state = 'ENGAGE';
      return;
    }
    this.target = null;
    // No enemy: objective behaviour.
    if (game.phase !== 'live') { this.state = 'HOLD'; return; }
    if (this.team === 'vanguard' && game.bombState === 'carried' && game.carrier === this) {
      // I carry the charge: push the site and plant.
      const site = SITES[game.attackSite];
      const d = Math.hypot(this.pos.x - site.x, this.pos.z - site.z);
      if (d < site.r) { this.state = 'PLANT'; return; }
      if (this.state !== 'PATROL') this.chooseObjective(game, game.attackSite);
      return;
    }
    if (this.team === 'sentinel' && game.bombState === 'planted') {
      const site = SITES[game.bombSite];
      const d = Math.hypot(this.pos.x - site.x, this.pos.z - site.z);
      if (d < site.r + 1) { this.state = 'DEFUSE'; return; }
      if (this.state !== 'PATROL') {
        const from = nearestWaypoint(this.pos.x, this.pos.z);
        this.setPath(findPath(from, nearestWaypoint(site.x, site.z)));
        this.state = 'PATROL';
      }
      return;
    }
    if (this.state === 'ROTATE') {
      this.rotateTimer -= CONFIG.bot.thinkEvery;
      // Return to whatever the bot was doing; the route is kept, so a
      // gunshot glance never abandons the objective.
      if (this.rotateTimer <= 0) this.state = this.prevState || 'HOLD';
      return;
    }
    if (this.state === 'HOLD' && this.holdPoint != null) {
      // Drift to the hold point, then watch.
      const wp = WAYPOINTS[this.holdPoint];
      const d = Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z);
      if (d > 2) {
        const from = nearestWaypoint(this.pos.x, this.pos.z);
        this.setPath(findPath(from, this.holdPoint));
        this.state = 'PATROL';
      }
    }
  }

  act(dt, game) {
    // ENGAGE: face the target, fire in bursts once the reaction passes.
    if (this.state === 'ENGAGE' && this.target && this.target.alive) {
      const dx = this.target.pos.x - this.pos.x;
      const dz = this.target.pos.z - this.pos.z;
      const want = Math.atan2(-dx, -dz);
      this.yaw = this.turnToward(want, dt * 6);
      this.reactTimer -= dt;
      if (this.reactTimer <= 0 && this.fireCooldown <= 0 && this.reloadTimer <= 0) {
        if (this.mag <= 0) { this.reloadTimer = WEAPONS[this.weaponId].reload; this.sounds.reload(); }
        else if (this.burstLeft <= 0 && this.burstPause <= 0) {
          this.burstLeft = this.weaponId === 'ar77' ? 3 : this.weaponId === 'vex9' ? 5 : 1;
          // Re-roll the aim error each burst: a single bad roll must never
          // doom a whole engagement.
          this.aimError = (Math.random() - 0.5) * 2 * CONFIG.bot.aimError;
        }
        if (this.burstLeft > 0) {
          this.burstLeft -= 1;
          this.fireCooldown = WEAPONS[this.weaponId].rate;
          this.mag -= 1;
          const origin = this.eye;
          const dir = new THREE.Vector3(
            -Math.sin(this.yaw) + this.aimError + (Math.random() - 0.5) * 0.02,
            (this.target.pos.y + 1.3 - 1.55) / Math.max(1, Math.hypot(dx, dz)) + (Math.random() - 0.5) * 0.02,
            -Math.cos(this.yaw) + (Math.random() - 0.5) * 0.02,
          ).normalize();
          game.shoot(this, origin, dir);
          if (this.burstLeft === 0) this.burstPause = 0.5 + Math.random() * 0.5;
        }
      }
      if (this.burstPause > 0) this.burstPause -= dt;
      // Strafe around the fight: sidestep perpendicular to the aim so the
      // duel moves and the bot is harder to track.
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 0.8 + Math.random() * 0.7; }
      const sx = Math.cos(this.yaw) * this.strafeDir * 1.4 * dt;
      const sz = -Math.sin(this.yaw) * this.strafeDir * 1.4 * dt;
      const c = collideCircle(this.pos.x + sx, this.pos.z + sz, 0.42, this.walls);
      if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 0.005) this.strafeDir *= -1;
      this.pos.x = c.x; this.pos.z = c.z;
      return; // no path walking while shooting
    }
    // PLANT / DEFUSE: channel, then the game resolves it.
    if (this.state === 'PLANT' && game.bombState === 'carried' && game.carrier === this) {
      this.channelTimer += dt;
      if (this.channelTimer >= 3) {
        this.channelTimer = 0;
        game.plantBomb(game.attackSite, this);
      }
      return;
    }
    if (this.state === 'DEFUSE' && game.bombState === 'planted') {
      this.channelTimer += dt;
      if (this.channelTimer >= 5) {
        this.channelTimer = 0;
        game.defuseBomb(this);
      }
      return;
    }
    this.channelTimer = 0;
    // PATROL / ROTATE / HOLD: walk the path.
    if (this.pathIdx < this.path.length) {
      const wp = WAYPOINTS[this.path[this.pathIdx]];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9) { this.pathIdx += 1; this.wpTimer = 0; this.wpBest = Infinity; return; }
      // Safety valve: a waypoint the bot stops making progress toward
      // (blocked by a prop, orbiting) is skipped after 4 s of no progress,
      // instead of trapping the bot. Steady progress resets the timer, so
      // long legs are never cut short.
      if (d < this.wpBest - 0.05) { this.wpBest = d; this.wpTimer = 0; }
      else {
        this.wpTimer += dt;
        if (this.wpTimer > 4) { this.pathIdx += 1; this.wpTimer = 0; this.wpBest = Infinity; return; }
      }
      const want = Math.atan2(-dx, -dz);
      this.yaw = this.turnToward(want, dt * 5);
      const speed = 3.4;
      let mx = Math.sin(this.yaw) * -1 * speed * dt * -1;
      // Move along the facing direction (forward = -sin, -cos).
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      let nx = this.pos.x + fx * speed * dt;
      let nz = this.pos.z + fz * speed * dt;
      // Sidestep when stuck: strafe sideways for a while.
      if (this.sidestep > 0) {
        this.sidestep -= dt;
        nx = this.pos.x + Math.cos(this.yaw) * speed * 0.7 * dt;
        nz = this.pos.z - Math.sin(this.yaw) * speed * 0.7 * dt;
      }
      const c = collideCircle(nx, nz, 0.42, this.walls);
      const moved = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      this.pos.x = c.x; this.pos.z = c.z;
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.5) {
        if (moved < 0.05) { this.sidestep = 0.7; this.stuckTimer = 0; }
        else this.stuckTimer = 0;
      }
      void mx;
    } else if (this.state === 'ROTATE' && this.rotateTarget) {
      const dx = this.rotateTarget.x - this.pos.x, dz = this.rotateTarget.z - this.pos.z;
      this.yaw = this.turnToward(Math.atan2(-dx, -dz), dt * 5);
    } else if (this.state === 'HOLD') {
      // Watch the sector: sweep the view ±51° around the arrival heading so
      // a bot holding a lane actually sees the enemy push through it.
      if (this.scanBase === null) this.scanBase = this.yaw;
      const t = performance.now() / 1000;
      this.yaw = this.scanBase + Math.sin(t * 0.6 + this.scanPhase) * 0.9;
    }
  }

  turnToward(want, maxStep) {
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    let yaw = this.yaw + step;
    while (yaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw < -Math.PI) yaw += Math.PI * 2;
    return yaw;
  }

  die(killer) {
    this.alive = false;
    this.parts.group.visible = false;
    this.state = 'HOLD';
    if (killer) killer.kills = (killer.kills || 0) + 1;
  }
}
