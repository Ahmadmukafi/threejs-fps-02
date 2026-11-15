// RUSTLINE — shared constants. One place for every number the game tunes:
// weapons, economy, rounds, movement, the map and the palette.

export const GAME_NAME = 'RUSTLINE';
export const MAP_NAME = 'Foundry Yard';

// --- teams ---------------------------------------------------------------
export const TEAMS = {
  vanguard: { name: 'Vanguard', color: 0x2e8f7a, css: '#35b59a', role: 'attack' },
  sentinel: { name: 'Sentinel', color: 0xc65a2e, css: '#e0703a', role: 'defend' },
};

// --- rounds ---------------------------------------------------------------
export const ROUND = {
  winScore: 5,          // first to 5 rounds takes the match (max 9 rounds)
  maxRounds: 9,
  buySeconds: 15,       // buy phase before the round starts
  roundSeconds: 100,    // round timer once play starts
  fuseSeconds: 35,      // charge fuse after planting
  plantSeconds: 3,      // hold E to plant
  defuseSeconds: 5,     // hold E to defuse
  freezeAfterRound: 4,  // seconds the end-of-round banner stays up
};

// --- economy ---------------------------------------------------------------
export const ECONOMY = {
  startMoney: 800,
  winBonus: 325,
  lossBonus: 200,
  killReward: 300,
  plantReward: 300,
  roundStreakBonus: 0,
};

// --- weapons --------------------------------------------------------------
// damage: body damage per hit. headMult multiplies on a head hit.
// spread: base radians of cone. bloom: spread added per shot. recover: spread
// recovered per second. movePenalty: extra spread while moving (x of base).
// rate: seconds between shots. mag: magazine size. reserve: spare ammo.
// reload: seconds to reload. auto: hold mouse to fire. range: max hit metres.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3,
    spread: 0.011, bloom: 0.010, recover: 0.09, movePenalty: 1.6,
    rate: 0.16, mag: 12, reserve: 48, reload: 1.4, auto: false, range: 60,
    tracer: 0xffe08a, kick: 0.011, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Vex-9 SMG', price: 950, damage: 22, headMult: 3,
    spread: 0.017, bloom: 0.009, recover: 0.11, movePenalty: 1.3,
    rate: 0.085, mag: 28, reserve: 112, reload: 1.9, auto: true, range: 45,
    tracer: 0xffd34d, kick: 0.008, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Rifle', price: 2100, damage: 34, headMult: 3,
    spread: 0.009, bloom: 0.011, recover: 0.10, movePenalty: 1.8,
    rate: 0.105, mag: 30, reserve: 90, reload: 2.2, auto: true, range: 90,
    tracer: 0xfff2b0, kick: 0.014, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'Longbow .50', price: 3400, damage: 92, headMult: 2.5,
    spread: 0.002, bloom: 0.05, recover: 0.06, movePenalty: 3.2,
    rate: 1.15, mag: 5, reserve: 15, reload: 3.0, auto: false, range: 120,
    tracer: 0xcfe8ff, kick: 0.06, sound: 'sniper',
  },
};

export const GRENADE = {
  id: 'grenade', name: 'Spark Frag', price: 300, maxCarry: 2,
  fuse: 1.4, radius: 7, damage: 110, throwSpeed: 16,
};

export const ARMOR = { id: 'armor', name: 'Plate Vest', price: 650, absorb: 0.5 };

// --- movement ---------------------------------------------------------------
export const MOVE = {
  walkSpeed: 5.2,
  sprintSpeed: 6.6,
  crouchSpeed: 2.6,
  accel: 42,          // m/s^2 on the ground
  friction: 11,        // ground friction
  airAccel: 8,
  jumpSpeed: 5.4,
  gravity: 14,
  eyeStand: 1.62,
  eyeCrouch: 1.05,
  radius: 0.38,        // player capsule radius for collision
  height: 1.75,
};

// --- bots -------------------------------------------------------------------
export const BOTS = {
  attackers: 3,        // friendly bots on the player's team
  defenders: 5,        // enemy bots
  hp: 100,
  reactionMin: 0.35,   // seconds before a bot fires after seeing a target
  reactionMax: 1.0,
  burstMin: 3,         // shots per burst
  burstMax: 6,
  burstPause: 0.7,
  aimError: 0.02,      // base aim error (radians) — bots are dangerous, not laser-accurate
  strafeChance: 0.5,
  hearingRadius: 42,   // metres: gunfire heard this far pulls bots
  sightRange: 32,      // metres: bots cannot see across the whole map
};

// --- map --------------------------------------------------------------------
export const MAP = {
  width: 64,           // x: -32 .. 32
  depth: 44,           // z: -22 .. 22
  wallHeight: 4.2,
};

// --- palette ----------------------------------------------------------------
export const PALETTE = {
  ground: 0x3a3630,
  groundLine: 0x2c2822,
  wall: 0x6b5a48,
  wallDark: 0x4a3f34,
  crate: 0x8a6a3c,
  crateDark: 0x6e5230,
  pipe: 0x3f6b6b,
  accent: 0x2e8f7a,
  hazard: 0xd8a13c,
  siteA: 0xc65a2e,
  siteB: 0x2e7fc6,
  sky: 0x1c1a24,
  fog: 0x241f1c,
  sun: 0xffd9a0,
};
