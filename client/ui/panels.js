// DOM-панели: тосты, диалоги, инвентарь с экипировкой, экран смерти.
import { STR, ITEM_NAMES } from '../../shared/strings.js';
import { MSG } from '../../shared/protocol.js';
import { ITEMS, GEAR_SLOTS, SLOT_NAMES, isGear, isPotion, describeItem } from '../../shared/items.js';
import { AMMO_NAMES } from '../../shared/weapons.js';
import { SFX } from '../sfx.js';

const USABLE_FOOD = new Set(['bread', 'meat', 'cooked_meat', 'bandage']);

export class Panels {
  constructor(net, atlas) {
    this.net = net;
    this.atlas = atlas;
    this.toastsEl = document.getElementById('toasts');
    this.dialogEl = document.getElementById('dialog');
    this.invEl = document.getElementById('inv');
    this.deadEl = document.getElementById('deadmsg');
    this.helpEl = document.getElementById('help');
    this.invOpen = false;
    this.iconCache = new Map();
    this.helpEl.textContent = STR.controls;
    setTimeout(() => { this.helpEl.style.display = 'none'; }, 20000);
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 4200);
    if (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
  }

  showDialog(m) {
    const d = this.dialogEl;
    d.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'dname'; name.textContent = m.name;
    d.appendChild(name);
    for (const line of m.lines) {
      const el = document.createElement('div');
      el.className = 'dline'; el.textContent = line;
      d.appendChild(el);
    }
    for (const ch of m.choices) {
      const b = document.createElement('button');
      b.className = 'dchoice'; b.textContent = ch.label;
      b.onclick = () => {
        SFX.ui();
        this.net.send({ t: MSG.DIALOG_CHOICE, id: m.id, choice: ch.id });
        this.hideDialog();
      };
      d.appendChild(b);
    }
    d.style.display = 'block';
  }

  hideDialog() { this.dialogEl.style.display = 'none'; }
  get dialogOpen() { return this.dialogEl.style.display === 'block'; }

  toggleInventory() {
    this.invOpen = !this.invOpen;
    this.invEl.style.display = this.invOpen ? 'block' : 'none';
    if (this.invOpen) this.renderInventory();
  }

  // Иконка 32x32 из атласа (кэш DOM-канвасов)
  icon(spriteName) {
    let c = this.iconCache.get(spriteName);
    if (c) return c.cloneNode ? this.freshIcon(spriteName) : null;
    return this.freshIcon(spriteName);
  }

  freshIcon(spriteName) {
    const s = this.atlas.map[spriteName];
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    c.className = 'icon';
    if (!s) return c;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const k = Math.min(32 / s.w, 32 / s.h, 2.5);
    const w = Math.round(s.w * k), h = Math.round(s.h * k);
    ctx.drawImage(this.atlas.img, s.x, s.y, s.w, s.h, (32 - w) >> 1, (32 - h) >> 1, w, h);
    return c;
  }

  itemName(id) { return ITEMS[id]?.name || ITEM_NAMES[id] || id; }
  itemIcon(id) { return ITEMS[id]?.icon || 'item_' + id; }

  renderInventory() {
    if (!this.invOpen || !this.net.you) return;
    const you = this.net.you;
    const el = this.invEl;
    el.innerHTML = '';

    // --- экипировка ---
    el.appendChild(header('Экипировка'));
    const eqRow = document.createElement('div');
    eqRow.className = 'eqrow';
    for (const slot of GEAR_SLOTS) {
      const cell = document.createElement('div');
      cell.className = 'eqslot';
      const itemId = you.eq?.[slot];
      if (itemId) {
        cell.appendChild(this.freshIcon(this.itemIcon(itemId)));
        cell.title = `${this.itemName(itemId)} — ${describeItem(itemId)}\n(клик — снять)`;
        cell.classList.add('filled');
        cell.onclick = () => { SFX.ui(); this.net.send({ t: MSG.UNEQUIP, slot }); setTimeout(() => this.renderInventory(), 150); };
      } else {
        cell.title = SLOT_NAMES[slot];
        const lbl = document.createElement('span');
        lbl.className = 'eqlabel';
        lbl.textContent = SLOT_NAMES[slot];
        cell.appendChild(lbl);
      }
      eqRow.appendChild(cell);
    }
    el.appendChild(eqRow);

    // --- бафы ---
    const buffs = Object.entries(you.bf || {});
    if (buffs.length) {
      const b = document.createElement('div');
      b.className = 'buffline';
      b.textContent = buffs.map(([k, t]) => `${k === 'speed' ? 'Прыть' : k}: ${t} с`).join(', ');
      el.appendChild(b);
    }

    // --- предметы ---
    el.appendChild(header(STR.inventory));
    const grid = document.createElement('div');
    grid.className = 'invgrid';
    const entries = Object.entries(you.inv || {}).filter(([, n]) => n > 0);
    if (!entries.length) {
      const e = document.createElement('div');
      e.className = 'empty'; e.textContent = '— пусто —';
      grid.appendChild(e);
    }
    for (const [item, n] of entries) {
      const cell = document.createElement('div');
      cell.className = 'invcell';
      cell.appendChild(this.freshIcon(this.itemIcon(item)));
      if (n > 1) {
        const badge = document.createElement('span');
        badge.className = 'count'; badge.textContent = n;
        cell.appendChild(badge);
      }
      const desc = describeItem(item);
      const action = isGear(item) ? 'надеть' : (USABLE_FOOD.has(item) || isPotion(item)) ? 'использовать' : null;
      cell.title = this.itemName(item) + (desc ? ` — ${desc}` : '') + (action ? `\n(клик — ${action})` : '');
      if (action) {
        cell.classList.add('usable');
        cell.onclick = () => {
          SFX.ui();
          this.net.send(isGear(item) ? { t: MSG.EQUIP, item } : { t: MSG.USE_ITEM, item });
          setTimeout(() => this.renderInventory(), 150);
        };
      }
      grid.appendChild(cell);
    }
    el.appendChild(grid);

    // --- боеприпасы ---
    const ammo = Object.entries(you.ammo || {}).filter(([, n]) => n > 0);
    if (ammo.length) {
      el.appendChild(header('Боеприпасы'));
      const line = document.createElement('div');
      line.className = 'ammoline';
      line.textContent = ammo.map(([k, n]) => `${AMMO_NAMES[k] || k}: ${n}`).join(' · ');
      el.appendChild(line);
    }

    // --- репутация ---
    el.appendChild(header('Репутация'));
    const names = { severane: 'Северяне', ozerny: 'Озёрный союз', stepnyaki: 'Степняки', bandits: 'Вольница' };
    for (const [f, v] of Object.entries(you.rep || {})) {
      if (f === 'monsters') continue;
      const row = document.createElement('div');
      row.className = 'item';
      const col = v > 20 ? '#99e550' : v < -20 ? '#d9574a' : '#847e87';
      row.innerHTML = `<span>${names[f] || f}</span><span style="color:${col}">${v}</span>`;
      el.appendChild(row);
    }
  }

  setDead(dead, downT) {
    this.deadEl.style.display = dead ? 'block' : 'none';
    if (dead) this.deadEl.innerHTML = STR.dead + '<br>' + STR.respawnIn(Math.ceil(downT));
  }
}

function header(text) {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
}
