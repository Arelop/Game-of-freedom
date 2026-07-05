// Архетипы врагов — данные. Мозги в server/sim/ai.js.
// РПГ-баланс: враги живучее, темп их атак ниже — бой тактичнее.
export const ENEMIES = {
  slime: {
    id: 'slime', name: 'Слизень', archetype: 'chaser', hp: 6, speed: 40,
    radius: 5, touchDamage: 1, lungeSpeed: 150, lungeWindup: 0.45, lungeRange: 40,
    sprite: 'enemy_slime', xp: 2, drops: { coin: [1, 3] },
  },
  wolf: {
    id: 'wolf', name: 'Дикий волк', archetype: 'chaser', hp: 9, speed: 70,
    radius: 5, touchDamage: 1, lungeSpeed: 210, lungeWindup: 0.35, lungeRange: 55,
    sprite: 'enemy_wolf', xp: 3, drops: { coin: [0, 2], meat: [1, 2] },
  },
  bandit: {
    id: 'bandit', name: 'Бандит', archetype: 'shooter', hp: 11, speed: 52,
    radius: 5, touchDamage: 1, preferRange: [90, 150], fireInterval: 1.9,
    pattern: 'aimedSingle', sprite: 'enemy_bandit', xp: 4,
    drops: { coin: [2, 5], ammo_arrow: [0, 1] },
  },
  banditHeavy: {
    id: 'banditHeavy', name: 'Громила', archetype: 'shooter', hp: 22, speed: 38,
    radius: 6, touchDamage: 2, preferRange: [70, 120], fireInterval: 2.5,
    pattern: 'fan5', sprite: 'enemy_bandit_heavy', xp: 8,
    drops: { coin: [4, 8], ammo_bolt: [0, 2] },
  },
  skeleton: {
    id: 'skeleton', name: 'Скелет', archetype: 'shooter', hp: 9, speed: 45,
    radius: 5, touchDamage: 1, preferRange: [80, 140], fireInterval: 2.1,
    pattern: 'burst3aimed', sprite: 'enemy_skeleton', xp: 4,
    drops: { coin: [1, 4] },
  },
  turret: {
    id: 'turret', name: 'Тотем', archetype: 'turret', hp: 16, speed: 0,
    radius: 6, touchDamage: 0, fireInterval: 1.6, pattern: 'ring8',
    sprite: 'enemy_turret', xp: 5, drops: { coin: [3, 6] },
  },
  spiralTurret: {
    id: 'spiralTurret', name: 'Вихревой тотем', archetype: 'turret', hp: 19, speed: 0,
    radius: 6, touchDamage: 0, fireInterval: 0.26, pattern: 'spiral',
    sprite: 'enemy_turret2', xp: 7, drops: { coin: [4, 7] },
  },
  dasher: {
    id: 'dasher', name: 'Прыгун', archetype: 'dasher', hp: 10, speed: 48,
    radius: 5, touchDamage: 2, dashSpeed: 280, dashWindup: 0.6, dashTime: 0.5,
    sprite: 'enemy_dasher', xp: 5, drops: { coin: [2, 5] },
  },
  bossOgre: {
    id: 'bossOgre', name: 'Огр-вожак', archetype: 'boss', hp: 170, speed: 34,
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
