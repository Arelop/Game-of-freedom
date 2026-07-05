// Архетипы врагов — данные. Мозги в server/sim/ai.js.
export const ENEMIES = {
  slime: {
    id: 'slime', name: 'Слизень', archetype: 'chaser', hp: 4, speed: 42,
    radius: 5, touchDamage: 1, lungeSpeed: 160, lungeWindup: 0.4, lungeRange: 40,
    sprite: 'enemy_slime', xp: 1, drops: { coin: [1, 3] },
  },
  wolf: {
    id: 'wolf', name: 'Дикий волк', archetype: 'chaser', hp: 6, speed: 74,
    radius: 5, touchDamage: 1, lungeSpeed: 220, lungeWindup: 0.3, lungeRange: 55,
    sprite: 'enemy_wolf', xp: 2, drops: { coin: [0, 2], meat: [1, 2] },
  },
  bandit: {
    id: 'bandit', name: 'Бандит', archetype: 'shooter', hp: 8, speed: 55,
    radius: 5, touchDamage: 1, preferRange: [90, 150], fireInterval: 1.6,
    pattern: 'aimedSingle', sprite: 'enemy_bandit', xp: 3,
    drops: { coin: [2, 5], ammo_arrow: [0, 1] },
  },
  banditHeavy: {
    id: 'banditHeavy', name: 'Громила', archetype: 'shooter', hp: 16, speed: 40,
    radius: 6, touchDamage: 2, preferRange: [70, 120], fireInterval: 2.2,
    pattern: 'fan5', sprite: 'enemy_bandit_heavy', xp: 6,
    drops: { coin: [4, 8], ammo_bolt: [0, 2] },
  },
  skeleton: {
    id: 'skeleton', name: 'Скелет', archetype: 'shooter', hp: 6, speed: 48,
    radius: 5, touchDamage: 1, preferRange: [80, 140], fireInterval: 1.8,
    pattern: 'burst3aimed', sprite: 'enemy_skeleton', xp: 3,
    drops: { coin: [1, 4] },
  },
  turret: {
    id: 'turret', name: 'Тотем', archetype: 'turret', hp: 12, speed: 0,
    radius: 6, touchDamage: 0, fireInterval: 1.3, pattern: 'ring8',
    sprite: 'enemy_turret', xp: 4, drops: { coin: [3, 6] },
  },
  spiralTurret: {
    id: 'spiralTurret', name: 'Вихревой тотем', archetype: 'turret', hp: 14, speed: 0,
    radius: 6, touchDamage: 0, fireInterval: 0.22, pattern: 'spiral',
    sprite: 'enemy_turret2', xp: 5, drops: { coin: [4, 7] },
  },
  dasher: {
    id: 'dasher', name: 'Прыгун', archetype: 'dasher', hp: 7, speed: 50,
    radius: 5, touchDamage: 2, dashSpeed: 300, dashWindup: 0.55, dashTime: 0.5,
    sprite: 'enemy_dasher', xp: 4, drops: { coin: [2, 5] },
  },
  bossOgre: {
    id: 'bossOgre', name: 'Огр-вожак', archetype: 'boss', hp: 120, speed: 36,
    radius: 10, touchDamage: 2, sprite: 'enemy_boss', xp: 50,
    drops: { coin: [30, 50], weapon: 1 },
    phases: [
      { hpAbove: 0.66, steps: [
        { pattern: 'aimedTriple', interval: 1.4, move: 'chase' },
        { pattern: 'ring8', interval: 2.2, move: 'chase' },
      ]},
      { hpAbove: 0.33, steps: [
        { pattern: 'spiral', interval: 0.18, move: 'strafe' },
        { pattern: 'fan5', interval: 1.2, move: 'chase' },
      ]},
      { hpAbove: 0, steps: [
        { pattern: 'ring12', interval: 1.6, move: 'chase' },
        { pattern: 'spiral', interval: 0.14, move: 'strafe' },
        { pattern: 'wideWave', interval: 1.1, move: 'chase' },
      ]},
    ],
  },
};
