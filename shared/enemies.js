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
};

// Монстры тира min..max — для спавна по сложности (без боссов и войск Тьмы)
export function enemiesOfTier(min, max) {
  return Object.values(ENEMIES)
    .filter(e => e.tier >= min && e.tier <= max && e.archetype !== 'boss' && e.faction !== 'darkness')
    .map(e => e.id);
}

// войско Тьмы для фортов и рейдов
export const DARK_KINDS = ['darkSoldier', 'darkSoldier', 'darkArcher', 'darkMage', 'darkKnight'];
