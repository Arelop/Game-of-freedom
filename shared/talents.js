// Деревья талантов: 9 талантов на класс в 3 ярусах.
// Ярус 2 открывается после 2 изученных талантов, ярус 3 — после 4.
// effects — числовые бонусы (суммируются в recomputeStats),
// flag — особые механики, обрабатываемые кодом боя.
export const TIER_REQ = { 1: 0, 2: 2, 3: 4 };

export const TALENTS = {
  warrior: [
    { id: 'w_grip', tier: 1, name: 'Крепкая хватка', desc: '+15% урона ближнего боя', effects: { dmgMelee: 0.15 } },
    { id: 'w_skin', tier: 1, name: 'Стальная кожа', desc: '+1 сердце', effects: { maxHp: 2 } },
    { id: 'w_dash', tier: 1, name: 'Рывок', desc: '−20% кулдаун переката', effects: { rollCd: 0.2 } },
    { id: 'w_arc', tier: 2, name: 'Широкий замах', desc: 'Дуга удара шире на 40°', effects: { arcBonus: 40 } },
    { id: 'w_blood', tier: 2, name: 'Кровожадность', desc: 'Убийство в ближнем бою лечит ½ сердца', flag: 'bloodlust' },
    { id: 'w_tough', tier: 2, name: 'Несокрушимость', desc: '+2 сердца', effects: { maxHp: 4 } },
    { id: 'w_whirl', tier: 3, name: 'Вихрь стали', desc: 'Удары бьют по кругу (360°)', flag: 'whirl' },
    { id: 'w_rage', tier: 3, name: 'Ярость', desc: 'Ниже 30% здоровья — +40% урона', flag: 'rage' },
    { id: 'w_ram', tier: 3, name: 'Таран', desc: 'Перекат сбивает врагов и наносит урон', flag: 'ram' },
  ],
  mage: [
    { id: 'm_spark', tier: 1, name: 'Искра', desc: '+15% урона магии', effects: { dmgMagic: 0.15 } },
    { id: 'm_medit', tier: 1, name: 'Медитация', desc: '+2 к регену маны', effects: { manaRegen: 2 } },
    { id: 'm_robes', tier: 1, name: 'Лёгкие одежды', desc: '+6% скорость движения', effects: { speed: 0.06 } },
    { id: 'm_twin', tier: 2, name: 'Двойной сгусток', desc: 'Посохи выпускают +1 снаряд', effects: { magicProj: 1 } },
    { id: 'm_frost', tier: 2, name: 'Ледяная хватка', desc: 'Лёд замедляет сильнее и дольше', flag: 'frostMaster' },
    { id: 'm_barrier', tier: 2, name: 'Барьер', desc: 'Неуязвимость в перекате дольше', flag: 'barrier' },
    { id: 'm_storm', tier: 3, name: 'Огненный шторм', desc: 'Ещё +1 снаряд и +15% урона магии', effects: { magicProj: 1, dmgMagic: 0.15 } },
    { id: 'm_arch', tier: 3, name: 'Архимаг', desc: '30% шанс не потратить ману', flag: 'arcane' },
    { id: 'm_blood', tier: 3, name: 'Чародейская кровь', desc: 'Зелья действуют на 50% сильнее', flag: 'alchemy' },
  ],
  rogue: [
    { id: 'r_aim', tier: 1, name: 'Меткость', desc: '+15% урона дальнего боя', effects: { dmgRanged: 0.15 } },
    { id: 'r_step', tier: 1, name: 'Лёгкая поступь', desc: '+8% скорость движения', effects: { speed: 0.08 } },
    { id: 'r_pick', tier: 1, name: 'Карманник', desc: '+30% монет с врагов', effects: { coinMult: 0.3 } },
    { id: 'r_hands', tier: 2, name: 'Быстрые руки', desc: '+20% скорость атаки', effects: { atkSpeed: 0.2 } },
    { id: 'r_shadow', tier: 2, name: 'Тень', desc: 'После переката следующая атака +50% урона', flag: 'shadow' },
    { id: 'r_acro', tier: 2, name: 'Акробат', desc: '−25% кулдаун переката', effects: { rollCd: 0.25 } },
    { id: 'r_stab', tier: 3, name: 'Смертельный укол', desc: 'Криты наносят ×3 вместо ×2', flag: 'deadly' },
    { id: 'r_fan', tier: 3, name: 'Веер ножей', desc: 'Метательные ножи: +2 снаряда', effects: { knifeProj: 2 } },
    { id: 'r_luck', tier: 3, name: 'Фортуна', desc: '+10% шанс крита', effects: { critChance: 0.1 } },
  ],
};

export function findTalent(cls, id) {
  return (TALENTS[cls] || []).find(t => t.id === id);
}

// Можно ли изучить: есть очко, не изучен, открыт ярус
export function canLearn(cls, id, learned, talentPts) {
  if (talentPts <= 0) return false;
  const t = findTalent(cls, id);
  if (!t || learned.includes(id)) return false;
  return learned.length >= TIER_REQ[t.tier];
}
