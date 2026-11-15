// RUSTLINE — the player: first-person movement, mouse look, firing input.
// Fixed-step: update(dt) runs at 60 Hz from main.js; rendering reads the
// same state, so the sim and the picture never drift apart.

import * as THREE from 'three';
import { CONFIG, WEAPONS, SITES } from './config.js';
import { collideCircle } from './world.js';

export class Player {
  constructor(scene, camera, sounds, weapons, walls) {
    this.scene = scene;
    this.camera = camera;
    this.sounds = sounds;
    this.weapons = weapons;
    this.walls = walls;
    this.pos = new THREE.Vector3(0, 0, 18);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.armor = false;
    this.money = CONFIG.economy.startMoney;
    this.weaponId = 'p9';
    this.mag = WEAPONS.p9.mag;
    this.reserve = WEAPONS.p9.reserve;
    this.grenades = 0;
    this.bloom = 0;
    this.recoil = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.plantTimer = 0;
    this.defuseTimer = 0;
    this.alive = true;
    this.crouched = false;
    this.onGround = true;
    this.vy = 0;
    this.kills = 0;
    this.keys = {};
    this.mouseDown = false;
    this.yawRate = 0; // set by bots/spectator when they drive the camera
    this.spectate = null;
    this.stepTimer = 0;
    this.isPlayer = true;
    this.team = 'vanguard';
    this.parts = null;
    camera.rotation.order = 'YXZ';
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.bloom = 0;
    this.recoil = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.plantTimer = 0;
    this.defuseTimer = 0;
    this.spectate = null;
    this.vy = 0;
  }

  lookAt(x, z) {
    this.yaw = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
  }

  get eye() {
    const h = this.crouched ? CONFIG.player.eyeHeight - 0.45 : CONFIG.player.eyeHeight;
    return new THREE.Vector3(this.pos.x, h + this.pos.y, this.pos.z);
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  get moving() {
    return this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD'];
  }

  update(dt, game) {
    if (!this.alive) return;
    // Timers decay.
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 1.4);
    this.recoil = Math.max(0, this.recoil - dt * 0.35);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const def = WEAPONS[this.weaponId];
        const need = def.mag - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
    // Movement: accelerate toward the wish direction, friction otherwise.
    const speed = this.crouched ? CONFIG.player.crouchSpeed : CONFIG.player.walkSpeed;
    let ix = 0, iz = 0;
    if (this.keys['KeyW']) iz -= 1;
    if (this.keys['KeyS']) iz += 1;
    if (this.keys['KeyA']) ix -= 1;
    if (this.keys['KeyD']) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    // Rotate the camera-space input (W = -z forward) by the yaw into world
    // space: world = (ix·cos + iz·sin, -ix·sin + iz·cos).
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos + iz * sin;
    const wz = -ix * sin + iz * cos;
    this.vel.x += wx * CONFIG.player.accel * dt;
    this.vel.z += wz * CONFIG.player.accel * dt;
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const maxV = speed * (this.keys['ShiftLeft'] ? 0.55 : 1);
    if (hv > maxV) { this.vel.x *= maxV / hv; this.vel.z *= maxV / hv; }
    if (len === 0) {
      const f = Math.max(0, 1 - CONFIG.player.friction * dt);
      this.vel.x *= f; this.vel.z *= f;
    }
    // Integrate with axis-separated collision so walls slide, never stick.
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z;
    let c = collideCircle(nx, nz, CONFIG.player.radius, this.walls);
    this.pos.x = c.x;
    nx = this.pos.x;
    nz = this.pos.z + this.vel.z * dt;
    c = collideCircle(nx, nz, CONFIG.player.radius, this.walls);
    this.pos.z = c.z;
    // Vertical: simple gravity + jump.
    if (this.keys['Space'] && this.onGround) { this.vy = CONFIG.player.jumpSpeed; this.onGround = false; }
    this.vy -= CONFIG.player.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    // Footsteps.
    if (hv > 1.5 && this.onGround) {
      this.stepTimer -= dt * hv;
      if (this.stepTimer <= 0) { this.stepTimer = 2.2; this.sounds.step(); }
    }
    // Firing: hold for autos, click for semi-autos (mouseDown edge handled by game).
    const def = WEAPONS[this.weaponId];
    const wantFire = def.auto ? this.mouseDown : this.mouseDown && !this._fired;
    if (wantFire && this.fireCooldown <= 0 && this.reloadTimer <= 0 && this.mag > 0 && game.phase === 'live') {
      this._fired = true;
      this.fireCooldown = def.rate;
      this.mag -= 1;
      const origin = this.eye;
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
      dir.y += this.recoil * 0.6;
      game.shoot(this, origin, dir);
      if (this.mag === 0) this.sounds.dryFire();
    }
    if (!this.mouseDown) this._fired = false;
    // Camera follows the body, with recoil kick on pitch.
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0);
    this.weapons.viewmodel.visible = true;
    // Plant / defuse channels: hold E inside a site while the bomb state fits.
    this.updateChannel(dt, game);
  }

  updateChannel(dt, game) {
    const inSite = (s) => {
      const dx = this.pos.x - s.x, dz = this.pos.z - s.z;
      return dx * dx + dz * dz < s.r * s.r;
    };
    const want = this.keys['KeyE'];
    if (want && game.phase === 'live') {
      if (game.bombState === 'carried' && this.team === 'vanguard' && (inSite(SITES.A) || inSite(SITES.B))) {
        this.plantTimer += dt;
        if (this.plantTimer >= CONFIG.round.plantSeconds) {
          this.plantTimer = 0;
          game.plantBomb(inSite(SITES.A) ? 'A' : 'B', this);
        }
        return;
      }
      if (game.bombState === 'planted' && this.team === 'sentinel') {
        const s = SITES[game.bombSite];
        if (inSite(s)) {
          this.defuseTimer += dt;
          if (this.defuseTimer >= CONFIG.round.defuseSeconds) {
            this.defuseTimer = 0;
            game.defuseBomb(this);
          }
          return;
        }
      }
    }
    this.plantTimer = 0;
    this.defuseTimer = 0;
  }

  buy(id) {
    const def = WEAPONS[id];
    if (!def || this.money < def.price) return false;
    if (def.armor) { if (this.armor) return false; this.armor = true; }
    else if (def.grenade) { if (this.grenades >= 2) return false; this.grenades += 1; }
    else {
      this.weaponId = id;
      this.mag = def.mag;
      this.reserve = def.reserve;
      this.weapons.equip(id, this.camera);
    }
    this.money -= def.price;
    return true;
  }

  throwGrenade(game) {
    if (this.grenades <= 0 || !this.alive) return;
    this.grenades -= 1;
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    dir.y += 0.35;
    dir.normalize();
    game.spawnGrenade(this.eye, dir.multiplyScalar(13));
  }

  die(killer) {
    this.alive = false;
    this.mouseDown = false;
    this.weapons.viewmodel.visible = false;
    if (killer) killer.kills = (killer.kills || 0) + 1;
  }
}
