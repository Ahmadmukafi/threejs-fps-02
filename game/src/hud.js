// RUSTLINE — the HUD. All DOM the player sees: health, armor, ammo,
// money, the round timer, the score, team pips, crosshair, hitmarker,
// kill feed, round banners and the buy menu. The sim calls set() every
// frame with one state object; the HUD decides what changed.

import { shopItems } from './rounds.js';
import { WEAPONS } from './config.js';

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = {};
    for (const id of ['health', 'healthBar', 'armor', 'ammo', 'money', 'timer',
      'scoreV', 'scoreS', 'pipsV', 'pipsS', 'crosshair', 'hitmarker', 'feed',
      'banner', 'bannerSub', 'buyMenu', 'buyItems', 'hint', 'objective',
      'plantBar', 'plantFill', 'plantLabel', 'overlay', 'overlayTitle',
      'overlaySub', 'damage', 'reload']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.last = {};
    this.feedCount = 0;
  }

  // Write text only when it changed (avoids layout thrash every frame).
  text(id, value) {
    if (this.last[id] !== value) {
      this.last[id] = value;
      const e = this.el[id];
      if (e) e.textContent = value;
    }
  }

  set(s) {
    // health + armor
    this.text('health', Math.max(0, Math.ceil(s.hp)));
    this.el.healthBar.style.width = Math.max(0, s.hp) + '%';
    this.el.healthBar.style.background = s.hp > 50 ? '#35b59a' : s.hp > 25 ? '#d8a13c' : '#d84a2e';
    this.el.armor.style.display = s.armor > 0 ? 'block' : 'none';
    if (s.armor > 0) this.text('armor', 'VEST ' + Math.ceil(s.armor));

    // ammo
    const w = s.weapon;
    if (w) {
      this.text('ammo', s.reloading ? '-- / --' : `${w.mag} / ${w.reserve}`);
      this.el.reload.style.display = s.reloading ? 'block' : 'none';
    }

    // money, timer, score
    this.text('money', '$' + s.money);
    const t = Math.max(0, Math.ceil(s.timer));
    this.text('timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.text('scoreV', String(s.score.vanguard));
    this.text('scoreS', String(s.score.sentinel));
    this.text('pipsV', '●'.repeat(s.aliveV) + '○'.repeat(Math.max(0, 4 - s.aliveV)));
    this.text('pipsS', '●'.repeat(s.aliveS) + '○'.repeat(Math.max(0, 5 - s.aliveS)));

    // crosshair: gap grows with spread, hidden while the buy menu is open
    const gap = 4 + s.spread * 900;
    this.el.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.el.crosshair.style.opacity = s.showCrosshair ? '1' : '0';

    // objective line
    this.text('objective', s.objective);

    // plant / defuse progress
    if (s.plant) {
      this.el.plantBar.style.display = 'block';
      this.text('plantLabel', s.plant.label);
      this.el.plantFill.style.width = (s.plant.progress * 100).toFixed(0) + '%';
    } else {
      this.el.plantBar.style.display = 'none';
    }

    // hint line (contextual)
    this.text('hint', s.hint || '');

    // buy menu
    this.el.buyMenu.style.display = s.showBuy ? 'block' : 'none';
    if (s.showBuy) this.renderBuy(s);
  }

  renderBuy(s) {
    const key = s.money + '|' + Object.keys(s.owned).join(',');
    if (this.last.buyKey === key) return;
    this.last.buyKey = key;
    const items = shopItems();
    this.el.buyItems.innerHTML = items.map((it) => {
      const owned = it.kind === 'weapon' && s.owned[it.id];
      const afford = s.money >= it.price;
      const cls = owned ? 'owned' : afford ? 'afford' : 'poor';
      return `<div class="buy-item ${cls}"><span class="buy-key">${it.key}</span>
        <span class="buy-name">${it.name}</span>
        <span class="buy-desc">${it.desc}</span>
        <span class="buy-price">${owned ? 'OWNED' : '$' + it.price}</span></div>`;
    }).join('');
    this.el.buyItems.querySelectorAll('.buy-item').forEach((el, i) => {
      el.addEventListener('click', () => s.onBuy && s.onBuy(items[i].id));
    });
  }

  banner(title, sub = '', ms = 2600) {
    this.el.banner.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.style.display = 'block';
    this.el.bannerSub.style.display = sub ? 'block' : 'none';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => {
      this.el.banner.style.display = 'none';
      this.el.bannerSub.style.display = 'none';
    }, ms);
  }

  killfeed(text) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.textContent = text;
    this.el.feed.prepend(div);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => div.classList.add('fade'), 4200);
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.style.display = 'block';
    h.classList.toggle('head', !!head);
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.style.display = 'none'; }, 120);
  }

  damageFlash() {
    const d = this.el.damage;
    d.style.opacity = '0.55';
    setTimeout(() => { d.style.opacity = '0'; }, 140);
  }

  overlay(title, sub) {
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
    this.el.overlay.style.display = 'flex';
  }

  hideOverlay() {
    this.el.overlay.style.display = 'none';
  }
}
