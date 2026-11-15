// RUSTLINE — round 3. The human player: pointer-lock mouse look, WASD with
// acceleration and friction, crouch, jump, and collision against the map.
// Movement punishes accuracy (see weapons.js): stopping to aim pays.
import * as THREE from 'three';
import { MOVE } from './config.js';
import { collideCircle, clamp } from './util.js';

export class PlayerController {
  constructor(agent, camera, dom, audio) {
    this.agent = agent;
    this.camera = camera;
    this.dom = dom;
    this.audio = audio;
    this.keys = new Set();
    this.yaw = agent.yaw;
    this.pitch = 0;
    this.vel = { x: 0, z: 0 };
    this.y = 0; // jump height
    this.vy = 0;
    this.locked = false;
    this.stepAcc = 0;
    this.onShoot = null; // (dir) => void, set by main
    this.onReload = null;
    this.onGrenade = null; // (kind) => void
    this.onBuyToggle = null;
    this.onSwitch = null; // (weaponId) => void
    this._bind();
  }

  _bind() {
    const dom = this.dom;
    dom.addEventListener('click', () => {
      if (!this.locked && this.agent.health > 0) dom.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    });
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR' && this.onReload) this.onReload();
      if (e.code === 'KeyB' && this.onBuyToggle) this.onBuyToggle();
      if (e.code === 'Digit1' && this.onSwitch) this.onSwitch('p9');
      if (e.code === 'Digit2' && this.onSwitch) this.onSwitch('vk47');
      if (e.code === 'Digit3' && this.onSwitch) this.onSwitch('raptor');
      if (e.code === 'Digit4' && this.onSwitch) this.onSwitch('longshot');
      if (e.code === 'Digit5' && this.onSwitch) this.onSwitch('breacher');
      if (e.code === 'KeyG' && this.onGrenade) this.onGrenade('he');
      if (e.code === 'KeyF' && this.onGrenade) this.onGrenade('flash');
      if (e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.agent.weaponState.triggerHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.agent.weaponState.triggerHeld = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** One fixed step. Returns nothing; writes agent.pos/yaw/speed. */
  tick(dt, walls, now) {
    const a = this.agent;
    a.yaw = this.yaw;
    const crouched = this.keys.has('ControlLeft') || this.keys.has('KeyC');
    a.crouched = crouched;

    // wish direction in world space
    let ix = 0;
    let iz = 0;
    if (this.keys.has('KeyW')) iz += 1;
    if (this.keys.has('KeyS')) iz -= 1;
    if (this.keys.has('KeyA')) ix -= 1;
    if (this.keys.has('KeyD')) ix += 1;
    const ilen = Math.hypot(ix, iz) || 1;
    ix /= ilen;
    iz /= ilen;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Camera forward is (-sin(yaw), -cos(yaw)) in XZ (three.js looks down -Z).
    const wx = -sin * iz + cos * ix;
    const wz = -cos * iz - sin * ix;

    const maxSpeed = crouched ? MOVE.crouchSpeed : (this.keys.has('ShiftLeft') ? MOVE.runSpeed : MOVE.walkSpeed);
    const accel = a.y > 0.01 ? MOVE.airAccel : MOVE.accel;
    this.vel.x += wx * accel * dt;
    this.vel.z += wz * accel * dt;
    // friction when no input
    if (ix === 0 && iz === 0) {
      const f = Math.max(0, 1 - MOVE.friction * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > maxSpeed) {
      this.vel.x *= maxSpeed / sp;
      this.vel.z *= maxSpeed / sp;
    }
    const out = { x: 0, z: 0 };
    collideCircle(a.pos.x + this.vel.x * dt, a.pos.z + this.vel.z * dt, MOVE.radius, walls, out);
    a.pos.x = out.x;
    a.pos.z = out.z;
    a.speed2D = Math.hypot(this.vel.x, this.vel.z);

    // jump
    if (this.keys.has('Space') && a.y <= 0.01) {
      this.vy = MOVE.jumpSpeed;
      a.y = 0.01;
    }
    if (a.y > 0 || this.vy !== 0) {
      this.vy -= MOVE.gravity * dt;
      a.y += this.vy * dt;
      if (a.y <= 0) {
        a.y = 0;
        this.vy = 0;
      }
    }

    // footsteps
    this.stepAcc += a.speed2D * dt;
    if (this.stepAcc > 2.2 && a.speed2D > 1) {
      this.stepAcc = 0;
      this.audio.step();
    }

    // camera
    const eye = a.eyeY();
    this.camera.position.set(a.pos.x, eye + a.y, a.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    a.pitch = this.pitch;
  }

  /** Aim direction from the camera (unit vector). Camera forward is
   * (-sin(yaw), -cos(yaw)) in XZ, matching three.js -Z look direction. */
  aimDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  release() {
    this.keys.clear();
    this.agent.weaponState.triggerHeld = false;
  }
}
