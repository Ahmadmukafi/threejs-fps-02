// RUSTLINE — round 3. Bot AI: waypoint-BFS movement, vision + hearing,
// burst fire with real spread, peeking from cover at long range, site holds,
// rotations, retakes, planting and defusing. Sentinel defends slightly
// better than Vanguard attacks — that is the round-3 balance.
import { WAYPOINTS, WAYPOINT_EDGES, SITES, BOT, MOVE, WALLS } from './config.js';
import { buildGraph, bfsPath, nearestWaypoint, dist2D, segmentBlocked, pointBlocked, collideCircle, clamp, angleDiffDeg } from './util.js';

const ADJ = buildGraph(WAYPOINTS, WAYPOINT_EDGES);

// Waypoints that sit next to a wall: usable cover for peeking.
const COVERED = WAYPOINTS.map((w) => pointBlocked(w.x, w.z, WALLS, 2.2));

const SITE_ANCHORS = {
  A: [13, 22, 16],
  B: [14, 23, 17],
  MID: [24, 16, 17],
};

export function makeBotState(team, cfg, rng) {
  return {
    isBot: true,
    state: 'idle',
    path: [], // {x,z} points
    pathIdx: 0,
    targetSite: null,
    holdWp: -1,
    target: null, // enemy agent currently engaged
    lastSeen: null, // {x, z, t}
    heard: null, // {x, z, t}
    reactionUntil: 0,
    burstLeft: 0,
    burstSize: 0,
    burstPauseUntil: 0,
    peekState: 'none', // none | hide | expose
    peekUntil: 0,
    peekCover: null,
    strafeDir: 1,
    strafeUntil: 0,
    plantProgress: 0,
    defuseProgress: 0,
    skill: cfg.skill,
    reactionMin: cfg.reactionMin,
    reactionMax: cfg.reactionMax,
    burstMin: cfg.burstMin,
    burstMax: cfg.burstMax,
    burstPauseMin: cfg.burstPauseMin,
    burstPauseMax: cfg.burstPauseMax,
    holdBonus: cfg.holdAccuracyBonus,
    retakeDelay: cfg.retakeDelay,
    retakeAt: 0,
    assignedSite: rng() < 0.5 ? 'A' : 'B',
    thinkAt: 0,
  };
}

/** Give a bot a path (list of {x,z}) toward a waypoint id. */
function setPathTo(agent, wpId) {
  const from = nearestWaypoint(WAYPOINTS, agent.pos.x, agent.pos.z);
  const ids = bfsPath(ADJ, from, wpId);
  if (!ids) {
    agent.bot.path = [];
    return;
  }
  agent.bot.path = ids.map((id) => ({ x: WAYPOINTS[id].x, z: WAYPOINTS[id].z }));
  agent.bot.pathIdx = 0;
}

function setPathToPoint(agent, x, z) {
  const wp = nearestWaypoint(WAYPOINTS, x, z);
  setPathTo(agent, wp);
  agent.bot.path.push({ x, z });
}

/** Nearest covered waypoint to (x,z) that can see (tx,tz). */
function nearestCover(x, z, tx, tz, walls) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    if (!COVERED[i]) continue;
    const w = WAYPOINTS[i];
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d >= bestD) continue;
    if (segmentBlocked(w.x, w.z, tx, tz, walls)) continue;
    best = i;
    bestD = d;
  }
  return best;
}

/** Can `a` see `b`? Range, field of view, line of sight. */
function canSee(a, b, walls) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > BOT.seeRange) return false;
  // Forward is (-sin(yaw), -cos(yaw)) in XZ (three.js -Z look direction).
  const fwdX = -Math.sin(a.yaw);
  const fwdZ = -Math.cos(a.yaw);
  const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.001, d);
  if (dot < BOT.seeFovCos && d > 3) return false;
  return !segmentBlocked(a.pos.x, a.pos.z, b.pos.x, b.pos.z, walls);
}

function faceToward(agent, tx, tz, dt, rate = 7) {
  const want = Math.atan2(-(tx - agent.pos.x), -(tz - agent.pos.z));
  const diff = angleDiffDeg((want * 180) / Math.PI, (agent.yaw * 180) / Math.PI);
  const step = clamp(diff, -rate * dt * 57.3, rate * dt * 57.3);
  agent.yaw += (step * Math.PI) / 180;
}

function moveAlongPath(agent, dt, walls, speedMul = 1, facePath = true) {
  const bot = agent.bot;
  if (bot.pathIdx >= bot.path.length) return true;
  const target = bot.path[bot.pathIdx];
  const dx = target.x - agent.pos.x;
  const dz = target.z - agent.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.5) {
    bot.pathIdx++;
    return bot.pathIdx >= bot.path.length;
  }
  const speed = MOVE.walkSpeed * speedMul;
  const nx = agent.pos.x + (dx / d) * speed * dt;
  const nz = agent.pos.z + (dz / d) * speed * dt;
  const out = { x: nx, z: nz };
  collideCircle(nx, nz, MOVE.radius, walls, out);
  agent.pos.x = out.x;
  agent.pos.z = out.z;
  agent.speed2D = speed;
  if (facePath) faceToward(agent, target.x, target.z, dt, 5);
  return false;
}

function stopMoving(agent) {
  agent.speed2D = 0;
}

/** Pick a visible enemy, preferring the nearest. Sets reaction delay. */
function acquireTarget(agent, game, now) {
  const bot = agent.bot;
  let best = null;
  let bestD = Infinity;
  for (const other of game.agents) {
    if (other.team === agent.team || other.health <= 0) continue;
    if (!canSee(agent, other, game.walls)) continue;
    const d = dist2D(agent.pos.x, agent.pos.z, other.pos.x, other.pos.z);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  if (best) {
    if (bot.target !== best) {
      bot.target = best;
      bot.reactionUntil = now + bot.reactionMin + game.rng() * (bot.reactionMax - bot.reactionMin);
      bot.burstLeft = 0;
      bot.peekState = 'none';
    }
    bot.lastSeen = { x: best.pos.x, z: best.pos.z, t: now };
  } else if (bot.target && now - (bot.lastSeen?.t ?? 0) > 1.2) {
    bot.target = null;
    bot.peekState = 'none';
  }
  return bot.target;
}

function burstFire(agent, game, now) {
  const bot = agent.bot;
  if (now < bot.reactionUntil) return;
  if (now < bot.burstPauseUntil) return;
  if (bot.burstLeft <= 0) {
    bot.burstLeft = bot.burstMin + Math.floor(game.rng() * (bot.burstMax - bot.burstMin + 1));
    bot.burstSize = bot.burstLeft;
  }
  const target = bot.target;
  if (!target) return;
  const dir = aimDir(agent, target, game, bot.burstLeft === bot.burstSize);
  const rec = game.combat.shoot(agent, dir, game.agents, game.walls, game.rng, now);
  if (rec && rec.blocked === 'empty') {
    game.combat.audio.dryFire();
    return;
  }
  if (rec && rec.killed) game.onKill(rec);
  else if (rec && rec.hit) {
    if (rec.hit === game.player) game.onPlayerHit(rec);
    else if (rec.hit.isBot) game.onBotHit(rec);
  }
  bot.burstLeft--;
  if (bot.burstLeft <= 0) {
    bot.burstPauseUntil = now + bot.burstPauseMin + game.rng() * (bot.burstPauseMax - bot.burstPauseMin);
  }
}

/** Aim direction at the target's chest, with the bot's skill shaping error.
 * `firstShot` (first round of a burst) is steadier, per BOT.firstShotFactor. */
function aimDir(agent, target, game, firstShot) {
  const bot = agent.bot;
  const dx = target.pos.x - agent.pos.x;
  const dz = target.pos.z - agent.pos.z;
  const dy = 1.35 - agent.eyeY();
  const d = Math.sqrt(dx * dx + dz * dz);
  const skill = bot.skill * (agent.stationary ? bot.holdBonus : 1);
  // error in degrees: skill pulls it down, range pushes it up
  let errDeg = Math.max(0.25, BOT.baseErrorDeg * (1.5 - skill) + BOT.errorPerMeter * d);
  if (firstShot) errDeg *= BOT.firstShotFactor;
  const baseYaw = Math.atan2(-dx, -dz);
  const basePitch = Math.atan2(dy, d);
  const yaw = baseYaw + ((game.rng() * 2 - 1) * errDeg * Math.PI) / 180;
  const pitch = basePitch + ((game.rng() * 2 - 1) * errDeg * 0.7 * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** One fixed step of bot AI. `game` carries agents, walls, combat, rng, round. */
export function updateBot(agent, game, dt, now) {
  const bot = agent.bot;
  if (agent.health <= 0) return;
  if (now < agent.blindedUntil) {
    stopMoving(agent);
    return;
  }
  agent.stationary = agent.speed2D < 0.3;

  const round = game.round;
  if (round.phase === 'buy') {
    stopMoving(agent);
    return;
  }
  if (round.phase !== 'live') {
    stopMoving(agent);
    return;
  }

  // ---- perception -----------------------------------------------------------
  const target = acquireTarget(agent, game, now);

  // ---- combat override ------------------------------------------------------
  if (target && now >= bot.reactionUntil) {
    const d = dist2D(agent.pos.x, agent.pos.z, target.pos.x, target.pos.z);
    // Attackers do not stop to trade at long range: they keep pushing the
    // objective while firing on the move, and only stand and duel once the
    // range closes. Without this the whole attack stalls at spawn.
    if (agent.team === 'vanguard' && d > BOT.duelRange) {
      faceToward(agent, target.pos.x, target.pos.z, dt, 9);
      burstFire(agent, game, now);
      if (bot.path.length > 0 && bot.pathIdx < bot.path.length) {
        moveAlongPath(agent, dt, game.walls, 0.85, false);
      } else {
        updateVanguard(agent, game, dt, now); // re-paths the objective
      }
      return;
    }
    const inOpen = !pointBlocked(agent.pos.x, agent.pos.z, game.walls, 3);
    // Long-range duel in the open: peek from cover instead of trading.
    // Defenders only — attackers execute onto the site instead of hiding
    // behind cover while the carrier walks in alone.
    if (d > BOT.longRange && inOpen && bot.peekState === 'none' && agent.team === 'sentinel') {
      const cover = nearestCover(agent.pos.x, agent.pos.z, target.pos.x, target.pos.z, game.walls);
      if (cover >= 0) {
        bot.peekCover = WAYPOINTS[cover];
        bot.peekState = 'hide';
        bot.peekUntil = now + BOT.peekHide;
        setPathTo(agent, cover);
      }
    }
    if (bot.peekState !== 'none') {
      updatePeek(agent, game, target, dt, now);
      return;
    }
    // Strafe in a duel, flipping direction on a timer or when hurt.
    if (now >= bot.strafeUntil || (agent.lastDamageAt > now - 0.3 && game.rng() < 0.5)) {
      bot.strafeDir *= -1;
      bot.strafeUntil = now + BOT.strafeChange * (0.7 + game.rng() * 0.6);
    }
    faceToward(agent, target.pos.x, target.pos.z, dt, 9);
    // strafe perpendicular to the target while firing (right = (cos, -sin))
    const fx = -Math.sin(agent.yaw);
    const fz = -Math.cos(agent.yaw);
    const sx = -fz * bot.strafeDir;
    const sz = fx * bot.strafeDir;
    const out = { x: 0, z: 0 };
    collideCircle(agent.pos.x + sx * MOVE.walkSpeed * 0.55 * dt, agent.pos.z + sz * MOVE.walkSpeed * 0.55 * dt, MOVE.radius, game.walls, out);
    agent.pos.x = out.x;
    agent.pos.z = out.z;
    agent.speed2D = MOVE.walkSpeed * 0.55;
    burstFire(agent, game, now);
    return;
  }

  // ---- low HP: fall back to cover when nothing is shooting at us ------------
  if (agent.health < BOT.lowHpRetreat && !target) {
    const cover = nearestCover(agent.pos.x, agent.pos.z, agent.pos.x + 10, agent.pos.z, game.walls);
    if (cover >= 0 && bot.state !== 'retreat') {
      bot.state = 'retreat';
      setPathTo(agent, cover);
    }
    if (bot.state === 'retreat') {
      if (moveAlongPath(agent, dt, game.walls, 1.1)) bot.state = 'idle';
      return;
    }
  }

  // ---- objective ------------------------------------------------------------
  if (agent.team === 'vanguard') updateVanguard(agent, game, dt, now);
  else updateSentinel(agent, game, dt, now);
}

function updatePeek(agent, game, target, dt, now) {
  const bot = agent.bot;
  if (bot.peekState === 'hide') {
    // walk to cover, but the hide -> expose switch is TIME-based: if the
    // cover point turns out unreachable the bot must not wait there forever
    moveAlongPath(agent, dt, game.walls, 1);
    if (now >= bot.peekUntil) {
      bot.peekState = 'expose';
      bot.peekUntil = now + BOT.peekExpose;
    }
    return;
  }
  // expose: step out, fire a burst, step back
  faceToward(agent, target.pos.x, target.pos.z, dt, 9);
  burstFire(agent, game, now);
  if (now >= bot.peekUntil || agent.lastDamageAt > now - 0.2) {
    bot.peekState = 'hide';
    bot.peekUntil = now + BOT.peekHide;
    if (bot.peekCover) setPathToPoint(agent, bot.peekCover.x, bot.peekCover.z);
  }
}

function updateVanguard(agent, game, dt, now) {
  const bot = agent.bot;
  const round = game.round;
  const spike = round.spike;

  // After a plant, hold post-plant angles near the site.
  if (spike.state === 'planted') {
    const site = SITES[spike.site];
    const d = dist2D(agent.pos.x, agent.pos.z, site.x, site.z);
    if (d > 9) {
      if (bot.state !== 'postplant') {
        bot.state = 'postplant';
        setPathToPoint(agent, site.x + (game.rng() - 0.5) * 10, site.z + (game.rng() - 0.5) * 10);
      }
      moveAlongPath(agent, dt, game.walls, 1);
    } else {
      stopMoving(agent);
      faceToward(agent, site.x + 6, site.z, dt, 4);
    }
    return;
  }

  // Carrier plants when on site and (mostly) clear.
  if (spike.carrier === agent) {
    const site = SITES[bot.assignedSite];
    const d = dist2D(agent.pos.x, agent.pos.z, site.x, site.z);
    if (d < 3.5) {
      // plant when the site is clear enough: defenders holding the far
      // anchors (~11 m out) must rotate in to stop it
      const nearEnemy = game.agents.some((o) => o.team !== agent.team && o.health > 0 && dist2D(agent.pos.x, agent.pos.z, o.pos.x, o.pos.z) < 10);
      if (!nearEnemy) {
        stopMoving(agent);
        bot.plantProgress += dt;
        if (Math.floor(bot.plantProgress * 2) !== Math.floor((bot.plantProgress - dt) * 2)) game.combat.audio.plantBeep();
        if (bot.plantProgress >= 4) {
          game.plantSpike(agent, bot.assignedSite, now);
          bot.plantProgress = 0;
        }
        return;
      }
      bot.plantProgress = 0;
    } else {
      // re-path if the push was never started or the path ran out
      if (bot.state !== 'push' || bot.pathIdx >= bot.path.length) {
        bot.state = 'push';
        setPathToPoint(agent, site.x, site.z);
      }
      moveAlongPath(agent, dt, game.walls, 1);
    }
    return;
  }

  // Non-carriers: escort to their assigned site (the last bot fakes the
  // other site), recover the spike if the carrier died, else push on.
  const carrier = spike.carrier && spike.carrier.health > 0 ? spike.carrier : null;
  if (carrier) {
    if (bot.state !== 'escort') {
      bot.state = 'escort';
      const site = SITES[bot.assignedSite];
      setPathToPoint(agent, site.x + (game.rng() - 0.5) * 6, site.z + (game.rng() - 0.5) * 6);
    }
    if (moveAlongPath(agent, dt, game.walls, 1)) {
      // arrived: pick a fresh nearby point so the bot keeps a live presence
      bot.state = 'idle';
    }
    return;
  }
  if (spike.state === 'dropped') {
    if (bot.state !== 'recover') {
      bot.state = 'recover';
      setPathToPoint(agent, spike.pos.x, spike.pos.z);
    }
    if (moveAlongPath(agent, dt, game.walls, 1.1)) {
      spike.state = 'carried';
      spike.carrier = agent;
    }
    return;
  }
  // no carrier alive and nothing to recover: push the assigned site
  if (bot.state !== 'push' || bot.pathIdx >= bot.path.length) {
    bot.state = 'push';
    const site = SITES[bot.assignedSite];
    setPathToPoint(agent, site.x, site.z);
  }
  moveAlongPath(agent, dt, game.walls, 1);
}

function updateSentinel(agent, game, dt, now) {
  const bot = agent.bot;
  const round = game.round;
  const spike = round.spike;

  // Bomb planted: retake, then defuse when the site is clear.
  if (spike.state === 'planted') {
    if (now < bot.retakeAt) {
      stopMoving(agent);
      return;
    }
    const site = SITES[spike.site];
    const d = dist2D(agent.pos.x, agent.pos.z, site.x, site.z);
    if (d < 3.5) {
      const nearEnemy = game.agents.some((o) => o.team !== agent.team && o.health > 0 && dist2D(agent.pos.x, agent.pos.z, o.pos.x, o.pos.z) < 12);
      if (!nearEnemy) {
        stopMoving(agent);
        bot.defuseProgress += dt;
        if (Math.floor(bot.defuseProgress * 2) !== Math.floor((bot.defuseProgress - dt) * 2)) game.combat.audio.defuseBeep();
        if (bot.defuseProgress >= 5) {
          game.defuseSpike(agent, now);
          bot.defuseProgress = 0;
        }
        return;
      }
      bot.defuseProgress = 0;
    }
    if (bot.state !== 'retake') {
      bot.state = 'retake';
      setPathToPoint(agent, site.x + (game.rng() - 0.5) * 6, site.z + (game.rng() - 0.5) * 6);
    }
    moveAlongPath(agent, dt, game.walls, 1.05);
    return;
  }

  // Heard the push or the carrier: rotate one anchor toward that site.
  if (bot.heard && now - bot.heard.t < 6 && bot.state === 'hold') {
    const site = bot.heard.site;
    if (site && bot.assignedSite !== site) {
      bot.state = 'rotate';
      setPathTo(agent, SITE_ANCHORS[site][0]);
    }
  }

  // Hold the assigned site anchor; shuffle a little so holds don't look dead.
  if (bot.state === 'hold' || bot.state === 'rotate' || bot.state === 'idle') {
    if (bot.holdWp < 0) {
      const anchors = SITE_ANCHORS[bot.assignedSite];
      bot.holdWp = anchors[Math.floor(game.rng() * anchors.length)];
      setPathTo(agent, bot.holdWp);
    }
    if (moveAlongPath(agent, dt, game.walls, 0.9)) {
      stopMoving(agent);
      // hold angle: face the most likely approach
      const site = SITES[bot.assignedSite];
      faceToward(agent, site.x - 14, site.z + (agent.pos.z > 0 ? -6 : 6), dt, 2.5);
    }
    return;
  }
  moveAlongPath(agent, dt, game.walls, 1);
}

/** Called when a shot is heard: bots remember the direction. */
export function onHeard(agent, x, z, site, now) {
  const bot = agent.bot;
  if (!bot) return;
  bot.heard = { x, z, site, t: now };
}

/** Assign sites/anchors at round start. */
export function assignRoundRoles(agents, rng) {
  const sentinels = agents.filter((a) => a.team === 'sentinel' && a.isBot);
  const vanguards = agents.filter((a) => a.team === 'vanguard' && a.isBot);
  // Sentinel: 2 on A, 2 on B, 1 mid roamer (assigned B, rotates freely).
  sentinels.forEach((a, i) => {
    a.bot.assignedSite = i < 2 ? 'A' : 'B';
    a.bot.state = 'hold';
    a.bot.holdWp = -1;
    a.bot.retakeAt = 0;
    a.bot.defuseProgress = 0;
  });
  // Vanguard: carrier + escorts share one site; one bot fakes the other.
  // Pre-set a push path so attackers move from frame one, even if they
  // spot a defender across the map during the first step.
  const pushSite = rng() < 0.5 ? 'A' : 'B';
  const fakeSite = pushSite === 'A' ? 'B' : 'A';
  vanguards.forEach((a, i) => {
    a.bot.assignedSite = i === vanguards.length - 1 ? fakeSite : pushSite;
    a.bot.state = 'idle';
    a.bot.plantProgress = 0;
    const site = SITES[a.bot.assignedSite];
    setPathToPoint(a, site.x + (rng() - 0.5) * 6, site.z + (rng() - 0.5) * 6);
  });
  return pushSite;
}
