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
  // --- расширение арсенала брони ---
  padded_armor: {
    id: 'padded_armor', name: 'Стёганка', slot: 'armor',
    stats: { maxHp: 1, speed: 0.03 }, price: 25, icon: 'item_armor_padded',
  },
  scale_armor: {
    id: 'scale_armor', name: 'Чешуйчатый доспех', slot: 'armor',
    stats: { maxHp: 5, speed: -0.08 }, price: 130, icon: 'item_armor_scale',
  },
  leather_cap: {
    id: 'leather_cap', name: 'Кожаный шлем', slot: 'helmet',
    stats: { maxHp: 1 }, price: 30, icon: 'item_cap',
  },
  owl_amulet: {
    id: 'owl_amulet', name: 'Совиный амулет', slot: 'amulet',
    stats: { manaRegen: 1, damage: 0.08 }, price: 70, icon: 'item_amulet_owl',
  },
  fox_amulet: {
    id: 'fox_amulet', name: 'Лисий амулет', slot: 'amulet',
    stats: { dodge: 0.04, speed: 0.05 }, price: 75, icon: 'item_amulet_fox',
  },
  iron_ring: {
    id: 'iron_ring', name: 'Железное кольцо', slot: 'amulet',
    stats: { maxHp: 2 }, price: 45, icon: 'item_ring_iron',
  },
  tower_shield: {
    id: 'tower_shield', name: 'Ростовой щит', slot: 'shield',
    stats: { maxHp: 4, speed: -0.1 }, price: 120, icon: 'item_shield_tower',
  },

  // --- броня с бонусами к атрибутам (чистые и смешанные) ---
  berserk_armor: {
    id: 'berserk_armor', name: 'Доспех берсерка', slot: 'armor',
    stats: { maxHp: 2, str: 2 }, price: 140, icon: 'item_armor_berserk',
  },
  mage_robe: {
    id: 'mage_robe', name: 'Мантия чародея', slot: 'armor',
    stats: { int: 2, speed: 0.04 }, price: 130, icon: 'item_robe',
  },
  shadow_cloak: {
    id: 'shadow_cloak', name: 'Плащ ловкача', slot: 'armor',
    stats: { agi: 2, speed: 0.05 }, price: 135, icon: 'item_cloak',
  },
  sage_helmet: {
    id: 'sage_helmet', name: 'Колпак мудреца', slot: 'helmet',
    stats: { int: 1, manaRegen: 1 }, price: 80, icon: 'item_sage_hat',
  },
  war_helm: {
    id: 'war_helm', name: 'Шлем вождя', slot: 'helmet',
    stats: { str: 1, maxHp: 1 }, price: 85, icon: 'item_war_helm',
  },
  crown: {
    id: 'crown', name: 'Корона предводителя', slot: 'helmet',
    stats: { str: 1, agi: 1, int: 1, lck: 1 }, price: 220, icon: 'item_crown',
  },
  rune_amulet: {
    id: 'rune_amulet', name: 'Рунный амулет', slot: 'amulet',
    stats: { int: 1, lck: 1 }, price: 110, icon: 'item_amulet_rune',
  },
  totem_amulet: {
    id: 'totem_amulet', name: 'Боевой тотем', slot: 'amulet',
    stats: { str: 1, agi: 1 }, price: 110, icon: 'item_totem',
  },
  gladiator_shield: {
    id: 'gladiator_shield', name: 'Щит гладиатора', slot: 'shield',
    stats: { maxHp: 2, str: 1 }, price: 115, icon: 'item_shield_glad',
  },
  lucky_charm: {
    id: 'lucky_charm', name: 'Кроличья лапка', slot: 'amulet',
    stats: { lck: 2 }, price: 90, icon: 'item_charm',
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

function baseOf(id) { const i = (id || '').indexOf('@'); return i < 0 ? id : id.slice(0, i); }
export function isGear(itemId) { return !!ITEMS[baseOf(itemId)]?.slot; }
export function isPotion(itemId) { return !!ITEMS[baseOf(itemId)]?.use; }
export function isWeaponItem(itemId) { return (itemId || '').startsWith('weapon:'); }
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

// Русское описание статов: «+1 сердце, +12% скорость».
// resolvedItem — объект из rarity.getItem() для предметов с редкостью.
export function describeItem(itemId, resolvedItem) {
  const it = resolvedItem || ITEMS[itemId];
  if (!it) return '';
  const parts = [];
  if (it.stats) {
    const s = it.stats;
    if (s.maxHp) parts.push(`+${s.maxHp / 2} ${plural(s.maxHp / 2, 'сердце', 'сердца', 'сердец')}`);
    if (s.speed) parts.push(`${s.speed > 0 ? '+' : ''}${Math.round(s.speed * 100)}% скорость`);
    if (s.damage) parts.push(`+${Math.round(s.damage * 100)}% урон`);
    if (s.rollCd) parts.push(`−${Math.round(s.rollCd * 100)}% кулдаун переката`);
    if (s.dodge) parts.push(`+${Math.round(s.dodge * 100)}% уворот`);
    if (s.manaRegen) parts.push(`+${s.manaRegen} к регену маны`);
    if (s.str) parts.push(`+${s.str} Сила`);
    if (s.agi) parts.push(`+${s.agi} Ловкость`);
    if (s.int) parts.push(`+${s.int} Интеллект`);
    if (s.lck) parts.push(`+${s.lck} Удача`);
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
