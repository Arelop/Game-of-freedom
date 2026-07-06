// РПГ-предметы: экипировка (слоты) и зелья. Чистые данные + описания.
// stats: maxHp (+сердца, 2 = 1 сердце), speed/damage (множители-добавки),
// rollCd (снижение кулдауна переката).
export const GEAR_SLOTS = ['armor', 'helmet', 'amulet', 'shield'];
export const SLOT_NAMES = { armor: 'Броня', helmet: 'Голова', amulet: 'Амулет', shield: 'Щит' };

export const ITEMS = {
  // --- броня ---
  leather_armor: {
    id: 'leather_armor', name: 'Кожаный доспех', slot: 'armor',
    stats: { maxHp: 2 }, price: 40, icon: 'item_armor_leather',
  },
  chain_armor: {
    id: 'chain_armor', name: 'Кольчуга', slot: 'armor',
    stats: { maxHp: 4, speed: -0.05 }, price: 95, icon: 'item_armor_chain',
  },
  plate_armor: {
    id: 'plate_armor', name: 'Латный доспех', slot: 'armor',
    stats: { maxHp: 6, speed: -0.12 }, price: 170, icon: 'item_armor_plate',
  },
  // --- голова ---
  hunter_hood: {
    id: 'hunter_hood', name: 'Капюшон охотника', slot: 'helmet',
    stats: { speed: 0.06 }, price: 35, icon: 'item_hood',
  },
  iron_helmet: {
    id: 'iron_helmet', name: 'Железный шлем', slot: 'helmet',
    stats: { maxHp: 2 }, price: 65, icon: 'item_helmet',
  },
  // --- амулеты и кольца ---
  wolf_amulet: {
    id: 'wolf_amulet', name: 'Волчий амулет', slot: 'amulet',
    stats: { speed: 0.12 }, price: 55, icon: 'item_amulet_wolf',
  },
  bear_amulet: {
    id: 'bear_amulet', name: 'Медвежий амулет', slot: 'amulet',
    stats: { damage: 0.25 }, price: 85, icon: 'item_amulet_bear',
  },
  swift_ring: {
    id: 'swift_ring', name: 'Кольцо ловкости', slot: 'amulet',
    stats: { rollCd: 0.35 }, price: 75, icon: 'item_ring',
  },
  // --- щиты ---
  wood_shield: {
    id: 'wood_shield', name: 'Деревянный щит', slot: 'shield',
    stats: { maxHp: 1 }, price: 25, icon: 'item_shield_wood',
  },
  iron_shield: {
    id: 'iron_shield', name: 'Железный щит', slot: 'shield',
    stats: { maxHp: 2, speed: -0.04 }, price: 70, icon: 'item_shield_iron',
  },
  // --- зелья ---
  heal_potion: {
    id: 'heal_potion', name: 'Зелье лечения', use: { heal: 3 },
    price: 30, icon: 'item_potion',
  },
  mana_potion: {
    id: 'mana_potion', name: 'Зелье маны', use: { mana: 15 },
    price: 25, icon: 'item_potion_blue',
  },
  swift_potion: {
    id: 'swift_potion', name: 'Зелье прыти', use: { buff: 'speed', mult: 0.3, time: 45 },
    price: 35, icon: 'item_potion_green',
  },
  fire_arrows: {
    id: 'fire_arrows', name: 'Горящие стрелы', use: { buff: 'fireArrows', time: 60 },
    price: 25, icon: 'item_fire_arrow',
  },
};

export function isGear(itemId) { return !!ITEMS[itemId]?.slot; }
export function isPotion(itemId) { return !!ITEMS[itemId]?.use; }
export function isWeaponItem(itemId) { return itemId.startsWith('weapon:'); }
export function weaponIdOf(itemId) { return itemId.slice(7); }

// Базовые цены материалов/еды (для продажи торговцу)
export const MATERIAL_PRICES = {
  bread: 8, meat: 5, cooked_meat: 12, bandage: 15, wood: 6, hide: 9, herb: 5, coin: 1,
  metal: 12,
};

// Цена продажи торговцу (~40% от стоимости). WEAPONS передаётся параметром,
// чтобы не плодить циклический импорт.
export function sellPrice(itemId, WEAPONS) {
  if (isWeaponItem(itemId)) {
    const w = WEAPONS?.[weaponIdOf(itemId)];
    return w ? Math.max(5, Math.round(w.price * 0.4)) : 5;
  }
  if (ITEMS[itemId]?.price) return Math.max(2, Math.round(ITEMS[itemId].price * 0.4));
  if (MATERIAL_PRICES[itemId]) return Math.max(1, Math.round(MATERIAL_PRICES[itemId] * 0.5));
  return 1;
}

// Русское описание статов: «+1 сердце, +12% скорость»
export function describeItem(itemId) {
  const it = ITEMS[itemId];
  if (!it) return '';
  const parts = [];
  if (it.stats) {
    const s = it.stats;
    if (s.maxHp) parts.push(`+${s.maxHp / 2} ${plural(s.maxHp / 2, 'сердце', 'сердца', 'сердец')}`);
    if (s.speed) parts.push(`${s.speed > 0 ? '+' : ''}${Math.round(s.speed * 100)}% скорость`);
    if (s.damage) parts.push(`+${Math.round(s.damage * 100)}% урон`);
    if (s.rollCd) parts.push(`−${Math.round(s.rollCd * 100)}% кулдаун переката`);
  }
  if (it.use) {
    const u = it.use;
    if (u.heal) parts.push(`лечит ${u.heal / 2}❤`);
    if (u.mana) parts.push(`+${u.mana} маны`);
    if (u.buff === 'speed') parts.push(`+${Math.round(u.mult * 100)}% скорость на ${u.time} с`);
    if (u.buff === 'fireArrows') parts.push(`стрелы и болты жгут и ломают стены, ${u.time} с`);
  }
  return parts.join(', ');
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
