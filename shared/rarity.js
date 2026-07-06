// Редкость предметов: id с суффиксом «@r» (редкое) / «@e» (эпическое) /
// «@l» (легендарное — задел, в мире пока не выпадает).
// getWeapon/getItem резолвят суффикс в готовый объект с усиленными статами.
import { WEAPONS } from './weapons.js';
import { ITEMS } from './items.js';

export const RARITIES = {
  c: { key: 'c', name: '', color: '#b8b8b8', statMult: 1, dmgMult: 1, priceMult: 1 },
  r: { key: 'r', name: 'Редкое', color: '#639bff', statMult: 1.6, dmgMult: 1.3, priceMult: 2.5 },
  e: { key: 'e', name: 'Эпическое', color: '#b06ee1', statMult: 2.3, dmgMult: 1.6, priceMult: 6 },
  l: { key: 'l', name: 'Легендарное', color: '#df7126', statMult: 3.2, dmgMult: 2.1, priceMult: 15 },
};

export function splitId(id) {
  const m = /^(.*)@([rel])$/.exec(id || '');
  return m ? { base: m[1], rar: m[2] } : { base: id, rar: 'c' };
}

export function rarityOf(id) { return RARITIES[splitId(id).rar]; }

const wCache = new Map();
// Оружие по id (с учётом редкости): урон/разрушение/цена усилены
export function getWeapon(id) {
  if (!id) return null;
  let w = wCache.get(id);
  if (w) return w;
  const { base, rar } = splitId(id);
  const w0 = WEAPONS[base];
  if (!w0) return null;
  const R = RARITIES[rar];
  w = {
    ...w0, id, baseId: base, rarity: rar,
    name: R.name ? `${w0.name} [${R.name}]` : w0.name,
    damage: Math.round(w0.damage * R.dmgMult * 10) / 10,
    structDmg: w0.structDmg ? Math.round(w0.structDmg * R.dmgMult) : 0,
    price: Math.round((w0.price || 30) * R.priceMult),
  };
  wCache.set(id, w);
  return w;
}

const iCache = new Map();
const ATTRS = ['str', 'agi', 'int', 'lck'];
// очки атрибутов от редкости и профиль по слоту (если у предмета нет своих атрибутов)
const RAR_ATTR_PTS = { c: 0, r: 1, e: 3, l: 5 };
const SLOT_AFFINITY = {
  chest: ['str'], head: ['int'], legs: ['agi'],
  offhand: ['str'], acc: ['lck'], ring: ['lck'],
};

// Экипировка/зелья по id: обычные статы умножены на редкость,
// а атрибуты (СИЛ/ЛОВ/ИНТ/УДЧ) редкость даёт плоскими очками по профилю:
// редкое +1, эпическое +3, легендарное +5 — в «родные» атрибуты предмета
// (или по слоту: грудь — сила, голова — интеллект, ноги — ловкость...)
export function getItem(id) {
  if (!id) return null;
  let it = iCache.get(id);
  if (it) return it;
  const { base, rar } = splitId(id);
  const it0 = ITEMS[base];
  if (!it0) return null;
  const R = RARITIES[rar];
  it = { ...it0, id, baseId: base, rarity: rar, name: R.name ? `${it0.name} [${R.name}]` : it0.name };
  if (it0.stats) {
    it.stats = {};
    const INT_STATS = new Set(['maxHp', 'manaRegen']);
    for (const [k, v] of Object.entries(it0.stats)) {
      if (ATTRS.includes(k)) it.stats[k] = v; // атрибуты не умножаем — редкость добавит очки
      else it.stats[k] = INT_STATS.has(k)
        ? Math.round(v * R.statMult)
        : Math.round(v * R.statMult * 100) / 100;
    }
  }
  const pts = RAR_ATTR_PTS[rar] || 0;
  if (pts && it0.slot) {
    it.stats = it.stats || {};
    const own = it0.stats ? ATTRS.filter(k => it0.stats[k]) : [];
    const aff = own.length ? own : (SLOT_AFFINITY[it0.slot] || ['str']);
    for (let i = 0; i < pts; i++) {
      const k = aff[i % aff.length];
      it.stats[k] = (it.stats[k] || 0) + 1;
    }
  }
  it.price = Math.round((it0.price || 10) * R.priceMult);
  iCache.set(id, it);
  return it;
}

// Бросок редкости для дропа. luck — очки удачи убийцы (повышают шансы).
// boost: 0 обычный враг, 1 сундук/элита, 2 босс (минимум редкое).
// Эпики — редкие трофеи: без удачи и с обычного врага ~1.5%
export function rollRarity(rand, luck = 0, boost = 0) {
  const eChance = 0.015 + boost * 0.04 + luck * 0.003;
  const rChance = 0.20 + boost * 0.20 + luck * 0.012;
  const roll = rand();
  if (roll < eChance) return 'e';
  if (roll < eChance + rChance || boost >= 2) return 'r';
  return 'c';
}

export function withRarity(baseId, rar) { return rar === 'c' ? baseId : baseId + '@' + rar; }

import { MATERIAL_PRICES } from './items.js';
// Цена продажи с учётом редкости (~40%)
export function sellPriceR(itemId) {
  if ((itemId || '').startsWith('weapon:')) {
    const w = getWeapon(itemId.slice(7));
    return w ? Math.max(5, Math.round(w.price * 0.4)) : 5;
  }
  const it = getItem(itemId);
  if (it?.price) return Math.max(2, Math.round(it.price * 0.4));
  if (MATERIAL_PRICES[itemId]) return Math.max(1, Math.round(MATERIAL_PRICES[itemId] * 0.5));
  return 1;
}
