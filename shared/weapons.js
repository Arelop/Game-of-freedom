// Оружие — чистые данные. Новое оружие = новая запись.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Пистолет', damage: 2, projectilesPerShot: 1,
    spreadDeg: 3, projectileSpeed: 300, fireRate: 4, magSize: 12,
    reloadTime: 1.0, knockback: 20, recoilShake: 0.15, infiniteAmmo: true,
    sprite: 'gun_pistol', projSprite: 'proj_small', sound: 'shot_light',
    projRadius: 2, projLife: 1.2,
  },
  smg: {
    id: 'smg', name: 'ПП «Оса»', damage: 1, projectilesPerShot: 1,
    spreadDeg: 9, projectileSpeed: 340, fireRate: 11, magSize: 30,
    reloadTime: 1.4, knockback: 10, recoilShake: 0.1,
    sprite: 'gun_smg', projSprite: 'proj_small', sound: 'shot_light',
    projRadius: 2, projLife: 0.9, ammoType: 'light',
  },
  shotgun: {
    id: 'shotgun', name: 'Обрез', damage: 2, projectilesPerShot: 6,
    spreadDeg: 24, projectileSpeed: 260, fireRate: 1.4, magSize: 2,
    reloadTime: 1.6, knockback: 60, recoilShake: 0.45,
    sprite: 'gun_shotgun', projSprite: 'proj_pellet', sound: 'shot_heavy',
    projRadius: 2, projLife: 0.45, ammoType: 'shell',
  },
  rifle: {
    id: 'rifle', name: 'Винтовка', damage: 5, projectilesPerShot: 1,
    spreadDeg: 0.5, projectileSpeed: 480, fireRate: 1.6, magSize: 5,
    reloadTime: 1.8, knockback: 45, recoilShake: 0.35,
    sprite: 'gun_rifle', projSprite: 'proj_long', sound: 'shot_heavy',
    projRadius: 2, projLife: 1.6, ammoType: 'heavy',
  },
  crossbow: {
    id: 'crossbow', name: 'Арбалет', damage: 7, projectilesPerShot: 1,
    spreadDeg: 1, projectileSpeed: 380, fireRate: 0.9, magSize: 1,
    reloadTime: 1.2, knockback: 70, recoilShake: 0.3,
    sprite: 'gun_crossbow', projSprite: 'proj_bolt', sound: 'shot_bow',
    projRadius: 2, projLife: 1.8, ammoType: 'heavy',
  },
  laser: {
    id: 'laser', name: 'Лучемёт', damage: 2, projectilesPerShot: 1,
    spreadDeg: 0, projectileSpeed: 520, fireRate: 7, magSize: 20,
    reloadTime: 1.5, knockback: 5, recoilShake: 0.08,
    sprite: 'gun_laser', projSprite: 'proj_laser', sound: 'shot_laser',
    projRadius: 2, projLife: 0.8, ammoType: 'cell',
  },
};

export const AMMO_NAMES = {
  light: 'лёгкие патроны', shell: 'дробь', heavy: 'тяжёлые патроны', cell: 'батареи',
};

export const STARTING_WEAPONS = ['pistol'];
