// RUSTLINE — round 3. Weapon state: one owned weapon per agent plus a
// sidearm, with a fire model where stopping to aim pays — spread grows with
// movement and with sustained fire, and decays when the trigger is released.
import { WEAPONS, GRENADES } from './config.js';

/** A fresh loadout: sidearm always owned, primary bought. */
export function makeLoadout() {
  return {
    weapons: { p9: { id: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve } },
    current: 'p9',
    grenades: { he: 0, flash: 0 },
    vest: false,
    armor: 0,
  };
}

export function buyWeapon(loadout, id) {
  const def = WEAPONS[id];
  if (!def || loadout.weapons[id]) return false;
  loadout.weapons[id] = { id, mag: def.mag, reserve: def.reserve };
  loadout.current = id;
  return true;
}

export function buyGrenade(loadout, id) {
  if (!GRENADES[id]) return false;
  if (loadout.grenades[id] >= 2) return false;
  loadout.grenades[id]++;
  return true;
}

export function buyVest(loadout) {
  if (loadout.vest) return false;
  loadout.vest = true;
  loadout.armor = 50;
  return true;
}

/** Per-agent live weapon state, reset every round. */
export function makeWeaponState() {
  return {
    spreadBloom: 0, // 0..1, grows while firing, decays while idle
    lastShotAt: -10,
    reloading: false,
    reloadEndAt: 0,
    reloadWeapon: null,
    switchEndAt: 0,
    burstCount: 0, // shots fired inside the current burst (bots)
    burstEndAt: 0,
    triggerHeld: false,
  };
}

/** Current spread in degrees for an agent holding `def`. */
export function currentSpreadDeg(def, st, speed, crouched, now) {
  let s = def.spread;
  // movement punishes accuracy: firing on the move spreads wide
  s *= 1 + (speed / 5.6) * def.moveSpread;
  if (crouched) s *= 0.7;
  // bloom from sustained fire
  s *= 1 + st.spreadBloom * 1.6;
  // first shot after a pause is the steadiest
  if (now - st.lastShotAt > 0.4) s *= 0.85;
  return s;
}

/** Can the agent fire right now? Returns a reason string or null. */
export function fireBlockReason(loadout, st, now) {
  const w = loadout.weapons[loadout.current];
  if (!w) return 'no weapon';
  if (st.reloading) return 'reloading';
  if (now < st.switchEndAt) return 'switching';
  if (w.mag <= 0) return 'empty';
  const def = WEAPONS[w.id];
  const interval = 60 / def.rpm;
  if (now - st.lastShotAt < interval) return 'rate';
  return null;
}

/** Consume one shot: decrements the magazine, grows bloom, stamps time. */
export function consumeShot(loadout, st, now) {
  const w = loadout.weapons[loadout.current];
  w.mag--;
  st.lastShotAt = now;
  st.burstCount++;
  st.spreadBloom = Math.min(1, st.spreadBloom + 0.22);
}

export function startReload(loadout, st, now) {
  const w = loadout.weapons[loadout.current];
  const def = WEAPONS[w.id];
  if (st.reloading || w.mag === def.mag || w.reserve <= 0) return false;
  st.reloading = true;
  st.reloadWeapon = w.id;
  st.reloadEndAt = now + def.reload;
  return true;
}

export function finishReload(loadout, st) {
  const w = loadout.weapons[st.reloadWeapon];
  const def = WEAPONS[w.id];
  const need = def.mag - w.mag;
  const take = Math.min(need, w.reserve);
  w.mag += take;
  w.reserve -= take;
  st.reloading = false;
  st.reloadWeapon = null;
  st.spreadBloom = 0;
}

export function switchWeapon(loadout, st, id, now) {
  if (!loadout.weapons[id] || loadout.current === id) return false;
  loadout.current = id;
  st.switchEndAt = now + 0.35;
  st.reloading = false;
  st.reloadWeapon = null;
  return true;
}

/** Decay bloom over time; call once per fixed step. */
export function tickWeapon(st, dt, now) {
  if (now - st.lastShotAt > 0.25) {
    st.spreadBloom = Math.max(0, st.spreadBloom - dt * 1.8);
  }
}
