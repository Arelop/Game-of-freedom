// Деревья талантов в духе WoW Classic: у класса 3 специализации-вкладки,
// таланты с рангами (очко за ранг), ярусы открываются очками В ЭТОЙ ветке:
// ярус 2 — 3 очка, ярус 3 — 6 очков, ярус 4 (капстоуны) — 9 очков.
// effects — числовые бонусы ЗА РАНГ (суммируются в recomputeStats),
// flag — особые механики, обрабатываемые кодом боя.
export const TIER_REQ = { 1: 0, 2: 3, 3: 6, 4: 9 };

export const SPECS = {
  warrior: [
    { id: 'berserk', name: 'Берсерк', color: '#d9574a', desc: 'Ярость, казнь и вихрь стали' },
    { id: 'guard', name: 'Страж', color: '#9badb7', desc: 'Щит, шипы и последний рубеж' },
    { id: 'warlord', name: 'Полководец', color: '#d9a066', desc: 'Манёвр, тактика и воинский клич' },
  ],
  mage: [
    { id: 'pyro', name: 'Пиромант', color: '#df7126', desc: 'Пламя, поджоги и эхо маны' },
    { id: 'cryo', name: 'Криомант', color: '#63c5ff', desc: 'Лёд, мана-щит и абсолютный ноль' },
    { id: 'arcane', name: 'Арканист', color: '#b06ee1', desc: 'Чистая мана и сила архонта' },
  ],
  rogue: [
    { id: 'assassin', name: 'Убийца', color: '#d9574a', desc: 'Яд, засада и смертельные криты' },
    { id: 'marksman', name: 'Стрелок', color: '#99e550', desc: 'Меткость, темп и град стали' },
    { id: 'trickster', name: 'Плут', color: '#fbf236', desc: 'Удача, золото и невидимость' },
  ],
};

export const TALENTS = {
  warrior: [
    // ═══ БЕРСЕРК ═══
    { id: 'w_grip', spec: 'berserk', tier: 1, ranks: 3, name: 'Крепкая хватка', desc: '+6% урона ближнего боя за ранг', effects: { dmgMelee: 0.06 } },
    { id: 'w_fury', spec: 'berserk', tier: 1, ranks: 2, name: 'Боевое исступление', desc: '+8% скорости атаки за ранг', effects: { atkSpeed: 0.08 } },
    { id: 'w_arc', spec: 'berserk', tier: 2, ranks: 1, name: 'Широкий замах', desc: 'Дуга удара шире на 40°', effects: { arcBonus: 40 } },
    { id: 'w_blood', spec: 'berserk', tier: 2, ranks: 1, name: 'Кровожадность', desc: 'Убийство в ближнем бою лечит ½ сердца', flag: 'bloodlust' },
    { id: 'w_stunhit', spec: 'berserk', tier: 2, ranks: 1, name: 'Оглушающий удар', desc: '15% шанс оглушить ударом на 0.6 с', flag: 'stunhit' },
    { id: 'w_powerburn', spec: 'berserk', tier: 3, ranks: 1, name: 'Сокрушение', desc: 'Мощный удар: +40% урона', flag: 'ab_power' },
    { id: 'w_execute', spec: 'berserk', tier: 3, ranks: 1, name: 'Палач', desc: '+50% урона по врагам ниже 25% здоровья', flag: 'execute' },
    { id: 'w_rage', spec: 'berserk', tier: 4, ranks: 1, name: 'Ярость', desc: 'Ниже 30% здоровья — +40% урона', flag: 'rage' },
    { id: 'w_whirl', spec: 'berserk', tier: 4, ranks: 1, name: 'Вихрь стали', desc: 'Удары бьют по кругу (360°)', flag: 'whirl' },
    // ═══ СТРАЖ ═══
    { id: 'w_skin', spec: 'guard', tier: 1, ranks: 3, name: 'Стальная кожа', desc: '+1 сердце за ранг', effects: { maxHp: 2 } },
    { id: 'w_vigor', spec: 'guard', tier: 1, ranks: 2, name: 'Второе дыхание', desc: '+4% скорости за ранг', effects: { speed: 0.04 } },
    { id: 'w_tough', spec: 'guard', tier: 2, ranks: 2, name: 'Стойкость', desc: '+3% уворота за ранг', effects: { dodge: 0.03 } },
    { id: 'w_thorns', spec: 'guard', tier: 2, ranks: 1, name: 'Шипастый доспех', desc: 'Враги, ударившие вблизи, получают 1 урона', flag: 'thorns' },
    { id: 'w_bulwark', spec: 'guard', tier: 2, ranks: 1, name: 'Мастер щита', desc: 'Блок щитом гасит удары в вдвое более широком секторе', flag: 'blockwide' },
    { id: 'w_fortress', spec: 'guard', tier: 3, ranks: 1, name: 'Бастион', desc: '+3 сердца', effects: { maxHp: 6 } },
    { id: 'w_laststand', spec: 'guard', tier: 3, ranks: 1, name: 'Последний рубеж', desc: 'Смертельный удар оставляет 1 ХП (раз в 60 с)', flag: 'laststand' },
    { id: 'w_citadel', spec: 'guard', tier: 4, ranks: 1, name: 'Живая крепость', desc: '+2 сердца, а шипы бьют на 3 урона', flag: 'thorns3', effects: { maxHp: 4 } },
    // ═══ ПОЛКОВОДЕЦ ═══
    { id: 'w_dash', spec: 'warlord', tier: 1, ranks: 2, name: 'Рывок', desc: '−12% кулдауна переката за ранг', effects: { rollCd: 0.12 } },
    { id: 'w_march', spec: 'warlord', tier: 1, ranks: 2, name: 'Марш-бросок', desc: '+4% скорости за ранг', effects: { speed: 0.04 } },
    { id: 'w_ram', spec: 'warlord', tier: 2, ranks: 1, name: 'Таран', desc: 'Перекат сбивает врагов и наносит урон', flag: 'ram' },
    { id: 'w_tactic', spec: 'warlord', tier: 2, ranks: 2, name: 'Тактик', desc: '+5% ко всему урону за ранг', effects: { dmgMelee: 0.05, dmgRanged: 0.05, dmgMagic: 0.05 } },
    { id: 'w_whirlfar', spec: 'warlord', tier: 3, ranks: 1, name: 'Стальной шторм', desc: 'Вихрь стали летит на 50% дальше', flag: 'ab_whirlfar' },
    { id: 'w_cryheal', spec: 'warlord', tier: 3, ranks: 1, name: 'Вдохновляющий клич', desc: 'Боевой клич лечит союзников на ½ сердца', flag: 'ab_cryheal' },
    { id: 'w_warlord', spec: 'warlord', tier: 4, ranks: 1, name: 'Вождь', desc: 'Клич даёт группе +15% урона на 10 с', flag: 'ab_crydmg' },
    { id: 'w_horn', spec: 'warlord', tier: 4, ranks: 1, name: 'Рог войны', desc: 'Клич укрывает группу барьером на 1 сердце', flag: 'ab_cryarmor' },
  ],
  mage: [
    // ═══ ПИРОМАНТ ═══
    { id: 'm_spark', spec: 'pyro', tier: 1, ranks: 3, name: 'Искра', desc: '+6% урона магии за ранг', effects: { dmgMagic: 0.06 } },
    { id: 'm_ember', spec: 'pyro', tier: 1, ranks: 2, name: 'Тлеющие угли', desc: '+1 реген маны за ранг', effects: { manaRegen: 1 } },
    { id: 'm_twin', spec: 'pyro', tier: 2, ranks: 1, name: 'Двойной сгусток', desc: 'Посохи выпускают +1 снаряд', effects: { magicProj: 1 } },
    { id: 'm_ignite', spec: 'pyro', tier: 2, ranks: 1, name: 'Поджог', desc: 'Магия поджигает врагов: 1 урона/с на 3 с', flag: 'ignite' },
    { id: 'm_wavewide', spec: 'pyro', tier: 2, ranks: 1, name: 'Пламенный вал', desc: 'Огненная волна шире и дальше', flag: 'ab_wave' },
    { id: 'm_blinkburn', spec: 'pyro', tier: 3, ranks: 1, name: 'Пылающий след', desc: 'Телепорт оставляет взрыв в точке старта', flag: 'ab_blink' },
    { id: 'm_echo', spec: 'pyro', tier: 3, ranks: 1, name: 'Эхо маны', desc: '20% шанс: способность почти без кулдауна', flag: 'echo' },
    { id: 'm_storm', spec: 'pyro', tier: 4, ranks: 1, name: 'Огненный шторм', desc: 'Ещё +1 снаряд и +15% урона магии', effects: { magicProj: 1, dmgMagic: 0.15 } },
    // ═══ КРИОМАНТ ═══
    { id: 'm_chill', spec: 'cryo', tier: 1, ranks: 3, name: 'Стужа', desc: '+5% урона магии за ранг', effects: { dmgMagic: 0.05 } },
    { id: 'm_frost', spec: 'cryo', tier: 1, ranks: 1, name: 'Ледяная хватка', desc: 'Лёд замедляет сильнее и дольше', flag: 'frostMaster' },
    { id: 'm_barrier', spec: 'cryo', tier: 2, ranks: 1, name: 'Барьер', desc: 'Неуязвимость в перекате дольше', flag: 'barrier' },
    { id: 'm_manashield', spec: 'cryo', tier: 2, ranks: 1, name: 'Ледяная кора', desc: 'Четверть урона уходит в ману (3 маны за 1 урона)', flag: 'manashield' },
    { id: 'm_novadeep', spec: 'cryo', tier: 2, ranks: 1, name: 'Вечная мерзлота', desc: 'Ледяная нова замораживает почти намертво', flag: 'ab_nova' },
    { id: 'm_icyveins', spec: 'cryo', tier: 3, ranks: 1, name: 'Ледяные жилы', desc: '−20% кулдауны способностей', flag: 'cdr' },
    { id: 'm_glacier', spec: 'cryo', tier: 3, ranks: 1, name: 'Ледник', desc: '+2 сердца и +1 реген маны', effects: { maxHp: 4, manaRegen: 1 } },
    { id: 'm_deepfreeze', spec: 'cryo', tier: 4, ranks: 1, name: 'Абсолютный ноль', desc: '+35% урона по замедленным врагам', flag: 'deepfreeze' },
    // ═══ АРКАНИСТ ═══
    { id: 'm_medit', spec: 'arcane', tier: 1, ranks: 3, name: 'Медитация', desc: '+1 реген маны за ранг', effects: { manaRegen: 1 } },
    { id: 'm_robes', spec: 'arcane', tier: 1, ranks: 2, name: 'Лёгкие одежды', desc: '+4% скорости за ранг', effects: { speed: 0.04 } },
    { id: 'm_arch', spec: 'arcane', tier: 2, ranks: 1, name: 'Архимаг', desc: '30% шанс не потратить ману', flag: 'arcane' },
    { id: 'm_blood', spec: 'arcane', tier: 2, ranks: 1, name: 'Чародейская кровь', desc: 'Зелья действуют на 50% сильнее', flag: 'alchemy' },
    { id: 'm_focus', spec: 'arcane', tier: 3, ranks: 2, name: 'Фокусировка', desc: '+10% урона магии за ранг', effects: { dmgMagic: 0.1 } },
    { id: 'm_overmind', spec: 'arcane', tier: 3, ranks: 1, name: 'Сверхразум', desc: '+2 реген маны и +12% урона магии', effects: { manaRegen: 2, dmgMagic: 0.12 } },
    { id: 'm_archon', spec: 'arcane', tier: 4, ranks: 1, name: 'Архонт', desc: '+1 снаряд посохам и +10% урона магии', effects: { magicProj: 1, dmgMagic: 0.1 } },
  ],
  rogue: [
    // ═══ УБИЙЦА ═══
    { id: 'r_blade', spec: 'assassin', tier: 1, ranks: 3, name: 'Отточенные клинки', desc: '+5% урона ближ. и дальн. боя за ранг', effects: { dmgMelee: 0.05, dmgRanged: 0.05 } },
    { id: 'r_shadow', spec: 'assassin', tier: 1, ranks: 1, name: 'Тень', desc: 'После переката следующая атака +50% урона', flag: 'shadow' },
    { id: 'r_stab', spec: 'assassin', tier: 2, ranks: 1, name: 'Смертельный укол', desc: 'Криты наносят ×3 вместо ×2', flag: 'deadly' },
    { id: 'r_ambush', spec: 'assassin', tier: 2, ranks: 1, name: 'Засада', desc: '+40% урона по врагам с полным здоровьем', flag: 'ambush' },
    { id: 'r_dashstun', spec: 'assassin', tier: 2, ranks: 1, name: 'Ошеломление', desc: 'Рывок теней оглушает на 1 с', flag: 'ab_dash' },
    { id: 'r_venom', spec: 'assassin', tier: 3, ranks: 1, name: 'Отравленные клинки', desc: 'Атаки отравляют: 1 урона/с на 4 с', flag: 'venom' },
    { id: 'r_luck', spec: 'assassin', tier: 3, ranks: 2, name: 'Фортуна', desc: '+5% шанса крита за ранг', effects: { critChance: 0.05 } },
    { id: 'r_execution', spec: 'assassin', tier: 4, ranks: 1, name: 'Казнь', desc: '+8% крита и +15% урона ближнего боя', effects: { critChance: 0.08, dmgMelee: 0.15 } },
    // ═══ СТРЕЛОК ═══
    { id: 'r_aim', spec: 'marksman', tier: 1, ranks: 3, name: 'Меткость', desc: '+6% урона дальнего боя за ранг', effects: { dmgRanged: 0.06 } },
    { id: 'r_hands', spec: 'marksman', tier: 1, ranks: 2, name: 'Быстрые руки', desc: '+8% скорости атаки за ранг', effects: { atkSpeed: 0.08 } },
    { id: 'r_fan', spec: 'marksman', tier: 2, ranks: 2, name: 'Веер ножей', desc: 'Метательные ножи: +1 снаряд за ранг', effects: { knifeProj: 1 } },
    { id: 'r_bladefan', spec: 'marksman', tier: 2, ranks: 1, name: 'Стальной ливень', desc: 'Град клинков: +6 клинков', flag: 'ab_blades' },
    { id: 'r_sniper', spec: 'marksman', tier: 3, ranks: 2, name: 'Снайпер', desc: '+10% урона дальнего боя за ранг', effects: { dmgRanged: 0.1 } },
    { id: 'r_rapid', spec: 'marksman', tier: 3, ranks: 1, name: 'Шквал', desc: 'Ещё +15% скорости атаки', effects: { atkSpeed: 0.15 } },
    { id: 'r_barrage', spec: 'marksman', tier: 4, ranks: 1, name: 'Град стали', desc: '+1 нож и +10% скорости атаки', effects: { knifeProj: 1, atkSpeed: 0.1 } },
    // ═══ ПЛУТ ═══
    { id: 'r_step', spec: 'trickster', tier: 1, ranks: 2, name: 'Лёгкая поступь', desc: '+4% скорости за ранг', effects: { speed: 0.04 } },
    { id: 'r_pick', spec: 'trickster', tier: 1, ranks: 2, name: 'Карманник', desc: '+15% монет с врагов за ранг', effects: { coinMult: 0.15 } },
    { id: 'r_acro', spec: 'trickster', tier: 2, ranks: 1, name: 'Акробат', desc: '−25% кулдауна переката', effects: { rollCd: 0.25 } },
    { id: 'r_smokespd', spec: 'trickster', tier: 2, ranks: 1, name: 'Дым и зеркала', desc: 'Завеса дольше (5 с) и даёт +30% скорости', flag: 'ab_smoke' },
    { id: 'r_ghost', spec: 'trickster', tier: 3, ranks: 1, name: 'Призрак', desc: '+4% уворота и −15% кулдауна переката', effects: { dodge: 0.04, rollCd: 0.15 } },
    { id: 'r_gold', spec: 'trickster', tier: 3, ranks: 2, name: 'Деловая хватка', desc: '+10% монет и +2% крита за ранг', effects: { coinMult: 0.1, critChance: 0.02 } },
    { id: 'r_gambler', spec: 'trickster', tier: 4, ranks: 1, name: 'Игрок', desc: '+30% монет, +5% крита и +3% уворота', effects: { coinMult: 0.3, critChance: 0.05, dodge: 0.03 } },
  ],
};

export function findTalent(cls, id) {
  return (TALENTS[cls] || []).find(t => t.id === id);
}

// сколько рангов таланта изучено (learned хранит id по разу за ранг)
export function talentRank(id, learned) {
  return learned.filter(x => x === id).length;
}

// очки, вложенные в конкретную ветку
export function specPoints(cls, spec, learned) {
  return learned.filter(id => findTalent(cls, id)?.spec === spec).length;
}

// Можно ли изучить (следующий ранг): есть очко, ранги не выкачаны, ярус набран
export function canLearn(cls, id, learned, talentPts) {
  if (talentPts <= 0) return false;
  const t = findTalent(cls, id);
  if (!t) return false;
  if (talentRank(id, learned) >= (t.ranks || 1)) return false;
  return specPoints(cls, t.spec, learned) >= TIER_REQ[t.tier];
}
