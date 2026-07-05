// Общие константы клиента и сервера.
export const TICK_RATE = 30;          // тик сервера, Гц
export const TICK_DT = 1 / TICK_RATE;
export const SIM_RATE = 60;           // шаг локальной симуляции клиента, Гц
export const SIM_DT = 1 / SIM_RATE;
export const SNAPSHOT_EVERY = 2;      // снапшот каждые N тиков (15 Гц)

export const TILE = 16;               // пиксель-размер тайла
export const CHUNK = 32;              // тайлов в чанке по стороне
export const WORLD_CHUNKS = 16;       // мир 16x16 чанков = 512x512 тайлов
export const WORLD_TILES = WORLD_CHUNKS * CHUNK;

export const VIEW_W = 480;            // нативное разрешение рендера
export const VIEW_H = 270;

export const PLAYER_SPEED = 88;       // px/с
export const PLAYER_RADIUS = 5;
export const PLAYER_MAX_HP = 6;
export const PLAYER_HURT_INVULN = 1.0;   // сек неуязвимости после урона

export const ROLL_TIME = 0.45;
export const ROLL_IFRAMES = 0.30;
export const ROLL_COOLDOWN = 0.6;
export const ROLL_SPEED_MULT = 2.2;

export const MAX_PLAYERS = 4;
export const AOI_RADIUS = 380;        // радиус интереса для снапшотов, px

export const DAY_LENGTH = 600;        // сек реального времени на игровые сутки
export const HUNGER_MAX = 100;
export const HUNGER_RATE = HUNGER_MAX / 1500; // ~25 минут до нуля

// Типы тайлов
export const T = {
  DEEP_WATER: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST_FLOOR: 4,
  DIRT: 5, ROCK: 6, SWAMP: 7, FLOOR_WOOD: 8, FLOOR_STONE: 9,
  WALL: 10, TREE: 11, ROCK_SOLID: 12, BUSH: 13, ROAD: 14,
  DUNGEON_FLOOR: 15, DUNGEON_WALL: 16, DOOR: 17, WATER_EDGE: 18,
  CAMPFIRE: 19, STALL: 20, BED: 21, TABLE: 22, WELL: 23, CHEST: 24,
  DUNGEON_DOOR: 25, DUNGEON_EXIT: 26, FIELD: 27, TOWER: 28,
  MINE: 29, SHRINE: 30,
};

// Сезоны: 3 игровых дня каждый. Влияют на урожай и агрессию монстров.
export const SEASONS = ['Весна', 'Лето', 'Осень', 'Зима'];
export function seasonOf(day) { return Math.floor((day - 1) / 3) % 4; }
// множитель урожая по сезону
export const SEASON_HARVEST = [1.0, 1.5, 1.2, 0.3];

// Проходимость: true = блокирует движение
export const SOLID = new Set([
  T.DEEP_WATER, T.WATER, T.WALL, T.TREE, T.ROCK_SOLID,
  T.DUNGEON_WALL, T.STALL, T.WELL, T.CHEST, T.TABLE, T.BED, T.TOWER,
  T.MINE, T.SHRINE,
]);
// Блокирует пули (стены — да, вода — нет)
export const BULLET_SOLID = new Set([
  T.WALL, T.TREE, T.ROCK_SOLID, T.DUNGEON_WALL, T.STALL, T.WELL, T.TOWER,
  T.MINE,
]);
