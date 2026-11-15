// RUSTLINE — shared configuration: map layout, weapons, economy, teams.
// One place for every tunable number; every other module reads from here.

export const CONFIG = Object.freeze({
  map: { halfX: 32, halfZ: 22, wallH: 4.2 },
  round: { buySeconds: 15, roundSeconds: 100, fuseSeconds: 35, plantSeconds: 3, defuseSeconds: 5, winRounds: 5, maxRounds: 9 },
  economy: { startMoney: 800, winBonus: 325, lossBonus: 200, killBonus: 300, plantBonus: 300 },
  player: { radius: 0.42, height: 1.7, eyeHeight: 1.62, walkSpeed: 5.2, crouchSpeed: 2.6, accel: 42, friction: 11, jumpSpeed: 5.4, gravity: 14 },
  bot: { sightRange: 32, hearRange: 42, reactMin: 0.35, reactMax: 1.0, aimError: 0.035, thinkEvery: 0.15 },
  teams: { VANGUARD: 'Vanguard', SENTINEL: 'Sentinel' },
  colors: { vanguard: 0x3f8cff, sentinel: 0xff5a3c, ground: 0x2a2723, dusk: 0x1a1410 },
});

// Walls are axis-aligned boxes: [centerX, centerZ, halfX, halfZ, height].
// The foundry is a 64x44 m yard: an outer shell, a furnace wall splitting mid
// with one gap, two bombsites, and three lanes (A Long west, Mid, B Short east).
export const WALLS = Object.freeze([
  // Outer shell (north / south / west / east).
  [0, -22.5, 33, 0.5, 4.2], [0, 22.5, 33, 0.5, 4.2],
  [-32.5, 0, 0.5, 23, 4.2], [32.5, 0, 0.5, 23, 4.2],
  // Furnace wall splitting mid, with a 6 m gap at the centre for Mid lane.
  [-18, -2, 14, 1.2, 4.2], [18, -2, 14, 1.2, 4.2],
  // Furnace block on site A (west) and storehouse block on site B (east).
  [-24, -13, 5, 3, 3.2], [24, -13, 5, 3, 3.2],
  // Cover: crates, pipes and pillars scattered along the lanes.
  [-28, 2, 1.4, 1.4, 1.4], [-20, 12, 1.1, 1.1, 1.1], [-8, 8, 1.6, 1.0, 1.3],
  [8, 10, 1.2, 1.2, 1.2], [20, 6, 1.4, 1.4, 1.4], [24, 12, 1.1, 1.1, 1.1],
  [-12, -10, 1.5, 1.0, 1.5], [12, -10, 1.5, 1.0, 1.5], [0, 16, 2.2, 1.2, 1.6],
  [-28, -6, 1.0, 1.0, 2.6], [28, -6, 1.0, 1.0, 2.6], [-4, -16, 1.8, 1.2, 1.4],
  [4, -16, 1.8, 1.2, 1.4],
]);

// Waypoint graph: nodes bots walk between. Edges are bidirectional by index.
// Every edge is checked against the furnace wall: the wall splits mid with a
// single 8 m gap at x in [-4, 4], so all three lanes cross through the gap
// waypoint 17 (0, -2) — no edge cuts through the wall itself.
export const WAYPOINTS = Object.freeze([
  { x: -24, z: 18, links: [1, 3] },      // 0 Vanguard spawn
  { x: -24, z: 6, links: [0, 4] },       // 1 A Long lower
  { x: -24, z: -6, links: [5, 6] },      // 2 A Long upper
  { x: -8, z: 18, links: [0, 4, 7] },    // 3 Mid spawn fork
  { x: -8, z: 6, links: [1, 3, 17, 8] }, // 4 Mid west
  { x: -8, z: -8, links: [17, 2, 6] },   // 5 Mid furnace gap (north)
  { x: -24, z: -9, links: [2, 5] },      // 6 Site A approach (south of the furnace block)
  { x: 8, z: 18, links: [3, 8, 11] },    // 7 Mid east fork
  { x: 8, z: 6, links: [4, 7, 17, 9] },  // 8 Mid east
  { x: 24, z: 6, links: [7, 8, 17] },    // 9 B Short lower
  { x: 24, z: -6, links: [13, 12] },     // 10 B Short upper
  { x: 24, z: 18, links: [7, 9] },       // 11 B spawn fork
  { x: 24, z: -9, links: [10, 13] },     // 12 Site B approach (south of the storehouse block)
  { x: 8, z: -8, links: [5, 10, 12, 17] }, // 13 Mid north east
  { x: 0, z: -18, links: [5, 13] },      // 14 Sentinel spawn
  { x: -14, z: -18, links: [5, 14] },    // 15 Sentinel west
  { x: 14, z: -18, links: [13, 14] },    // 16 Sentinel east
  { x: 0, z: -2, links: [4, 8, 5, 13] }, // 17 Mid gap — the only crossing of the furnace wall
]);

export const SITES = Object.freeze({
  A: { x: -24, z: -13, r: 4.5, name: 'A · Furnace' },
  B: { x: 24, z: -13, r: 4.5, name: 'B · Storehouse' },
});

export const SPAWNS = Object.freeze({
  vanguard: [[-27, 19], [-24, 19], [-21, 19], [-24, 16]],
  sentinel: [[-14, -19], [-7, -19], [0, -19], [7, -19], [14, -19]],
});

// Weapons: damage is per body hit; headshots multiply. Spread in radians.
export const WEAPONS = Object.freeze({
  p9: { name: 'P9 Pistol', price: 0, damage: 26, headMult: 3.0, rate: 0.16, mag: 12, reserve: 48, reload: 1.1, spread: 0.014, moveSpread: 0.030, auto: false, zoom: 1.0, range: 60 },
  vex9: { name: 'Vex-9 SMG', price: 950, damage: 21, headMult: 3.0, rate: 0.085, mag: 28, reserve: 112, reload: 1.6, spread: 0.020, moveSpread: 0.042, auto: true, zoom: 1.0, range: 55 },
  ar77: { name: 'AR-77 Rifle', price: 2100, damage: 33, headMult: 3.0, rate: 0.115, mag: 25, reserve: 100, reload: 2.0, spread: 0.011, moveSpread: 0.034, auto: true, zoom: 1.15, range: 70 },
  longbow: { name: 'Longbow .50', price: 3400, damage: 88, headMult: 2.5, rate: 1.25, mag: 5, reserve: 20, reload: 2.8, spread: 0.004, moveSpread: 0.055, auto: false, zoom: 2.4, range: 120 },
  spark: { name: 'Spark Grenade', price: 300, damage: 70, headMult: 1.0, rate: 0.9, mag: 1, reserve: 1, reload: 0, spread: 0, moveSpread: 0, auto: false, zoom: 1.0, range: 8, grenade: true },
  vest: { name: 'Plate Vest', price: 650, damage: 0, headMult: 1, rate: 0, mag: 0, reserve: 0, reload: 0, spread: 0, moveSpread: 0, auto: false, zoom: 1.0, range: 0, armor: true },
});

export const BUY_KEYS = ['p9', 'vex9', 'ar77', 'longbow', 'spark', 'vest'];
