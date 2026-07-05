// Оружие — чистые данные. Фэнтези-арсенал: ближний бой + луки/посохи/метательное.
// melee:true — удар по дуге (без патронов/перезарядки). Остальное — снаряды.
export const WEAPONS = {
  sword: {
    id: 'sword', name: 'Меч', melee: true, damage: 4, fireRate: 2.4,
    range: 30, arcDeg: 110, knockback: 90, recoilShake: 0.2, infiniteAmmo: true,
    sprite: 'wpn_sword', sound: 'swing', swingColor: '#eeeeee',
  },
  axe: {
    id: 'axe', name: 'Секира', melee: true, damage: 8, fireRate: 1.3,
    range: 32, arcDeg: 130, knockback: 140, recoilShake: 0.4, infiniteAmmo: true,
    sprite: 'wpn_axe', sound: 'swing_heavy', swingColor: '#d9a066',
  },
  bow: {
    id: 'bow', name: 'Лук', damage: 3, projectilesPerShot: 1,
    spreadDeg: 3, projectileSpeed: 360, fireRate: 3, magSize: 12,
    reloadTime: 0.8, knockback: 25, recoilShake: 0.12,
    sprite: 'wpn_bow', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.4, ammoType: 'arrow',
  },
  huntbow: {
    id: 'huntbow', name: 'Охотничий лук', damage: 6, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 480, fireRate: 1.5, magSize: 1,
    reloadTime: 0.5, knockback: 45, recoilShake: 0.3,
    sprite: 'wpn_bow2', projSprite: 'proj_arrow', sound: 'shot_bow',
    projRadius: 2, projLife: 1.8, ammoType: 'arrow',
  },
  crossbow: {
    id: 'crossbow', name: 'Арбалет', damage: 8, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 420, fireRate: 0.9, magSize: 1,
    reloadTime: 1.2, knockback: 80, recoilShake: 0.35,
    sprite: 'wpn_crossbow', projSprite: 'proj_bolt', sound: 'shot_crossbow',
    projRadius: 2, projLife: 1.9, ammoType: 'bolt',
  },
  knives: {
    id: 'knives', name: 'Метательные ножи', damage: 2, projectilesPerShot: 3,
    spreadDeg: 22, projectileSpeed: 320, fireRate: 1.6, magSize: 6,
    reloadTime: 1.3, knockback: 30, recoilShake: 0.25,
    sprite: 'wpn_dagger', projSprite: 'proj_knife', sound: 'shot_knife',
    projRadius: 2, projLife: 0.7, ammoType: 'knife',
  },
  firestaff: {
    id: 'firestaff', name: 'Посох огня', damage: 3, projectilesPerShot: 1,
    spreadDeg: 4, projectileSpeed: 240, fireRate: 5, magSize: 20,
    reloadTime: 1.5, knockback: 12, recoilShake: 0.1,
    sprite: 'wpn_staff_fire', projSprite: 'proj_fire', sound: 'shot_fire',
    projRadius: 3, projLife: 1.0, ammoType: 'mana',
  },
  froststaff: {
    id: 'froststaff', name: 'Посох льда', damage: 5, projectilesPerShot: 1,
    spreadDeg: 0, projectileSpeed: 300, fireRate: 2.4, magSize: 12,
    reloadTime: 1.5, knockback: 20, recoilShake: 0.12,
    sprite: 'wpn_staff_frost', projSprite: 'proj_frost', sound: 'shot_frost',
    projRadius: 3, projLife: 1.3, ammoType: 'mana',
  },
};

export const AMMO_NAMES = {
  arrow: 'стрелы', bolt: 'болты', mana: 'мана', knife: 'ножи',
};

export const STARTING_WEAPONS = ['sword', 'bow'];
