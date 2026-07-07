// Оружие — чистые данные. Фэнтези-арсенал: ближний бой + луки/посохи/метательное.
// school: melee/ranged/magic — какая характеристика усиливает урон.
// Темп боя намеренно размеренный: реже атаки, весомее каждый удар.
export const WEAPONS = {
  sword: {
    id: 'sword', structDmg: 2, name: 'Меч', melee: true, school: 'melee', damage: 4, fireRate: 1.8,
    range: 30, arcDeg: 110, knockback: 90, recoilShake: 0.2, infiniteAmmo: true,
    sprite: 'wpn_sword', sound: 'swing', swingColor: '#eeeeee', price: 30,
  },
  axe: {
    id: 'axe', structDmg: 6, name: 'Секира', melee: true, school: 'melee', damage: 9, fireRate: 1.0,
    range: 32, arcDeg: 130, knockback: 150, recoilShake: 0.4, infiniteAmmo: true,
    sprite: 'wpn_axe', sound: 'swing_heavy', swingColor: '#d9a066', price: 90,
  },
  bow: {
    id: 'bow', name: 'Лук', school: 'ranged', damage: 4, projectilesPerShot: 1,
    spreadDeg: 3, projectileSpeed: 340, fireRate: 2.1, magSize: 12,
    reloadTime: 1.0, knockback: 25, recoilShake: 0.12,
    sprite: 'wpn_bow', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.4, ammoType: 'arrow', price: 35,
  },
  huntbow: {
    id: 'huntbow', name: 'Охотничий лук', school: 'ranged', damage: 7, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 460, fireRate: 1.1, magSize: 1,
    reloadTime: 0.6, knockback: 45, recoilShake: 0.3,
    sprite: 'wpn_bow2', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.8, ammoType: 'arrow', price: 85,
  },
  crossbow: {
    id: 'crossbow', structDmg: 2, name: 'Арбалет', school: 'ranged', damage: 10, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 420, fireRate: 0.7, magSize: 1,
    reloadTime: 1.0, knockback: 90, recoilShake: 0.35,
    sprite: 'wpn_crossbow', projSprite: 'proj_bolt', sound: 'shot_crossbow',
    projRadius: 2, projLife: 1.9, ammoType: 'bolt', price: 120,
  },
  knives: {
    id: 'knives', name: 'Метательные ножи', school: 'ranged', damage: 3, projectilesPerShot: 3,
    spreadDeg: 22, projectileSpeed: 300, fireRate: 1.3, magSize: 6,
    reloadTime: 1.4, knockback: 30, recoilShake: 0.25,
    sprite: 'wpn_dagger', projSprite: 'proj_knife', sound: 'shot_knife',
    projRadius: 2, projLife: 0.7, ammoType: 'knife', price: 70,
  },
  firestaff: {
    id: 'firestaff', structDmg: 1, name: 'Посох огня', school: 'magic', damage: 4, projectilesPerShot: 1,
    spreadDeg: 4, projectileSpeed: 230, fireRate: 3.2, manaCost: 1,
    knockback: 12, recoilShake: 0.1,
    sprite: 'wpn_staff_fire', projSprite: 'proj_fire', sound: 'shot_fire',
    projRadius: 3, projLife: 1.0, price: 100,
  },
  froststaff: {
    id: 'froststaff', name: 'Посох льда', school: 'magic', damage: 6, projectilesPerShot: 1,
    spreadDeg: 0, projectileSpeed: 290, fireRate: 1.7, manaCost: 2,
    knockback: 20, recoilShake: 0.12,
    sprite: 'wpn_staff_frost', projSprite: 'proj_frost', sound: 'shot_frost',
    projRadius: 3, projLife: 1.3, price: 120,
    slow: { mult: 0.65, time: 1.5 },      // лёд замедляет врагов
  },
  fireball: {
    id: 'fireball', structDmg: 10, name: 'Посох огненных шаров', school: 'magic', damage: 9, projectilesPerShot: 1,
    spreadDeg: 2, projectileSpeed: 190, fireRate: 0.8, manaCost: 4,
    knockback: 40, recoilShake: 0.35,
    sprite: 'wpn_staff_bomb', projSprite: 'proj_fireball', sound: 'shot_fire',
    projRadius: 4, projLife: 1.6, price: 170,
    explode: { radius: 30 },              // взрыв бьёт всех вокруг
  },
  stormstaff: {
    id: 'stormstaff', structDmg: 1, name: 'Посох бури', school: 'magic', damage: 6, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 420, fireRate: 1.5, manaCost: 3,
    knockback: 15, recoilShake: 0.18,
    sprite: 'wpn_staff_storm', projSprite: 'proj_lightning', sound: 'shot_laserlike',
    projRadius: 3, projLife: 0.9, price: 180,
    chain: { count: 2, radius: 70, falloff: 0.7 }, // молния перескакивает
  },
  spear: {
    id: 'spear', structDmg: 2, name: 'Копьё', melee: true, school: 'melee', damage: 6, fireRate: 1.4,
    range: 42, arcDeg: 40, knockback: 110, recoilShake: 0.25, infiniteAmmo: true,
    sprite: 'wpn_spear', sound: 'swing', swingColor: '#d9a066', price: 55,
  },
  warhammer: {
    id: 'warhammer', structDmg: 9, name: 'Боевой молот', melee: true, school: 'melee', damage: 13, fireRate: 0.7,
    range: 30, arcDeg: 120, knockback: 200, recoilShake: 0.55, infiniteAmmo: true,
    sprite: 'wpn_hammer', sound: 'swing_heavy', swingColor: '#847e87', price: 130,
  },
  dagger: {
    id: 'dagger', structDmg: 1, name: 'Кинжал', melee: true, school: 'melee', damage: 2.5, fireRate: 3.4,
    range: 24, arcDeg: 80, knockback: 40, recoilShake: 0.1, infiniteAmmo: true,
    sprite: 'wpn_dagger', sound: 'swing', swingColor: '#eeeeee', price: 40,
  },
  taxes: {
    id: 'taxes', name: 'Метательные топоры', school: 'ranged', damage: 6, projectilesPerShot: 1,
    spreadDeg: 5, projectileSpeed: 250, fireRate: 1.1, magSize: 3,
    reloadTime: 1.3, knockback: 90, recoilShake: 0.3,
    sprite: 'wpn_taxe', projSprite: 'proj_taxe', sound: 'shot_knife',
    projRadius: 3, projLife: 0.9, ammoType: 'knife', price: 95, structDmg: 3,
  },
  venomstaff: {
    id: 'venomstaff', name: 'Посох яда', school: 'magic', damage: 5, projectilesPerShot: 2,
    spreadDeg: 14, projectileSpeed: 260, fireRate: 2.2, manaCost: 2,
    knockback: 8, recoilShake: 0.1,
    sprite: 'wpn_staff_venom', projSprite: 'proj_venom', sound: 'shot_frost',
    projRadius: 3, projLife: 1.1, price: 150,
    slow: { mult: 0.8, time: 1.2 },      // яд вязкий: слегка замедляет
  },
  bombs: {
    id: 'bombs', structDmg: 14, name: 'Огненные бомбы', school: 'ranged', damage: 10, projectilesPerShot: 1,
    spreadDeg: 3, projectileSpeed: 170, fireRate: 0.6, magSize: 1,
    reloadTime: 1.0, knockback: 60, recoilShake: 0.4,
    sprite: 'wpn_bombs', projSprite: 'proj_bomb', sound: 'shot_bow',
    projRadius: 4, projLife: 1.4, ammoType: 'bomb', price: 140,
    explode: { radius: 34 },              // сносит стены пачками
  },

  // --- средневековый арсенал ближнего боя ---
  mace: {
    id: 'mace', structDmg: 4, name: 'Булава', melee: true, school: 'melee', damage: 7, fireRate: 1.2,
    range: 28, arcDeg: 100, knockback: 130, recoilShake: 0.3, infiniteAmmo: true,
    sprite: 'wpn_mace', sound: 'swing_heavy', swingColor: '#9badb7', price: 75,
  },
  flail: {
    id: 'flail', structDmg: 3, name: 'Кистень', melee: true, school: 'melee', damage: 6, fireRate: 1.5,
    range: 34, arcDeg: 140, knockback: 100, recoilShake: 0.25, infiniteAmmo: true,
    sprite: 'wpn_flail', sound: 'swing', swingColor: '#9badb7', price: 85,
  },
  morningstar: {
    id: 'morningstar', structDmg: 6, name: 'Моргенштерн', melee: true, school: 'melee', damage: 10, fireRate: 0.85,
    range: 30, arcDeg: 110, knockback: 180, recoilShake: 0.45, infiniteAmmo: true,
    sprite: 'wpn_morningstar', sound: 'swing_heavy', swingColor: '#847e87', price: 115,
  },
  greatsword: {
    id: 'greatsword', structDmg: 5, name: 'Двуручный меч', melee: true, school: 'melee', damage: 12, fireRate: 0.75,
    range: 38, arcDeg: 150, knockback: 160, recoilShake: 0.5, infiniteAmmo: true,
    sprite: 'wpn_greatsword', sound: 'swing_heavy', swingColor: '#eeeeee', price: 150,
  },
  halberd: {
    id: 'halberd', structDmg: 4, name: 'Алебарда', melee: true, school: 'melee', damage: 9, fireRate: 0.95,
    range: 48, arcDeg: 60, knockback: 140, recoilShake: 0.35, infiniteAmmo: true,
    sprite: 'wpn_halberd', sound: 'swing', swingColor: '#d9a066', price: 125,
  },

  // --- ЛЕГЕНДАРНОЕ оружие: не выпадает в мире — только награда за
  // финал «Войны с Тьмой». Выдаётся с суффиксом @l. У каждого — уникальное свойство.
  sunblade: {
    id: 'sunblade', structDmg: 6, name: 'Клинок рассвета', melee: true, school: 'melee',
    damage: 5, fireRate: 1.9, range: 32, arcDeg: 130, knockback: 120, recoilShake: 0.3,
    infiniteAmmo: true, lifeOnKill: 1, // убийство в ближнем бою лечит
    sprite: 'wpn_sunblade', sound: 'swing', swingColor: '#fbf236', price: 400, legendary: true,
  },
  dawnstaff: {
    id: 'dawnstaff', structDmg: 2, name: 'Посох зари', school: 'magic', damage: 4,
    projectilesPerShot: 1, spreadDeg: 1, projectileSpeed: 400, fireRate: 2.2, manaCost: 2,
    knockback: 15, recoilShake: 0.15,
    sprite: 'wpn_dawnstaff', projSprite: 'proj_lightning', sound: 'shot_laserlike',
    projRadius: 3, projLife: 1.0, price: 450, legendary: true,
    chain: { count: 3, radius: 85, falloff: 0.75 }, // каждая молния скачет трижды
  },
  windbow: {
    id: 'windbow', name: 'Ветер степей', school: 'ranged', damage: 4,
    projectilesPerShot: 2, spreadDeg: 6, projectileSpeed: 480, fireRate: 2.3, magSize: 14,
    reloadTime: 0.8, knockback: 35, recoilShake: 0.2,
    sprite: 'wpn_windbow', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.8, ammoType: 'arrow', price: 420, legendary: true,
  },
};

export const AMMO_NAMES = {
  arrow: 'стрелы', bolt: 'болты', mana: 'мана', knife: 'ножи', bomb: 'бомбы',
};
