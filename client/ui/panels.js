// DOM-панели: тосты, диалоги, инвентарь с экипировкой, экран смерти.
import { STR, ITEM_NAMES } from '../../shared/strings.js';
import { MSG } from '../../shared/protocol.js';
import { ITEMS, GEAR_SLOTS, SLOT_NAMES, isGear, isPotion, describeItem, isWeaponItem, weaponIdOf, sellPrice } from '../../shared/items.js';
import { AMMO_NAMES, WEAPONS } from '../../shared/weapons.js';
import { getWeapon, getItem, rarityOf, sellPriceR, RARITIES } from '../../shared/rarity.js';
import { CLASSES, STAT_KEYS, STAT_NAMES, STAT_DESC, xpNeed, MAX_LEVEL } from '../../shared/classes.js';
import { TALENTS, TIER_REQ } from '../../shared/talents.js';
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

  hideDialog() {
    this.dialogEl.style.display = 'none';
    this.hideShop();
  }
  get dialogOpen() { return this.dialogEl.style.display === 'block' || this.shopOpen; }

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
    }

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
      }

      block.innerHTML = `
        <div class="facname">${fname} <span style="color:${col}">${rep}</span></div>
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

    // таланты
    const th = document.createElement('h3');
    th.innerHTML = 'Таланты' + (you.tp2 > 0 ? ` <span class="pts">(+${you.tp2} очк.)</span>` : '');
    el.appendChild(th);
    const learned = you.tl || [];
    let lastTier = 0;
    for (const t of TALENTS[you.cls] || []) {
      if (t.tier !== lastTier) {
        lastTier = t.tier;
        const tl = document.createElement('div');
        tl.className = 'tierlabel';
        tl.textContent = `— Ярус ${t.tier}` + (TIER_REQ[t.tier] ? ` (нужно ${TIER_REQ[t.tier]} изученных)` : '');
        el.appendChild(tl);
      }
      const box = document.createElement('div');
      const isLearned = learned.includes(t.id);
      const tierOpen = learned.length >= TIER_REQ[t.tier];
      const avail = !isLearned && tierOpen && you.tp2 > 0;
      box.className = 'talent ' + (isLearned ? 'learned' : avail ? 'avail' : 'locked');
      box.innerHTML = `<div class="tname">${isLearned ? '✓ ' : ''}${t.name}</div><div class="tdesc">${t.desc}</div>`;
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
