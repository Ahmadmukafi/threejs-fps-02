// RUSTLINE — weapons. A loadout holds the weapon definitions a fighter
// carries, with live ammo, bloom and reload state. Firing is hitscan: the
// caller supplies the ray; this module owns the numbers (spread, recoil,
// damage) so bots and the player share exactly the same gunplay.

import * as THREE from 'three';
import { WEAPONS, GRENADE, ARMOR } from './config.js';

// A fresh loadout: pistol + 0 grenades, no armor. Money buys the rest.
export function newLoadout() {
  return {
    weapons: {
      pistol: { ...WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    },
    current: 'pistol',
    grenades: 0,
    armor: 0,          // 0 = none, 100 = full vest
    bloom: 0,          // extra spread radians, decays over time
    lastShot: -99,
    reloading: false,
    reloadEnd: 0,
  };
}

export function buyWeapon(loadout, id, money) {
  const def = WEAPONS[id];
  if (!def || loadout.weapons[id]) return { ok: false, money };
  if (money < def.price) return { ok: false, money };
  loadout.weapons[id] = { ...def, mag: def.mag, reserve: def.reserve };
  loadout.current = id;
  return { ok: true, money: money - def.price };
}

export function buyArmor(loadout, money) {
  if (loadout.armor >= 100 || money < ARMOR.price) return { ok: false, money };
  loadout.armor = 100;
  return { ok: true, money: money - ARMOR.price };
}

export function buyGrenade(loadout, money) {
  if (loadout.grenades >= GRENADE.maxCarry || money < GRENADE.price) return { ok: false, money };
  loadout.grenades += 1;
  return { ok: true, money: money - GRENADE.price };
}

export function buyAmmo(loadout, money) {
  const w = loadout.weapons[loadout.current];
  if (!w) return { ok: false, money };
  const cost = 200;
  if (w.reserve >= w.mag * 4 || money < cost) return { ok: false, money };
  w.reserve = w.mag * 4;
  return { ok: true, money: money - cost };
}

export function currentWeapon(loadout) {
  return loadout.weapons[loadout.current];
}

// Can this loadout fire right now? (Not reloading, off cooldown, has ammo.)
export function canFire(loadout, now) {
  const w = currentWeapon(loadout);
  if (!w || loadout.reloading) return false;
  if (now - loadout.lastShot < w.rate) return false;
  return w.mag > 0;
}

// Current spread in radians: base + bloom + movement penalty.
// moving: 0 (still) .. 1 (full sprint). crouched: halves the penalty.
export function spreadOf(loadout, moving, crouched) {
  const w = currentWeapon(loadout);
  if (!w) return 0.05;
  const move = w.spread * w.movePenalty * moving * (crouched ? 0.5 : 1);
  return w.spread + loadout.bloom + move;
}

// Spend one shot: consume ammo, add bloom, stamp the time. Returns the
// weapon def, or null when it cannot fire.
export function fireShot(loadout, now) {
  if (!canFire(loadout, now)) return null;
  const w = currentWeapon(loadout);
  w.mag -= 1;
  loadout.bloom = Math.min(0.09, loadout.bloom + w.bloom);
  loadout.lastShot = now;
  return w;
}

export function startReload(loadout, now) {
  const w = currentWeapon(loadout);
  if (!w || loadout.reloading || w.reserve <= 0) return false;
  if (w.mag >= WEAPONS[w.id].mag) return false;
  loadout.reloading = true;
  loadout.reloadEnd = now + w.reload;
  return true;
}

export function finishReload(loadout, now) {
  if (!loadout.reloading || now < loadout.reloadEnd) return false;
  const w = currentWeapon(loadout);
  const need = WEAPONS[w.id].mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  loadout.reloading = false;
  return true;
}

// Bloom decays toward zero every tick.
export function tickLoadout(loadout, dt) {
  const w = currentWeapon(loadout);
  if (w) loadout.bloom = Math.max(0, loadout.bloom - w.recover * dt);
}

// Damage after armor: a vest absorbs ARMOR.absorb of the hit until it breaks.
export function applyDamage(loadout, raw) {
  if (loadout.armor > 0) {
    const absorbed = Math.min(loadout.armor, raw * ARMOR.absorb);
    loadout.armor -= absorbed;
    return raw - absorbed;
  }
  return raw;
}

// --- grenades -----------------------------------------------------------------
// A thrown grenade: simple ballistic arc, bounces once, then explodes.
export function newGrenade(origin, dir) {
  return {
    pos: origin.clone(),
    vel: dir.clone().multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(0, 4.5, 0)),
    timer: GRENADE.fuse,
    bounced: false,
    dead: false,
  };
}
