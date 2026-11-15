// RUSTLINE — bots. Each bot is a fighter with a simple state machine:
// HOLD (guard a site), PATROL (walk the waypoint graph to an objective),
// ENGAGE (a visible enemy: aim with error, fire in bursts, strafe),
// ROTATE (move to a sound or a planted charge), PLANT / DEFUSE.
// Bots use the same weapon numbers as the player (weapons.js) and the same
// hitboxes the player's shots test against.

import * as THREE from 'three';
import { BOTS, WEAPONS } from './config.js';
import { collideCircle, findPath, nearestNode } from './world.js';
import { newLoadout, currentWeapon, canFire, fireShot, tickLoadout } from './weapons.js';

const NAMES = {
  vanguard: ['Ash', 'Bram', 'Cy'],
  sentinel: ['Vex', 'Noor', 'Kade', 'Rook', 'Sable'],
};

const BOT_SPEED = 3.9;

export class Bot {
  constructor(team, index, spawn, scene) {
    this.team = team;
    this.index = index;
    this.name = NAMES[team][index % NAMES[team].length];
    this.pos = spawn.clone();
    this.yaw = team === 'vanguard' ? 0 : Math.PI;   // attackers face north, defenders south
    this.hp = BOTS.hp;
    this.alive = true;
    this.loadout = newLoadout();
    // defenders carry rifles; attackers carry rifles too (they bought in)
    this.loadout.weapons.rifle = { ...WEAPONS.rifle, mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
    this.loadout.current = 'rifle';
    this.state = 'hold';
    this.target = null;         // enemy fighter currently engaged
    this.reaction = 0;          // counts down once a target is seen
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.path = [];             // waypoint node ids
    this.pathIndex = 0;
    this.holdNode = null;
    this.assignNode = null;     // objective node for this round
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.heardAt = null;        // last gunshot heard (Vector3)
    this.mesh = this.buildMesh(scene);
    this.eyeHeight = 1.55;
  }

  buildMesh(scene) {
    const color = this.team === 'vanguard' ? 0x2e8f7a : 0xc65a2e;
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.9 });
    const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.7 });
    // legs
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), dark);
    legs.position.y = 0.4; legs.castShadow = true;
    // torso (the body hitbox)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.32), suit);
    torso.position.y = 1.11; torso.castShadow = true;
    torso.userData = { bot: this, part: 'body' };
    // head (the head hitbox)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), skin);
    head.position.y = 1.56; head.castShadow = true;
    head.userData = { bot: this, part: 'head' };
    // helmet
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), dark);
    helm.position.y = 1.72; helm.castShadow = true;
    // gun
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), dark);
    gun.position.set(0.22, 1.25, 0.3); gun.castShadow = true;
    g.add(legs, torso, head, helm, gun);
    g.position.copy(this.pos);
    scene.add(g);
    this.bodyMesh = torso;
    this.headMesh = head;
    this.gunMesh = gun;
    return g;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  get hitMeshes() {
    return [this.bodyMesh, this.headMesh];
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      // fall over
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      return true;
    }
    return false;
  }

  reset(spawn) {
    this.pos.copy(spawn);
    this.hp = BOTS.hp;
    this.alive = true;
    this.state = 'hold';
    this.target = null;
    this.reaction = 0;
    this.burstLeft = 0;
    this.path = [];
    this.pathIndex = 0;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
    this.loadout = newLoadout();
    this.loadout.weapons.rifle = { ...WEAPONS.rifle, mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
    this.loadout.current = 'rifle';
  }

  // Assign this round's objective: a waypoint node to hold or push to.
  // 'hold' walks to the node first, then guards it; 'patrol' pushes to the
  // node and then plants (attackers) or guards it.
  assign(node, mode) {
    this.assignNode = node;
    this.holdNode = node;
    this.willHold = mode === 'hold';
    this.state = 'patrol';
    this.path = [];
    this.pathIndex = 0;
  }

  // Walk the current path one step. Returns true when the path is done.
  // If the bot stops closing on its node (a crate in the way), it sidesteps
  // perpendicular for a beat instead of pushing against the obstacle forever.
  followPath(dt, waypoints, colliders) {
    if (this.pathIndex >= this.path.length) return true;
    const nodeId = this.path[this.pathIndex];
    const [nx, nz] = waypoints.nodes[nodeId];
    const dx = nx - this.pos.x, dz = nz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { this.pathIndex++; this.stuckTimer = 0; return this.pathIndex >= this.path.length; }
    if (this.stuckTimer === undefined) this.stuckTimer = 0;
    if (this.lastDist === undefined) this.lastDist = d;
    if (d < this.lastDist - 0.01) {
      this.lastDist = d;
      this.stuckTimer = 0;
    } else {
      this.stuckTimer += dt;
    }
    let mx = dx / d, mz = dz / d;
    if (this.stuckTimer > 0.8) {
      // sidestep: perpendicular to the blocked direction, alternating sides
      const s = this.strafeDir;
      mx = -mz * s; mz = dx / d * s;
      if (this.stuckTimer > 1.6) { this.stuckTimer = 0; this.strafeDir = -this.strafeDir; }
    }
    this.pos.x += mx * BOT_SPEED * dt;
    this.pos.z += mz * BOT_SPEED * dt;
    this.yaw = Math.atan2(mx, mz);
    collideCircle(colliders, this.pos, 0.38);
    return false;
  }

  setPathTo(waypoints, nodeId) {
    const from = nearestNode(waypoints, this.pos.x, this.pos.z);
    this.path = findPath(waypoints, from, nodeId);
    this.pathIndex = 0;
    if (this.path[0] === from) this.pathIndex = 1;
  }

  // One fixed step. ctx: { now, dt, waypoints, colliders, enemies, los, sites,
  //   planted, player, hearShot } — the sim fills it in. Returns an action:
  //   null | { type: 'shot', origin, dir, weapon } | { type: 'plant' } ...
  update(ctx) {
    if (!this.alive) return null;
    const { now, dt } = ctx;
    tickLoadout(this.loadout, dt);
    const w = currentWeapon(this.loadout);
    if (w && w.mag === 0 && !this.loadout.reloading) {
      // auto-reload when the magazine runs dry
      this.loadout.reloading = true;
      this.loadout.reloadEnd = now + w.reload;
    }
    if (this.loadout.reloading && now >= this.loadout.reloadEnd) {
      const need = WEAPONS.rifle.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take; w.reserve -= take;
      this.loadout.reloading = false;
    }

    // --- senses: nearest visible enemy -------------------------------------
    let seen = null, seenD = Infinity;
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const d = this.pos.distanceTo(e.pos);
      if (d > BOTS.sightRange) continue;
      if (!ctx.los(this.eye, e.eye || e.pos.clone().setY(e.pos.y + 1.4))) continue;
      if (d < seenD) { seenD = d; seen = e; }
    }
    if (seen) {
      if (this.target !== seen) {
        this.target = seen;
        this.reaction = BOTS.reactionMin + Math.random() * (BOTS.reactionMax - BOTS.reactionMin);
        this.anchor = this.pos.clone();   // strafe around where the fight started
        this.path = [];                    // re-path from here when the fight ends
      }
    } else if (this.target && this.target.alive === false) {
      this.target = null;
      this.path = [];
    } else if (!seen) {
      this.target = null;
    }

    // --- planting / defusing (objective work beats fighting) ---------------
    // Each fires exactly once: the state moves on after the event.
    if (this.state === 'plant') {
      this.plantProgress += dt;
      if (this.plantProgress >= 3) {
        this.state = 'hold';
        return { type: 'planted', bot: this };
      }
      return null;
    }
    if (this.state === 'defuse') {
      this.defuseProgress += dt;
      if (this.defuseProgress >= 5) {
        this.state = 'hold';
        return { type: 'defused', bot: this };
      }
      return null;
    }

    // --- engage ------------------------------------------------------------
    if (this.target && this.target.alive) {
      const t = this.target;
      const tPos = t.pos.clone();
      const d = this.pos.distanceTo(tPos);
      // face the target
      this.yaw = Math.atan2(tPos.x - this.pos.x, tPos.z - this.pos.z);
      // strafe while engaging, but stay near the fight's anchor point
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.7 + Math.random() * 0.9;
        this.strafeDir = Math.random() < BOTS.strafeChance ? -this.strafeDir : this.strafeDir;
      }
      if (d > 6) {
        const ax = this.anchor ? this.anchor.x - this.pos.x : 0;
        const az = this.anchor ? this.anchor.z - this.pos.z : 0;
        const ad = Math.hypot(ax, az);
        let mx, mz;
        if (ad > 4) { mx = ax / ad; mz = az / ad; }  // drifted too far: come back
        else { mx = Math.cos(this.yaw) * this.strafeDir; mz = -Math.sin(this.yaw) * this.strafeDir; }
        this.pos.x += mx * BOT_SPEED * 0.4 * dt;
        this.pos.z += mz * BOT_SPEED * 0.4 * dt;
        collideCircle(ctx.colliders, this.pos, 0.38);
      }
      // fire in bursts once the reaction time has passed
      if (this.reaction > 0) { this.reaction -= dt; return null; }
      if (this.burstLeft <= 0) {
        if (this.burstPause > 0) { this.burstPause -= dt; return null; }
        this.burstLeft = BOTS.burstMin + Math.floor(Math.random() * (BOTS.burstMax - BOTS.burstMin + 1));
        this.burstPause = BOTS.burstPause;
      }
      const shot = fireShot(this.loadout, now);
      if (shot) {
        this.burstLeft--;
        // aim with error that grows with distance and target movement
        const aimAt = new THREE.Vector3(tPos.x, tPos.y + 1.25, tPos.z);
        const err = BOTS.aimError * (0.4 + d / 40);
        aimAt.x += (Math.random() - 0.5) * 2 * err * d;
        aimAt.y += (Math.random() - 0.5) * 2 * err * d * 0.6;
        aimAt.z += (Math.random() - 0.5) * 2 * err * d;
        const dir = aimAt.sub(this.eye).normalize();
        return { type: 'shot', origin: this.eye.clone(), dir, weapon: shot, shooter: this };
      }
      return null;
    }

    // --- rotate to a heard shot --------------------------------------------
    if (this.heardAt && this.team === 'sentinel' && this.state !== 'rotate') {
      const node = nearestNode(ctx.waypoints, this.heardAt.x, this.heardAt.z);
      this.setPathTo(ctx.waypoints, node);
      this.state = 'rotate';
      this.heardAt = null;
    }

    // --- rotate to a planted charge (defenders) ----------------------------
    if (ctx.planted && this.team === 'sentinel' && this.state !== 'defuse') {
      const node = ctx.planted.site === 'A' ? 'siteA' : 'siteB';
      this.setPathTo(ctx.waypoints, node);
      this.state = 'rotate';
      this.rotateTarget = node;
    }
    if (this.state === 'rotate' && this.rotateTarget) {
      const done = this.followPath(dt, ctx.waypoints, ctx.colliders);
      if (done) {
        if (ctx.planted && this.team === 'sentinel') {
          // at the planted site: defuse
          this.state = 'defuse';
          this.defuseProgress = 0;
        } else {
          this.state = 'hold';
          this.holdNode = this.rotateTarget;
        }
        this.rotateTarget = null;
      }
      return null;
    }

    // --- patrol / hold -------------------------------------------------------
    if (this.state === 'patrol' && this.assignNode) {
      if (!this.path.length) this.setPathTo(ctx.waypoints, this.assignNode);
      const done = this.followPath(dt, ctx.waypoints, ctx.colliders);
      if (done) {
        // reached the site: hold it, or plant it (attackers)
        if (this.team === 'vanguard' && ctx.plantSite) {
          this.state = 'plant';
          this.plantProgress = 0;
        } else {
          this.state = 'hold';
          this.holdNode = this.assignNode;
        }
      }
      return null;
    }
    // hold: idle scan, small shuffle
    return null;
  }

  // Sync the mesh to the simulated position.
  syncMesh() {
    if (!this.alive) return;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }
}
