// RUSTLINE — round 3. Match and round state: buy phase, live round, round
// end, economy, the spike (plant / defuse / detonate), and match end.
// First to 5, at most 9 rounds; a 4-4 tie is decided by round 9.
import { MAP, ECONOMY, WEAPONS, GRENADES, VEST_PRICE, SPAWNS, SITES } from './config.js';
import { makeLoadout, buyWeapon, buyGrenade, buyVest } from './weapons.js';
import { assignRoundRoles } from './bots.js';

export class Match {
  constructor(agents, game) {
    this.agents = agents;
    this.game = game;
    this.score = { vanguard: 0, sentinel: 0 };
    this.roundNum = 0;
    this.phase = 'buy'; // buy | live | over
    this.timeLeft = MAP.buyTime;
    this.spike = { state: 'carried', site: null, carrier: null, plantedAt: 0, pos: null };
    this.lossStreak = { vanguard: 0, sentinel: 0 };
    this.roundLog = [];
    this.winner = null;
    this.lastCombatAt = 0;
    this.nudgeFired = false;
    this.onEvent = null; // (event) => void — HUD / feed
    this.onRoundEnd = null;
    this.onMatchEnd = null;
  }

  emit(type, data) {
    if (this.onEvent) this.onEvent({ type, ...data });
  }

  startMatch() {
    this.score = { vanguard: 0, sentinel: 0 };
    this.roundNum = 0;
    this.winner = null;
    this.roundLog = [];
    this.startRound();
  }

  startRound() {
    this.roundNum++;
    this.phase = 'buy';
    this.timeLeft = MAP.buyTime;
    this.spike = { state: 'carried', site: null, carrier: null, plantedAt: 0, pos: null };
    this.nudgeFired = false;
    this.lastCombatAt = 0;
    // reset agents: positions, health, spike carrier
    const vanguard = this.agents.filter((a) => a.team === 'vanguard');
    const sentinel = this.agents.filter((a) => a.team === 'sentinel');
    vanguard.forEach((a, i) => {
      const s = SPAWNS.vanguard[i % SPAWNS.vanguard.length];
      a.pos.x = s.x;
      a.pos.z = s.z;
      a.y = 0;
      a.yaw = -Math.PI / 2; // face east, toward the yard
      a.health = 100;
      a.blindedUntil = 0;
      a.lastDamageAt = -10;
      if (a.isBot) {
        a.bot.state = 'idle';
        a.bot.target = null;
        a.bot.path = [];
        a.bot.plantProgress = 0;
        a.bot.defuseProgress = 0;
      }
    });
    sentinel.forEach((a, i) => {
      const s = SPAWNS.sentinel[i % SPAWNS.sentinel.length];
      a.pos.x = s.x;
      a.pos.z = s.z;
      a.y = 0;
      a.yaw = Math.PI / 2; // face west
      a.health = 100;
      a.blindedUntil = 0;
      a.lastDamageAt = -10;
      if (a.isBot) {
        a.bot.state = 'hold';
        a.bot.target = null;
        a.bot.path = [];
        a.bot.holdWp = -1;
        a.bot.plantProgress = 0;
        a.bot.defuseProgress = 0;
      }
    });
    // spike carrier: the first living Vanguard bot (or the player)
    const carrier = vanguard.find((a) => !a.isPlayer) || vanguard[0];
    this.spike.carrier = carrier;
    assignRoundRoles(this.agents, this.game.rng);
    this.emit('roundStart', { round: this.roundNum, carrier: carrier?.name });
  }

  /** Auto-buy for bots during the buy phase (simple, role-based). */
  autoBuy(agent) {
    const money = agent.money;
    const loadout = agent.loadout;
    const rng = this.game.rng;
    // keep the sidearm; buy a primary if affordable
    if (!loadout.weapons.vk47 && !loadout.weapons.raptor && money >= WEAPONS.vk47.price) {
      if (agent.money >= WEAPONS.vk47.price && buyWeapon(loadout, 'vk47')) agent.money -= WEAPONS.vk47.price;
    } else if (!loadout.weapons.raptor && money >= WEAPONS.raptor.price && money < WEAPONS.vk47.price) {
      if (buyWeapon(loadout, 'raptor')) agent.money -= WEAPONS.raptor.price;
    }
    if (agent.money >= WEAPONS.longshot.price && rng() < 0.25 && !loadout.weapons.longshot) {
      if (buyWeapon(loadout, 'longshot')) agent.money -= WEAPONS.longshot.price;
    }
    if (agent.money >= GRENADES.he.price && rng() < 0.6) {
      if (buyGrenade(loadout, 'he')) agent.money -= GRENADES.he.price;
    }
    if (agent.money >= GRENADES.flash.price && rng() < 0.3) {
      if (buyGrenade(loadout, 'flash')) agent.money -= GRENADES.flash.price;
    }
    if (!loadout.vest && agent.money >= VEST_PRICE && rng() < 0.7) {
      if (buyVest(loadout)) agent.money -= VEST_PRICE;
    }
  }

  /** Player buy. Returns true when the purchase went through. */
  playerBuy(kind, id) {
    const agent = this.agents.find((a) => a.isPlayer);
    if (!agent || this.phase !== 'buy') return false;
    const loadout = agent.loadout;
    if (kind === 'weapon') {
      const def = WEAPONS[id];
      if (!def || agent.money < def.price || loadout.weapons[id]) return false;
      if (buyWeapon(loadout, id)) {
        agent.money -= def.price;
        return true;
      }
    } else if (kind === 'grenade') {
      const def = GRENADES[id];
      if (!def || agent.money < def.price) return false;
      if (buyGrenade(loadout, id)) {
        agent.money -= def.price;
        return true;
      }
    } else if (kind === 'vest') {
      if (agent.money < VEST_PRICE || loadout.vest) return false;
      if (buyVest(loadout)) {
        agent.money -= VEST_PRICE;
        return true;
      }
    }
    return false;
  }

  plantSpike(agent, siteId, now) {
    if (this.phase !== 'live' || this.spike.state !== 'carried') return;
    this.spike.state = 'planted';
    this.spike.site = siteId;
    this.spike.carrier = null;
    this.spike.plantedAt = now;
    this.spike.pos = { x: SITES[siteId].x, z: SITES[siteId].z };
    // retake delay for Sentinel bots so the plant breathes
    for (const a of this.agents) {
      if (a.team === 'sentinel' && a.isBot) a.bot.retakeAt = now + (a.bot.retakeDelay || 0) + this.game.rng() * 0.8;
    }
    this.emit('planted', { site: siteId, by: agent.name });
  }

  defuseSpike(agent, now) {
    if (this.phase !== 'live' || this.spike.state !== 'planted') return;
    this.spike.state = 'defused';
    this.endRound('sentinel', 'defuse', now);
  }

  dropSpike(agent) {
    if (this.spike.carrier === agent) {
      this.spike.state = 'dropped';
      this.spike.carrier = null;
      this.spike.pos = { x: agent.pos.x, z: agent.pos.z };
      this.emit('spikeDropped', { x: agent.pos.x, z: agent.pos.z });
    }
  }

  /** One fixed step of the match clock. */
  tick(dt, now) {
    if (this.phase === 'over') return;
    this.timeLeft -= dt;

    if (this.phase === 'buy') {
      if (this.timeLeft <= 0) {
        this.phase = 'live';
        this.timeLeft = MAP.roundTime;
        this.lastCombatAt = now;
        this.emit('live', { round: this.roundNum });
      }
      return;
    }

    // live round
    if (this.spike.state === 'planted') {
      const fuseLeft = MAP.fuseTime - (now - this.spike.plantedAt);
      if (fuseLeft <= 0) {
        this.spike.state = 'detonated';
        this.emit('detonated', { site: this.spike.site });
        this.endRound('vanguard', 'detonation', now);
        return;
      }
    }

    // objective nudge: a quiet round gets pushed toward the site — reset
    // the attackers' state so updateVanguard re-paths them (clearing the
    // path alone would leave them standing in a stale 'push' state)
    if (!this.nudgeFired && now - this.lastCombatAt > MAP.idleNudgeAfter && this.spike.state !== 'planted') {
      this.nudgeFired = true;
      this.emit('nudge', {});
      for (const a of this.agents) {
        if (a.team === 'vanguard' && a.isBot && a.health > 0) {
          a.bot.state = 'idle';
          a.bot.target = null;
          a.bot.peekState = 'none';
          a.bot.path = [];
          a.bot.pathIdx = 0;
        }
      }
    }

    if (this.timeLeft <= 0) {
      // time expires: defenders win unless the spike is planted
      if (this.spike.state === 'planted') {
        // fuse handles the outcome; give the round to Sentinel if defused in time — handled above
        this.endRound('sentinel', 'time', now);
      } else {
        this.endRound('sentinel', 'time', now);
      }
    }
  }

  aliveCount(team) {
    return this.agents.filter((a) => a.team === team && a.health > 0).length;
  }

  /** Check elimination wins; call after every kill. */
  checkElimination(now) {
    if (this.phase !== 'live') return;
    if (this.spike.state === 'planted') return; // spike decides it
    if (this.aliveCount('sentinel') === 0) this.endRound('vanguard', 'elimination', now);
    else if (this.aliveCount('vanguard') === 0) this.endRound('sentinel', 'elimination', now);
  }

  endRound(winnerTeam, reason, now) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.score[winnerTeam]++;
    const loser = winnerTeam === 'vanguard' ? 'sentinel' : 'vanguard';
    this.lossStreak[winnerTeam] = 0;
    this.lossStreak[loser] = Math.min(3, this.lossStreak[loser] + 1);
    // economy
    for (const a of this.agents) {
      if (a.team === winnerTeam) {
        a.money += ECONOMY.winReward;
        if (a.health > 0) a.money += 0;
      } else {
        a.money += ECONOMY.lossReward + this.lossStreak[loser] * ECONOMY.lossStreakBonus;
      }
      a.money = Math.min(16000, a.money);
    }
    this.roundLog.push({ round: this.roundNum, winner: winnerTeam, reason });
    this.emit('roundEnd', { round: this.roundNum, winner: winnerTeam, reason, score: { ...this.score } });
    if (this.onRoundEnd) this.onRoundEnd(this.roundNum, winnerTeam, reason);

    if (this.score[winnerTeam] >= MAP.winRounds || this.roundNum >= MAP.maxRounds) {
      this.winner = winnerTeam;
      this.emit('matchEnd', { winner: winnerTeam, score: { ...this.score } });
      if (this.onMatchEnd) this.onMatchEnd(winnerTeam, { ...this.score });
      return;
    }
    // next round after a short breather (handled by main.js timer)
    this.nextRoundAt = now + 3.5;
  }

  maybeNextRound(now) {
    if (this.phase === 'over' && !this.winner && this.nextRoundAt && now >= this.nextRoundAt) {
      this.nextRoundAt = 0;
      this.startRound();
    }
  }
}
