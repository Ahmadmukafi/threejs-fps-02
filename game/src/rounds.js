// RUSTLINE — rounds. The state machine for a match: LOBBY (click to play)
// -> BUY (buy phase, frozen in spawn) -> LIVE (the round plays) -> END
// (banner, then the next buy phase) -> MATCH (a team reached 5).
// It owns money, the score, the round timer, and the charge (plant/defuse).

import * as THREE from 'three';
import { ROUND, ECONOMY, WEAPONS, GRENADE } from './config.js';

export class RoundManager {
  constructor() {
    this.phase = 'lobby';     // lobby | buy | live | end | match
    this.round = 0;
    this.score = { vanguard: 0, sentinel: 0 };
    this.timer = 0;
    this.money = ECONOMY.startMoney;
    this.planted = null;      // { site: 'A'|'B', pos: Vector3, fuse: seconds }
    this.planting = null;     // { by, site, progress }
    this.defusing = null;     // { by, progress }
    this.lastWinner = null;
    this.lastReason = '';
    this.matchWinner = null;
    this.onEvent = null;      // (type, data) — the sim hooks sounds + HUD here
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent(type, data);
  }

  startMatch() {
    this.phase = 'buy';
    this.round = 1;
    this.score = { vanguard: 0, sentinel: 0 };
    this.timer = ROUND.buySeconds;
    this.money = ECONOMY.startMoney;
    this.planted = null;
    this.planting = null;
    this.defusing = null;
    this.matchWinner = null;
    this.emit('buy', { round: 1 });
  }

  startRound() {
    this.phase = 'live';
    this.timer = ROUND.roundSeconds;
    this.planted = null;
    this.planting = null;
    this.defusing = null;
    this.emit('roundStart', { round: this.round });
  }

  // The round ends: award money, update the score, move to the next phase.
  endRound(winner, reason) {
    if (this.phase === 'end' || this.phase === 'match') return;
    this.lastWinner = winner;
    this.lastReason = reason;
    this.score[winner]++;
    this.money += winner === 'vanguard' ? ECONOMY.winBonus : ECONOMY.lossBonus;
    this.planted = null;
    this.planting = null;
    this.defusing = null;
    this.emit('roundEnd', { winner, reason, score: { ...this.score } });
    if (this.score[winner] >= ROUND.winScore || this.round >= ROUND.maxRounds) {
      this.phase = 'match';
      this.matchWinner = this.score.vanguard > this.score.sentinel ? 'vanguard'
        : this.score.sentinel > this.score.vanguard ? 'sentinel' : 'draw';
      this.emit('matchEnd', { winner: this.matchWinner, score: { ...this.score } });
    } else {
      this.phase = 'end';
      this.timer = ROUND.freezeAfterRound;
    }
  }

  nextRound() {
    this.round++;
    this.phase = 'buy';
    this.timer = ROUND.buySeconds;
    this.emit('buy', { round: this.round });
  }

  // Planting: a fighter holds E inside a site. Call every tick with the
  // fighter and the site they stand in (or null). Returns the site when the
  // plant completes.
  tickPlant(dt, fighter, siteId) {
    if (this.phase !== 'live' || this.planted) return null;
    if (fighter && fighter.team === 'vanguard' && siteId && fighter.alive) {
      if (!this.planting || this.planting.by !== fighter) {
        this.planting = { by: fighter, site: siteId, progress: 0 };
      }
      this.planting.progress += dt;
      if (this.planting.progress >= ROUND.plantSeconds) {
        const site = siteId;
        this.planted = { site, pos: fighter.pos.clone(), fuse: ROUND.fuseSeconds };
        this.planting = null;
        this.money += ECONOMY.plantReward;
        this.emit('planted', { site });
        return site;
      }
    } else {
      this.planting = null;
    }
    return null;
  }

  // Defusing: a defender holds E at the planted charge.
  tickDefuse(dt, fighter, nearCharge) {
    if (this.phase !== 'live' || !this.planted) return null;
    if (fighter && fighter.team === 'sentinel' && nearCharge && fighter.alive) {
      if (!this.defusing || this.defusing.by !== fighter) {
        this.defusing = { by: fighter, progress: 0 };
      }
      this.defusing.progress += dt;
      if (this.defusing.progress >= ROUND.defuseSeconds) {
        this.defusing = null;
        this.endRound('sentinel', 'Charge defused');
        return true;
      }
    } else {
      this.defusing = null;
    }
    return null;
  }

  // The live-round clock. Call every tick; returns 'timeout' when the round
  // timer expires, 'detonate' when the fuse burns out.
  tick(dt) {
    if (this.phase === 'buy') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
      return null;
    }
    if (this.phase === 'end') {
      this.timer -= dt;
      if (this.timer <= 0) this.nextRound();
      return null;
    }
    if (this.phase !== 'live') return null;
    if (this.planted) {
      this.planted.fuse -= dt;
      if (this.planted.fuse <= 0) {
        this.endRound('vanguard', 'Charge detonated');
        return 'detonate';
      }
      return null;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.endRound('sentinel', 'Time expired — no plant');
      return 'timeout';
    }
    return null;
  }

  // Which site is a fighter standing in, if any? (sites from world.js)
  siteAt(pos, sites) {
    for (const [id, s] of Object.entries(sites)) {
      const dx = pos.x - s.center.x, dz = pos.z - s.center.z;
      if (dx * dx + dz * dz < s.radius * s.radius) return id;
    }
    return null;
  }

  // How far is a fighter from the planted charge?
  nearCharge(pos, radius = 2.2) {
    if (!this.planted) return false;
    return pos.distanceTo(this.planted.pos) < radius;
  }

  // Alive counts decide elimination wins; the sim calls this each tick.
  checkElimination(aliveV, aliveS) {
    if (this.phase !== 'live') return;
    if (this.planted) {
      if (aliveV === 0) this.endRound('sentinel', 'Attackers eliminated');
    } else {
      if (aliveV === 0) this.endRound('sentinel', 'Vanguard eliminated');
      else if (aliveS === 0) this.endRound('vanguard', 'Sentinel eliminated');
    }
  }
}

// The buy menu's catalogue, shared by the HUD and the sim.
export function shopItems() {
  return [
    { kind: 'weapon', id: 'smg', key: '1', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: 'Fast, close-range spray' },
    { kind: 'weapon', id: 'rifle', key: '2', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: 'Accurate all-rounder' },
    { kind: 'weapon', id: 'sniper', key: '3', name: WEAPONS.sniper.name, price: WEAPONS.sniper.price, desc: 'One shot, long range' },
    { kind: 'armor', id: 'armor', key: '4', name: 'Plate Vest', price: 650, desc: 'Absorbs half of each hit' },
    { kind: 'grenade', id: 'grenade', key: '5', name: GRENADE.name, price: GRENADE.price, desc: 'Frag — 110 damage in 7 m' },
    { kind: 'ammo', id: 'ammo', key: '6', name: 'Reserve Ammo', price: 200, desc: 'Refill the current weapon' },
  ];
}
