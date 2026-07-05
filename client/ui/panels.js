// DOM-панели: тосты, диалоги, инвентарь, экран смерти.
import { STR, ITEM_NAMES } from '../../shared/strings.js';
import { MSG } from '../../shared/protocol.js';
import { SFX } from '../sfx.js';

export class Panels {
  constructor(net) {
    this.net = net;
    this.toastsEl = document.getElementById('toasts');
    this.dialogEl = document.getElementById('dialog');
    this.invEl = document.getElementById('inv');
    this.deadEl = document.getElementById('deadmsg');
    this.helpEl = document.getElementById('help');
    this.invOpen = false;
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

  renderInventory() {
    if (!this.invOpen || !this.net.you) return;
    const you = this.net.you;
    const el = this.invEl;
    el.innerHTML = `<h3>${STR.inventory}</h3>`;
    const usable = new Set(['bread', 'meat', 'cooked_meat', 'bandage']);
    const entries = Object.entries(you.inv || {}).filter(([, n]) => n > 0);
    if (!entries.length) el.innerHTML += '<div class="item">— пусто —</div>';
    for (const [item, n] of entries) {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `<span>${ITEM_NAMES[item] || item} ×${n}</span>` +
        (usable.has(item) ? '<span class="use">использовать</span>' : '');
      if (usable.has(item)) row.onclick = () => { SFX.ui(); this.net.send({ t: MSG.USE_ITEM, item }); };
      el.appendChild(row);
    }
    const ammo = Object.entries(you.ammo || {}).filter(([, n]) => n > 0)
      .map(([k, n]) => `${ITEM_NAMES['ammo_' + k] || k}: ${n}`).join(', ');
    if (ammo) el.innerHTML += `<div class="item" style="color:#847e87">${ammo}</div>`;
    // репутация
    const reps = Object.entries(you.rep || {}).filter(([f]) => !['monsters'].includes(f));
    el.innerHTML += '<h3 style="margin-top:8px">Репутация</h3>' + reps.map(([f, v]) => {
      const names = { severane: 'Северяне', ozerny: 'Озёрный союз', stepnyaki: 'Степняки', bandits: 'Вольница' };
      const col = v > 20 ? '#99e550' : v < -20 ? '#d9574a' : '#847e87';
      return `<div class="item"><span>${names[f] || f}</span><span style="color:${col}">${v}</span></div>`;
    }).join('');
  }

  setDead(dead, downT) {
    this.deadEl.style.display = dead ? 'block' : 'none';
    if (dead) this.deadEl.innerHTML = STR.dead + '<br>' + STR.respawnIn(Math.ceil(downT));
  }
}
