// RUSTLINE — rounds: the match state machine.
// buy (15 s) -> live (100 s) -> end -> next round, first to 5 (max 9).
// Vanguard attacks and plants; Sentinel defends and defuses. Every round
// end pays the economy and the HUD banner names the reason.

import { CONFIG, SITES, SPAWNS } from './config.js';

export class RoundManager {
  constructor(game) {
    this.game = game;
    this.round = 0;
    this.score = { vanguard: 0, sentinel: 0 };
    this.phase = 'lobby';
    this.phaseTimer = 0;
    this.fuseTimer = 0;
    this.attackSite = 'A';
    this.bombState = 'carried'; // carried | planted | exploded | defused
    this.bombSite = null;
    this.carrier = null;
    this.roundLog = [];
    this.matchOver = false;
    this.winner = null;
  }

  startMatch() {
    this.round = 0;
    this.score = { vanguard: 0, sentinel: 0 };
    this.matchOver = false;
    this.winner = null;
    this.startRound();
  }

  startRound() {
    this.round += 1;
    this.phase = 'buy';
    this.phaseTimer = CONFIG.round.buySeconds;
    this.bombState = 'carried';
    this.bombSite = null;
    this.fuseTimer = 0;
    // Alternate the target site each round so both lanes see play.
    this.attackSite = this.round % 2 === 1 ? 'A' : 'B';
    const g = this.game;
    // Spawn the player and the bots.
    g.player.reset(SPAWNS.vanguard[0][0], SPAWNS.vanguard[0][1], Math.PI);
    const vBots = g.bots.filter((b) => b.team === 'vanguard');
    const sBots = g.bots.filter((b) => b.team === 'sentinel');
    vBots.forEach((b, i) => {
      const s = SPAWNS.vanguard[(i + 1) % SPAWNS.vanguard.length];
      b.reset(s[0], s[1], Math.PI, null);
      b.chooseObjective(g, this.attackSite);
    });
    sBots.forEach((b, i) => {
      const s = SPAWNS.sentinel[i % SPAWNS.sentinel.length];
      b.reset(s[0], s[1], 0, [15, 16, 5, 13, 2][i % 5]);
      b.chooseObjective(g, this.attackSite);
    });
    // The carrier is the first Vanguard bot (the player never carries in
    // round 1's spirit: bots do the planting, the player covers them).
    this.carrier = vBots[0] || null;
    g.hud.banner(`ROUND ${this.round} — ${SITES[this.attackSite].name}`, 'Vanguard pushes ' + SITES[this.attackSite].name);
    g.sounds.roundStart();
  }

  update(dt) {
    if (this.matchOver) return;
    if (this.phase === 'buy') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'live';
        this.phaseTimer = CONFIG.round.roundSeconds;
        this.game.hud.banner('GO', 'Plant the charge or clear the yard');
      }
      return;
    }
    if (this.phase === 'live') {
      this.phaseTimer -= dt;
      // If the carrier died, the charge passes to another living Vanguard
      // fighter — otherwise the bomb is lost with its carrier and Vanguard
      // can only win by elimination.
      if (this.bombState === 'carried' && (!this.carrier || !this.carrier.alive)) {
        const living = this.game.fighters.filter((f) => f.team === 'vanguard' && f.alive);
        this.carrier = living.length ? living[Math.floor(Math.random() * living.length)] : null;
        if (this.carrier) this.game.hud.addFeed((this.carrier.name || 'You') + ' picks up the charge');
      }
      if (this.bombState === 'planted') {
        this.fuseTimer -= dt;
        if (this.fuseTimer <= 0) { this.detonate(); return; }
      }
      if (this.phaseTimer <= 0) {
        // Time out: defenders win unless the bomb is ticking.
        if (this.bombState !== 'planted') this.endRound('sentinel', 'Time — Sentinel holds the yard');
        return;
      }
      // Elimination check.
      const vAlive = this.game.fighters.some((f) => f.team === 'vanguard' && f.alive);
      const sAlive = this.game.fighters.some((f) => f.team === 'sentinel' && f.alive);
      if (!vAlive) this.endRound('sentinel', 'Vanguard wiped out');
      else if (!sAlive) this.endRound('vanguard', 'Sentinel wiped out');
      return;
    }
    if (this.phase === 'end') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.score.vanguard >= CONFIG.round.winRounds || this.score.sentinel >= CONFIG.round.winRounds || this.round >= CONFIG.round.maxRounds) {
          this.endMatch();
        } else {
          this.startRound();
        }
      }
    }
  }

  plantBomb(siteKey, by) {
    if (this.bombState !== 'carried' || this.phase !== 'live') return;
    this.bombState = 'planted';
    this.bombSite = siteKey;
    this.fuseTimer = CONFIG.round.fuseSeconds;
    this.game.hud.banner('CHARGE PLANTED — ' + SITES[siteKey].name, 'Defend the charge · 35 s fuse');
    this.game.hud.addFeed(`${by.name || 'You'} planted the charge at ${siteKey}`);
    this.game.sounds.plantBeep(true);
    if (by.money !== undefined) by.money = (by.money || 0) + CONFIG.economy.plantBonus;
    this.game.onPlant(siteKey);
  }

  defuseBomb(by) {
    if (this.bombState !== 'planted') return;
    this.bombState = 'defused';
    this.endRound('sentinel', 'Charge defused by ' + (by.name || 'You'));
  }

  detonate() {
    this.bombState = 'exploded';
    this.game.onDetonate(SITES[this.bombSite]);
    this.endRound('vanguard', 'Charge detonated — ' + SITES[this.bombSite].name + ' is gone');
  }

  endRound(winnerTeam, reason) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.phaseTimer = 4;
    this.score[winnerTeam] += 1;
    this.roundLog.push({ round: this.round, winner: winnerTeam, reason });
    // Pay the economy (bots carry no money; only the player is paid here).
    const g = this.game;
    g.player.money += g.player.team === winnerTeam ? CONFIG.economy.winBonus : CONFIG.economy.lossBonus;
    g.hud.banner(winnerTeam === 'vanguard' ? 'VANGUARD TAKES THE ROUND' : 'SENTINEL TAKES THE ROUND', reason);
    g.hud.addFeed(reason);
    g.sounds.roundEnd(g.player.team === winnerTeam);
  }

  endMatch() {
    this.matchOver = true;
    this.phase = 'done';
    this.winner = this.score.vanguard > this.score.sentinel ? 'vanguard' : 'sentinel';
    const g = this.game;
    g.hud.showMatchEnd(this.winner, this.score, g.player.kills);
    g.sounds.roundEnd(g.player.team === this.winner);
  }
}
