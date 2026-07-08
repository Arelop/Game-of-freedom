// Общие константы клиента и сервера.
export const TICK_RATE = 30;          // тик сервера, Гц
export const TICK_DT = 1 / TICK_RATE;
export const SIM_RATE = 60;           // шаг локальной симуляции клиента, Гц
export const SIM_DT = 1 / SIM_RATE;
export const SNAPSHOT_EVERY = 2;      // снапшот каждые N тиков (15 Гц)

export const TILE = 16;               // пиксель-размер тайла
export const CHUNK = 32;              // тайлов в чанке по стороне
export const WORLD_CHUNKS = 24;       // мир 24x24 чанка = 768x768 тайлов
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
  MINE: 29, SHRINE: 30, RUBBLE: 31, FENCE: 32, ANVIL: 33, BOARD: 34,
  // достопримечательности и декор
  OBELISK: 35,       // древний обелиск — точка интереса, крупица знаний
  STATUE: 36,        // гранитная статуя — украшение данжей и кругов
  FOUNTAIN: 37,      // целебный источник — лечит путников
  DARK_ALTAR: 38,    // осквернённый идол каменных кругов
  CRYSTAL_WALL: 39,  // светящийся кристалл — свет в данжах, добыча кристаллов
  PILLAR: 40,        // обломанная колонна — руины
  BLOOD: 41,         // засохшая кровь на полу данжа
  TRAP: 42,          // ловушка с лезвиями — ранит наступившего
  LOCKED_DOOR: 43,   // запертая дверь босса — нужен ключ мини-босса
  STAIRS: 44,        // лестница на нижний этаж подземелья
  // Выжженные земли
  ASH: 45,           // пепельная пустошь — земля региона
  LAVA: 46,          // лава: жжёт стоящего, перекатом можно проскочить
  OBSIDIAN: 47,      // обсидиановая скала — стены региона
  BURNT_TREE: 48,    // обугленное дерево
  EMBER: 49,         // тлеющая кристальная жила — богатая добыча кристаллов
  PORTAL: 50,        // обсидиановый портал между мирами
  // детализация подземелий: разрушаемый реквизит и события
  BARREL: 51,        // бочка — ломается, роняет мелочь
  CRATE: 52,         // ящик с припасами
  SACK: 53,          // мешок зерна
  BARREL_FIRE: 54,   // огненная бочка: взрывается от удара, цепная детонация
  BONES: 55,         // старые кости — декор склепов и павшие искатели
  CRACKED_WALL: 56,  // треснувшая стена — за ней тайник (ломается оружием)
  PLAQUE: 57,        // каменная табличка с летописью подземелья
  PLATE: 58,         // ритуальная плита испытания (E — принять бой)
  // фракционная архитектура: у каждого народа свой строительный почерк
  WALL_LOG: 59,      // северный сруб — тёмное дерево
  WALL_STONE2: 60,   // озёрная кладка — серый камень
  WALL_CLAY: 61,     // степной саман — глина и солома
  YURT: 62,          // степная юрта-шатёр
  PIER: 63,          // причальные мостки над водой (проходимы)
  TOWN_PORTAL: 64,   // портальный камень: сеть телепортов между деревнями
  ICE_WALL: 65,      // ледяная стена мага: временная преграда, тает сама
};

// Реквизит подземелий: бьётся ЛЮБЫМ оружием, не только с structDmg
export const PROP_TILES = new Set([T.BARREL, T.CRATE, T.SACK, T.BARREL_FIRE, T.CRACKED_WALL]);

// Разрушаемые тайлы: прочность, во что превращаются, дроп.
export const DESTRUCTIBLE = {
  [T.WALL]: { hp: 12, becomes: T.RUBBLE, drops: { wood: 0.5 } },
  [T.DOOR]: { hp: 8, becomes: T.RUBBLE, drops: { wood: 0.5 } },
  [T.TOWER]: { hp: 25, becomes: T.RUBBLE, drops: { metal: 0.5 } },
  [T.MINE]: { hp: 25, becomes: T.RUBBLE, drops: { metal: 0.7 } },
  [T.ROCK_SOLID]: { hp: 15, becomes: T.ROCK, drops: { metal: 0.4 } },
  [T.TREE]: { hp: 3, becomes: T.GRASS, drops: { wood: 1.4 } },
  [T.BUSH]: { hp: 2, becomes: T.GRASS, drops: { herb: 0.3 } },
  [T.STALL]: { hp: 8, becomes: T.RUBBLE, drops: { wood: 0.5 } },
  [T.TABLE]: { hp: 5, becomes: T.FLOOR_WOOD, drops: { wood: 0.5 } },
  [T.BED]: { hp: 5, becomes: T.FLOOR_WOOD, drops: { wood: 0.3 } },
  [T.WELL]: { hp: 20, becomes: T.RUBBLE, drops: {} },
  [T.FENCE]: { hp: 4, becomes: T.GRASS, drops: { wood: 0.6 } },
  [T.ANVIL]: { hp: 15, becomes: T.FLOOR_WOOD, drops: { metal: 0.6 } },
  [T.STATUE]: { hp: 20, becomes: T.RUBBLE, drops: {} },
  [T.PILLAR]: { hp: 8, becomes: T.RUBBLE, drops: {} },
  [T.CRYSTAL_WALL]: { hp: 12, becomes: T.DUNGEON_FLOOR, drops: { crystal: 1 } },
  [T.BURNT_TREE]: { hp: 2, becomes: T.ASH, drops: { wood: 0.6 } },
  [T.OBSIDIAN]: { hp: 18, becomes: T.ASH, drops: { metal: 0.5 } },
  [T.EMBER]: { hp: 14, becomes: T.ASH, drops: { crystal: 1.6 } },
  // реквизит подземелий (лёгкий — бьётся с одного-двух ударов)
  [T.BARREL]: { hp: 3, becomes: T.DUNGEON_FLOOR, drops: { coin: 0.9, wood: 0.4 } },
  [T.CRATE]: { hp: 3, becomes: T.DUNGEON_FLOOR, drops: { coin: 0.7, bread: 0.3 } },
  [T.SACK]: { hp: 2, becomes: T.DUNGEON_FLOOR, drops: { bread: 0.8, herb: 0.3 } },
  [T.BARREL_FIRE]: { hp: 2, becomes: T.DUNGEON_FLOOR, drops: {} }, // взрыв — в damageTile
  [T.CRACKED_WALL]: { hp: 8, becomes: T.DUNGEON_FLOOR, drops: {} },
  [T.WALL_LOG]: { hp: 12, becomes: T.RUBBLE, drops: { wood: 0.6 } },
  [T.WALL_STONE2]: { hp: 15, becomes: T.RUBBLE, drops: { metal: 0.3 } },
  [T.WALL_CLAY]: { hp: 10, becomes: T.RUBBLE, drops: {} },
  [T.YURT]: { hp: 8, becomes: T.GRASS, drops: { wood: 0.5 } },
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
  T.MINE, T.SHRINE, T.FENCE, T.ANVIL,
  T.OBELISK, T.STATUE, T.FOUNTAIN, T.DARK_ALTAR, T.CRYSTAL_WALL, T.PILLAR,
  T.LOCKED_DOOR, T.OBSIDIAN, T.BURNT_TREE, T.EMBER, T.PORTAL,
  T.BARREL, T.CRATE, T.SACK, T.BARREL_FIRE, T.CRACKED_WALL, T.PLAQUE,
  T.WALL_LOG, T.WALL_STONE2, T.WALL_CLAY, T.YURT, T.TOWN_PORTAL, T.ICE_WALL,
]);
// Блокирует пули (стены — да, вода — нет)
export const BULLET_SOLID = new Set([
  T.WALL, T.TREE, T.ROCK_SOLID, T.DUNGEON_WALL, T.STALL, T.WELL, T.TOWER,
  T.MINE, T.OBELISK, T.STATUE, T.CRYSTAL_WALL, T.PILLAR, T.LOCKED_DOOR,
  T.OBSIDIAN, T.BURNT_TREE, T.EMBER, T.PORTAL,
  T.BARREL, T.CRATE, T.SACK, T.BARREL_FIRE, T.CRACKED_WALL, T.PLAQUE,
  T.WALL_LOG, T.WALL_STONE2, T.WALL_CLAY, T.YURT, T.TOWN_PORTAL, T.ICE_WALL,
]);
