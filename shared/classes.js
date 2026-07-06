// Классы персонажей и характеристики.
// СИЛ — урон ближнего боя; ЛОВ — урон дальнего боя и перекат;
// ИНТ — урон магии; УДЧ — шанс крита и монеты.
export const STAT_KEYS = ['str', 'agi', 'int', 'lck'];
export const STAT_NAMES = { str: 'Сила', agi: 'Ловкость', int: 'Интеллект', lck: 'Удача' };
export const STAT_DESC = {
  str: '+8% урона ближнего боя, +½ сердца за очко',
  agi: '+4% скорость атаки, +2% шанс уворота',
  int: '+1 к регену маны, +6% урона магии',
  lck: 'выше шанс, количество и редкость добычи',
};

export const CLASSES = {
  warrior: {
    id: 'warrior', name: 'Воин',
    desc: 'Крепкий боец ближнего боя. Меч, щит и упрямство.',
    baseStats: { str: 3, agi: 1, int: 0, lck: 1 },
    maxHpBonus: 2,
    weapons: ['sword', 'bow'],
    ammo: { arrow: 30, bolt: 0, mana: 0, knife: 0 },
    sprite: 'player_warrior',
  },
  mage: {
    id: 'mage', name: 'Маг',
    desc: 'Повелитель стихий. Хрупок, но испепеляет издалека.',
    baseStats: { str: 0, agi: 1, int: 3, lck: 1 },
    maxHpBonus: 0,
    weapons: ['firestaff', 'sword'],
    ammo: { arrow: 0, bolt: 0, mana: 50, knife: 0 },
    sprite: 'player_mage',
  },
  rogue: {
    id: 'rogue', name: 'Вор',
    desc: 'Быстрый и меткий. Бьёт в спину и исчезает.',
    baseStats: { str: 1, agi: 3, int: 0, lck: 2 },
    maxHpBonus: 0,
    speedBonus: 0.05,
    weapons: ['bow', 'knives'],
    ammo: { arrow: 50, bolt: 0, mana: 0, knife: 15 },
    sprite: 'player_rogue',
  },
};

// Кривая опыта: сколько нужно до следующего уровня
export function xpNeed(level) { return 20 + level * 20; }
export const MAX_LEVEL = 20;

// Бонусы от характеристик (используются сервером и листом персонажа)
export function statBonuses(stats) {
  return {
    dmgMelee: (stats.str || 0) * 0.08,
    maxHp: (stats.str || 0),                          // +½ сердца за очко силы
    atkSpeed: (stats.agi || 0) * 0.04,
    dodge: Math.min(0.6, (stats.agi || 0) * 0.02),    // шанс полностью избежать урона
    dmgMagic: (stats.int || 0) * 0.06,
    manaRegen: (stats.int || 0),                      // +1 маны за цикл регена
    coinMult: (stats.lck || 0) * 0.05,
    dropBonus: (stats.lck || 0) * 0.03,               // шанс доп. добычи; редкость — в rollRarity
  };
}
