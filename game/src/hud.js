// RUSTLINE — HUD: every DOM element the game shows, updated from one place.
// The HUD is plain HTML/CSS over the canvas; the 3D view never renders text.

import { CONFIG, WEAPONS, BUY_KEYS } from './config.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {};
    for (const id of ['health', 'healthbar', 'ammo', 'money', 'timer', 'score', 'feed', 'banner', 'bannerSub', 'buy', 'buyList', 'overlay', 'overlayTitle', 'overlaySub', 'vignette', 'channel', 'channelFill', 'channelLabel', 'end', 'endTitle', 'endScore', 'crosshair', 'hint']) {
      this.el[id] = document.getElementById(id);
    }
    this.feedItems = [];
    this.bannerTimer = 0;
  }

  update() {
    const g = this.game;
    const p = g.player;
    this.el.health.textContent = Math.max(0, Math.ceil(p.hp));
    this.el.healthbar.style.width = Math.max(0, p.hp) + '%';
    this.el.healthbar.style.background = p.hp > 50 ? '#7ec850' : p.hp > 25 ? '#e0a030' : '#d04030';
    const def = WEAPONS[p.weaponId];
    this.el.ammo.textContent = def.grenade ? `${p.grenades} ×` : `${p.mag} / ${p.reserve}`;
    this.el.ammo.textContent = def.armor ? '—' : this.el.ammo.textContent;
    this.el.money.textContent = '$' + p.money;
    const t = Math.max(0, Math.ceil(g.rounds.phaseTimer));
    const mm = String(Math.floor(t / 60)).padStart(1, '0');
    const ss = String(t % 60).padStart(2, '0');
    this.el.timer.textContent = g.rounds.phase === 'buy' ? 'BUY ' + mm + ':' + ss : mm + ':' + ss;
    this.el.timer.style.color = g.rounds.bombState === 'planted' ? '#ff5a3c' : '#f0e8d8';
    this.el.score.textContent = `Vanguard ${g.rounds.score.vanguard} — ${g.rounds.score.sentinel} Sentinel`;
    // Channel bar (plant / defuse progress).
    const chan = p.plantTimer > 0 ? { v: p.plantTimer / CONFIG.round.plantSeconds, label: 'PLANTING…' }
      : p.defuseTimer > 0 ? { v: p.defuseTimer / CONFIG.round.defuseSeconds, label: 'DEFUSING…' } : null;
    if (chan) {
      this.el.channel.style.display = 'block';
      this.el.channelFill.style.width = (chan.v * 100) + '%';
      this.el.channelLabel.textContent = chan.label;
    } else {
      this.el.channel.style.display = 'none';
    }
    // Damage vignette fades with time since the last hit.
    const since = performance.now() - (p.lastDamageAt || 0);
    this.el.vignette.style.opacity = p.alive ? Math.max(0, 0.65 - since / 900) : 0.85;
    if (this.bannerTimer > 0) this.bannerTimer -= 1 / 60;
    else this.el.banner.style.opacity = 0;
    // Buy menu contents refresh while open.
    if (this.el.buy.style.display === 'block') this.renderBuy();
  }

  banner(title, sub) {
    this.el.banner.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.style.opacity = 1;
    this.el.bannerSub.style.opacity = 1;
    this.bannerTimer = 3;
  }

  addFeed(text) {
    this.feedItems.unshift(text);
    if (this.feedItems.length > 5) this.feedItems.pop();
    this.el.feed.innerHTML = this.feedItems.map((t) => `<div>${t}</div>`).join('');
  }

  killFeed(killer, victim, headshot) {
    const k = killer.isPlayer ? 'You' : killer.name;
    const v = victim.isPlayer ? 'You' : victim.name;
    this.addFeed(`${k} ✕ ${v}${headshot ? ' (headshot)' : ''}`);
  }

  renderBuy() {
    const p = this.game.player;
    this.el.buyList.innerHTML = BUY_KEYS.map((id, i) => {
      const w = WEAPONS[id];
      const owned = id === 'vest' ? p.armor : id === 'spark' ? p.grenades >= 2 : p.weaponId === id;
      const afford = p.money >= w.price;
      return `<div class="buy-row${owned ? ' owned' : ''}${afford ? '' : ' poor'}"><span class="buy-key">${i + 1}</span><span class="buy-name">${w.name}</span><span class="buy-price">$${w.price}</span></div>`;
    }).join('');
  }

  toggleBuy(show) {
    this.el.buy.style.display = show ? 'block' : 'none';
    if (show) this.renderBuy();
  }

  showOverlay(title, sub) {
    this.el.overlay.style.display = 'flex';
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
  }

  hideOverlay() { this.el.overlay.style.display = 'none'; }

  showMatchEnd(winner, score, kills) {
    this.el.end.style.display = 'flex';
    this.el.endTitle.textContent = winner === 'vanguard' ? 'VANGUARD WINS THE MATCH' : 'SENTINEL WINS THE MATCH';
    this.el.endScore.textContent = `Vanguard ${score.vanguard} — ${score.sentinel} Sentinel · Your kills: ${kills}`;
  }

  hint(text) { this.el.hint.textContent = text; }
}
