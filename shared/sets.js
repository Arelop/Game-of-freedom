// Сеты экипировки: носи части комплекта — получай бонусы за 2 и 4 части.
// У предметов в items.js стоит поле set: '<id>'. Бонусы:
//   stats — плоские прибавки (maxHp, speed, dodge, manaRegen, mana),
//   flag  — боевое свойство, обрабатывается сервером (p.setFlags).
export const SETS = {
  wolfpack: {
    id: 'wolfpack', name: 'Волчья стая', color: '#d9a066',
    lore: 'Доспех вожаков северных охотников. Стая не отпускает добычу.',
    bonuses: {
      2: { desc: '+8% к скорости', stats: { speed: 0.08 } },
      4: { desc: 'удары в ближнем бою вызывают кровотечение (3 с)', flag: 'set_bleed' },
    },
  },
  icehall: {
    id: 'icehall', name: 'Ледяной чертог', color: '#5fcde4',
    lore: 'Одеяния зимних волхвов. Холод слушается их, как пёс.',
    bonuses: {
      2: { desc: '+15 к запасу маны', stats: { mana: 15 } },
      4: { desc: 'попадания магией замедляют врагов', flag: 'set_chill' },
    },
  },
  nightshade: {
    id: 'nightshade', name: 'Ночная тень', color: '#847ec9',
    lore: 'Ремесло гильдии теней: тебя не видят, пока не поздно.',
    bonuses: {
      2: { desc: '+5% к увороту', stats: { dodge: 0.05 } },
      4: { desc: 'удары со спины наносят +40% урона', flag: 'set_backstab' },
    },
  },
  ashorder: {
    id: 'ashorder', name: 'Пепельный орден', color: '#df7126',
    lore: 'Кованая в лаве броня огнеходцев Выжженных земель.',
    bonuses: {
      2: { desc: '+1 сердце, лава жжёт вдвое слабее', stats: { maxHp: 2 }, flag: 'set_ashwalk' },
      4: { desc: 'получив урон, 20% шанс огненной новы', flag: 'set_flamenova' },
    },
  },
};

// части сетов (для дропа и подсказок): собирается из items.js при загрузке
export const SET_PIECES = {
  wolfpack: ['pack_helm', 'pack_armor', 'pack_legs', 'pack_ring'],
  icehall: ['frost_hood', 'frost_robe', 'frost_legs', 'frost_amulet'],
  nightshade: ['night_hood', 'night_cloak', 'night_legs', 'night_ring'],
  ashorder: ['ash_helm', 'ash_armor', 'ash_legs', 'ash_amulet'],
};

// сколько частей каждого сета надето (equipment: {slot: 'id@rar'})
export function countSets(equipment, getItem) {
  const counts = {};
  for (const id of Object.values(equipment || {})) {
    const it = getItem(id);
    if (it?.set) counts[it.set] = (counts[it.set] || 0) + 1;
  }
  return counts;
}
