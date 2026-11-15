// RUSTLINE — the player. First-person movement with acceleration and
// friction, mouse look with recoil kick, crouching and jumping, and AABB
// collision against the map. The simulation steps at a fixed 60 Hz; this
// module owns only the player's own state.

import * as THREE from 'three';
import { MOVE } from './config.js';
import { collideCircle } from './world.js';

export class Player {
  constructor(spawn) {
    this.team = 'vanguard';
    this.pos = spawn.clone();          // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;                      // facing north (-z), toward the defenders
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.crouched = false;
    this.onGround = true;
    this.eyeHeight = MOVE.eyeStand;
    this.recoil = 0;                   // camera kick, decays
    this.moveAmount = 0;               // 0 still .. 1 full sprint (for spread)
    this.keys = {};
    this.sprinting = false;
    this.stepAcc = 0;                  // footstep timer
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  // Forward / right vectors on the ground plane, from the yaw.
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
  }

  addRecoil(amount) {
    this.recoil += amount;
    this.pitch += amount * 0.55;
  }

  // One fixed step. input: { f, r, jump, sprint, crouch } in -1..1.
  // Returns true when a footstep sound should play.
  step(dt, input, colliders, onStep) {
    if (!this.alive) return false;
    const k = this.keys;
    const f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    const r = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    this.sprinting = !!k['ShiftLeft'] && f > 0 && !this.crouched;
    this.crouched = !!k['ControlLeft'] || !!k['KeyC'];

    const targetEye = this.crouched ? MOVE.eyeCrouch : MOVE.eyeStand;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    const speed = this.crouched ? MOVE.crouchSpeed
      : this.sprinting ? MOVE.sprintSpeed : MOVE.walkSpeed;
    const fw = this.forward(), rt = this.right();
    const wish = new THREE.Vector3()
      .addScaledVector(fw, f)
      .addScaledVector(rt, r);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);

    // accelerate toward the wish velocity, friction when idle
    const accel = this.onGround ? MOVE.accel : MOVE.airAccel;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt / speed * 2.2);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt / speed * 2.2);
    if (f === 0 && r === 0 && this.onGround) {
      const fr = Math.max(0, 1 - MOVE.friction * dt);
      this.vel.x *= fr; this.vel.z *= fr;
    }

    // gravity + jump
    this.vel.y -= MOVE.gravity * dt;
    if (input.jump && this.onGround) {
      this.vel.y = MOVE.jumpSpeed;
      this.onGround = false;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }

    collideCircle(colliders, this.pos, MOVE.radius);

    // recoil decays; movement amount for the spread model
    this.recoil = Math.max(0, this.recoil - dt * 0.12);
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.moveAmount = Math.min(1, planar / MOVE.walkSpeed);

    // footsteps
    let stepped = false;
    if (planar > 1.2 && this.onGround) {
      this.stepAcc += planar * dt;
      if (this.stepAcc > 2.4) { this.stepAcc = 0; stepped = true; }
    }
    if (stepped && onStep) onStep();
    return stepped;
  }

  // Apply the camera to a three.js camera object.
  applyCamera(camera) {
    camera.position.copy(this.eye);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch + this.recoil;
    camera.rotation.z = 0;
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  reset(spawn) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.recoil = 0;
    this.keys = {};
  }
}
