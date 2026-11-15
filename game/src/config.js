// RUSTLINE — round 3. Shared constants: map, weapons, economy, tuning.
// Foundry Yard: 64 x 44 m industrial foundry at dusk. Vanguard spawns west,
// Sentinel spawns east. Site A north-east, Site B south-east.

// ---- map bounds ------------------------------------------------------------
export const MAP = {
  halfX: 32, // x in [-32, 32]
  halfZ: 22, // z in [-22, 22]
  wallHeight: 4.2,
  roundTime: 100, // seconds of live round
  buyTime: 15, // seconds of buy phase
  plantTime: 4, // seconds to plant the spike
  defuseTime: 5, // seconds to defuse
  fuseTime: 35, // seconds from plant to detonation
  winRounds: 5, // first to 5
  maxRounds: 9, // at most 9 rounds
  idleNudgeAfter: 25, // seconds with no combat before the objective nudge
};

// ---- sites -----------------------------------------------------------------
export const SITES = {
  A: { id: 'A', x: 22, z: -14, color: 0x35d0ff, css: '#35d0ff', label: 'SITE A' },
  B: { id: 'B', x: 22, z: 14, color: 0xff4fa3, css: '#ff4fa3', label: 'SITE B' },
};

// ---- spawns ----------------------------------------------------------------
export const SPAWNS = {
  vanguard: [
    { x: -28, z: -6 }, { x: -28, z: 0 }, { x: -28, z: 6 }, { x: -25, z: -2 },
  ],
  sentinel: [
    { x: 28, z: -8 }, { x: 28, z: 0 }, { x: 28, z: 8 }, { x: 25, z: -14 }, { x: 25, z: 14 },
  ],
};

// ---- walls: axis-aligned boxes {x, z, w, d, h} -----------------------------
// The yard is ringed by perimeter walls; inside, the furnace block, pipe
// runs, crate stacks and low cover shape three lanes: North, Mid, South.
export const WALLS = [
  // perimeter (thick, tall)
  { x: 0, z: -22.6, w: 66, d: 1.2, h: 5 },
  { x: 0, z: 22.6, w: 66, d: 1.2, h: 5 },
  { x: -32.6, z: 0, w: 1.2, d: 46, h: 5 },
  { x: 32.6, z: 0, w: 1.2, d: 46, h: 5 },
  // central furnace block (the yard's heart, blocks Mid sightline)
  { x: 0, z: 0, w: 8, d: 6, h: 5.5 },
  // furnace flanks: pipe columns that break the mid lane
  { x: -8, z: -4, w: 2, d: 2, h: 4.5 },
  { x: -8, z: 4, w: 2, d: 2, h: 4.5 },
  { x: 8, z: -4, w: 2, d: 2, h: 4.5 },
  { x: 8, z: 4, w: 2, d: 2, h: 4.5 },
  // north lane cover: crate stacks + a low wall
  { x: -14, z: -14, w: 6, d: 2, h: 2.2 },
  { x: 4, z: -16, w: 4, d: 2, h: 1.6 },
  { x: 14, z: -18, w: 2, d: 2, h: 2.4 },
  { x: 18, z: -10.5, w: 2, d: 5, h: 3.2 },
  // south lane cover: mirrored-ish, different rhythm so lanes read apart
  { x: -14, z: 14, w: 6, d: 2, h: 2.2 },
  { x: 4, z: 16, w: 4, d: 2, h: 1.6 },
  { x: 12, z: 18, w: 2, d: 2, h: 2.4 },
  { x: 18, z: 10.5, w: 2, d: 5, h: 3.2 },
  // site A cover: two crates + a pillar inside the site
  { x: 22, z: -18, w: 3, d: 2, h: 1.8 },
  { x: 26, z: -11, w: 2, d: 2, h: 2.6 },
  // site B cover
  { x: 22, z: 18, w: 3, d: 2, h: 1.8 },
  { x: 26, z: 11, w: 2, d: 2, h: 2.6 },
  // west approach cover for attackers
  { x: -20, z: -8, w: 2, d: 2, h: 1.8 },
  { x: -20, z: 8, w: 2, d: 2, h: 1.8 },
  { x: -22, z: 0, w: 3, d: 2, h: 1.4 },
];

// ---- waypoints: navigation graph -------------------------------------------
// Nodes the bots walk between; edges connect nodes with a clear straight line
// (checked at build time by the world module's line-of-sight test).
export const WAYPOINTS = [
  // id, x, z, tags
  { id: 0, x: -28, z: 0, tags: ['spawnV'] },
  { id: 1, x: -22, z: -3.5, tags: ['mid'] },
  { id: 2, x: -14, z: 0, tags: ['mid'] },
  { id: 3, x: -8, z: -8, tags: ['mid', 'north'] },
  { id: 4, x: -8, z: 8, tags: ['mid', 'south'] },
  { id: 5, x: -14, z: -10, tags: ['north'] },
  { id: 6, x: -14, z: 10, tags: ['south'] },
  { id: 7, x: 0, z: -12, tags: ['north'] },
  { id: 8, x: 0, z: 12, tags: ['south'] },
  { id: 9, x: 8, z: -12, tags: ['north'] },
  { id: 10, x: 8, z: 12, tags: ['south'] },
  { id: 11, x: 14, z: -14, tags: ['north', 'siteA'] },
  { id: 12, x: 14, z: 14, tags: ['south', 'siteB'] },
  { id: 13, x: 22, z: -14, tags: ['siteA'] },
  { id: 14, x: 22, z: 14, tags: ['siteB'] },
  { id: 15, x: 28, z: 0, tags: ['spawnS'] },
  { id: 16, x: 18, z: -3, tags: ['mid', 'siteA'] },
  { id: 17, x: 18, z: 3, tags: ['mid', 'siteB'] },
  { id: 18, x: 0, z: -18, tags: ['north'] },
  { id: 19, x: 0, z: 18, tags: ['south'] },
  { id: 20, x: -22, z: -10, tags: ['north'] },
  { id: 21, x: -22, z: 10, tags: ['south'] },
  { id: 22, x: 26, z: -6, tags: ['siteA'] },
  { id: 23, x: 26, z: 6, tags: ['siteB'] },
  { id: 24, x: 10, z: 0, tags: ['mid'] },
  { id: 25, x: -4, z: -12, tags: ['north'] },
  { id: 26, x: -4, z: 12, tags: ['south'] },
];

// Explicit edges (undirected). Hand-checked AND machine-validated (see the
// nav-check script): every edge is a straight line a bot can actually walk,
// routing around the furnace block instead of through it.
export const WAYPOINT_EDGES = [
  [0, 1], [0, 20], [0, 21], [1, 2], [1, 20], [2, 3], [2, 4],
  [3, 5], [3, 7], [3, 25], [4, 6], [4, 8], [4, 26], [5, 7], [5, 18], [5, 20],
  [6, 8], [6, 19], [6, 21], [7, 9], [7, 18], [7, 25], [8, 10], [8, 19], [8, 26],
  [9, 11], [9, 16], [10, 12], [10, 17], [11, 13], [11, 16],
  [12, 14], [12, 17], [13, 22], [13, 16], [14, 23], [14, 17], [15, 16], [15, 17],
  [15, 22], [15, 23], [16, 17], [16, 24], [17, 24], [18, 25], [19, 26],
  [20, 25], [21, 26], [22, 23],
];

// ---- weapons ---------------------------------------------------------------
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0, damage: 26, headMult: 2.0,
    rpm: 360, mag: 12, reserve: 36, spread: 0.55, moveSpread: 1.4, auto: false,
    range: 40, reload: 1.1, pellets: 1, zoom: 1,
  },
  vk47: {
    id: 'vk47', name: 'VK-47 Rifle', kind: 'rifle', price: 2700, damage: 33, headMult: 2.0,
    rpm: 600, mag: 30, reserve: 90, spread: 0.7, moveSpread: 1.8, auto: true,
    range: 60, reload: 2.2, pellets: 1, zoom: 1,
  },
  raptor: {
    id: 'raptor', name: 'Raptor-9 SMG', kind: 'smg', price: 1500, damage: 22, headMult: 2.0,
    rpm: 900, mag: 32, reserve: 96, spread: 0.9, moveSpread: 1.6, auto: true,
    range: 35, reload: 1.8, pellets: 1, zoom: 1,
  },
  longshot: {
    id: 'longshot', name: 'Longshot DMR', kind: 'dmr', price: 4750, damage: 80, headMult: 2.5,
    rpm: 60, mag: 5, reserve: 15, spread: 0.12, moveSpread: 3.2, auto: false,
    range: 90, reload: 2.8, pellets: 1, zoom: 2.2,
  },
  breacher: {
    id: 'breacher', name: 'Breacher Shotgun', kind: 'shotgun', price: 1100, damage: 9, headMult: 1.5,
    rpm: 70, mag: 6, reserve: 18, spread: 2.6, moveSpread: 2.0, auto: false,
    range: 18, reload: 2.6, pellets: 9, zoom: 1,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'HE Charge', price: 300, radius: 6, maxDamage: 90 },
  flash: { id: 'flash', name: 'Flash Charge', price: 200, radius: 14, blindTime: 2.2 },
};

export const VEST_PRICE = 650;
export const VEST_ARMOR = 50;

// ---- economy ---------------------------------------------------------------
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3000,
  lossReward: 2400,
  lossStreakBonus: 500, // per consecutive loss, up to 3
  plantReward: 300, // to the planter's team on a successful plant
};

// ---- movement --------------------------------------------------------------
export const MOVE = {
  walkSpeed: 4.6,
  runSpeed: 5.6,
  crouchSpeed: 2.4,
  accel: 38, // ground acceleration
  airAccel: 8,
  friction: 10,
  radius: 0.42, // agent capsule radius (XZ)
  eyeHeight: 1.62,
  crouchEye: 1.15,
  jumpSpeed: 5.2,
  gravity: 14,
};

// ---- bot tuning (round 3: competitive balance) -----------------------------
// Sentinel defends and holds sites: a small accuracy edge while stationary
// and a retake instinct after a plant. Vanguard attacks 4v5, so its bots
// get the higher base skill and faster reactions to keep rounds close.
// Smoke-test target: Vanguard 5-3 / 5-4.
export const BOT = {
  sentinel: {
    skill: 0.62, reactionMin: 0.28, reactionMax: 0.4,
    burstMin: 3, burstMax: 5, burstPauseMin: 0.35, burstPauseMax: 0.6,
    holdAccuracyBonus: 1.06, retakeDelay: 1.2,
  },
  vanguard: {
    skill: 0.68, reactionMin: 0.28, reactionMax: 0.42,
    burstMin: 2, burstMax: 4, burstPauseMin: 0.4, burstPauseMax: 0.7,
    holdAccuracyBonus: 1.0, retakeDelay: 0,
  },
  // Aim model: angular error (degrees) sampled per shot.
  baseErrorDeg: 0.85, // at 10 m, skill 0.5
  errorPerMeter: 0.02, // extra error per metre of range
  firstShotFactor: 0.55, // first shot of a burst is this accurate
  duelRange: 25, // attackers push through combat beyond this range
  burstGrowth: 1.22, // spread multiplier per extra shot inside a burst
  longRange: 18, // beyond this, bots peek from cover instead of trading
  peekExpose: 0.9, // seconds a peeking bot stays exposed
  peekHide: 0.7, // seconds a peeking bot stays behind cover
  hearRadius: 26, // gunshots heard this far
  seeFovCos: 0.25, // cos of half-FOV for vision (~75 deg half angle)
  seeRange: 55,
  strafeChange: 0.9, // seconds between strafe direction flips in a duel
  lowHpRetreat: 30, // hp below this: fall back to cover when safe
};
