// RUSTLINE — main. Wires the whole game: renderer, fixed-step simulation,
// input (pointer lock, keys, mouse), shooting, grenades, the charge, the
// viewmodel, the HUD and the sounds. One Game object holds all state;
// modules own their piece and the sim calls them in order, 60 times a second.

import * as THREE from 'three';
import { GAME_NAME, MAP_NAME, ROUND, ECONOMY, WEAPONS, GRENADE, BOTS, MOVE } from './config.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { SoundBank } from './audio.js';
import { HUD } from './hud.js';
import {
  newLoadout, currentWeapon, canFire, fireShot, spreadOf, startReload,
  finishReload, tickLoadout, buyWeapon, buyArmor, buyGrenade, buyAmmo,
  applyDamage,
} from './weapons.js';
import { RoundManager, shopItems } from './rounds.js';
import { resolveShot, hasLOS, Tracers, Sparks, Grenades } from './combat.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') || null;      // 1..4: scripted screenshot setups
const SMOKE = params.get('smoke') === '1';    // headless self-test

class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.08, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.world = buildWorld(this.scene);
    this.sounds = new SoundBank();
    this.hud = new HUD(document);
    this.rounds = new RoundManager();
    this.tracers = new Tracers(this.scene);
    this.sparks = new Sparks(this.scene);
    this.grenades = new Grenades(this.scene);

    // --- fighters ----------------------------------------------------------
    // The player spawns centre; the three friendly bots flank them.
    this.player = new Player(this.world.spawns.attack[2]);
    this.player.loadout = newLoadout();
    this.playerHit = this.buildPlayerHitboxes();
    this.attackerSpawns = [
      this.world.spawns.attack[0], this.world.spawns.attack[1], this.world.spawns.attack[3],
    ];
    this.bots = [];
    for (let i = 0; i < BOTS.attackers; i++) {
      this.bots.push(new Bot('vanguard', i, this.attackerSpawns[i], this.scene));
    }
    for (let i = 0; i < BOTS.defenders; i++) {
      this.bots.push(new Bot('sentinel', i, this.world.spawns.defend[i % 5], this.scene));
    }
    this.fighters = [this.player, ...this.bots];
    // the combat module reads these off the fighter objects
    this.player.hitMeshes = this.playerHit.meshes;

    this.money = ECONOMY.startMoney;
    this.firing = false;
    this.plantKey = false;
    this.showBuy = false;
    this.locked = false;
    this.time = 0;
    this.acc = 0;
    this.shotsFired = 0;
    this.botShots = 0;
    this.botKills = 0;
    this.kills = 0;
    this.roundReasons = [];
    this.smokeRounds = 0;
    this.errors = [];
    this.chargeMesh = null;
    this.viewmodel = this.buildViewmodel();
    this.camera.add(this.viewmodel);
    // a soft light on the camera so the viewmodel reads in any light
    const camLight = new THREE.PointLight(0xfff2dd, 3, 4, 1.5);
    camLight.position.set(0.2, 0.1, 0.1);
    this.camera.add(camLight);
    this.scene.add(this.camera);
    this.muzzle = this.buildMuzzle();

    this.rounds.onEvent = (t, d) => this.onRoundEvent(t, d);
    window.addEventListener('error', (e) => { this.errors.push(String(e.message)); });
    this.bindInput();
    this.assignBots();
    this.setupDemo();
    if (!DEMO && !SMOKE) {
      this.hud.overlay(GAME_NAME, `${MAP_NAME} — click to play. First to ${ROUND.winScore} rounds wins.`);
    }
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // Invisible hitboxes for the player, so bots can shoot back at them.
  buildPlayerHitboxes() {
    const mk = (w, h, d, y, part) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ visible: false }));
      m.userData = { fighter: this.player, part };
      m.position.y = y;
      this.scene.add(m);
      return m;
    };
    const body = mk(0.56, 0.9, 0.36, 1.05, 'body');
    const head = mk(0.34, 0.32, 0.34, 1.62, 'head');
    return { meshes: [body, head], body, head };
  }

  syncPlayerHitboxes() {
    const p = this.player.pos;
    this.playerHit.body.position.set(p.x, p.y + 1.05, p.z);
    this.playerHit.head.position.set(p.x, p.y + 1.62, p.z);
  }

  // A simple gun viewmodel: boxes on the lower right of the camera.
  buildViewmodel() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.5, metalness: 0.5 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), mid);
    barrel.position.set(0, 0.02, -0.42);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), dark);
    grip.position.set(0, -0.12, 0.18);
    grip.rotation.x = 0.35;
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), mid);
    mag.position.set(0, -0.12, -0.05);
    g.add(body, barrel, grip, mag);
    g.position.set(0.32, -0.3, -0.7);
    g.scale.setScalar(0.62);
    return g;
  }

  buildMuzzle() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false }),
    );
    m.position.set(0.32, -0.27, -0.98);
    this.camera.add(m);
    return m;
  }

  // --- input ---------------------------------------------------------------
  bindInput() {
    const canvas = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      this.player.keys[e.code] = true;
      if (e.code === 'KeyR') this.reload();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyB' && this.rounds.phase === 'buy') this.toggleBuy();
      if (e.code === 'KeyE') this.plantKey = true;
      if (this.showBuy && /^Digit[1-6]$/.test(e.code)) {
        const item = shopItems()[Number(e.code.slice(5)) - 1];
        if (item) this.buy(item.id);
      }
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.player.keys[e.code] = false;
      if (e.code === 'KeyE') this.plantKey = false;
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.locked && !DEMO && !SMOKE) this.lockPointer();
        else this.firing = true;
      }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked) this.player.look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.rounds.phase === 'live' && !DEMO && !SMOKE) {
        this.hud.overlay('PAUSED', 'Click to resume — pointer lock was lost.');
      } else if (this.locked) {
        this.hud.hideOverlay();
      }
    });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  lockPointer() {
    this.sounds.resume();
    this.renderer.domElement.requestPointerLock();
  }

  // --- rounds ----------------------------------------------------------------
  assignBots() {
    // defenders hold the sites and mid; attackers push a site each round.
    const defs = this.bots.filter((b) => b.team === 'sentinel');
    const atks = this.bots.filter((b) => b.team === 'vanguard');
    const defNodes = ['siteA', 'siteB', 'defA', 'defB', 'midHold'];
    defs.forEach((b, i) => b.assign(defNodes[i % defNodes.length], 'hold'));
    // attackers: two push the sites, the third pushes mid
    atks[0] && atks[0].assign('siteA', 'patrol');
    atks[1] && atks[1].assign('siteB', 'patrol');
    atks[2] && atks[2].assign('midHigh', 'patrol');
  }

  onRoundEvent(type, d) {
    if (type === 'buy') {
      this.showBuy = !DEMO;
      this.hud.banner(`ROUND ${d.round}`, 'Buy phase — press B for the shop', 2200);
      this.sounds.buy();
    } else if (type === 'roundStart') {
      this.showBuy = false;
      this.hud.banner(`ROUND ${d.round}`, 'Plant the charge at FURNACE or STOREHOUSE', 2200);
    } else if (type === 'roundEnd') {
      this.smokeRounds++;
      this.roundReasons.push(`${d.winner}:${d.reason}`);
      const won = d.winner === 'vanguard';
      this.hud.banner(won ? 'ROUND WON' : 'ROUND LOST', d.reason, 3000);
      if (won) this.sounds.roundWin(); else this.sounds.roundLose();
      this.removeChargeMesh();
    } else if (type === 'matchEnd') {
      const won = d.winner === 'vanguard';
      this.hud.overlay(
        won ? 'VICTORY' : d.winner === 'draw' ? 'DRAW' : 'DEFEAT',
        `Vanguard ${d.score.vanguard} — ${d.score.sentinel} Sentinel. Click to play again.`,
      );
    } else if (type === 'planted') {
      this.hud.banner('CHARGE PLANTED', `Site ${d.site} — defend it until it blows`, 3000);
      this.spawnChargeMesh(d.site);
      this.sounds.plantBeep();
    }
  }

  spawnChargeMesh(site) {
    this.removeChargeMesh();
    const s = this.world.sites[site];
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 }));
    box.position.y = 0.15;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    light.position.set(0, 0.34, 0);
    g.add(box, light);
    g.position.set(s.center.x, 0, s.center.z);
    this.scene.add(g);
    this.chargeMesh = g;
    this.chargeLight = light;
  }

  removeChargeMesh() {
    if (this.chargeMesh) {
      this.scene.remove(this.chargeMesh);
      this.chargeMesh = null;
    }
  }

  // --- actions ---------------------------------------------------------------
  reload() {
    if (this.rounds.phase !== 'live' && this.rounds.phase !== 'buy') return;
    if (startReload(this.player.loadout, this.time)) this.sounds.reload();
  }

  buy(id) {
    if (this.rounds.phase !== 'buy') return;
    const l = this.player.loadout;
    let r;
    if (id === 'armor') r = buyArmor(l, this.money);
    else if (id === 'grenade') r = buyGrenade(l, this.money);
    else if (id === 'ammo') r = buyAmmo(l, this.money);
    else r = buyWeapon(l, id, this.money);
    if (r.ok) { this.money = r.money; this.sounds.buy(); this.updateViewmodel(); }
    else this.sounds.denied();
  }

  toggleBuy() {
    this.showBuy = !this.showBuy;
    if (this.showBuy) this.sounds.buy();
  }

  throwGrenade() {
    const l = this.player.loadout;
    if (this.rounds.phase !== 'live' || !this.player.alive || l.grenades <= 0) return;
    l.grenades--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.grenades.throw(this.player.eye, dir);
    this.sounds.grenadePin();
  }

  updateViewmodel() {
    const w = currentWeapon(this.player.loadout);
    if (!w) return;
    const len = w.id === 'sniper' ? 0.85 : w.id === 'rifle' ? 0.62 : w.id === 'smg' ? 0.5 : 0.42;
    this.viewmodel.scale.set(1, 1, len / 0.55);
  }

  // Fire the player's current weapon along the camera ray.
  shootPlayer() {
    const l = this.player.loadout;
    const w = fireShot(l, this.time);
    if (!w) {
      if (l && currentWeapon(l) && currentWeapon(l).mag === 0) this.sounds.dryFire();
      return;
    }
    this.shotsFired++;
    const spread = spreadOf(l, this.player.moveAmount, this.player.crouched);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    const origin = this.player.eye;
    const res = resolveShot(this, this.player, origin, dir, w);
    const end = res.point || origin.clone().addScaledVector(dir, w.range);
    this.tracers.fire(origin.clone().addScaledVector(dir, 0.6), end, w.tracer);
    this.muzzle.material.opacity = 0.9;
    this.player.addRecoil(w.kick);
    this.viewmodel.position.z = -0.7 + 0.05;
    this.sounds.shot(w.sound, 0);
    if (res.hit) {
      this.hud.hitmarker(res.head);
      this.sounds.hit(res.head);
      if (res.killed) {
        this.kills++;
        this.money += ECONOMY.killReward;
        this.sounds.kill();
        this.hud.killfeed(`You ▸ ${res.fighter.name || 'enemy'}`);
      }
    } else if (res.wall) {
      this.sparks.burst(res.point);
    }
  }

  // A bot fires: resolve its shot the same way, with sound by distance.
  shootBot(action) {
    this.botShots++;
    const res = resolveShot(this, action.shooter, action.origin, action.dir, action.weapon);
    const end = res.point || action.origin.clone().addScaledVector(action.dir, action.weapon.range);
    this.tracers.fire(action.origin, end, action.weapon.tracer);
    const d = this.player.pos.distanceTo(action.origin);
    this.sounds.shot(action.weapon.sound, Math.min(1, d / 55));
    // tell nearby defenders where the shot came from
    for (const b of this.bots) {
      if (b.team === 'sentinel' && b.alive && b.pos.distanceTo(action.origin) < BOTS.hearingRadius) {
        b.heardAt = action.origin.clone();
      }
    }
    if (res.hit) {
      if (res.fighter === this.player) {
        this.hud.damageFlash();
        this.sounds.hurt();
        if (res.killed) this.hud.killfeed(`${action.shooter.name} ▸ You`);
      } else if (res.killed) {
        this.botKills++;
        this.hud.killfeed(`${action.shooter.name} ▸ ${res.fighter.name}`);
      }
    } else if (res.wall) {
      this.sparks.burst(res.point);
    }
  }

  explode(pos) {
    this.sounds.explosion(Math.min(1, this.player.pos.distanceTo(pos) / 55));
    this.sparks.burst(pos);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const d = f.pos.distanceTo(pos);
      if (d < GRENADE.radius) {
        let dmg = GRENADE.damage * (1 - d / GRENADE.radius);
        if (f.loadout) dmg = Math.max(1, applyDamage(f.loadout, dmg));
        const killed = f.damage(dmg);
        if (killed && f === this.player) this.hud.killfeed('Spark frag ▸ You');
        else if (killed) {
          this.hud.killfeed(`Spark frag ▸ ${f.name}`);
          if (f.team === 'sentinel') { this.kills++; this.money += ECONOMY.killReward; }
        }
        if (f === this.player) this.hud.damageFlash();
      }
    }
  }

  // --- simulation ------------------------------------------------------------
  step(dt) {
    this.time += dt;
    const R = this.rounds;

    // round clock
    const ev = R.tick(dt);
    if (ev === 'detonate') this.removeChargeMesh();
    if (R.phase === 'lobby' || R.phase === 'match') {
      this.updateCameraAndHud(dt);
      return;
    }

    // player movement (allowed in buy and live; frozen when dead)
    if (this.player.alive) {
      this.player.step(dt, { jump: !!this.player.keys['Space'] }, this.world.colliders, () => this.sounds.step());
      finishReload(this.player.loadout, this.time);
      tickLoadout(this.player.loadout, dt);
      if (this.firing && R.phase === 'live') this.shootPlayer();
      // grenade is thrown on keydown; nothing per-tick here
    }

    // bots act in live phase only
    if (R.phase === 'live') {
      for (const b of this.bots) {
        if (!b.alive) continue;
        // in demo (screenshot) mode the bots leave the player alone, so the
        // shot is never ruined by the player dying mid-frame
        const foes = DEMO
          ? this.fighters.filter((f) => f.team !== b.team && f !== this.player)
          : this.fighters.filter((f) => f.team !== b.team);
        const ctx = {
          now: this.time, dt,
          waypoints: this.world.waypoints, colliders: this.world.colliders,
          enemies: foes,
          los: (a, c) => hasLOS(this, a, c),
          sites: this.world.sites,
          planted: R.planted ? { site: R.planted.site } : null,
          plantSite: null,
          player: this.player,
        };
        // attacker bots plant when they reach their site
        if (b.team === 'vanguard' && b.state === 'patrol' && b.assignNode) {
          const siteId = b.assignNode === 'siteA' ? 'A' : b.assignNode === 'siteB' ? 'B' : null;
          if (siteId && R.siteAt(b.pos, this.world.sites) === siteId) ctx.plantSite = siteId;
        }
        const action = b.update(ctx);
        if (action && action.type === 'shot') this.shootBot(action);
        else if (action && action.type === 'planted' && !R.planted) {
          R.planted = { site: action.bot.assignNode === 'siteA' ? 'A' : 'B', pos: action.bot.pos.clone(), fuse: ROUND.fuseSeconds };
          R.money += ECONOMY.plantReward;
          R.emit('planted', { site: R.planted.site });
          this.spawnChargeMesh(R.planted.site);
        } else if (action && action.type === 'defused') {
          R.endRound('sentinel', 'Charge defused');
        }
        b.syncMesh();
      }
    }

    // player planting / defusing (hold E)
    if (R.phase === 'live' && this.player.alive) {
      if (this.plantKey && !R.planted) {
        const site = R.siteAt(this.player.pos, this.world.sites);
        if (site) R.tickPlant(dt, this.player, site);
      } else if (this.plantKey && R.planted) {
        R.tickDefuse(dt, this.player, R.nearCharge(this.player.pos));
      } else {
        R.planting = null;
        R.defusing = null;
      }
    }

    // grenades
    const booms = this.grenades.tick(dt, this.world.colliders);
    for (const b of booms) this.explode(b.pos);

    // elimination wins
    const aliveV = this.fighters.filter((f) => f.team === 'vanguard' && f.alive).length;
    const aliveS = this.fighters.filter((f) => f.team === 'sentinel' && f.alive).length;
    R.checkElimination(aliveV, aliveS);

    // respawn the player at the next buy phase
    if (R.phase === 'buy' && !this.player.alive) {
      this.player.reset(this.world.spawns.attack[2]);
      this.player.loadout = newLoadout();
      this.assignBots();
      for (const b of this.bots) {
        const spawn = b.team === 'vanguard'
          ? this.attackerSpawns[this.bots.filter((x) => x.team === 'vanguard').indexOf(b)]
          : this.world.spawns.defend[this.bots.filter((x) => x.team === 'sentinel').indexOf(b) % 5];
        b.reset(spawn);
      }
      this.assignBots();
    }
    if (R.phase === 'buy') this.syncPlayerHitboxes();

    // charge blink + beeps as the fuse runs down
    if (R.planted && this.chargeMesh) {
      const blink = Math.sin(this.time * (R.planted.fuse < 10 ? 14 : 6)) > 0;
      this.chargeLight.material.color.setHex(blink ? 0xff2a1a : 0x551208);
      if (R.planted.fuse < 10 && Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
        this.sounds.plantBeep();
      }
    }

    // viewmodel bob + recoil recovery
    const bob = this.player.moveAmount * Math.sin(this.time * 11) * 0.012;
    this.viewmodel.position.y = -0.3 + bob;
    this.viewmodel.position.z += (-0.7 - this.viewmodel.position.z) * Math.min(1, dt * 10);
    this.muzzle.material.opacity = Math.max(0, this.muzzle.material.opacity - dt * 14);

    this.tracers.tick(dt);
    this.sparks.tick(dt);
    this.syncPlayerHitboxes();
    this.updateCameraAndHud(dt);
  }

  updateCameraAndHud(dt) {
    // camera: the player, or a spectated bot when dead
    if (this.player.alive) {
      this.player.applyCamera(this.camera);
    } else {
      const spec = this.bots.find((b) => b.alive && b.team === 'vanguard')
        || this.bots.find((b) => b.alive);
      if (spec) {
        this.camera.position.set(spec.pos.x, spec.pos.y + 1.6, spec.pos.z);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = spec.yaw;
        this.camera.rotation.x = 0;
      }
    }
    const R = this.rounds;
    const w = currentWeapon(this.player.loadout);
    const aliveV = this.fighters.filter((f) => f.team === 'vanguard' && f.alive).length;
    const aliveS = this.fighters.filter((f) => f.team === 'sentinel' && f.alive).length;
    let objective = 'Plant the charge at FURNACE or STOREHOUSE';
    if (R.planted) objective = `Charge planted at ${R.planted.site} — ${Math.ceil(R.planted.fuse)}s`;
    else if (R.phase === 'buy') objective = 'Buy phase — press B for the shop';
    else if (R.phase === 'lobby') objective = 'Click to play';
    let hint = '';
    if (!this.player.alive) hint = 'You are down — spectating';
    else if (R.phase === 'live' && !R.planted && R.siteAt(this.player.pos, this.world.sites)) hint = 'Hold E to plant the charge';
    else if (R.phase === 'live' && R.planted && this.player.team === 'vanguard') hint = 'Defend the charge';
    else if (R.phase === 'live' && R.planted) hint = 'Hold E at the charge to defuse';
    let plant = null;
    if (R.planting && R.planting.by === this.player) {
      plant = { label: 'PLANTING…', progress: R.planting.progress / ROUND.plantSeconds };
    } else if (R.defusing && R.defusing.by === this.player) {
      plant = { label: 'DEFUSING…', progress: R.defusing.progress / ROUND.defuseSeconds };
    }
    this.hud.set({
      hp: this.player.hp,
      armor: this.player.loadout ? this.player.loadout.armor : 0,
      weapon: w,
      reloading: this.player.loadout ? this.player.loadout.reloading : false,
      money: this.money,
      timer: R.phase === 'live' || R.phase === 'buy' ? R.timer : 0,
      score: R.score,
      aliveV, aliveS,
      spread: w ? spreadOf(this.player.loadout, this.player.moveAmount, this.player.crouched) : 0.02,
      showCrosshair: this.player.alive && (R.phase === 'live') && !this.showBuy,
      objective, hint, plant,
      showBuy: this.showBuy && R.phase === 'buy',
      owned: this.player.loadout ? this.player.loadout.weapons : {},
      onBuy: (id) => this.buy(id),
    });
  }

  // --- demo / smoke ------------------------------------------------------------
  setupDemo() {
    if (SMOKE) {
      // headless self-test: start at once, no pointer lock, no overlay
      this.hud.hideOverlay();
      this.rounds.startMatch();
      this._smokeSteps = 0;
      return;
    }
    if (!DEMO) return;
    this.hud.hideOverlay();
    this.rounds.startMatch();
    // jump straight into the live round for the shot
    this.rounds.startRound();
    if (DEMO === '1') {
      // wide view down mid, bots in the lane
      this.player.pos.set(0, 0, 16);
      this.player.yaw = 0;
      this.player.pitch = -0.02;
    } else if (DEMO === '2') {
      // aiming down A Long, an enemy bot in the sights
      this.player.pos.set(24, 0, 14);
      this.player.yaw = 0;
      this.player.pitch = 0.01;
      const e = this.bots.find((b) => b.team === 'sentinel');
      if (e) { e.pos.set(24, 0, -6); e.yaw = 0; e.syncMesh(); }
    } else if (DEMO === '3') {
      // buy menu open at round start
      this.rounds.phase = 'buy';
      this.rounds.timer = ROUND.buySeconds;
      this.showBuy = true;
      this.player.pos.set(0, 0, 18);
      this.player.yaw = 0;
    } else if (DEMO === '4') {
      // planting the charge at site A: a clear view of the site, the
      // furnace and the plant in progress
      this.player.pos.set(25, 0, -12);
      this.player.yaw = Math.PI * 0.75;
      this.plantKey = true;
      this.rounds.planting = { by: this.player, site: 'A', progress: 1.6 };
    }
  }

  loop(t) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (t - (this._last || t)) / 1000 || 0.016);
    this._last = t;
    if (SMOKE) {
      // fast-forward: many fixed steps per frame, then report. The hitbox
      // meshes only move when the scene graph updates, so refresh the world
      // matrices every game-second or shots would test stale positions.
      for (let i = 0; i < 3600; i++) {
        this.step(STEP);
        this._smokeSteps++;
        if (this._smokeSteps % 60 === 0) this.scene.updateMatrixWorld(true);
        if (this._smokeSteps > 600 * 60 * 3) break; // ~3 game-minutes max
        if (this.rounds.phase === 'match') break;
      }
      const el = document.getElementById('status');
      const msg = `SMOKE rounds=${this.smokeRounds} shots=${this.shotsFired} botShots=${this.botShots} botKills=${this.botKills} kills=${this.kills} phase=${this.rounds.phase} score=${this.rounds.score.vanguard}-${this.rounds.score.sentinel} errors=${this.errors.length} playerHp=${this.player.hp} reasons=[${this.roundReasons.join(' | ')}]`;
      if (el) el.textContent = msg;
      document.title = msg;
      if (this.rounds.phase === 'match' || this._smokeSteps > 600 * 60 * 3) {
        // done: stop stepping, keep rendering the final frame
        this._smokeDone = true;
      }
      if (!this._smokeDone) return;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 5) this.acc = 0;
    this.renderer.render(this.scene, this.camera);
  }
}

// Click the start overlay to play (or restart after a match).
document.getElementById('overlay').addEventListener('click', () => {
  const g = window.__game;
  if (!g) return;
  g.sounds.resume();
  if (g.rounds.phase === 'lobby' || g.rounds.phase === 'match') {
    g.rounds.startMatch();
    g.player.reset(g.world.spawns.attack[2]);
    g.player.loadout = newLoadout();
    g.money = ECONOMY.startMoney;
    for (const b of g.bots) {
      const spawn = b.team === 'vanguard'
        ? g.attackerSpawns[g.bots.filter((x) => x.team === 'vanguard').indexOf(b)]
        : g.world.spawns.defend[g.bots.filter((x) => x.team === 'sentinel').indexOf(b) % 5];
      b.reset(spawn);
    }
    g.assignBots();
    g.updateViewmodel();
  }
  g.hud.hideOverlay();
  g.lockPointer();
});

window.__game = new Game();
document.getElementById('status').textContent = 'ready';
