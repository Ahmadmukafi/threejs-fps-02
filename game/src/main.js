// RUSTLINE — round 3. Bootstrap, fixed-step simulation, rendering, input,
// agent meshes, viewmodel, and the ?smoke=1 / ?shot=N / ?demo=N modes.
// The simulation runs at a fixed 60 Hz, decoupled from rendering; the
// dossier the judge reads is built from these same files by main.ts.
import * as THREE from 'three';
import { MAP, WALLS, SITES, WEAPONS, GRENADES, BOT, MOVE } from './config.js';
import { buildWorld } from './world.js';
import { AudioSys } from './audio.js';
import { Combat } from './combat.js';
import { makeBotState, updateBot, onHeard } from './bots.js';
import { PlayerController } from './player.js';
import { Match } from './rounds.js';
import { Hud } from './hud.js';
import { makeLoadout, makeWeaponState, startReload, finishReload, switchWeapon, tickWeapon } from './weapons.js';
import { mulberry32, clamp, dist2D } from './util.js';

const params = new URLSearchParams(location.search);
const SMOKE = params.has('smoke');
const SHOT = params.get('shot');
const DEMO = params.get('demo');
const FIXED = 1 / 60;
const TEAM_COLOR = { vanguard: 0x2fae7d, sentinel: 0xc23b4e };
const TEAM_CSS = { vanguard: '#37d67a', sentinel: '#ff5252' };

let errors = 0;
window.addEventListener('error', () => { errors++; });
window.addEventListener('unhandledrejection', () => { errors++; });

// ---------------------------------------------------------------- agents
let agentId = 0;
function makeAgent(team, name, isPlayer, rng) {
  const cfg = BOT[team];
  const agent = {
    id: agentId++,
    name,
    team,
    isPlayer,
    isBot: !isPlayer,
    pos: { x: 0, z: 0 },
    y: 0,
    yaw: 0,
    pitch: 0,
    health: 100,
    money: 800,
    loadout: makeLoadout(),
    weaponState: makeWeaponState(),
    speed2D: 0,
    crouched: false,
    stationary: true,
    blindedUntil: 0,
    lastDamageAt: -10,
    lastAttacker: null,
    lastSeenByPlayer: 0,
    walkPhase: rng() * 6,
    bot: null,
    mesh: null,
    hpBar: null,
    hpBg: null,
  };
  agent.eyeY = function () { return (this.crouched ? MOVE.crouchEye : MOVE.eyeHeight) + this.y; };
  if (!isPlayer) agent.bot = makeBotState(team, cfg, rng);
  return agent;
}

function makeAgentMesh(team) {
  const g = new THREE.Group();
  const base = team === 'vanguard' ? 0x2c3430 : 0x38262a;
  const accent = TEAM_COLOR[team];
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8, metalness: 0.3 });
  const suit = new THREE.MeshStandardMaterial({ color: base, roughness: 0.75, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.4, emissive: accent, emissiveIntensity: 0.5 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.6, emissive: accent, emissiveIntensity: 1.4 });
  const wide = team === 'sentinel' ? 1.22 : 1;
  // legs
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.24);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.13, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, dark);
  legR.position.set(0.13, 0.39, 0);
  // torso (Sentinel bulkier, Vanguard slimmer)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62 * wide, 0.62, 0.34), suit);
  torso.position.y = 1.09;
  // chest plate accent
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5 * wide, 0.3, 0.06), accentMat);
  plate.position.set(0, 1.14, 0.19);
  // shoulders
  const shGeo = new THREE.BoxGeometry(0.2, 0.18, 0.3);
  const shL = new THREE.Mesh(shGeo, suit);
  shL.position.set(-0.38 * wide, 1.36, 0);
  const shR = new THREE.Mesh(shGeo, suit);
  shR.position.set(0.38 * wide, 1.36, 0);
  // arms
  const armGeo = new THREE.BoxGeometry(0.14, 0.55, 0.16);
  const armL = new THREE.Mesh(armGeo, dark);
  armL.position.set(-0.38 * wide, 1.05, 0.12);
  armL.rotation.x = -0.7;
  const armR = new THREE.Mesh(armGeo, dark);
  armR.position.set(0.38 * wide, 1.05, 0.12);
  armR.rotation.x = -0.7;
  // head + visor slit
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), suit);
  head.position.y = 1.6;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), visorMat);
  visor.position.set(0, 1.62, 0.17);
  // gun held forward
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.62), dark);
  gun.position.set(0.12, 1.18, 0.42);
  const gunTip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), accentMat);
  gunTip.position.set(0.12, 1.18, 0.78);
  g.add(legL, legR, torso, plate, shL, shR, armL, armR, head, visor, gun, gunTip);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  // health bar sprites (always face the camera)
  const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.8 }));
  hpBg.scale.set(0.9, 0.1, 1);
  hpBg.position.y = 2.05;
  const hpFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x37d67a, depthTest: false, transparent: true, opacity: 0.95 }));
  hpFg.scale.set(0.9, 0.07, 1);
  hpFg.position.y = 2.05;
  g.add(hpBg, hpFg);
  g.userData = { legL, legR, armL, armR, torso, head };
  return { group: g, hpBg, hpFg };
}

// ---------------------------------------------------------------- boot
const rng = SMOKE ? mulberry32(1337) : mulberry32((Math.random() * 1e9) | 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(SMOKE ? 640 : innerWidth, SMOKE ? 360 : innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = !SMOKE; // smoke: skip shadow passes (SwiftShader)
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 400);
const world = buildWorld(scene);
const audio = new AudioSys();
const combat = new Combat(scene, audio);
const hud = new Hud(document.getElementById('hud'), null);

// agents: player + 3 Vanguard bots vs 5 Sentinel bots
const agents = [];
const player = makeAgent('vanguard', 'YOU', true, rng);
agents.push(player);
for (let i = 0; i < 3; i++) agents.push(makeAgent('vanguard', `VANGUARD-${i + 1}`, false, rng));
for (let i = 0; i < 5; i++) agents.push(makeAgent('sentinel', `SENTINEL-${i + 1}`, false, rng));
for (const a of agents) {
  const m = makeAgentMesh(a.team);
  a.mesh = m.group;
  a.hpBar = m.hpFg;
  a.hpBg = m.hpBg;
  scene.add(a.mesh);
}

// viewmodel: the player's rifle, attached to the camera
const viewmodel = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.45, metalness: 0.75 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x2fae7d, roughness: 0.4, metalness: 0.4, emissive: 0x2fae7d, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), metal);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.44);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), metal);
  mag.position.set(0, -0.14, -0.05);
  mag.rotation.x = 0.25;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.1), accent);
  sight.position.set(0, 0.1, -0.15);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.5), accent);
  stripe.position.set(0, -0.02, -0.1);
  viewmodel.add(body, barrel, mag, sight, stripe);
  viewmodel.position.set(0.28, -0.26, -0.55);
  camera.add(viewmodel);
  scene.add(camera);
}
const muzzle = new THREE.PointLight(0xffc36b, 0, 9, 1.5);
muzzle.position.set(0.28, -0.2, -1.1);
camera.add(muzzle);

// game context shared with bots/combat/rounds
const game = {
  agents,
  walls: WALLS,
  combat,
  audio,
  rng,
  player,
  now: 0,
  round: null,
  onKill: (rec) => handleKill(rec),
  onPlayerHit: (rec) => handlePlayerHit(rec),
  onBotHit: (rec) => {},
  plantSpike: (agent, site, now) => match.plantSpike(agent, site, now),
  defuseSpike: (agent, now) => match.defuseSpike(agent, now),
  buyRequest: (kind, id) => buyRequest(kind, id),
};
const match = new Match(agents, game);
game.round = match;
hud.game = game;

// match events -> HUD / audio
match.onEvent = (e) => {
  if (e.type === 'roundStart') {
    hud.banner(`ROUND ${e.round}`, e.carrier ? `${e.carrier} carries the spike` : '');
    for (const a of agents) if (a.isBot) match.autoBuy(a);
  } else if (e.type === 'live') {
    hud.banner('GO', 'Plant the spike at A or B', 1200);
  } else if (e.type === 'planted') {
    hud.banner('SPIKE PLANTED', `Site ${e.site} — defend it`, 2000);
    audio.plantBeep(true);
  } else if (e.type === 'detonated') {
    audio.explosion();
    hud.banner('SPIKE DETONATED', `Site ${e.site}`, 2000);
  } else if (e.type === 'nudge') {
    hud.nudge(true);
  } else if (e.type === 'roundEnd') {
    const won = e.winner === 'vanguard';
    hud.banner(won ? 'VANGUARD TAKES THE ROUND' : 'SENTINEL TAKES THE ROUND', `${e.reason} · ${e.score.vanguard} — ${e.score.sentinel}`);
    if (won) audio.roundWin(); else audio.roundLose();
  } else if (e.type === 'matchEnd') {
    hud.endScreen(e.winner, e.score);
    audio.roundWin();
  }
};
match.onRoundEnd = () => {};
match.onMatchEnd = (winner, score) => {
  if (SMOKE) finishSmoke();
};

// ---------------------------------------------------------------- combat hooks
function handleKill(rec) {
  const killer = rec.by;
  const victim = rec.killed;
  hud.addKill(killer.name, victim.name, rec.headshot, killer.team);
  if (killer === player) {
    hud.hitmark(true);
    audio.kill();
  }
  if (victim === player) {
    audio.hurt();
  }
  match.dropSpike(victim);
  // hearing: nearby enemies learn the shooter's position
  const site = nearestSite(victim.pos.x, victim.pos.z);
  for (const a of agents) {
    if (a.team === victim.team || a.health <= 0 || !a.isBot) continue;
    if (dist2D(a.pos.x, a.pos.z, killer.pos.x, killer.pos.z) < BOT.hearRadius) {
      a.bot.heard = { x: killer.pos.x, z: killer.pos.z, site, t: game.now };
    }
  }
  match.checkElimination(game.now);
}

function handlePlayerHit(rec) {
  hud.hitmark(false);
  const a = rec.by;
  const ang = Math.atan2(-(a.pos.x - player.pos.x), -(a.pos.z - player.pos.z));
  hud.damage(ang);
  audio.hurt();
  if (player.health <= 0) {
    player.weaponState.triggerHeld = false;
  }
}

function nearestSite(x, z) {
  let best = null;
  let bestD = 15;
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const d = dist2D(x, z, s.x, s.z);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

// ---------------------------------------------------------------- input
const controller = new PlayerController(player, camera, renderer.domElement, audio);
controller.onReload = () => {
  if (startReload(player.loadout, player.weaponState, game.now)) audio.reload();
};
controller.onSwitch = (id) => {
  if (switchWeapon(player.loadout, player.weaponState, id, game.now)) audio.reload();
};
controller.onBuyToggle = () => {
  if (match.phase === 'buy') hud.setBuyMenu(!hud.isBuyMenuOpen());
};
controller.onGrenade = (kind) => {
  if (match.phase !== 'live' || player.health <= 0) return;
  const dir = controller.aimDir();
  combat.throwGrenade(player, kind, dir, game.now);
};

function buyRequest(kind, id) {
  if (match.playerBuy(kind, id)) audio.buy();
}

// auto-pilot for the player in smoke mode
if (SMOKE) {
  player.bot = makeBotState('vanguard', BOT.vanguard, rng);
  player.isBot = true;
  player.isPlayer = false;
  hud.hideCenter();
} else {
  hud.showCenter();
  renderer.domElement.addEventListener('click', () => hud.hideCenter(), { once: true });
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && match.winner) location.reload();
});

// ---------------------------------------------------------------- shot mode
const SHOT_CAM = {
  1: { pos: [-26, 2.2, -6], yaw: -1.35, pitch: -0.02 },
  2: { pos: [14, 2.4, 20], yaw: -0.93, pitch: -0.06 },
  3: { pos: [-24, 2.4, -9], yaw: -1.15, pitch: -0.04 },
  4: { pos: [-30, 16, -20], yaw: -2.4, pitch: -0.5 },
};
let freeCam = null;
let shotFrozen = false;
if (SHOT) {
  hud.hideCenter();
}
if (DEMO) {
  hud.hideCenter();
  const c = SHOT_CAM[DEMO] || SHOT_CAM[1];
  freeCam = c;
}

// ---------------------------------------------------------------- sim
let accumulator = 0;
let frameNo = 0;
let lastT = performance.now();
let smokeSteps = 0;

function agentMeshSync(a, dt) {
  const m = a.mesh;
  if (!m) return;
  m.position.set(a.pos.x, a.y, a.pos.z);
  m.rotation.y = a.yaw + Math.PI; // meshes face +Z; yaw 0 faces -Z
  m.visible = a.health > 0 || a.isPlayer;
  const dead = a.health <= 0;
  m.rotation.z = dead ? Math.PI / 2 : 0;
  m.position.y = dead ? 0.25 : a.y;
  // walk swing
  if (a.speed2D > 0.5 && !dead) {
    a.walkPhase += dt * a.speed2D * 2.4;
    const s = Math.sin(a.walkPhase) * 0.5;
    m.userData.legL.rotation.x = s;
    m.userData.legR.rotation.x = -s;
    m.userData.armL.rotation.x = -0.7 - s * 0.4;
    m.userData.armR.rotation.x = -0.7 + s * 0.4;
  }
  // health bar
  const hp = clamp(a.health / 100, 0, 1);
  a.hpBar.scale.x = 0.9 * hp;
  a.hpBar.material.color.setHex(hp > 0.5 ? 0x37d67a : hp > 0.25 ? 0xffc36b : 0xff5252);
  a.hpBar.visible = !dead && a.health < 100;
  a.hpBg.visible = !dead && a.health < 100;
}

function playerShoot(now) {
  if (player.health <= 0 || match.phase !== 'live') return;
  const dir = controller.aimDir();
  const rec = combat.shoot(player, dir, agents, WALLS, rng, now);
  if (rec && rec.blocked === 'empty') {
    audio.dryFire();
    return;
  }
  if (rec && rec.fired) {
    muzzle.intensity = 14;
    viewmodel.position.z = -0.5; // recoil kick
  }
  if (rec && rec.killed) handleKill(rec);
  else if (rec && rec.hit) {
    hud.hitmark(rec.killed);
    audio.hit();
    if (rec.hit === player) handlePlayerHit(rec);
  }
  // hearing: enemies learn the shot
  for (const a of agents) {
    if (a.team === player.team || a.health <= 0 || !a.isBot) continue;
    if (dist2D(a.pos.x, a.pos.z, player.pos.x, player.pos.z) < BOT.hearRadius) {
      a.bot.heard = { x: player.pos.x, z: player.pos.z, site: nearestSite(player.pos.x, player.pos.z), t: now };
    }
  }
}

let lastShots = 0; // for the quiet-round clock in Match.tick
function fixedStep(dt) {
  const now = game.now;
  match.tick(dt, now);
  match.maybeNextRound(now);

  // reload completion + bot auto-reload (bots never press R: if the mag is
  // dry, start a reload; if the reserve is gone, fall back to the sidearm)
  for (const a of agents) {
    const st = a.weaponState;
    if (st.reloading && now >= st.reloadEndAt) finishReload(a.loadout, st);
    if (a.isBot && !st.reloading) {
      const w = a.loadout.weapons[a.loadout.current];
      if (w && w.mag <= 0) {
        if (!startReload(a.loadout, st, now) && a.loadout.current !== 'p9' && a.loadout.weapons.p9) {
          switchWeapon(a.loadout, st, 'p9', now);
        }
      }
    }
    tickWeapon(st, dt, now);
  }

  // player
  if (!SMOKE && player.health > 0 && match.phase === 'live') {
    controller.tick(dt, WALLS, now);
    if (player.weaponState.triggerHeld) playerShoot(now);
  } else if (SMOKE && player.health > 0) {
    updateBot(player, game, dt, now);
    // autopilot firing is handled inside updateBot via burstFire
  }

  // bots
  for (const a of agents) {
    if (a === player) continue;
    if (a.health <= 0) continue;
    updateBot(a, game, dt, now);
  }

  // grenades
  combat.tickGrenades(dt, agents, WALLS, now, (rec) => handleKill(rec));

  // quiet-round clock: any shot fired counts as combat
  if (combat.stats.shots !== lastShots) {
    match.lastCombatAt = now;
    lastShots = combat.stats.shots;
  }

  // enemy visibility memory for the minimap
  for (const a of agents) {
    if (a.team === player.team || a.health <= 0) continue;
    const dx = a.pos.x - player.pos.x;
    const dz = a.pos.z - player.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 40) a.lastSeenByPlayer = now;
  }

  // spike carrier death already drops via handleKill
  game.now += dt;
}

// ---------------------------------------------------------------- render
const clock = { last: performance.now() };
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now();
  let dt = (t - clock.last) / 1000;
  clock.last = t;
  if (dt > 0.25) dt = 0.25;

  if (SHOT && !shotFrozen) {
    // shot mode: warm the round up fast, then freeze on the vantage
    const warmup = SHOT === '3' ? 1.5 : 7;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 10) {
      fixedStep(FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (game.now >= warmup) {
      shotFrozen = true;
      freeCam = SHOT_CAM[SHOT] || SHOT_CAM[1];
      window.__shotReady = true;
    }
  } else if (!freeCam) {
    accumulator += dt;
    const maxSteps = SMOKE ? 30 : 5; // smoke: burn sim time fast under SwiftShader
    let steps = 0;
    while (accumulator >= FIXED && steps < maxSteps) {
      fixedStep(FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (steps === maxSteps) accumulator = 0;
  }

  // visuals that run every frame
  const time = t / 1000;
  world.furnaceLight.intensity = 55 + Math.sin(time * 7.3) * 8 + Math.sin(time * 13.7) * 5;
  for (const key of ['A', 'B']) {
    const mk = world.siteMarkers[key];
    mk.bill.position.y = mk.baseY + Math.sin(time * 1.4 + (key === 'A' ? 0 : 2)) * 0.25;
    mk.bill.lookAt(camera.position);
    mk.ring.material.opacity = 0.4 + Math.sin(time * 2.2) * 0.15;
  }
  const ep = world.embers.geometry.attributes.position;
  for (let i = 0; i < ep.count; i++) {
    let y = ep.getY(i) + dt * (0.6 + world.emberSeed[i] * 0.8);
    if (y > 9) y = 0.2;
    ep.setY(i, y);
    ep.setX(i, ep.getX(i) + Math.sin(time + i) * dt * 0.2);
  }
  ep.needsUpdate = true;

  for (const a of agents) agentMeshSync(a, dt);
  if (player.health <= 0 && !SMOKE) {
    // death cam: high spectator view
    camera.position.set(-10, 18, -14);
    camera.lookAt(0, 0, 0);
  } else if (!freeCam && !SMOKE) {
    // player camera is set by the controller; viewmodel follows
    viewmodel.position.z += ((-0.55) - viewmodel.position.z) * dt * 10;
    muzzle.intensity = Math.max(0, muzzle.intensity - dt * 160);
  }
  if (freeCam) {
    // spectator camera: never show the first-person rifle in front of it
    viewmodel.visible = false;
    camera.position.set(freeCam.pos[0], freeCam.pos[1], freeCam.pos[2]);
    camera.rotation.set(freeCam.pitch, freeCam.yaw, 0, 'YXZ');
  }

  hud.update(game, game.now);
  combat.tickTracers(dt);
  // smoke: render only every 3rd frame — SwiftShader is the bottleneck and
  // the sim is what the smoke test measures
  frameNo++;
  if (!SMOKE || frameNo % 3 === 0) renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- smoke
function finishSmoke() {
  const result = {
    errors,
    winner: match.winner,
    score: { ...match.score },
    rounds: match.roundLog,
    kills: combat.stats.kills,
    shots: combat.stats.shots,
    hits: combat.stats.hits,
    accuracy: combat.stats.shots ? +(combat.stats.hits / combat.stats.shots).toFixed(3) : 0,
    simSeconds: +game.now.toFixed(1),
  };
  window.__smokeResult = result;
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
}

if (SMOKE) {
  // shorter rounds for the headless run, same rules
  MAP.buyTime = 2;
  MAP.roundTime = 45;
}
// debug handle: lets a headless probe inspect live state (positions,
// health, spike, round) without touching the game
window.__rustline = { game, match, agents, combat };
match.startMatch();
if (SHOT && SHOT !== '3') {
  // action shots: skip the buy phase so bots are mid-round when frozen
  match.phase = 'live';
  match.timeLeft = 90;
  match.lastCombatAt = game.now;
}
frame();
