// RUSTLINE — combat: fighter bodies, hit resolution, damage and death.
// Every fighter is a low-poly humanoid built from boxes; the head mesh is a
// separate target so headshots pay. Hit meshes carry their fighter on userData.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

// Builds a blocky humanoid. Returns { group, head, body } where body is the
// list of meshes a raycast can hit (head first, so it wins ties).
export function buildFighter(teamColor, isPlayer = false) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.8, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22201d, roughness: 0.7, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.75 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), dark);
  visor.position.set(0, 1.64, 0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), dark);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), suit);
  armL.position.set(-0.34, 1.15, 0.08);
  armL.rotation.x = -0.9;
  const armR = armL.clone();
  armR.position.x = 0.34;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), dark);
  gun.position.set(0.18, 1.28, 0.32);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), dark);
  vest.position.y = 1.18;
  group.add(torso, head, visor, legL, legR, armL, armR, gun, vest);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const body = [head, torso, vest, legL, legR, armL, armR];
  return { group, head, body, legL, legR };
}

// Resolves a hitscan result against a fighter. Returns damage dealt.
export function applyHit(fighter, hit, weaponId, sounds) {
  const def = WEAPONS[weaponId];
  if (!def || fighter.hp <= 0) return 0;
  const isHead = hit.object === fighter.parts.head;
  let dmg = def.damage * (isHead ? def.headMult : 1);
  if (fighter.armor) dmg *= 0.5;
  fighter.hp = Math.max(0, fighter.hp - dmg);
  fighter.lastDamageAt = performance.now();
  fighter.flash = 0.12;
  if (sounds && fighter.isPlayer) sounds.hurt();
  if (sounds && !fighter.isPlayer && hit.object.userData.shooterIsPlayer) sounds.hit();
  return dmg;
}

// A blood-less hit puff: a small dark burst that fades, pooled per fighter.
export function makeHitPuff(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x8a2a1a, transparent: true, opacity: 0 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, life: 0 };
}

export function showHitPuff(puff, point) {
  puff.mesh.position.copy(point);
  puff.mesh.visible = true;
  puff.mesh.material.opacity = 0.8;
  puff.life = 0.18;
}

export function updateHitPuff(puff, dt) {
  if (puff.life <= 0) return;
  puff.life -= dt;
  if (puff.life <= 0) { puff.mesh.visible = false; puff.mesh.material.opacity = 0; }
  else puff.mesh.material.opacity = (puff.life / 0.18) * 0.8;
}
