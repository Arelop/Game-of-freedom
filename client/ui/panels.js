// DOM-панели: тосты, диалоги, инвентарь с экипировкой, экран смерти.
import { STR, ITEM_NAMES } from '../../shared/strings.js';
import { MSG } from '../../shared/protocol.js';
import { ITEMS, GEAR_SLOTS, SLOT_NAMES, isGear, isPotion, describeItem, isWeaponItem, weaponIdOf, sellPrice } from '../../shared/items.js';
import { AMMO_NAMES, WEAPONS } from '../../shared/weapons.js';
import { getWeapon, getItem, rarityOf, sellPriceR, RARITIES } from '../../shared/rarity.js';
import { CLASSES, STAT_KEYS, STAT_NAMES, STAT_DESC, xpNeed, MAX_LEVEL } from '../../shared/classes.js';
import { ENEMIES, HABITATS, ARCHETYPE_NAMES, tierTouchBonus, tierProjDmg } from '../../shared/enemies.js';
import { TALENTS, TIER_REQ, SPECS, specPoints, talentRank } from '../../shared/talents.js';
import { SFX } from '../sfx.js';

const USABLE_FOOD = new Set(['bread', 'meat', 'cooked_meat', 'bandage']);

export class Panels {
  constructor(net, atlas) {
    this.net = net;
    this.atlas = atlas;
    this.toastsEl = document.getElementById('toasts');
    this.dialogEl = document.getElementById('dialog');
    this.invEl = document.getElementById('inv');
    this.charEl = document.getElementById('char');
    this.deadEl = document.getElementById('deadmsg');
    this.helpEl = document.getElementById('help');
    this.invOpen = false;
    this.charOpen = false;
    this.iconCache = new Map();
    this.helpEl.textContent = STR.controls;
    setTimeout(() => { this.helpEl.style.display = 'none'; }, 20000);
    // плавающая карточка предмета
    this.tipEl = document.createElement('div');
    this.tipEl.id = 'tipcard';
    document.body.appendChild(this.tipEl);
  }

  // ---------- карточка предмета (красивый тултип) ----------
  showTip(html, x, y) {
    const t = this.tipEl;
    t.innerHTML = html;
    t.style.display = 'block';
    const r = t.getBoundingClientRect();
    let px = x + 16, py = y + 12;
    if (px + r.width > innerWidth - 8) px = x - r.width - 12;
    if (py + r.height > innerHeight - 8) py = innerHeight - r.height - 8;
    t.style.left = Math.max(4, px) + 'px';
    t.style.top = Math.max(4, py) + 'px';
  }

  hideTip() { this.tipEl.style.display = 'none'; }

  bindTip(el, htmlFn) {
    el.onmouseenter = e => this.showTip(htmlFn(), e.clientX, e.clientY);
    el.onmousemove = e => { if (this.tipEl.style.display === 'block') this.showTip(htmlFn(), e.clientX, e.clientY); };
    el.onmouseleave = () => this.hideTip();
  }

  // карточка экипировки/зелья/материала
  tipItem(itemId, { action = null, price = true } = {}) {
    const it = getItem(itemId);
    const r = rarityOf(itemId);
    const name = it?.name || ITEM_NAMES[itemId] || itemId;
    const type = it?.slot ? SLOT_NAMES[it.slot === 'acc' ? 'acc1' : it.slot] || it.slot
      : it?.use ? 'Расходник' : 'Материал';
    const rarLabel = r.name ? ` · ${r.name}` : '';
    const stats = describeItem(itemId, it);
    const lines = stats ? stats.split(', ').map(s => `<div class="tstat">${s}</div>`).join('') : '';
    const blockLine = it?.block ? '<div class="tinfo">Блок на ПКМ: гасит удары спереди</div>' : '';
    const activeLine = it?.activeDesc ? `<div class="tinfo" style="color:#df7126">${it.activeDesc}</div>` : '';
    return `<div class="tname" style="color:${r.color}">${name}</div>`
      + `<div class="ttype">${type}${rarLabel}</div>`
      + lines + blockLine + activeLine
      + (price ? `<div class="tprice">Цена продажи: ${sellPriceR(itemId)} мон.</div>` : '')
      + (action ? `<div class="tact">клик — ${action}</div>` : '');
  }

  // карточка оружия
  tipWeapon(wid, { action = null, price = true } = {}) {
    const w = getWeapon(wid);
    if (!w) return wid;
    const r = RARITIES[w.rarity || 'c'];
    const school = { melee: 'Ближний бой', ranged: 'Дальний бой', magic: 'Магия' }[w.school] || '';
    const lines = [
      `<div class="tstat">Урон: ${w.damage}</div>`,
      `<div class="tstat">Темп: ${w.fireRate}/с</div>`,
    ];
    if (w.ammoType) lines.push(`<div class="tinfo">Боеприпас: ${AMMO_NAMES[w.ammoType]}</div>`);
    if (w.slow) lines.push('<div class="tinfo">Замедляет врагов</div>');
    if (w.explode) lines.push('<div class="tinfo">Взрывается по области</div>');
    if (w.chain) lines.push('<div class="tinfo">Молния скачет по врагам</div>');
    if (w.structDmg) lines.push(`<div class="tinfo">Ломает постройки (${w.structDmg})</div>`);
    return `<div class="tname" style="color:${r.color}">${w.name.replace(/ \[.*\]$/, '')}</div>`
      + `<div class="ttype">${school}${r.name ? ' · ' + r.name : ''}</div>`
      + lines.join('')
      + (price ? `<div class="tprice">Цена продажи: ${Math.max(5, Math.round(w.price * 0.4))} мон.</div>` : '')
      + (action ? `<div class="tact">клик — ${action}</div>` : '');
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 4200);
    if (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
  }

  // ---------- летопись (L): все вести копятся здесь, мировые — только здесь ----------
  logMsg(text, world) {
    this.log = this.log || [];
    this.log.push({ text, w: !!world, day: this.net.day });
    if (this.log.length > 120) this.log.shift();
    if (this.logOpen) this.renderLog();
  }

  toggleLog() {
    this.logOpen = !this.logOpen;
    let el = document.getElementById('worldlog');
    if (!el) {
      el = document.createElement('div');
      el.id = 'worldlog';
      document.body.appendChild(el);
    }
    el.style.display = this.logOpen ? 'block' : 'none';
    if (this.logOpen) this.renderLog();
  }

  renderLog() {
    const el = document.getElementById('worldlog');
    if (!el || !this.logOpen) return;
    el.innerHTML = '<h3>🕮 Летопись</h3>';
    const log = this.log || [];
    if (!log.length) {
      const e = document.createElement('div');
      e.className = 'lgempty';
      e.textContent = 'Пока тихо. Здесь копятся вести мира и твои события.';
      el.appendChild(e);
    }
    let lastDay = null;
    for (let i = log.length - 1; i >= 0; i--) { // свежее — сверху
      const m = log[i];
      if (m.day !== lastDay) {
        lastDay = m.day;
        const d = document.createElement('div');
        d.className = 'lgday';
        d.textContent = `— день ${m.day} —`;
        el.appendChild(d);
      }
      const row = document.createElement('div');
      row.className = 'lgrow' + (m.w ? ' world' : '');
      row.textContent = m.text;
      el.appendChild(row);
    }
  }

  showDialog(m) {
    const d = this.dialogEl;
    d.innerHTML = '';
    // портрет собеседника: спрайт NPC крупно в рамке (если сущность рядом)
    const ent = this.net.remotes?.get(m.id);
    const spr = ent?.data?.k;
    const head = document.createElement('div');
    head.className = 'dhead';
    if (spr && this.atlas.map[spr]) {
      const port = document.createElement('canvas');
      port.width = 72; port.height = 72;
      port.className = 'dportrait';
      const c = port.getContext('2d');
      c.imageSmoothingEnabled = false;
      const s = this.atlas.map[spr];
      const k = Math.min(64 / s.w, 64 / s.h);
      const w = Math.round(s.w * k), h = Math.round(s.h * k);
      c.drawImage(this.atlas.img, s.x, s.y, s.w, s.h, (72 - w) >> 1, (72 - h) >> 1, w, h);
      head.appendChild(port);
    }
    const nameBox = document.createElement('div');
    nameBox.className = 'dnamebox';
    const name = document.createElement('div');
    name.className = 'dname'; name.textContent = m.name;
    nameBox.appendChild(name);
    for (const line of m.lines) {
      const el = document.createElement('div');
      el.className = 'dline'; el.textContent = line;
      nameBox.appendChild(el);
    }
    head.appendChild(nameBox);
    d.appendChild(head);
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

  hideDialog() {
    this.dialogEl.style.display = 'none';
    this.hideShop();
    this.hideStash();
  }
  get dialogOpen() { return this.dialogEl.style.display === 'block' || this.shopOpen || this.stashOpen; }

  // ---------- бестиарий (B): все твари мира по тирам ----------
  showBestiary(m) {
    this.bestiaryCounts = m.k || {};
    this.beOpen = true;
    let el = document.getElementById('bestiary');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bestiary';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    this.renderBestiary();
  }

  hideBestiary() {
    this.beOpen = false;
    const el = document.getElementById('bestiary');
    if (el) el.style.display = 'none';
  }

  renderBestiary() {
    const el = document.getElementById('bestiary');
    if (!el || !this.beOpen) return;
    const counts = this.bestiaryCounts || {};
    const kinds = Object.values(ENEMIES);
    const known = kinds.filter(d => counts[d.id] > 0).length;
    el.innerHTML = `<h3>🐾 Бестиарий <span class="becount">${known}/${kinds.length} изучено</span></h3>
      <div class="behint">Победи тварь, чтобы раскрыть её повадки. Подсказка «где искать» видна всегда.</div>`;
    for (let tier = 1; tier <= 5; tier++) {
      const list = kinds.filter(d => d.tier === tier);
      if (!list.length) continue;
      const h = document.createElement('div');
      h.className = 'betier';
      h.textContent = `— Тир ${tier} ${'★'.repeat(tier)} —`;
      el.appendChild(h);
      for (const d of list) {
        const n = counts[d.id] || 0;
        const row = document.createElement('div');
        row.className = 'beentry' + (n > 0 ? ' known' : '');
        const icon = this.freshIcon(d.sprite);
        icon.classList.add('beicon');
        if (n === 0) icon.style.filter = 'brightness(0.25)';
        row.appendChild(icon);
        const info = document.createElement('div');
        info.className = 'beinfo';
        if (n > 0) {
          const touch = d.touchDamage ? d.touchDamage + tierTouchBonus(d.tier) : 0;
          const shoots = ['shooter', 'turret', 'boss'].includes(d.archetype);
          const dmgTxt = (touch ? `касание ${touch}` : '') + (touch && shoots ? ' / ' : '')
            + (shoots ? `снаряд ${tierProjDmg(d.tier)}` : '') || '—';
          info.innerHTML = `<div class="bename">${d.name}${d.faction === 'darkness' ? ' ⛧' : ''}`
            + ` <span class="bekills">убито: ${n}</span></div>`
            + `<div class="bestats">${ARCHETYPE_NAMES[d.archetype] || d.archetype} · ${d.hp} ХП`
            + ` · ${dmgTxt} · опыт ${d.xp}</div>`
            + `<div class="behab">${HABITATS[d.id] || ''}</div>`;
        } else {
          info.innerHTML = `<div class="bename" style="color:#696a6a">???</div>`
            + `<div class="behab">${HABITATS[d.id] || 'Неизвестно…'}</div>`;
        }
        row.appendChild(info);
        el.appendChild(row);
      }
    }
    const btn = document.createElement('div');
    btn.className = 'shopbtns';
    const close = document.createElement('button');
    close.textContent = STR.close + ' (B)';
    close.style.cssText = 'width:100%;background:#222034;color:#99e550;border:1px solid #45444f;padding:8px;font-family:inherit;cursor:pointer';
    close.onclick = () => this.hideBestiary();
    btn.appendChild(close);
    el.appendChild(btn);
  }

  // ---------- журнал заданий (J) ----------
  toggleJournal() {
    this.jrOpen = !this.jrOpen;
    let el = document.getElementById('journal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'journal';
      document.body.appendChild(el);
    }
    el.style.display = this.jrOpen ? 'block' : 'none';
    if (this.jrOpen) this.renderJournal();
  }

  renderJournal() {
    const el = document.getElementById('journal');
    const you = this.net.you;
    if (!el || !you || !this.jrOpen) return;
    const qs = you.qs || [];
    el.innerHTML = `<h3>📖 Журнал заданий (${qs.length}/3)</h3>`;
    if (!qs.length) {
      const e = document.createElement('div');
      e.className = 'jrempty';
      e.textContent = 'Пусто. Задания дают старейшины, охотники и доска заказов у столба.';
      el.appendChild(e);
    }
    for (const q of qs) {
      const row = document.createElement('div');
      row.className = 'jrquest' + (q.done ? ' done' : '');
      row.innerHTML = `<div class="jrtitle">${q.done ? '✓' : '•'} ${q.title}</div>
        <div class="jrstate">${q.done ? 'Выполнено — вернись к заказчику за наградой' : 'В работе' + (q.tx ? ' · цель отмечена на карте (M)' : '')}</div>`;
      el.appendChild(row);
    }
    const hintEl = document.createElement('div');
    hintEl.className = 'jrempty';
    hintEl.textContent = 'Можно вести до трёх заданий одновременно.';
    el.appendChild(hintEl);
  }

  // ---------- общий сундук отряда (таверна) ----------
  showStash(m) {
    this.stashData = m.items || {};
    this.stashBox = m.box || 'team';
    this.stashOpen = true;
    let el = document.getElementById('stash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'stash';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    this.renderStash();
  }

  hideStash() {
    this.stashOpen = false;
    const el = document.getElementById('stash');
    if (el) el.style.display = 'none';
    this.hideTip();
  }

  renderStash() {
    const el = document.getElementById('stash');
    if (!el || !this.stashOpen) return;
    el.innerHTML = this.stashBox === 'home'
      ? '<div class="shophead"><span>🏠 Личный сундук</span><span class="shopgreet">твоё добро в целости</span></div>'
      : '<div class="shophead"><span>📦 Сундук отряда</span><span class="shopgreet">общее добро — бери и клади</span></div>';
    const mkGrid = (items, take) => {
      const grid = document.createElement('div');
      grid.className = 'shopgrid';
      const entries = Object.entries(items).filter(([, n]) => n > 0);
      if (!entries.length) {
        const e = document.createElement('div');
        e.className = 'empty'; e.textContent = '— пусто —';
        e.style.cssText = 'color:#45444f;font-size:12px;padding:4px';
        grid.appendChild(e);
      }
      for (const [item, n] of entries) {
        const cell = document.createElement('div');
        cell.className = 'shopcell';
        cell.appendChild(this.freshIcon(this.itemIcon(item)));
        if (n > 1) {
          const b = document.createElement('span');
          b.className = 'count'; b.textContent = 'x' + n;
          cell.appendChild(b);
        }
        const rc = this.rarColor(item);
        if (rc) cell.style.borderColor = rc;
        const isWpn = isWeaponItem(item);
        this.bindTip(cell, () => isWpn
          ? this.tipWeapon(weaponIdOf(item), { action: take ? 'забрать' : 'положить', price: false })
          : this.tipItem(item, { action: take ? 'забрать' : 'положить', price: false }));
        cell.onclick = () => {
          SFX.ui();
          this.hideTip();
          this.net.send({ t: MSG.STASH, op: take ? 'take' : 'put', item, box: this.stashBox });
        };
        grid.appendChild(cell);
      }
      return grid;
    };
    el.appendChild(header('В сундуке (клик — забрать)'));
    el.appendChild(mkGrid(this.stashData, true));
    el.appendChild(header('Твоя сумка (клик — положить)'));
    el.appendChild(mkGrid(this.net.you?.inv || {}, false));
    const btn = document.createElement('div');
    btn.className = 'shopbtns';
    const close = document.createElement('button');
    close.textContent = STR.close + ' (Esc)';
    close.onclick = () => this.hideStash();
    btn.appendChild(close);
    el.appendChild(btn);
  }

  // ---------- окно торговли: сетка товаров с иконками и карточками ----------
  showShop(m) {
    this.shopData = m;
    this.shopOpen = true;
    let el = document.getElementById('shop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'shop';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    this.renderShop();
  }

  hideShop() {
    this.shopOpen = false;
    this.hideTip();
    const el = document.getElementById('shop');
    if (el) el.style.display = 'none';
  }

  renderShop() {
    const el = document.getElementById('shop');
    const m = this.shopData;
    if (!el || !m || !this.shopOpen) return;
    const coins = this.net.you?.coins ?? 0;
    el.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'shophead';
    head.innerHTML = `<span>🛒 Торговец ${m.name}</span><span class="shopcoins">🪙 ${coins}</span>`;
    el.appendChild(head);
    const greet = document.createElement('div');
    greet.className = 'shopgreet';
    greet.textContent = m.greet || '';
    el.appendChild(greet);

    // товары по группам — легче искать глазами
    const groupOf = it => it.item.startsWith('weapon:') ? 'Оружие'
      : it.item.startsWith('ammo_') ? 'Боеприпасы'
      : ITEMS[it.item]?.slot ? 'Экипировка'
      : (ITEMS[it.item]?.use || USABLE_FOOD.has(it.item)) ? 'Расходники' : 'Материалы';
    const groups = new Map();
    for (const it of m.items) {
      const g = groupOf(it);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    for (const gname of ['Оружие', 'Экипировка', 'Расходники', 'Боеприпасы', 'Материалы']) {
      const list = groups.get(gname);
      if (!list) continue;
      const h = document.createElement('h3');
      h.textContent = gname;
      el.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'shopgrid';
      for (const it of list) {
        const cell = document.createElement('div');
        cell.className = 'shopcell';
        const isWpn = it.item.startsWith('weapon:');
        cell.appendChild(this.freshIcon(this.itemIcon(it.item)));
        const rc = this.rarColor(it.item);
        if (rc) cell.style.borderColor = rc;
        if (it.count > 1) {
          const badge = document.createElement('span');
          badge.className = 'count'; badge.textContent = 'x' + it.count;
          cell.appendChild(badge);
        }
        const tag = document.createElement('span');
        tag.className = 'shopprice';
        tag.textContent = it.price + (it.trend > 0 ? '▲' : it.trend < 0 ? '▼' : '');
        if (it.trend > 0) tag.style.color = '#d9574a';
        if (it.trend < 0) tag.style.color = '#99e550';
        cell.appendChild(tag);
        const cantAfford = coins < it.price;
        if (cantAfford) cell.classList.add('poor');
        this.bindTip(cell, () => {
          const base = isWpn
            ? this.tipWeapon(it.item.slice(7), { action: cantAfford ? null : 'купить', price: false })
            : this.tipItem(it.item, { action: cantAfford ? null : 'купить', price: false });
          const extra = (it.need ? `<div class="tinfo" style="color:#d9a066">Нет оружия под боеприпас (${it.need})</div>` : '')
            + `<div class="tprice">Цена: ${it.price} мон.${it.trend > 0 ? ' (дефицит ▲)' : it.trend < 0 ? ' (избыток ▼)' : ''}${cantAfford ? ' — не хватает монет' : ''}</div>`;
          return base + extra;
        });
        cell.onclick = () => {
          if (this.net.you?.coins < it.price) { SFX.ui(); return; }
          SFX.pickup();
          this.net.send({ t: MSG.DIALOG_CHOICE, id: m.id, choice: 'buy:' + it.i });
          setTimeout(() => this.renderShop(), 200); // обновить монеты/доступность
        };
        grid.appendChild(cell);
      }
      el.appendChild(grid);
    }

    const btns = document.createElement('div');
    btns.className = 'shopbtns';
    const sellB = document.createElement('button');
    sellB.textContent = '💰 Продать вещи';
    sellB.onclick = () => {
      SFX.ui();
      this.hideShop();
      this.net.send({ t: MSG.DIALOG_CHOICE, id: m.id, choice: 'sell' });
    };
    const closeB = document.createElement('button');
    closeB.textContent = STR.bye + ' (Esc)';
    closeB.onclick = () => { SFX.ui(); this.hideShop(); };
    btns.appendChild(sellB);
    btns.appendChild(closeB);
    el.appendChild(btns);
  }

  toggleInventory() {
    this.invOpen = !this.invOpen;
    if (!this.invOpen) { this.sellMode = false; this.hideTip(); }
    this.invEl.style.display = this.invOpen ? 'block' : 'none';
    if (this.invOpen) this.renderInventory();
  }

  openSellMode() {
    this.sellMode = true;
    this.invOpen = true;
    this.invEl.style.display = 'block';
    this.renderInventory();
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

  itemName(id) {
    if (isWeaponItem(id)) return getWeapon(weaponIdOf(id))?.name || id;
    return getItem(id)?.name || ITEM_NAMES[id] || id;
  }
  itemIcon(id) {
    if (isWeaponItem(id)) return getWeapon(weaponIdOf(id))?.sprite || 'item_coin';
    return getItem(id)?.icon || 'item_' + id;
  }
  // цвет рамки по редкости (для оружия учитываем weapon:xxx@r)
  rarColor(id) {
    const rid = isWeaponItem(id) ? weaponIdOf(id) : id;
    const r = rarityOf(rid);
    return r.key === 'c' ? null : r.color;
  }

  weaponTooltip(wid) {
    const w = getWeapon(wid);
    if (!w) return wid;
    const school = { melee: 'ближний бой', ranged: 'дальний бой', magic: 'магия' }[w.school];
    const parts = [`${w.name} — ${school}`, `урон ${w.damage}, темп ${w.fireRate}/с`];
    if (w.ammoType) parts.push(`боеприпас: ${AMMO_NAMES[w.ammoType]}`);
    if (w.slow) parts.push('замедляет врагов');
    if (w.explode) parts.push('взрывается по области');
    if (w.chain) parts.push('молния перескакивает на врагов');
    return parts.join('\n');
  }

  renderInventory() {
    if (!this.invOpen || !this.net.you) return;
    const you = this.net.you;
    const el = this.invEl;
    el.innerHTML = '';

    if (this.sellMode) {
      const banner = document.createElement('div');
      banner.className = 'sellbanner';
      banner.textContent = '💰 ПРОДАЖА: клик по предмету в сумке продаёт его';
      el.appendChild(banner);
    } else if (this.giveMode) {
      const banner = document.createElement('div');
      banner.className = 'sellbanner';
      banner.textContent = '🤝 ПЕРЕДАЧА: клик по предмету отдаёт его союзнику рядом';
      el.appendChild(banner);
    }
    // передача вещей союзнику (кооп)
    const giveBtn = document.createElement('button');
    giveBtn.className = 'givebtn';
    giveBtn.textContent = this.giveMode ? '✕ Закончить передачу' : '🤝 Передать вещи союзнику';
    giveBtn.onclick = () => { this.giveMode = !this.giveMode; this.sellMode = false; this.renderInventory(); };
    el.appendChild(giveBtn);

    // --- оружие (ячейки 1-4) ---
    el.appendChild(header('Оружие (клавиши 1–4)'));
    const wpnRow = document.createElement('div');
    wpnRow.className = 'eqrow';
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement('div');
      cell.className = 'eqslot wslot';
      const wid = you.ws?.[i];
      if (wid) {
        cell.appendChild(this.freshIcon(getWeapon(wid)?.sprite));
        this.bindTip(cell, () => this.tipWeapon(wid, { action: 'убрать в сумку' }));
        cell.classList.add('filled');
        const rcW = this.rarColor('weapon:' + wid);
        if (rcW) cell.style.borderColor = rcW;
        if (i === you.wi) cell.classList.add('active');
        const num = document.createElement('span');
        num.className = 'slotnum'; num.textContent = i + 1;
        cell.appendChild(num);
        cell.onclick = () => { SFX.ui(); this.hideTip(); this.net.send({ t: MSG.UNEQUIP, slot: 'w' + i }); setTimeout(() => this.renderInventory(), 150); };
      } else {
        const lbl = document.createElement('span');
        lbl.className = 'eqlabel'; lbl.textContent = '—';
        cell.appendChild(lbl);
      }
      wpnRow.appendChild(cell);
    }
    el.appendChild(wpnRow);

    // --- экипировка: кукла персонажа ---
    el.appendChild(header('Экипировка'));
    const doll = document.createElement('div');
    doll.className = 'doll';
    // сетка 3×4: голова сверху, руки по бокам груди, ноги, аксессуары и кольцо
    const LAYOUT = [
      null, 'head', null,
      'offhand', 'chest', 'weapon',
      'acc1', 'legs', 'acc2',
      null, 'ring', null,
    ];
    for (const slot of LAYOUT) {
      if (slot === null) {
        const sp = document.createElement('div');
        sp.className = 'dollspacer';
        doll.appendChild(sp);
        continue;
      }
      const cell = document.createElement('div');
      cell.className = 'eqslot';
      const nameTag = document.createElement('span');
      nameTag.className = 'slotname';
      if (slot === 'weapon') {
        // правая рука: текущее оружие (управляется ячейками 1-4)
        nameTag.textContent = 'Правая рука';
        const wid = you.w;
        if (wid) {
          cell.appendChild(this.freshIcon(getWeapon(wid)?.sprite));
          cell.classList.add('filled');
          const rc = this.rarColor('weapon:' + wid);
          if (rc) cell.style.borderColor = rc;
          this.bindTip(cell, () => this.tipWeapon(wid, { action: null, price: false }));
        }
      } else {
        nameTag.textContent = SLOT_NAMES[slot];
        const itemId = you.eq?.[slot];
        if (itemId) {
          cell.appendChild(this.freshIcon(this.itemIcon(itemId)));
          cell.classList.add('filled');
          const rcE = this.rarColor(itemId);
          if (rcE) cell.style.borderColor = rcE;
          this.bindTip(cell, () => this.tipItem(itemId, { action: 'снять', price: false }));
          cell.onclick = () => { SFX.ui(); this.hideTip(); this.net.send({ t: MSG.UNEQUIP, slot }); setTimeout(() => this.renderInventory(), 150); };
        }
      }
      cell.appendChild(nameTag);
      doll.appendChild(cell);
    }
    el.appendChild(doll);

    // --- бафы ---
    const buffs = Object.entries(you.bf || {});
    if (buffs.length) {
      const b = document.createElement('div');
      b.className = 'buffline';
      b.textContent = buffs.map(([k, t]) => `${k === 'speed' ? 'Прыть' : k}: ${t} с`).join(', ');
      el.appendChild(b);
    }

    // --- сумка ---
    el.appendChild(header('Сумка'));
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
      const isWpn = isWeaponItem(item);
      const rc = this.rarColor(item);
      if (rc) cell.style.borderColor = rc;
      const price = sellPriceR(item);

      if (this.sellMode) {
        cell.classList.add('sellable');
        this.bindTip(cell, () => isWpn
          ? this.tipWeapon(weaponIdOf(item), { action: `продать за ${price} мон.` })
          : this.tipItem(item, { action: `продать за ${price} мон.` }));
        const tag = document.createElement('span');
        tag.className = 'pricetag'; tag.textContent = price;
        cell.appendChild(tag);
        cell.onclick = () => {
          SFX.pickup();
          this.hideTip();
          this.net.send({ t: MSG.SELL_ITEM, item });
          setTimeout(() => this.renderInventory(), 150);
        };
      } else if (this.giveMode) {
        cell.classList.add('sellable');
        this.bindTip(cell, () => isWpn
          ? this.tipWeapon(weaponIdOf(item), { action: 'передать союзнику' })
          : this.tipItem(item, { action: 'передать союзнику' }));
        cell.onclick = () => {
          SFX.ui();
          this.hideTip();
          this.net.send({ t: MSG.GIVE, item });
          setTimeout(() => this.renderInventory(), 150);
        };
      } else {
        const action = (isWpn || isGear(item)) ? (isWpn ? 'взять в руки' : 'надеть')
          : (USABLE_FOOD.has(item) || isPotion(item)) ? 'использовать' : null;
        this.bindTip(cell, () => isWpn
          ? this.tipWeapon(weaponIdOf(item), { action })
          : this.tipItem(item, { action }));
        if (action) {
          cell.classList.add('usable');
          cell.onclick = () => {
            SFX.ui();
            this.hideTip();
            this.net.send((isWpn || isGear(item)) ? { t: MSG.EQUIP, item } : { t: MSG.USE_ITEM, item });
            setTimeout(() => this.renderInventory(), 150);
          };
        }
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

  // ---------- меню фракций (F) ----------
  toggleFactions() {
    this.facOpen = !this.facOpen;
    let el = document.getElementById('factions');
    if (!el) {
      el = document.createElement('div');
      el.id = 'factions';
      document.body.appendChild(el);
    }
    el.style.display = this.facOpen ? 'block' : 'none';
    if (this.facOpen) this.renderFactions(el);
  }

  renderFactions(el) {
    const you = this.net.you;
    if (!you) return;
    const NAMES = { severane: 'Северяне', ozerny: 'Озёрный союз', stepnyaki: 'Степняки', bandits: 'Вольница' };
    el.innerHTML = '<h3>Дипломатия</h3>';

    // Армия Тьмы — общий враг: мощь Цитадели и её форты
    const dark = this.net.darkPower;
    if (dark) {
      const block = document.createElement('div');
      block.className = 'facblock dark';
      const forts = this.net.mapInfo.settlements.filter(s => s.st === 3).map(s => s.name).join(', ');
      const pw = Math.min(100, Math.round(dark.pw / 2));
      block.innerHTML = `
        <div class="facname">⛧ Армия Тьмы <span style="color:#d9574a">${you.rep?.darkness ?? -100}</span></div>
        <div class="facbar"><div class="facfill" style="width:${pw}%;background:#7b2fbe"></div></div>
        <div class="facvill">Мощь Цитадели: ${dark.pw} · Фортов: ${dark.f}${forts ? ` (${forts})` : ''}</div>
        <div class="facrel">Ведёт войну со всеми добрыми фракциями</div>
        <div class="facacts"><div>⚔ переговоры невозможны — только сталь</div>
        <div>✓ освобождение фортов и разгром гарнизона Цитадели ослабляют Тьму</div></div>`;
      el.appendChild(block);
    }

    for (const [f, fname] of Object.entries(NAMES)) {
      const rep = you.rep?.[f] ?? 0;
      const col = rep > 20 ? '#99e550' : rep < -20 ? '#d9574a' : '#d9a066';
      const block = document.createElement('div');
      block.className = 'facblock';

      const vlist = this.net.mapInfo.settlements
        .filter(s => s.faction === f)
        .map(s => `${s.name}${s.st === 3 ? '⛧' : s.st === 1 ? '⚔' : s.st === 2 ? '☠' : ''}`).join(', ');

      // отношения с другими фракциями
      const rels = Object.entries(this.net.relations?.[f] || {})
        .filter(([o, v]) => NAMES[o] && v < -15)
        .map(([o]) => NAMES[o]);

      // доступные действия по репутации
      const acts = [];
      if (rep < -20) acts.push('⚔ стража атакует тебя на месте');
      else {
        acts.push('✓ торговля и квесты');
        if (rep >= 20) acts.push('✓ скидки у торговцев, сбор урожая');
        else acts.push('✗ скидки — нужна репутация 20');
        if (rep >= 30) acts.push('✓ посредничество в конфликтах (старейшина)');
        else acts.push('✗ дипломатия — нужна репутация 30');
        if (rep < 50) acts.push('✗ звание Защитник (реп. 50) — дар 100 мон.');
        else if (rep < 80) acts.push('✓ Защитник · ✗ звание Герой (реп. 80) — эпический дар');
      }

      // текущий ранг игрока во фракции
      const rank = f === 'bandits' ? '' :
        rep >= 80 ? ' · <span style="color:#b46ee0">ГЕРОЙ</span>' :
        rep >= 50 ? ' · <span style="color:#5fcde4">Защитник</span>' :
        rep >= 25 ? ' · <span style="color:#99e550">Друг</span>' : '';

      block.innerHTML = `
        <div class="facname">${fname}${rank} <span style="color:${col}">${rep}</span></div>
        <div class="facbar"><div class="facfill" style="width:${Math.round((rep + 100) / 2)}%;background:${col}"></div></div>
        ${vlist ? `<div class="facvill">Поселения: ${vlist}</div>` : ''}
        ${rels.length ? `<div class="facrel">Вражда: ${rels.join(', ')}</div>` : ''}
        <div class="facacts">${acts.map(a => `<div>${a}</div>`).join('')}</div>`;
      el.appendChild(block);
    }
  }

  // ---------- лист персонажа (C) ----------
  toggleChar() {
    this.charOpen = !this.charOpen;
    this.charEl.style.display = this.charOpen ? 'block' : 'none';
    if (this.charOpen) this.renderChar();
  }

  renderChar() {
    if (!this.charOpen || !this.net.you) return;
    const you = this.net.you;
    const el = this.charEl;
    const C = CLASSES[you.cls] || CLASSES.warrior;
    el.innerHTML = '';

    const h = document.createElement('h3');
    h.textContent = `${C.name} — уровень ${you.lvl}`;
    el.appendChild(h);

    // полоса опыта
    const bar = document.createElement('div');
    bar.className = 'xpbar';
    bar.title = `Опыт: ${you.xp} / ${you.xpn}`;
    const fill = document.createElement('div');
    fill.className = 'xpfill';
    fill.style.width = you.lvl >= MAX_LEVEL ? '100%' : Math.round(100 * you.xp / you.xpn) + '%';
    bar.appendChild(fill);
    el.appendChild(bar);

    // характеристики
    const sh = document.createElement('h3');
    sh.innerHTML = 'Характеристики' + (you.sp > 0 ? ` <span class="pts">(+${you.sp} очк.)</span>` : '');
    el.appendChild(sh);
    for (const key of STAT_KEYS) {
      const row = document.createElement('div');
      row.className = 'strow';
      row.title = STAT_DESC[key];
      const label = document.createElement('span');
      label.innerHTML = `${STAT_NAMES[key]}: <b>${you.st?.[key] ?? 0}</b><br><span class="statdesc">${STAT_DESC[key]}</span>`;
      row.appendChild(label);
      if (you.sp > 0) {
        const plus = document.createElement('button');
        plus.className = 'plus';
        plus.textContent = '+';
        plus.onclick = () => {
          SFX.ui();
          this.net.send({ t: MSG.SPEND_STAT, stat: key });
          setTimeout(() => this.renderChar(), 150);
        };
        row.appendChild(plus);
      }
      el.appendChild(row);
    }

    // таланты в духе WoW Classic: три вкладки-специализации, ранги, ярусы
    const th = document.createElement('h3');
    th.innerHTML = 'Таланты' + (you.tp2 > 0 ? ` <span class="pts">(+${you.tp2} очк.)</span>` : '');
    el.appendChild(th);
    const learned = you.tl || [];
    const specs = SPECS[you.cls] || [];
    this.specTab = this.specTab ?? 0;

    // вкладки: имя ветки + вложенные очки
    const tabs = document.createElement('div');
    tabs.className = 'spectabs';
    specs.forEach((spec, i) => {
      const pts = specPoints(you.cls, spec.id, learned);
      const b = document.createElement('button');
      b.className = 'spectab' + (i === this.specTab ? ' active' : '');
      b.style.borderBottomColor = spec.color;
      if (i === this.specTab) b.style.color = spec.color;
      b.innerHTML = `${spec.name}<br><span class="specpts">${pts}</span>`;
      b.onclick = () => { this.specTab = i; this.renderChar(); };
      tabs.appendChild(b);
    });
    el.appendChild(tabs);

    const spec = specs[this.specTab];
    if (!spec) return;
    const pts = specPoints(you.cls, spec.id, learned);
    const sub = document.createElement('div');
    sub.className = 'specdesc';
    sub.textContent = `${spec.desc} · вложено очков: ${pts}`;
    el.appendChild(sub);

    let lastTier = 0;
    for (const t of (TALENTS[you.cls] || []).filter(x => x.spec === spec.id)) {
      if (t.tier !== lastTier) {
        lastTier = t.tier;
        const tl = document.createElement('div');
        tl.className = 'tierlabel';
        tl.textContent = t.tier === 4 ? `— КАПСТОУНЫ (нужно ${TIER_REQ[4]} очков в ветке)`
          : `— Ярус ${t.tier}` + (TIER_REQ[t.tier] ? ` (нужно ${TIER_REQ[t.tier]} очков в ветке)` : '');
        el.appendChild(tl);
      }
      const rank = talentRank(t.id, learned);
      const maxRank = t.ranks || 1;
      const isMax = rank >= maxRank;
      const tierOpen = pts >= TIER_REQ[t.tier];
      const avail = !isMax && tierOpen && you.tp2 > 0;
      const box = document.createElement('div');
      box.className = 'talent ' + (isMax ? 'learned' : rank > 0 ? 'partial' : avail ? 'avail' : 'locked');
      if (avail && rank > 0) box.classList.add('avail');
      box.style.borderLeft = `3px solid ${rank > 0 ? spec.color : '#45444f'}`;
      const rankTxt = maxRank > 1 ? ` <span class="trank" style="color:${rank > 0 ? spec.color : '#696a6a'}">${rank}/${maxRank}</span>` : (isMax ? ' ✓' : '');
      box.innerHTML = `<div class="tname">${t.name}${t.tier === 4 ? ' ★' : ''}${rankTxt}</div><div class="tdesc">${t.desc}</div>`;
      if (avail) {
        box.onclick = () => {
          SFX.quest();
          this.net.send({ t: MSG.LEARN_TALENT, id: t.id });
          setTimeout(() => this.renderChar(), 150);
        };
      }
      el.appendChild(box);
    }
  }
}

function header(text) {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
}
