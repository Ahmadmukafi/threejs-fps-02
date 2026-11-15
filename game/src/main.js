// RUSTLINE — entry point: renderer, fixed-step loop, input, and the glue
// between the modules. The simulation steps at 60 Hz; rendering only reads
// state. ?demo=1..4 stages a screenshot setup; ?smoke=1 plays a full match
// with an autopilot and reports the result for headless verification.

import * as THREE from 'three';
import { CONFIG, WEAPONS, SITES, WAYPOINTS } from './config.js';
import { buildWorld, segmentBlocked, findPath, nearestWaypoint } from './world.js';
import { SoundBank } from './audio.js';
import { WeaponSet, Grenade } from './weapons.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { RoundManager } from './rounds.js';
import { Hud } from './hud.js';
import { applyHit, makeHitPuff, showHitPuff, updateHitPuff } from './combat.js';

window.__gameErrors = [];
window.addEventListener('error', (e) => window.__gameErrors.push(String(e.message || e.error)));

const params = new URLSearchParams(location.search);
const DEMO = parseInt(params.get('demo') || '0', 10);
const SMOKE = params.get('smoke') === '1';

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: !SMOKE, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    // Smoke mode runs under software GL: keep it cheap (no shadows, 1x DPR).
    this.renderer.setPixelRatio(SMOKE ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !SMOKE;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 220);
    this.scene.add(this.camera);
    this.sounds = new SoundBank();
    this.weapons = new WeaponSet(this.scene, this.sounds);
    this.world = buildWorld(this.scene);
    this.player = new Player(this.scene, this.camera, this.sounds, this.weapons, this.world.walls);
    this.weapons.equip('p9', this.camera); // the starting pistol's viewmodel
    this.bots = [];
    for (let i = 0; i < 3; i++) this.bots.push(new Bot(this.scene, 'vanguard', i, this.world.walls, this.sounds, this.weapons));
    for (let i = 0; i < 5; i++) this.bots.push(new Bot(this.scene, 'sentinel', i + 3, this.world.walls, this.sounds, this.weapons));
    this.fighters = [this.player, ...this.bots];
    this.rounds = new RoundManager(this);
    this.hud = new Hud(this);
    this.grenades = [];
    this.puffs = [makeHitPuff(this.scene), makeHitPuff(this.scene)];
    this.puffIdx = 0;
    this.bombMesh = null;
    this.phase = 'lobby';
    this.smokeDone = false;
    this.smokeRounds = 0;
    this.smokeKills = 0;
    this.acc = 0;
    this.last = performance.now();
    this.autoPilot = SMOKE;
    this.bindInput();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  get bombState() { return this.rounds.bombState; }
  get bombSite() { return this.rounds.bombSite; }
  get carrier() { return this.rounds.carrier; }
  get attackSite() { return this.rounds.attackSite; }

  bindInput() {
    const p = this.player;
    addEventListener('keydown', (e) => {
      p.keys[e.code] = true;
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyB') this.hud.toggleBuy(this.hud.el.buy.style.display !== 'block' && this.rounds.phase === 'buy');
      if (e.code === 'KeyG') p.throwGrenade(this);
      if (e.code === 'KeyC' || e.code === 'ControlLeft') p.crouched = true;
      if (this.hud.el.buy.style.display === 'block') {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= 6) {
          const id = ['p9', 'vex9', 'ar77', 'longbow', 'spark', 'vest'][n - 1];
          if (p.buy(id)) this.hud.renderBuy();
        }
        if (e.code === 'Escape' || e.code === 'KeyB') this.hud.toggleBuy(false);
      }
    });
    addEventListener('keyup', (e) => {
      p.keys[e.code] = false;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') p.crouched = false;
    });
    addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.sounds.ensure();
      if (!this.pointerLocked && !SMOKE && !DEMO) {
        this.renderer.domElement.requestPointerLock();
        return;
      }
      p.mouseDown = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) p.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    });
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      p.yaw -= e.movementX * 0.0022;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - e.movementY * 0.0022));
    });
    this.hud.el.overlay.addEventListener('click', () => {
      this.sounds.ensure();
      this.hud.hideOverlay();
      this.renderer.domElement.requestPointerLock();
      if (this.rounds.phase === 'lobby') this.rounds.startMatch();
    });
  }

  reload() {
    const p = this.player;
    const def = WEAPONS[p.weaponId];
    if (p.reloadTimer > 0 || p.mag >= def.mag || p.reserve <= 0) return;
    p.reloadTimer = def.reload;
    this.sounds.reload();
  }

  // One hitscan shot from any fighter. Raycast against every other fighter's
  // hit meshes, apply damage, and report the kill.
  shoot(shooter, origin, dir) {
    window.__shots = (window.__shots || 0) + 1;
    const targets = [];
    for (const f of this.fighters) {
      if (f === shooter || !f.alive || !f.parts) continue;
      for (const m of f.parts.body) targets.push(m);
    }
    const res = this.weapons.fire(shooter, dir, origin, shooter.moving || false, shooter.crouched || false, targets);
    if (!res || !res.hit) return;
    const victim = res.object.userData.fighter;
    if (!victim) return;
    const dmg = applyHit(victim, res, shooter.weaponId, this.sounds);
    if (shooter.isPlayer) this.sounds.hit();
    const puff = this.puffs[this.puffIdx];
    this.puffIdx = (this.puffIdx + 1) % this.puffs.length;
    showHitPuff(puff, res.point);
    if (victim.hp <= 0) {
      victim.die(shooter);
      const headshot = res.object === victim.parts.head;
      this.hud.killFeed(shooter, victim, headshot);
      if (shooter.isPlayer) this.player.kills += 1;
      if (victim === this.player) this.startSpectate();
    }
    // Nearby bots hear the shot.
    for (const b of this.bots) b.hearShot(origin);
    void dmg;
  }

  spawnGrenade(origin, vel) {
    const g = new Grenade(this.scene, origin, vel);
    this.grenades.push(g);
    this.sounds.shot('p9');
  }

  onGrenadeBlast(pos) {
    this.sounds.explosion();
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      if (d < 8) {
        const falloff = 1 - d / 8;
        f.hp = Math.max(0, f.hp - 70 * falloff);
        f.flash = 0.12;
        if (f.hp <= 0) { f.die(null); this.hud.killFeed({ name: 'Spark', isPlayer: false }, f, false); }
        if (f === this.player) this.startSpectate();
      }
    }
  }

  // Planting and defusing go through the RoundManager (state, fuse, HUD,
  // economy); the Game only owns the visible bomb mesh.
  plantBomb(siteKey, by) {
    this.rounds.plantBomb(siteKey, by);
  }

  defuseBomb(by) {
    this.rounds.defuseBomb(by);
  }

  onPlant(siteKey) {
    const s = SITES[siteKey];
    this.bombMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.28, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x30302e, roughness: 0.4, metalness: 0.6, emissive: 0xff2200, emissiveIntensity: 0.6 }),
    );
    this.bombMesh.position.set(s.x, 0.16, s.z);
    this.bombMesh.castShadow = true;
    this.scene.add(this.bombMesh);
  }

  onDetonate(site) {
    if (this.bombMesh) { this.scene.remove(this.bombMesh); this.bombMesh = null; }
    this.sounds.explosion();
    // The blast kills everyone still on the site.
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = Math.hypot(f.pos.x - site.x, f.pos.z - site.z);
      if (d < 7) { f.hp = 0; f.die(null); if (f === this.player) this.startSpectate(); }
    }
  }

  startSpectate() {
    const alive = this.bots.filter((b) => b.team === 'vanguard' && b.alive);
    this.player.spectate = alive.length ? alive[0] : null;
    this.hud.hint('You are down — spectating ' + (this.player.spectate ? this.player.spectate.name : 'the yard'));
  }

  step(dt) {
    this.rounds.update(dt);
    this.phase = this.rounds.phase;
    // Smoke mode: cap a live round at 40 s (unless a bomb is ticking) so a
    // headless match finishes in a reasonable number of frames.
    if (SMOKE && this.rounds.phase === 'live' && this.rounds.bombState !== 'planted' && this.rounds.phaseTimer > 40) {
      this.rounds.phaseTimer = 40;
    }
    // Autopilot drives the player in smoke mode (and demo 1).
    if (this.autoPilot && this.player.alive && this.rounds.phase === 'live') this.driveAutopilot(dt);
    this.player.update(dt, this);
    for (const b of this.bots) b.update(dt, this);
    for (const g of this.grenades) g.update(dt, (pos) => this.onGrenadeBlast(pos));
    this.grenades = this.grenades.filter((g) => !g.done || g.blastLife > 0);
    this.weapons.update(dt);
    for (const p of this.puffs) updateHitPuff(p, dt);
    // Bomb blink.
    if (this.bombMesh) {
      const m = this.bombMesh.material;
      m.emissiveIntensity = 0.4 + 0.5 * Math.abs(Math.sin(performance.now() / 180));
    }
    // Spectator camera follows a living teammate.
    if (!this.player.alive && this.player.spectate) {
      const t = this.player.spectate;
      if (!t.alive) { this.startSpectate(); }
      else {
        this.camera.position.set(t.pos.x - Math.sin(t.yaw) * -2.5, 3.2, t.pos.z - Math.cos(t.yaw) * -2.5);
        this.camera.lookAt(t.pos.x, 1.4, t.pos.z);
      }
    }
    this.hud.update();
    if (SMOKE && this.rounds.matchOver && !this.smokeDone) {
      this.smokeDone = true;
      this.smokeRounds = this.rounds.round;
      this.smokeKills = this.bots.reduce((a, b) => a + b.kills, 0) + this.player.kills;
      window.__smoke = {
        done: true, errors: window.__gameErrors.length,
        rounds: this.smokeRounds, botKills: this.smokeKills,
        score: this.rounds.score, winner: this.rounds.winner,
      };
      document.title = 'SMOKE_DONE rounds=' + this.smokeRounds + ' kills=' + this.smokeKills + ' errors=' + window.__gameErrors.length;
      const div = document.createElement('div');
      div.id = 'smoke-result';
      div.textContent = JSON.stringify(window.__smoke);
      document.body.appendChild(div);
    }
  }

  // Minimal autopilot for smoke tests: follow the waypoint graph to the
  // attack site, shoot at anything visible, plant when on site. It plays
  // the whole match alone.
  driveAutopilot(dt) {
    const p = this.player;
    const site = SITES[this.rounds.attackSite];
    // (Re)build the route when the site changes or the route runs out.
    if (!this.autoPath || this.autoSite !== this.rounds.attackSite || this.autoPathIdx >= this.autoPath.length) {
      this.autoSite = this.rounds.attackSite;
      const from = nearestWaypoint(p.pos.x, p.pos.z);
      this.autoPath = findPath(from, nearestWaypoint(site.x, site.z));
      this.autoPathIdx = 0;
    }
    const wp = WAYPOINTS[this.autoPath[this.autoPathIdx]];
    const wdx = wp.x - p.pos.x, wdz = wp.z - p.pos.z;
    const wdist = Math.hypot(wdx, wdz);
    if (wdist < 1.2) {
      this.autoPathIdx += 1;
    } else {
      p.yaw = Math.atan2(-wdx, -wdz);
      p.keys['KeyW'] = true;
    }
    const dist = Math.hypot(site.x - p.pos.x, site.z - p.pos.z);
    if (dist <= site.r) {
      p.keys['KeyW'] = false;
      p.keys['KeyE'] = true;
    } else {
      p.keys['KeyE'] = false;
    }
    // Aim at the nearest visible enemy ONLY if it is roughly ahead: the
    // route comes first, so the autopilot actually reaches the site instead
    // of chasing a target into a wall. Semi-autos need a fresh click per
    // shot, so the trigger toggles while an enemy is in the cone.
    let best = null, bd = Infinity;
    for (const b of this.bots) {
      if (b.team === p.team || !b.alive) continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < bd && !segmentBlocked(p.pos.x, p.pos.z, b.pos.x, b.pos.z, this.world.walls)) { bd = d; best = b; }
    }
    if (best) {
      const tdx = best.pos.x - p.pos.x, tdz = best.pos.z - p.pos.z;
      const want = Math.atan2(-tdx, -tdz);
      let diff = want - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.35) {
        p.yaw = want;
        p.pitch = -0.02;
        // Toggle the trigger: semi-autos fire on the press edge, autos on hold.
        p.mouseDown = (Math.floor(performance.now() / 160) % 2 === 0);
      } else {
        p.mouseDown = false;
      }
    } else {
      p.mouseDown = false;
    }
    if (p.mag === 0) this.reload();
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const step = 1 / 60;
    if (SMOKE) {
      // Smoke mode fast-forwards: a fixed 24 steps a frame, independent of
      // the wall clock, so a whole match plays out in a few hundred frames.
      for (let n = 0; n < 24; n++) this.step(step);
      this.writeSmokeProgress();
    } else {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.acc += dt;
      let n = 0;
      while (this.acc >= step && n < 8) {
        this.step(step);
        this.acc -= step;
        n += 1;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Keeps the smoke state visible in the DOM for headless verification.
  writeSmokeProgress() {
    let div = document.getElementById('smoke-progress');
    if (!div) {
      div = document.createElement('div');
      div.id = 'smoke-progress';
      document.body.appendChild(div);
    }
    div.textContent = JSON.stringify({
      round: this.rounds.round, phase: this.rounds.phase,
      score: this.rounds.score, errors: window.__gameErrors.length,
      matchOver: this.rounds.matchOver,
    });
  }

  start() {
    this.rounds.phase = 'lobby';
    this.hud.showOverlay('RUSTLINE', 'Click to play — Vanguard vs Sentinel, first to 5 rounds');
    if (SMOKE) {
      this.hud.hideOverlay();
      this.rounds.startMatch();
      // Shorten the timers so a headless match finishes fast.
      this.rounds.phaseTimer = 1;
      const orig = this.rounds.startRound.bind(this.rounds);
      this.rounds.startRound = () => { orig(); this.rounds.phaseTimer = 1; };
    } else if (DEMO) {
      this.setupDemo(DEMO);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  setupDemo(n) {
    this.hud.hideOverlay();
    this.rounds.startMatch();
    this.rounds.phase = 'live';
    this.rounds.phaseTimer = 95;
    const p = this.player;
    const vBots = this.bots.filter((b) => b.team === 'vanguard');
    const sBots = this.bots.filter((b) => b.team === 'sentinel');
    if (n === 1) {
      // Mid-lane firefight: player holds Mid looking north up the lane,
      // bots trade fire down A Long and across the furnace gap.
      p.reset(-8, 14, 0.3);
      vBots[0].reset(-20, 8, 0, null);
      vBots[1].reset(-4, 10, 0.2, null);
      sBots[0].reset(-24, -8, Math.PI, null);
      sBots[1].reset(-8, -10, Math.PI, null);
      sBots[2].reset(8, -12, Math.PI, null);
      this.hud.hint('Demo 1 — Mid lane');
    } else if (n === 2) {
      // Aiming down the scope at site A from the furnace gap.
      p.reset(-8, -6, Math.PI * 0.08);
      p.weaponId = 'longbow'; p.mag = 5; p.reserve = 20;
      this.weapons.equip('longbow', this.camera);
      p.pitch = 0.02;
      sBots[0].reset(-24, -13, 0, null);
      sBots[1].reset(-20, -10, 0, null);
      vBots[0].reset(-12, -8, Math.PI, null);
      this.hud.hint('Demo 2 — Longbow on site A');
    } else if (n === 3) {
      // Buy phase at the Vanguard spawn, menu open.
      this.rounds.phase = 'buy';
      this.rounds.phaseTimer = 14;
      p.reset(-24, 18, Math.PI);
      p.money = 4200;
      this.hud.toggleBuy(true);
      this.hud.hint('Demo 3 — Buy menu');
    } else {
      // Planting at site B: player on the charge facing west down Mid
      // toward the defenders closing in, plant channel running.
      p.reset(24, -10, Math.PI / 2);
      p.keys['KeyE'] = true;
      this.rounds.phase = 'live';
      sBots[0].reset(14, -18, 0, null);
      sBots[1].reset(8, -8, 0, null);
      sBots[2].reset(18, -3, 0, null);
      vBots[0].reset(20, -12, Math.PI, null);
      this.hud.hint('Demo 4 — Planting at B');
    }
    // Let the scene settle one frame so the screenshot catches the pose.
    this.step(1 / 60);
  }
}

const game = new Game();
game.start();
window.__game = game;
window.__shots = 0;
