// Деревья талантов: у каждого класса 3 специализации по 6 талантов.
// Ярусы внутри ветки: 1 — свободно, 2 — нужно 2 очка в ЭТОЙ ветке,
// 3 — нужно 4 очка в ветке (капстоуны).
// effects — числовые бонусы (суммируются в recomputeStats),
// flag — особые механики, обрабатываемые кодом боя.
export const TIER_REQ = { 1: 0, 2: 2, 3: 4 };

// специализации: тематические ветки прокачки
export const SPECS = {
  warrior: [
    { id: 'berserk', name: 'Берсерк', color: '#d9574a', desc: 'Ярость и сокрушительные удары' },
    { id: 'guard', name: 'Страж', color: '#9badb7', desc: 'Несокрушимая стена из стали' },
    { id: 'warlord', name: 'Полководец', color: '#d9a066', desc: 'Манёвр и воинский клич' },
  ],
  mage: [
    { id: 'pyro', name: 'Пиромант', color: '#df7126', desc: 'Испепеляющее пламя' },
    { id: 'cryo', name: 'Криомант', color: '#63c5ff', desc: 'Лёд, сковывающий врагов' },
    { id: 'arcane', name: 'Арканист', color: '#b06ee1', desc: 'Чистая сила маны' },
  ],
  rogue: [
    { id: 'assassin', name: 'Убийца', color: '#d9574a', desc: 'Тень и смертельные удары' },
    { id: 'marksman', name: 'Стрелок', color: '#99e550', desc: 'Меткость и скорость' },
    { id: 'trickster', name: 'Плут', color: '#fbf236', desc: 'Удача, уловки и золото' },
  ],
};

export const TALENTS = {
  warrior: [
    // --- Берсерк: урон ближнего боя ---
    { id: 'w_grip', spec: 'berserk', tier: 1, name: 'Крепкая хватка', desc: '+15% урона ближнего боя', effects: { dmgMelee: 0.15 } },
    { id: 'w_arc', spec: 'berserk', tier: 1, name: 'Широкий замах', desc: 'Дуга удара шире на 40°', effects: { arcBonus: 40 } },
    { id: 'w_blood', spec: 'berserk', tier: 2, name: 'Кровожадность', desc: 'Убийство в ближнем бою лечит ½ сердца', flag: 'bloodlust' },
    { id: 'w_powerburn', spec: 'berserk', tier: 2, name: 'Сокрушение', desc: 'Мощный удар: +40% урона', flag: 'ab_power' },
    { id: 'w_rage', spec: 'berserk', tier: 3, name: 'Ярость', desc: 'Ниже 30% здоровья — +40% урона', flag: 'rage' },
    { id: 'w_whirl', spec: 'berserk', tier: 3, name: 'Вихрь стали', desc: 'Удары бьют по кругу (360°)', flag: 'whirl' },
    // --- Страж: живучесть и возмездие ---
    { id: 'w_skin', spec: 'guard', tier: 1, name: 'Стальная кожа', desc: '+1 сердце', effects: { maxHp: 2 } },
    { id: 'w_vigor', spec: 'guard', tier: 1, name: 'Второе дыхание', desc: '+1 сердце и +5% скорость', effects: { maxHp: 2, speed: 0.05 } },
    { id: 'w_tough', spec: 'guard', tier: 2, name: 'Несокрушимость', desc: '+2 сердца', effects: { maxHp: 4 } },
    { id: 'w_thorns', spec: 'guard', tier: 2, name: 'Шипастый доспех', desc: 'Враги, ударившие тебя вблизи, получают 1 урона', flag: 'thorns' },
    { id: 'w_fortress', spec: 'guard', tier: 3, name: 'Бастион', desc: '+3 сердца', effects: { maxHp: 6 } },
    { id: 'w_laststand', spec: 'guard', tier: 3, name: 'Последний рубеж', desc: 'Смертельный удар оставляет 1 ХП (раз в 60 с)', flag: 'laststand' },
    // --- Полководец: манёвр и клич ---
    { id: 'w_dash', spec: 'warlord', tier: 1, name: 'Рывок', desc: '−20% кулдаун переката', effects: { rollCd: 0.2 } },
    { id: 'w_march', spec: 'warlord', tier: 1, name: 'Марш-бросок', desc: '+6% скорость движения', effects: { speed: 0.06 } },
    { id: 'w_ram', spec: 'warlord', tier: 2, name: 'Таран', desc: 'Перекат сбивает врагов и наносит урон', flag: 'ram' },
    { id: 'w_whirlfar', spec: 'warlord', tier: 2, name: 'Стальной шторм', desc: 'Вихрь стали летит на 50% дальше', flag: 'ab_whirlfar' },
    { id: 'w_cryheal', spec: 'warlord', tier: 3, name: 'Вдохновляющий клич', desc: 'Боевой клич лечит союзников на ½ сердца', flag: 'ab_cryheal' },
    { id: 'w_warlord', spec: 'warlord', tier: 3, name: 'Вождь', desc: 'Боевой клич даёт группе +15% урона на 10 с', flag: 'ab_crydmg' },
  ],
  mage: [
    // --- Пиромант: испепеление ---
    { id: 'm_spark', spec: 'pyro', tier: 1, name: 'Искра', desc: '+15% урона магии', effects: { dmgMagic: 0.15 } },
    { id: 'm_ember', spec: 'pyro', tier: 1, name: 'Тлеющие угли', desc: '+8% урона магии и +1 реген маны', effects: { dmgMagic: 0.08, manaRegen: 1 } },
    { id: 'm_twin', spec: 'pyro', tier: 2, name: 'Двойной сгусток', desc: 'Посохи выпускают +1 снаряд', effects: { magicProj: 1 } },
    { id: 'm_wavewide', spec: 'pyro', tier: 2, name: 'Пламенный вал', desc: 'Огненная волна шире и дальше', flag: 'ab_wave' },
    { id: 'm_blinkburn', spec: 'pyro', tier: 3, name: 'Пылающий след', desc: 'Телепорт оставляет взрыв в точке старта', flag: 'ab_blink' },
    { id: 'm_storm', spec: 'pyro', tier: 3, name: 'Огненный шторм', desc: 'Ещё +1 снаряд и +15% урона магии', effects: { magicProj: 1, dmgMagic: 0.15 } },
    // --- Криомант: лёд и стойкость ---
    { id: 'm_frost', spec: 'cryo', tier: 1, name: 'Ледяная хватка', desc: 'Лёд замедляет сильнее и дольше', flag: 'frostMaster' },
    { id: 'm_chill', spec: 'cryo', tier: 1, name: 'Стужа', desc: '+10% урона магии', effects: { dmgMagic: 0.1 } },
    { id: 'm_barrier', spec: 'cryo', tier: 2, name: 'Барьер', desc: 'Неуязвимость в перекате дольше', flag: 'barrier' },
    { id: 'm_novadeep', spec: 'cryo', tier: 2, name: 'Вечная мерзлота', desc: 'Ледяная нова замораживает почти намертво', flag: 'ab_nova' },
    { id: 'm_icyveins', spec: 'cryo', tier: 3, name: 'Ледяные жилы', desc: '−20% кулдауны способностей', flag: 'cdr' },
    { id: 'm_glacier', spec: 'cryo', tier: 3, name: 'Ледник', desc: '+2 сердца и +1 реген маны', effects: { maxHp: 4, manaRegen: 1 } },
    // --- Арканист: мана и чистая сила ---
    { id: 'm_medit', spec: 'arcane', tier: 1, name: 'Медитация', desc: '+2 к регену маны', effects: { manaRegen: 2 } },
    { id: 'm_robes', spec: 'arcane', tier: 1, name: 'Лёгкие одежды', desc: '+6% скорость движения', effects: { speed: 0.06 } },
    { id: 'm_arch', spec: 'arcane', tier: 2, name: 'Архимаг', desc: '30% шанс не потратить ману', flag: 'arcane' },
    { id: 'm_blood', spec: 'arcane', tier: 2, name: 'Чародейская кровь', desc: 'Зелья действуют на 50% сильнее', flag: 'alchemy' },
    { id: 'm_focus', spec: 'arcane', tier: 3, name: 'Фокусировка', desc: '+25% урона магии', effects: { dmgMagic: 0.25 } },
    { id: 'm_overmind', spec: 'arcane', tier: 3, name: 'Сверхразум', desc: '+2 реген маны и +12% урона магии', effects: { manaRegen: 2, dmgMagic: 0.12 } },
  ],
  rogue: [
    // --- Убийца: тень и криты ---
    { id: 'r_blade', spec: 'assassin', tier: 1, name: 'Отточенные клинки', desc: '+12% урона ближнего и дальнего боя', effects: { dmgMelee: 0.12, dmgRanged: 0.12 } },
    { id: 'r_shadow', spec: 'assassin', tier: 1, name: 'Тень', desc: 'После переката следующая атака +50% урона', flag: 'shadow' },
    { id: 'r_stab', spec: 'assassin', tier: 2, name: 'Смертельный укол', desc: 'Криты наносят ×3 вместо ×2', flag: 'deadly' },
    { id: 'r_dashstun', spec: 'assassin', tier: 2, name: 'Ошеломление', desc: 'Рывок теней оглушает на 1 с', flag: 'ab_dash' },
    { id: 'r_luck', spec: 'assassin', tier: 3, name: 'Фортуна', desc: '+10% шанс крита', effects: { critChance: 0.1 } },
    { id: 'r_execution', spec: 'assassin', tier: 3, name: 'Казнь', desc: '+8% шанс крита и +15% урона ближнего боя', effects: { critChance: 0.08, dmgMelee: 0.15 } },
    // --- Стрелок: меткость и темп ---
    { id: 'r_aim', spec: 'marksman', tier: 1, name: 'Меткость', desc: '+15% урона дальнего боя', effects: { dmgRanged: 0.15 } },
    { id: 'r_hands', spec: 'marksman', tier: 1, name: 'Быстрые руки', desc: '+20% скорость атаки', effects: { atkSpeed: 0.2 } },
    { id: 'r_fan', spec: 'marksman', tier: 2, name: 'Веер ножей', desc: 'Метательные ножи: +2 снаряда', effects: { knifeProj: 2 } },
    { id: 'r_bladefan', spec: 'marksman', tier: 2, name: 'Стальной ливень', desc: 'Град клинков: +6 клинков', flag: 'ab_blades' },
    { id: 'r_sniper', spec: 'marksman', tier: 3, name: 'Снайпер', desc: '+25% урона дальнего боя', effects: { dmgRanged: 0.25 } },
    { id: 'r_rapid', spec: 'marksman', tier: 3, name: 'Шквал', desc: 'Ещё +15% скорость атаки', effects: { atkSpeed: 0.15 } },
    // --- Плут: удача и уловки ---
    { id: 'r_step', spec: 'trickster', tier: 1, name: 'Лёгкая поступь', desc: '+8% скорость движения', effects: { speed: 0.08 } },
    { id: 'r_pick', spec: 'trickster', tier: 1, name: 'Карманник', desc: '+30% монет с врагов', effects: { coinMult: 0.3 } },
    { id: 'r_acro', spec: 'trickster', tier: 2, name: 'Акробат', desc: '−25% кулдаун переката', effects: { rollCd: 0.25 } },
    { id: 'r_smokespd', spec: 'trickster', tier: 2, name: 'Дым и зеркала', desc: 'Завеса дольше (5 с) и даёт +30% скорости', flag: 'ab_smoke' },
    { id: 'r_ghost', spec: 'trickster', tier: 3, name: 'Призрак', desc: '+4% уворот и −15% кулдаун переката', effects: { dodge: 0.04, rollCd: 0.15 } },
    { id: 'r_gambler', spec: 'trickster', tier: 3, name: 'Игрок', desc: '+30% монет и +5% шанс крита', effects: { coinMult: 0.3, critChance: 0.05 } },
  ],
};

export function findTalent(cls, id) {
  return (TALENTS[cls] || []).find(t => t.id === id);
}

// очки, вложенные в конкретную ветку
export function specPoints(cls, spec, learned) {
  return learned.filter(id => findTalent(cls, id)?.spec === spec).length;
}

// Можно ли изучить: есть очко, не изучен, набран ярус в ЭТОЙ ветке
export function canLearn(cls, id, learned, talentPts) {
  if (talentPts <= 0) return false;
  const t = findTalent(cls, id);
  if (!t || learned.includes(id)) return false;
  return specPoints(cls, t.spec, learned) >= TIER_REQ[t.tier];
}
