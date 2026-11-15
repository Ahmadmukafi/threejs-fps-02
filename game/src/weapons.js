// RUSTLINE — weapons: firing, spread, recoil, tracers, muzzle flash, grenades.
// A weapon is plain state; the viewmodel and the tracer pool are built once
// and reused, so firing never allocates in the hot loop.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

const TRACER_MAX = 24;

export class WeaponSet {
  constructor(scene, sounds) {
    this.scene = scene;
    this.sounds = sounds;
    // Reused tracer pool: thin stretched boxes faded out over 90 ms.
    this.tracers = [];
    for (let i = 0; i < TRACER_MAX; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.02, 1),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    this.tracerIdx = 0;
    // Muzzle flash: a small additive sprite at the gun tip.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.flashLife = 0;
    scene.add(this.flash);
    // Viewmodel: a chunky low-poly gun parented to the camera, rebuilt per weapon.
    this.viewmodel = new THREE.Group();
    this.viewmodelParts = [];
    scene.add(this.viewmodel);
    this.current = null;
  }

  equip(id, camera) {
    this.current = id;
    for (const p of this.viewmodelParts) this.viewmodel.remove(p);
    this.viewmodelParts = [];
    const def = WEAPONS[id];
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.5, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: id === 'longbow' ? 0x6b4a1e : 0x3a3f45, roughness: 0.45, metalness: 0.6 });
    const barrelLen = id === 'longbow' ? 0.85 : id === 'ar77' ? 0.62 : 0.42;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, barrelLen), dark);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), accent);
    grip.position.set(0, -0.14, 0.14);
    grip.rotation.x = 0.3;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), accent);
    mag.position.set(0, -0.13, -0.05);
    this.viewmodel.add(body, grip, mag);
    this.viewmodelParts.push(body, grip, mag);
    if (id === 'longbow') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      this.viewmodel.add(scope);
      this.viewmodelParts.push(scope);
    }
    // Positioned bottom-right of the camera; the camera owns the group.
    this.viewmodel.position.set(0.26, -0.24, -0.5);
    camera.add(this.viewmodel);
    return def;
  }

  // Fires one hitscan shot. Returns the hit record (or null) for the caller.
  // The weapon stats come from the SHOOTER's own weapon id, not from shared
  // state: the WeaponSet is shared by all fighters, so a global "current"
  // weapon would make every bot fire the player's gun.
  fire(shooter, dir, origin, moving, crouched, raycastTargets) {
    const def = WEAPONS[shooter.weaponId];
    if (!def) return null;
    // Spread grows with movement and bloom; crouching halves it.
    let spread = def.spread + shooter.bloom * 0.02;
    if (moving) spread += def.moveSpread;
    if (crouched) spread *= 0.5;
    const d = dir.clone();
    d.x += (Math.random() - 0.5) * spread * 2;
    d.y += (Math.random() - 0.5) * spread * 2;
    d.z += (Math.random() - 0.5) * spread * 2;
    d.normalize();
    this.sounds.shot(shooter.weaponId);
    this.spawnTracer(origin, d, def.range);
    this.flashAt(origin, d);
    shooter.bloom = Math.min(1, shooter.bloom + (shooter.weaponId === 'longbow' ? 0.9 : 0.22));
    shooter.recoil = Math.min(0.09, shooter.recoil + (shooter.weaponId === 'longbow' ? 0.085 : 0.02));
    const ray = new THREE.Raycaster(origin, d, 0.1, def.range);
    const hits = ray.intersectObjects(raycastTargets, false);
    if (!hits.length) return { hit: false };
    const h = hits[0];
    return { hit: true, point: h.point, object: h.object, distance: h.distance };
  }

  spawnTracer(origin, dir, range) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % TRACER_MAX;
    const end = origin.clone().addScaledVector(dir, range);
    const mid = origin.clone().add(end).multiplyScalar(0.5);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(end);
    t.mesh.scale.set(1, 1, origin.distanceTo(end));
    t.mesh.material.opacity = 0.85;
    t.mesh.visible = true;
    t.life = 0.09;
  }

  flashAt(origin, dir) {
    this.flash.position.copy(origin).addScaledVector(dir, 0.6);
    this.flash.lookAt(origin.clone().addScaledVector(dir, 2));
    this.flash.material.opacity = 0.9;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flashLife = 0.05;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; }
      else t.mesh.material.opacity = (t.life / 0.09) * 0.85;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.material.opacity = 0;
    }
  }
}

// A thrown Spark grenade: arced flight, then an area blast after 1.4 s.
export class Grenade {
  constructor(scene, pos, vel) {
    this.scene = scene;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xc7a23a, roughness: 0.4, metalness: 0.8 }),
    );
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
    this.timer = 1.4;
    this.done = false;
    this.blast = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa03c, transparent: true, opacity: 0 }),
    );
    scene.add(this.blast);
    this.blastLife = 0;
  }

  update(dt, onBlast) {
    if (this.done) {
      if (this.blastLife > 0) {
        this.blastLife -= dt;
        this.blast.material.opacity = Math.max(0, this.blastLife / 0.35) * 0.55;
        const s = 1 + (0.35 - this.blastLife) * 14;
        this.blast.scale.set(s, s, s);
        if (this.blastLife <= 0) this.blast.visible = false;
      }
      return;
    }
    this.timer -= dt;
    this.vel.y -= 12 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0.09) { this.pos.y = 0.09; this.vel.y *= -0.35; this.vel.x *= 0.7; this.vel.z *= 0.7; }
    this.mesh.position.copy(this.pos);
    if (this.timer <= 0) {
      this.done = true;
      this.scene.remove(this.mesh);
      this.blast.position.copy(this.pos);
      this.blast.visible = true;
      this.blastLife = 0.35;
      onBlast(this.pos);
    }
  }
}
