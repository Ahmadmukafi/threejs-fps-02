// RUSTLINE — round 3. HUD: health, armor, ammo, timer, score, money,
// killfeed, crosshair with dynamic spread, hitmarker, damage direction,
// buy menu, top-down minimap, round banners and the end screen. All DOM.
import { WEAPONS, GRENADES, VEST_PRICE, MAP, SITES, WALLS } from './config.js';

export class Hud {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.el = {};
    this._build();
    this.killfeed = [];
    this.bannerUntil = 0;
    this.nudgeUntil = 0;
    this.hitmarkUntil = 0;
    this.damageFrom = null;
    this.damageUntil = 0;
    this.flashUntil = 0;
    this.flashStrength = 0;
  }

  _div(cls, parent, html = '') {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    (parent || this.root).appendChild(d);
    return d;
  }

  _build() {
    const r = this.root;
    this.el.crosshair = this._div('crosshair', r, '<span class="ch-dot"></span><span class="ch-t"></span><span class="ch-b"></span><span class="ch-l"></span><span class="ch-r"></span>');
    this.el.hitmark = this._div('hitmark', r);
    this.el.dmgdir = this._div('dmgdir', r);
    this.el.flash = this._div('flash', r);
    this.el.banner = this._div('banner', r);
    this.el.nudge = this._div('nudge', r, 'PUSH — PLANT THE SPIKE');
    this.el.killfeed = this._div('killfeed', r);
    this.el.timer = this._div('timer', r);
    this.el.score = this._div('score', r);
    this.el.money = this._div('money', r);
    this.el.health = this._div('health', r);
    this.el.ammo = this._div('ammo', r);
    this.el.weapon = this._div('weapon', r);
    this.el.spike = this._div('spike', r);
    this.el.hint = this._div('hint', r, 'WASD move · Mouse aim · Click fire · R reload · B buy · G grenade · F flash · Ctrl crouch');
    this.el.minimap = this._div('minimap', r);
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 150;
    this.mapCanvas.height = 104;
    this.el.minimap.appendChild(this.mapCanvas);
    this.el.buymenu = this._div('buymenu hidden', r);
    this.el.endscreen = this._div('endscreen hidden', r);
    this.el.center = this._div('center', r, '<div class="title">RUSTLINE</div><div class="sub">Foundry Yard — click to play</div>');
    this._buildBuyMenu();
  }

  _buildBuyMenu() {
    const m = this.el.buymenu;
    m.innerHTML = '<div class="buy-title">BUY PHASE — spend your credits</div>';
    const list = document.createElement('div');
    list.className = 'buy-list';
    const items = [
      ...Object.values(WEAPONS).filter((w) => w.price > 0).map((w) => ({ kind: 'weapon', id: w.id, name: w.name, price: w.price, key: w.id === 'vk47' ? '2' : w.id === 'raptor' ? '3' : w.id === 'longshot' ? '4' : '5' })),
      { kind: 'grenade', id: 'he', name: 'HE Charge', price: GRENADES.he.price, key: 'G' },
      { kind: 'grenade', id: 'flash', name: 'Flash Charge', price: GRENADES.flash.price, key: 'F' },
      { kind: 'vest', id: 'vest', name: 'Kevlar Vest (+50 armor)', price: VEST_PRICE, key: 'V' },
    ];
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.innerHTML = `<span class="buy-key">${it.key}</span> ${it.name} <span class="buy-price">$${it.price}</span>`;
      b.addEventListener('click', () => this.game.buyRequest(it.kind, it.id));
      list.appendChild(b);
    }
    m.appendChild(list);
    const close = document.createElement('button');
    close.className = 'buy-close';
    close.textContent = 'Close [B]';
    close.addEventListener('click', () => this.setBuyMenu(false));
    m.appendChild(close);
  }

  setBuyMenu(open) {
    this.el.buymenu.classList.toggle('hidden', !open);
  }

  isBuyMenuOpen() {
    return !this.el.buymenu.classList.contains('hidden');
  }

  banner(text, sub, durMs = 2200) {
    this.el.banner.innerHTML = `<div class="banner-main">${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.el.banner.classList.add('show');
    this.bannerUntil = performance.now() + durMs;
  }

  nudge(on) {
    this.el.nudge.classList.toggle('show', on);
    if (on) this.nudgeUntil = performance.now() + 4000;
  }

  hitmark(kill) {
    this.el.hitmark.classList.add('show');
    this.el.hitmark.classList.toggle('kill', !!kill);
    this.hitmarkUntil = performance.now() + (kill ? 350 : 150);
  }

  damage(fromYaw) {
    this.damageFrom = fromYaw;
    this.damageUntil = performance.now() + 600;
  }

  flash(strength) {
    this.flashStrength = strength;
    this.flashUntil = performance.now() + strength * 2000;
  }

  addKill(killerName, victimName, headshot, killerTeam) {
    const line = document.createElement('div');
    line.className = 'kf-line';
    line.innerHTML = `<span class="${killerTeam === 'vanguard' ? 'kf-v' : 'kf-s'}">${killerName}</span> ${headshot ? '◉' : '—'} <span class="${killerTeam === 'vanguard' ? 'kf-s' : 'kf-v'}">${victimName}</span>`;
    this.el.killfeed.prepend(line);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => line.remove(), 6000);
  }

  endScreen(winner, score) {
    const e = this.el.endscreen;
    const win = winner === 'vanguard';
    e.innerHTML = `<div class="end-title">${win ? 'VANGUARD WINS' : 'SENTINEL WINS'}</div><div class="end-score">${score.vanguard} — ${score.sentinel}</div><div class="end-sub">Foundry Yard · RUSTLINE · press R to play again</div>`;
    e.classList.remove('hidden');
  }

  hideCenter() {
    this.el.center.classList.add('hidden');
  }

  showCenter() {
    this.el.center.classList.remove('hidden');
  }

  /** Per-frame HUD refresh from the live game state. */
  update(game, now) {
    const p = game.player;
    const m = game.round; // the Match, stored as game.round in main.js
    const nowMs = performance.now();
    if (nowMs > this.bannerUntil) this.el.banner.classList.remove('show');
    if (nowMs > this.nudgeUntil) this.el.nudge.classList.remove('show');
    if (nowMs > this.hitmarkUntil) this.el.hitmark.classList.remove('show', 'kill');

    // damage direction indicator
    if (this.damageFrom !== null && nowMs < this.damageUntil) {
      const rel = ((this.damageFrom - p.yaw) * 180) / Math.PI;
      this.el.dmgdir.style.transform = `translate(-50%,-50%) rotate(${rel}deg)`;
      this.el.dmgdir.classList.add('show');
    } else {
      this.el.dmgdir.classList.remove('show');
    }
    // flash overlay
    if (nowMs < this.flashUntil) {
      this.el.flash.style.opacity = String(this.flashStrength * 0.85);
    } else {
      this.el.flash.style.opacity = '0';
    }

    // timer
    const t = Math.max(0, Math.ceil(m.timeLeft));
    const mm = Math.floor(t / 60);
    const ss = String(t % 60).padStart(2, '0');
    const phase = m.phase === 'buy' ? 'BUY' : m.phase === 'live' ? (m.spike.state === 'planted' ? 'SPIKE PLANTED' : `ROUND ${m.roundNum}`) : 'ROUND OVER';
    this.el.timer.innerHTML = `<span class="${t <= 20 && m.phase === 'live' ? 'urgent' : ''}">${mm}:${ss}</span><span class="timer-phase">${phase}</span>`;
    this.el.score.innerHTML = `<span class="sc-v">VANGUARD ${m.score.vanguard}</span><span class="sc-dot">·</span><span class="sc-s">${m.score.sentinel} SENTINEL</span>`;
    this.el.money.textContent = `$${p.money}`;
    this.el.health.innerHTML = `<span class="hp-num">${Math.max(0, Math.ceil(p.health))}</span><span class="hp-bar"><i style="width:${Math.max(0, p.health)}%"></i></span>${p.loadout.armor > 0 ? `<span class="armor">🛡 ${p.loadout.armor}</span>` : ''}`;
    const w = p.loadout.weapons[p.loadout.current];
    const def = w ? WEAPONS[w.id] : null;
    this.el.ammo.innerHTML = w ? `<span class="ammo-mag">${w.mag}</span><span class="ammo-res">/ ${w.reserve}</span>` : '—';
    this.el.weapon.textContent = def ? def.name : '';
    // spike status
    if (m.spike.state === 'planted') {
      const left = Math.max(0, MAP.fuseTime - (now - m.spike.plantedAt));
      this.el.spike.innerHTML = `💣 SPIKE at ${m.spike.site} — ${left.toFixed(0)}s`;
      this.el.spike.classList.add('planted');
    } else if (m.spike.state === 'carried' && m.spike.carrier === p) {
      this.el.spike.innerHTML = '💣 YOU CARRY THE SPIKE — plant at A or B';
      this.el.spike.classList.remove('planted');
    } else if (m.spike.state === 'dropped') {
      this.el.spike.innerHTML = '💣 SPIKE DROPPED — recover it';
      this.el.spike.classList.remove('planted');
    } else {
      this.el.spike.textContent = '';
    }
    // crosshair spread from the player's weapon state
    const spread = 6 + (p.weaponState ? p.weaponState.spreadBloom * 14 : 0) + (p.speed2D || 0) * 1.2;
    this.el.crosshair.style.setProperty('--gap', `${spread}px`);
    this.el.crosshair.classList.toggle('hidden', p.health <= 0);

    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const g = this.mapCanvas.getContext('2d');
    const W = 150;
    const H = 104;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.72)';
    g.fillRect(0, 0, W, H);
    const sx = (x) => ((x + MAP.halfX) / (MAP.halfX * 2)) * W;
    const sz = (z) => ((z + MAP.halfZ) / (MAP.halfZ * 2)) * H;
    // walls
    g.fillStyle = 'rgba(200,200,210,0.5)';
    for (const w of WALLS) g.fillRect(sx(w.x - w.w / 2), sz(w.z - w.d / 2), Math.max(1, (w.w / 64) * W), Math.max(1, (w.d / 44) * H));
    // sites
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      g.fillStyle = s.css;
      g.globalAlpha = 0.9;
      g.font = 'bold 11px Arial';
      g.textAlign = 'center';
      g.fillText(key, sx(s.x), sz(s.z) + 4);
      g.globalAlpha = 1;
    }
    // spike
    const m = game.round;
    if (m.spike.state === 'dropped' && m.spike.pos) {
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.arc(sx(m.spike.pos.x), sz(m.spike.pos.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    // agents: teammates bright, enemies only when recently seen
    for (const a of game.agents) {
      if (a.health <= 0) continue;
      const isTeam = a.team === game.player.team;
      const seen = a.lastSeenByPlayer && game.now - a.lastSeenByPlayer < 3;
      if (!isTeam && !seen) continue;
      g.fillStyle = a.isPlayer ? '#ffffff' : isTeam ? '#37d67a' : '#ff5252';
      g.beginPath();
      g.arc(sx(a.pos.x), sz(a.pos.z), a.isPlayer ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      // facing tick
      g.strokeStyle = g.fillStyle;
      g.beginPath();
      g.moveTo(sx(a.pos.x), sz(a.pos.z));
      g.lineTo(sx(a.pos.x) - Math.sin(a.yaw) * 6, sz(a.pos.z) - Math.cos(a.yaw) * 6);
      g.stroke();
    }
  }
}
