// Архетипы врагов — данные. Мозги в server/sim/ai.js.
// РПГ-баланс: враги живучее, темп их атак ниже — бой тактичнее.
// tier — таблица сложности 1..5: где и когда монстр может появляться.
export const ENEMIES = {
  rat: {
    id: 'rat', name: 'Гигантская крыса', archetype: 'chaser', hp: 3, speed: 65, tier: 1,
    radius: 4, touchDamage: 1, lungeSpeed: 170, lungeWindup: 0.3, lungeRange: 30,
    sprite: 'enemy_rat', xp: 1, drops: { coin: [0, 2] },
  },
  slime: {
    id: 'slime', name: 'Слизень', archetype: 'chaser', hp: 6, speed: 40, tier: 1,
    radius: 5, touchDamage: 1, lungeSpeed: 150, lungeWindup: 0.45, lungeRange: 40,
    sprite: 'enemy_slime', xp: 2, drops: { coin: [1, 3] },
  },
  wolf: {
    id: 'wolf', name: 'Дикий волк', archetype: 'chaser', hp: 9, speed: 70, tier: 2,
    radius: 5, touchDamage: 1, lungeSpeed: 210, lungeWindup: 0.35, lungeRange: 55,
    sprite: 'enemy_wolf', xp: 3, drops: { coin: [0, 2], meat: [1, 2] },
  },
  bandit: {
    id: 'bandit', name: 'Бандит', archetype: 'shooter', hp: 11, speed: 52, tier: 2,
    radius: 5, touchDamage: 1, preferRange: [90, 150], fireInterval: 1.9,
    pattern: 'aimedSingle', sprite: 'enemy_bandit', xp: 4,
    drops: { coin: [2, 5], ammo_arrow: [0, 1] },
  },
  banditHeavy: {
    id: 'banditHeavy', name: 'Громила', archetype: 'shooter', hp: 22, speed: 38, tier: 3,
    radius: 6, touchDamage: 2, preferRange: [70, 120], fireInterval: 2.5,
    pattern: 'fan5', sprite: 'enemy_bandit_heavy', xp: 8,
    drops: { coin: [4, 8], ammo_bolt: [0, 2] },
  },
  skeleton: {
    id: 'skeleton', name: 'Скелет', archetype: 'shooter', hp: 9, speed: 45, tier: 2,
    radius: 5, touchDamage: 1, preferRange: [80, 140], fireInterval: 2.1,
    pattern: 'burst3aimed', sprite: 'enemy_skeleton', xp: 4,
    drops: { coin: [1, 4] },
  },
  turret: {
    id: 'turret', name: 'Тотем', archetype: 'turret', hp: 16, speed: 0, tier: 3,
    radius: 6, touchDamage: 0, fireInterval: 1.6, pattern: 'ring8',
    sprite: 'enemy_turret', xp: 5, drops: { coin: [3, 6] },
  },
  spiralTurret: {
    id: 'spiralTurret', name: 'Вихревой тотем', archetype: 'turret', hp: 19, speed: 0, tier: 4,
    radius: 6, touchDamage: 0, fireInterval: 0.26, pattern: 'spiral',
    sprite: 'enemy_turret2', xp: 7, drops: { coin: [4, 7] },
  },
  dasher: {
    id: 'dasher', name: 'Прыгун', archetype: 'dasher', hp: 10, speed: 48, tier: 3,
    radius: 5, touchDamage: 2, dashSpeed: 280, dashWindup: 0.6, dashTime: 0.5,
    sprite: 'enemy_dasher', xp: 5, drops: { coin: [2, 5] },
  },
  demon: {
    id: 'demon', name: 'Демон', archetype: 'shooter', hp: 30, speed: 58, tier: 4,
    radius: 6, touchDamage: 2, preferRange: [60, 110], fireInterval: 1.7,
    pattern: 'fan5', sprite: 'enemy_demon', xp: 12,
    drops: { coin: [6, 12] },
  },
  imp: {
    id: 'imp', name: 'Бес', archetype: 'chaser', hp: 8, speed: 92, tier: 2,
    radius: 4, touchDamage: 1, lungeSpeed: 260, lungeWindup: 0.25, lungeRange: 45,
    sprite: 'enemy_imp', xp: 4, drops: { coin: [2, 4] },
  },
  archer: {
    id: 'archer', name: 'Лесной стрелок', archetype: 'shooter', hp: 8, speed: 55, tier: 2,
    radius: 5, touchDamage: 1, preferRange: [100, 170], fireInterval: 1.7,
    pattern: 'aimedSingle', sprite: 'enemy_archer', xp: 4,
    drops: { coin: [2, 4], ammo_arrow: [1, 2] },
  },
  mimic: {
    id: 'mimic', name: 'Мимик', archetype: 'chaser', hp: 18, speed: 30, tier: 3,
    radius: 6, touchDamage: 3, lungeSpeed: 240, lungeWindup: 0.3, lungeRange: 50,
    sprite: 'enemy_mimic', xp: 9, drops: { coin: [8, 16] },
  },
  darkKnight: {
    id: 'darkKnight', name: 'Рыцарь Тьмы', archetype: 'chaser', hp: 34, speed: 44, tier: 4,
    radius: 6, touchDamage: 2, lungeSpeed: 200, lungeWindup: 0.5, lungeRange: 55,
    sprite: 'enemy_dark_knight', xp: 14, drops: { coin: [8, 14] }, faction: 'darkness',
  },
  // --- Армия Тьмы: войско Чернокаменной Цитадели ---
  darkSoldier: {
    id: 'darkSoldier', name: 'Солдат Тьмы', archetype: 'chaser', hp: 16, speed: 52, tier: 3,
    radius: 5, touchDamage: 1, lungeSpeed: 230, lungeWindup: 0.35, lungeRange: 48,
    sprite: 'enemy_dark_soldier', xp: 7, drops: { coin: [3, 7] }, faction: 'darkness',
  },
  darkArcher: {
    id: 'darkArcher', name: 'Стрелок Тьмы', archetype: 'shooter', hp: 12, speed: 50, tier: 3,
    radius: 5, touchDamage: 1, preferRange: [90, 160], fireInterval: 1.8,
    pattern: 'aimedSingle', sprite: 'enemy_dark_archer', xp: 6,
    drops: { coin: [3, 6], ammo_arrow: [1, 2] }, faction: 'darkness',
  },
  darkMage: {
    id: 'darkMage', name: 'Чернокнижник', archetype: 'shooter', hp: 20, speed: 42, tier: 4,
    radius: 5, touchDamage: 1, preferRange: [80, 150], fireInterval: 2.2,
    pattern: 'aimedTriple', sprite: 'enemy_dark_mage', xp: 11,
    drops: { coin: [6, 11], crystal: [1, 2] }, faction: 'darkness',
  },
  darkLord: {
    id: 'darkLord', name: 'Лорд Тьмы', archetype: 'boss', hp: 220, speed: 38, tier: 5,
    radius: 8, touchDamage: 3, sprite: 'enemy_dark_lord', xp: 90,
    drops: { coin: [40, 70], weapon: 1, crystal: [3, 6] }, faction: 'darkness',
    phases: [
      { hpAbove: 0.66, steps: [
        { pattern: 'aimedTriple', interval: 1.4, move: 'chase' },
        { pattern: 'fan5', interval: 2.0, move: 'strafe' },
      ]},
      { hpAbove: 0.33, steps: [
        { pattern: 'ring8', interval: 1.6, move: 'chase' },
        { pattern: 'spiral', interval: 0.22, move: 'strafe' },
      ]},
      { hpAbove: 0, steps: [
        { pattern: 'spiral', interval: 0.16, move: 'strafe' },
        { pattern: 'aimedTriple', interval: 1.0, move: 'chase' },
      ]},
    ],
  },
  golem: {
    id: 'golem', name: 'Каменный голем', archetype: 'shooter', hp: 45, speed: 26, tier: 4,
    radius: 7, touchDamage: 2, preferRange: [50, 100], fireInterval: 2.6,
    pattern: 'ring8', sprite: 'enemy_golem', xp: 18,
    drops: { coin: [10, 18], metal: [1, 3] },
  },
  bossOgre: {
    id: 'bossOgre', name: 'Огр-вожак', archetype: 'boss', hp: 170, speed: 34, tier: 5,
    radius: 10, touchDamage: 2, sprite: 'enemy_boss', xp: 60,
    drops: { coin: [30, 50], weapon: 1 },
    phases: [
      { hpAbove: 0.66, steps: [
        { pattern: 'aimedTriple', interval: 1.6, move: 'chase' },
        { pattern: 'ring8', interval: 2.4, move: 'chase' },
      ]},
      { hpAbove: 0.33, steps: [
        { pattern: 'spiral', interval: 0.2, move: 'strafe' },
        { pattern: 'fan5', interval: 1.4, move: 'chase' },
      ]},
      { hpAbove: 0, steps: [
        { pattern: 'ring12', interval: 1.8, move: 'chase' },
        { pattern: 'spiral', interval: 0.16, move: 'strafe' },
        { pattern: 'wideWave', interval: 1.3, move: 'chase' },
      ]},
    ],
  },

  // --- средневековая рубка: ближнебойные враги всех тиров ---
  goblin: {
    id: 'goblin', name: 'Гоблин', archetype: 'chaser', hp: 4, speed: 75, tier: 1,
    radius: 4, touchDamage: 1, lungeSpeed: 200, lungeWindup: 0.25, lungeRange: 35,
    sprite: 'enemy_goblin', xp: 2, drops: { coin: [1, 3] },
  },
  hobgoblin: {
    id: 'hobgoblin', name: 'Хобгоблин', archetype: 'chaser', hp: 10, speed: 62, tier: 2,
    radius: 5, touchDamage: 1, lungeSpeed: 220, lungeWindup: 0.3, lungeRange: 45,
    sprite: 'enemy_hobgoblin', xp: 4, drops: { coin: [2, 4] },
  },
  gnollRaider: {
    id: 'gnollRaider', name: 'Гнолл-налётчик', archetype: 'chaser', hp: 12, speed: 66, tier: 2,
    radius: 5, touchDamage: 1, lungeSpeed: 240, lungeWindup: 0.3, lungeRange: 50,
    sprite: 'enemy_gnoll', xp: 5, drops: { coin: [2, 5], hide: [0, 1] },
  },
  orcWarrior: {
    id: 'orcWarrior', name: 'Орк-рубака', archetype: 'chaser', hp: 18, speed: 55, tier: 3,
    radius: 5, touchDamage: 2, lungeSpeed: 230, lungeWindup: 0.35, lungeRange: 50,
    sprite: 'enemy_orc_warrior', xp: 8, drops: { coin: [4, 8], metal: [0, 1] },
  },
  ghoul: {
    id: 'ghoul', name: 'Упырь', archetype: 'chaser', hp: 15, speed: 58, tier: 3,
    radius: 5, touchDamage: 2, lungeSpeed: 260, lungeWindup: 0.28, lungeRange: 45,
    sprite: 'enemy_ghoul', xp: 7, drops: { coin: [2, 6] },
  },
  orcKnight: {
    id: 'orcKnight', name: 'Орк-рыцарь', archetype: 'chaser', hp: 30, speed: 46, tier: 4,
    radius: 6, touchDamage: 2, lungeSpeed: 210, lungeWindup: 0.45, lungeRange: 55,
    sprite: 'enemy_orc_knight', xp: 13, drops: { coin: [7, 13], metal: [1, 2] },
  },
  ogre: {
    id: 'ogre', name: 'Огр', archetype: 'chaser', hp: 42, speed: 36, tier: 4,
    radius: 8, touchDamage: 3, lungeSpeed: 190, lungeWindup: 0.55, lungeRange: 60,
    sprite: 'enemy_ogre', xp: 16, drops: { coin: [8, 16], meat: [1, 2] },
  },
  minotaur: {
    id: 'minotaur', name: 'Минотавр', archetype: 'dasher', hp: 60, speed: 50, tier: 5,
    radius: 7, touchDamage: 3, dashSpeed: 340, dashWindup: 0.55, dashTime: 0.55,
    sprite: 'enemy_minotaur', xp: 28, drops: { coin: [15, 25], metal: [1, 3] },
  },
  orcWarlord: {
    id: 'orcWarlord', name: 'Орк-вождь', archetype: 'chaser', hp: 75, speed: 50, tier: 5,
    radius: 7, touchDamage: 3, lungeSpeed: 250, lungeWindup: 0.4, lungeRange: 60,
    sprite: 'enemy_orc_warlord', xp: 35, drops: { coin: [18, 30], weapon: 1 },
  },

  // --- живность биомов: у каждого зверя свой дом ---
  boar: {
    id: 'boar', name: 'Вепрь', archetype: 'chaser', hp: 5, speed: 62, tier: 1,
    radius: 5, touchDamage: 1, lungeSpeed: 220, lungeWindup: 0.3, lungeRange: 40,
    sprite: 'enemy_boar', xp: 2, drops: { meat: [1, 2] },
  },
  giantBat: {
    id: 'giantBat', name: 'Нетопырь', archetype: 'chaser', hp: 3, speed: 95, tier: 1,
    radius: 4, touchDamage: 1, lungeSpeed: 240, lungeWindup: 0.2, lungeRange: 35,
    sprite: 'enemy_bat', xp: 2, drops: { coin: [0, 2] },
  },
  spider: {
    id: 'spider', name: 'Волчий паук', archetype: 'chaser', hp: 8, speed: 78, tier: 2,
    radius: 5, touchDamage: 1, lungeSpeed: 260, lungeWindup: 0.25, lungeRange: 45,
    sprite: 'enemy_spider', xp: 4, drops: { coin: [1, 3] },
  },
  scorpion: {
    id: 'scorpion', name: 'Скорпион', archetype: 'chaser', hp: 9, speed: 55, tier: 2,
    radius: 5, touchDamage: 2, lungeSpeed: 230, lungeWindup: 0.35, lungeRange: 40,
    sprite: 'enemy_scorpion', xp: 5, drops: { coin: [1, 4] },
  },
  bear: {
    id: 'bear', name: 'Бурый медведь', archetype: 'chaser', hp: 26, speed: 52, tier: 3,
    radius: 7, touchDamage: 2, lungeSpeed: 220, lungeWindup: 0.4, lungeRange: 50,
    sprite: 'enemy_bear', xp: 10, drops: { meat: [2, 3], hide: [1, 2] },
  },
  nagaWarrior: {
    id: 'nagaWarrior', name: 'Нага-воин', archetype: 'chaser', hp: 20, speed: 50, tier: 3,
    radius: 6, touchDamage: 2, lungeSpeed: 220, lungeWindup: 0.35, lungeRange: 50,
    sprite: 'enemy_naga', xp: 9, drops: { coin: [4, 8], crystal: [0, 1] },
  },
  necromancer: {
    id: 'necromancer', name: 'Некромант', archetype: 'shooter', hp: 22, speed: 40, tier: 4,
    radius: 5, touchDamage: 1, preferRange: [90, 150], fireInterval: 2.0,
    pattern: 'burst3aimed', sprite: 'enemy_necromancer', xp: 12,
    drops: { coin: [6, 12], crystal: [1, 2] },
  },
  ironTroll: {
    id: 'ironTroll', name: 'Железный тролль', archetype: 'chaser', hp: 50, speed: 34, tier: 4,
    radius: 8, touchDamage: 3, lungeSpeed: 180, lungeWindup: 0.55, lungeRange: 55,
    sprite: 'enemy_iron_troll', xp: 18, drops: { coin: [8, 16], metal: [2, 4] },
  },
  frostGiant: {
    id: 'frostGiant', name: 'Ледяной великан', archetype: 'chaser', hp: 90, speed: 38, tier: 5,
    radius: 9, touchDamage: 3, lungeSpeed: 200, lungeWindup: 0.5, lungeRange: 60,
    sprite: 'enemy_frost_giant', xp: 40, drops: { coin: [20, 35], crystal: [2, 4] },
  },

  // --- боссы биомов: живут в логовах на карте ---
  swampWitch: {
    id: 'swampWitch', name: 'Болотная колдунья', archetype: 'boss', hp: 130, speed: 38, tier: 5,
    radius: 7, touchDamage: 2, sprite: 'enemy_swamp_witch', xp: 55,
    drops: { coin: [25, 40], weapon: 1, crystal: [2, 4] },
    phases: [
      { hpAbove: 0.5, steps: [
        { pattern: 'aimedTriple', interval: 1.5, move: 'strafe' },
        { pattern: 'fan5', interval: 2.0, move: 'chase' },
      ]},
      { hpAbove: 0, steps: [
        { pattern: 'ring8', interval: 1.6, move: 'strafe' },
        { pattern: 'burst3aimed', interval: 1.0, move: 'chase' },
      ]},
    ],
  },
  rockKing: {
    id: 'rockKing', name: 'Каменный король', archetype: 'boss', hp: 220, speed: 26, tier: 5,
    radius: 9, touchDamage: 3, sprite: 'enemy_rock_king', xp: 70,
    drops: { coin: [30, 50], weapon: 1, metal: [4, 8] },
    phases: [
      { hpAbove: 0.6, steps: [
        { pattern: 'ring8', interval: 2.2, move: 'chase' },
        { pattern: 'aimedTriple', interval: 1.6, move: 'chase' },
      ]},
      { hpAbove: 0.3, steps: [
        { pattern: 'ring12', interval: 1.9, move: 'chase' },
        { pattern: 'wideWave', interval: 1.4, move: 'strafe' },
      ]},
      { hpAbove: 0, steps: [
        { pattern: 'spiral', interval: 0.18, move: 'strafe' },
        { pattern: 'ring12', interval: 1.6, move: 'chase' },
      ]},
    ],
  },
  packLeader: {
    id: 'packLeader', name: 'Вожак варгов', archetype: 'chaser', hp: 90, speed: 80, tier: 5,
    radius: 7, touchDamage: 2, lungeSpeed: 300, lungeWindup: 0.4, lungeRange: 70,
    sprite: 'enemy_pack_leader', xp: 45, drops: { coin: [20, 35], weapon: 1, hide: [2, 4], meat: [2, 3] },
  },
  heartKeeper: {
    id: 'heartKeeper', name: 'Хранитель сердца', archetype: 'shooter', hp: 120, speed: 44, tier: 5,
    radius: 7, touchDamage: 2, preferRange: [70, 130], fireInterval: 1.5,
    pattern: 'fan5', sprite: 'enemy_heart_keeper', xp: 60,
    drops: { coin: [20, 40], crystal: [2, 4] }, faction: 'darkness',
  },
};

// Рост урона с тиром: старшие твари бьют больнее той же атакой.
// Касание: +1 на тирах 3-4, +2 на тире 5. Снаряды: 2 урона с тира 4.
export function tierTouchBonus(tier) { return Math.floor(((tier || 1) - 1) / 2); }
export function tierProjDmg(tier) { return 1 + Math.floor(((tier || 1) - 1) / 3); }

// Монстры тира min..max — для спавна по сложности (без боссов и войск Тьмы)
export function enemiesOfTier(min, max) {
  return Object.values(ENEMIES)
    .filter(e => e.tier >= min && e.tier <= max && e.archetype !== 'boss' && e.faction !== 'darkness')
    .map(e => e.id);
}

// войско Тьмы для фортов и рейдов
export const DARK_KINDS = ['darkSoldier', 'darkSoldier', 'darkArcher', 'darkMage', 'darkKnight'];

// ---------- бестиарий: где и когда встречается каждая тварь ----------
export const ARCHETYPE_NAMES = {
  chaser: 'Рукопашный', shooter: 'Стрелок', turret: 'Тотем', dasher: 'Прыгун', boss: 'БОСС',
};

export const HABITATS = {
  rat: 'Повсюду в глуши; гнёзда близ дорог и руин',
  slime: 'Луга и болота; сползаются в стаи',
  wolf: 'Леса; стаи охотятся и множатся ночью',
  boar: 'Кабаньи стада в лесах — источник мяса',
  giantBat: 'Вылетают только ночью, стаями',
  bandit: 'Банды Вольницы у дорог и в лагерях',
  banditHeavy: 'Вожаки в лагерях разбойников',
  gnollRaider: 'Наёмник Вольницы в бандах',
  skeleton: 'Подземелья; ночная нежить в глуши',
  ghoul: 'Упыриные стаи ночью и в подземельях',
  spider: 'Лесные чащи и своды подземелий',
  scorpion: 'Пустыни и барханы',
  archer: 'Лесные засады Вольницы',
  imp: 'Подземелья; вырываются из тёмных ритуалов',
  goblin: 'Гоблиньи ватаги в холмах, подземельях',
  hobgoblin: 'Вожаки гоблиньих ватаг',
  bear: 'Медведь-шатун бродит по глухим лесам',
  nagaWarrior: 'Топи и болотные тропы',
  turret: 'Тотемы в глубине подземелий',
  spiralTurret: 'Вихревые тотемы у сокровищниц',
  dasher: 'Прыгуны в средних этажах подземелий',
  mimic: 'Прикидывается сундуком в подземельях',
  orcWarrior: 'Орочьи отряды в дикой степи и данжах',
  orcKnight: 'Элита орочьих отрядов',
  demon: 'Разломы, тёмные ритуалы, круги камней',
  golem: 'Скалы, подземелья; охраняет метеориты',
  necromancer: 'Глубины подземелий; поднимает нежить',
  ironTroll: 'Скальные пустоши и пещеры',
  ogre: 'Огры-одиночки с гоблинской свитой',
  minotaur: 'Хранитель ключа в подземельях с боссом',
  orcWarlord: 'Хранитель ключа в подземельях с боссом',
  frostGiant: 'Спускается с гор ТОЛЬКО ЗИМОЙ',
  darkSoldier: 'Войска Тьмы: рейды и форты',
  darkArcher: 'Войска Тьмы: рейды и форты',
  darkMage: 'Войска Тьмы: рейды и форты',
  darkKnight: 'Элита Тьмы: гарнизон Цитадели, рейды',
  darkLord: 'Владыка Чернокаменной Цитадели',
  heartKeeper: 'Является у Каменного круга во время Войны с Тьмой',
  swampWitch: 'Логово в болотах (see: карта)',
  rockKing: 'Трон в скалах (see: карта)',
  packLeader: 'Логово в лесах (see: карта)',
  bossOgre: 'Владыка последней комнаты подземелий',
};
