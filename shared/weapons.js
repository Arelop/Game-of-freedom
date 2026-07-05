// Оружие — чистые данные. Фэнтези-арсенал: ближний бой + луки/посохи/метательное.
// school: melee/ranged/magic — какая характеристика усиливает урон.
// Темп боя намеренно размеренный: реже атаки, весомее каждый удар.
export const WEAPONS = {
  sword: {
    id: 'sword', name: 'Меч', melee: true, school: 'melee', damage: 4, fireRate: 1.8,
    range: 30, arcDeg: 110, knockback: 90, recoilShake: 0.2, infiniteAmmo: true,
    sprite: 'wpn_sword', sound: 'swing', swingColor: '#eeeeee',
  },
  axe: {
    id: 'axe', name: 'Секира', melee: true, school: 'melee', damage: 9, fireRate: 1.0,
    range: 32, arcDeg: 130, knockback: 150, recoilShake: 0.4, infiniteAmmo: true,
    sprite: 'wpn_axe', sound: 'swing_heavy', swingColor: '#d9a066',
  },
  bow: {
    id: 'bow', name: 'Лук', school: 'ranged', damage: 3, projectilesPerShot: 1,
    spreadDeg: 3, projectileSpeed: 340, fireRate: 2.1, magSize: 12,
    reloadTime: 1.0, knockback: 25, recoilShake: 0.12,
    sprite: 'wpn_bow', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.4, ammoType: 'arrow',
  },
  huntbow: {
    id: 'huntbow', name: 'Охотничий лук', school: 'ranged', damage: 7, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 460, fireRate: 1.1, magSize: 1,
    reloadTime: 0.6, knockback: 45, recoilShake: 0.3,
    sprite: 'wpn_bow2', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.8, ammoType: 'arrow',
  },
  crossbow: {
    id: 'crossbow', name: 'Арбалет', school: 'ranged', damage: 10, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 420, fireRate: 0.7, magSize: 1,
    reloadTime: 1.4, knockback: 90, recoilShake: 0.35,
    sprite: 'wpn_crossbow', projSprite: 'proj_bolt', sound: 'shot_crossbow',
    projRadius: 2, projLife: 1.9, ammoType: 'bolt',
  },
  knives: {
    id: 'knives', name: 'Метательные ножи', school: 'ranged', damage: 3, projectilesPerShot: 3,
    spreadDeg: 22, projectileSpeed: 300, fireRate: 1.3, magSize: 6,
    reloadTime: 1.4, knockback: 30, recoilShake: 0.25,
    sprite: 'wpn_dagger', projSprite: 'proj_knife', sound: 'shot_knife',
    projRadius: 2, projLife: 0.7, ammoType: 'knife',
  },
  firestaff: {
    id: 'firestaff', name: 'Посох огня', school: 'magic', damage: 4, projectilesPerShot: 1,
    spreadDeg: 4, projectileSpeed: 230, fireRate: 3.2, magSize: 20,
    reloadTime: 1.6, knockback: 12, recoilShake: 0.1,
    sprite: 'wpn_staff_fire', projSprite: 'proj_fire', sound: 'shot_fire',
    projRadius: 3, projLife: 1.0, ammoType: 'mana',
  },
  froststaff: {
    id: 'froststaff', name: 'Посох льда', school: 'magic', damage: 6, projectilesPerShot: 1,
    spreadDeg: 0, projectileSpeed: 290, fireRate: 1.7, magSize: 12,
    reloadTime: 1.6, knockback: 20, recoilShake: 0.12,
    sprite: 'wpn_staff_frost', projSprite: 'proj_frost', sound: 'shot_frost',
    projRadius: 3, projLife: 1.3, ammoType: 'mana',
    slow: { mult: 0.65, time: 1.5 },      // лёд замедляет врагов
  },
};

export const AMMO_NAMES = {
  arrow: 'стрелы', bolt: 'болты', mana: 'мана', knife: 'ножи',
};
