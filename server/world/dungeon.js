// Данжи в стиле Gungeon: отдельный инстанс 64x64, комнаты + коридоры,
// боевые комнаты запечатываются до зачистки, сокровищница, комната босса.
import { T } from '../../shared/constants.js';
import { mulberry32, randInt, pick } from '../../shared/rng.js';
import { enemiesOfTier } from '../../shared/enemies.js';

const SIZE = 64;

export function generateDungeon(seed, difficulty, withBoss) {
  const rand = mulberry32(seed);
  const g = new Uint8Array(SIZE * SIZE).fill(T.DUNGEON_WALL);
  const rooms = [];

  // цепочка комнат: вход -> 3-5 боевых -> (сокровищница) -> (босс)
  const count = randInt(rand, 3, 5) + (withBoss ? 1 : 0);
  let px = 8, py = SIZE - 10;
  const entrance = { x: px, y: py };
  carveRoom(g, px, py, 4, 4);
  let prev = { x: px, y: py };

  for (let i = 0; i < count; i++) {
    const isBoss = withBoss && i === count - 1;
    const rw = isBoss ? randInt(rand, 8, 10) : randInt(rand, 5, 8);
    const rh = isBoss ? randInt(rand, 8, 10) : randInt(rand, 5, 8);
    // следующая комната — смещение вверх/вбок
    let nx = 0, ny = 0, tries = 0;
    do {
      nx = prev.x + randInt(rand, -14, 14);
      ny = prev.y - randInt(rand, 8, 14);
      tries++;
    } while ((nx < rw + 3 || nx > SIZE - rw - 3 || ny < rh + 3) && tries < 30);
    if (ny < rh + 3) ny = rh + 3;
    nx = Math.max(rw + 2, Math.min(SIZE - rw - 2, nx));

    carveRoom(g, nx, ny, rw, rh);
    const doors = carveCorridor(g, prev.x, prev.y, nx, ny);

    const room = {
      id: 'r' + i, x: nx, y: ny, w: rw, h: rh,
      doors,          // тайлы-двери коридора (для запечатывания)
      cleared: false, sealed: false,
      isBoss,
      isTreasure: false,
      spawns: [],
    };
    const n = isBoss ? 1 : randInt(rand, 3, 4 + difficulty);
    // спавн по таблице тиров: сложность данжа задаёт диапазон монстров
    const kinds = isBoss ? ['bossOgre'] : enemiesOfTier(1, Math.min(4, difficulty + 1));
    for (let k = 0; k < n; k++) {
      room.spawns.push({
        kind: isBoss ? 'bossOgre' : pick(rand, kinds),
        x: nx + randInt(rand, -Math.floor(rw / 2) + 1, Math.floor(rw / 2) - 1),
        y: ny + randInt(rand, -Math.floor(rh / 2) + 1, Math.floor(rh / 2) - 1),
      });
    }
    rooms.push(room);
    prev = { x: nx, y: ny };
  }

  // сокровищница: сундук в последней небоссовой комнате
  const treasureRoom = rooms[withBoss ? rooms.length - 2 : rooms.length - 1];
  if (treasureRoom) {
    treasureRoom.isTreasure = true;
    g[(treasureRoom.y) * SIZE + treasureRoom.x] = T.CHEST;
    treasureRoom.chest = { x: treasureRoom.x, y: treasureRoom.y, opened: false };
  }

  // --- декор: кровь на полу, колонны, светящиеся кристаллы, статуи ---
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x;
      if (g[i] === T.DUNGEON_FLOOR) {
        const r = rand();
        if (r < 0.03) g[i] = T.BLOOD;                       // следы старых боёв
        else if (r < 0.045 && !nearTile(g, x, y, T.DUNGEON_EXIT)) g[i] = T.PILLAR; // обломки колонн
      } else if (g[i] === T.DUNGEON_WALL && rand() < 0.02 && nearTile(g, x, y, T.DUNGEON_FLOOR)) {
        g[i] = T.CRYSTAL_WALL;                              // светящиеся жилы кристалла
      }
    }
  }
  // статуи-стражи у входа в комнату босса
  const bossRoom = rooms.find(r => r.isBoss);
  if (bossRoom) {
    const bx = bossRoom.x, by = bossRoom.y + bossRoom.h - 1;
    if (g[by * SIZE + bx - 2] === T.DUNGEON_FLOOR) g[by * SIZE + bx - 2] = T.STATUE;
    if (g[by * SIZE + bx + 2] === T.DUNGEON_FLOOR) g[by * SIZE + bx + 2] = T.STATUE;
  }
  // целебный фонтан в сокровищнице — передышка перед боссом
  if (treasureRoom) {
    const fx2 = treasureRoom.x + 2, fy2 = treasureRoom.y;
    if (g[fy2 * SIZE + fx2] === T.DUNGEON_FLOOR) g[fy2 * SIZE + fx2] = T.FOUNTAIN;
  }

  // выход = вход (портал наружу)
  g[entrance.y * SIZE + entrance.x] = T.DUNGEON_EXIT;

  return { size: SIZE, grid: g, rooms, entrance, seed, difficulty };
}

function nearTile(g, x, y, tile) {
  return g[(y - 1) * SIZE + x] === tile || g[(y + 1) * SIZE + x] === tile
    || g[y * SIZE + x - 1] === tile || g[y * SIZE + x + 1] === tile;
}

function carveRoom(g, cx, cy, rw, rh) {
  for (let y = cy - rh; y <= cy + rh; y++)
    for (let x = cx - rw; x <= cx + rw; x++)
      if (x > 0 && y > 0 && x < SIZE - 1 && y < SIZE - 1)
        g[y * SIZE + x] = T.DUNGEON_FLOOR;
}

// Г-образный коридор шириной 2; возвращает тайлы в местах входа в комнаты
function carveCorridor(g, x0, y0, x1, y1) {
  const doors = [];
  let x = x0, y = y0;
  const carve = (x, y) => {
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx > 0 && yy > 0 && xx < SIZE - 1 && yy < SIZE - 1 && g[yy * SIZE + xx] === T.DUNGEON_WALL)
        g[yy * SIZE + xx] = T.DUNGEON_FLOOR;
    }
  };
  while (x !== x1) { x += Math.sign(x1 - x); carve(x, y); }
  while (y !== y1) { y += Math.sign(y1 - y); carve(x, y); }
  // дверные точки — середина коридора
  doors.push({ x: x1, y: Math.round((y0 + y1) / 2) });
  doors.push({ x: Math.round((x0 + x1) / 2), y: y0 });
  return doors;
}

export function roomAt(dungeon, tx, ty) {
  return dungeon.rooms.find(r =>
    tx >= r.x - r.w && tx <= r.x + r.w && ty >= r.y - r.h && ty <= r.y + r.h);
}
