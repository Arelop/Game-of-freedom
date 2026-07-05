// Штамповка построек поселения в world.edits + запись якорей для
// распорядка дня NPC (кровати, рабочие места, костёр, прилавки).
// Также рантайм-строительство: цивилизации возводят дома/поля/башни на лету.
import { T } from '../../shared/constants.js';
import { randInt } from '../../shared/rng.js';
import { baseTile } from './worldgen.js';

function set(world, x, y, t) { world.edits.set(x + ',' + y, t); }

// Свободна ли площадка w x h с углом (x0,y0): нет правок и рельеф проходим
export function siteFree(world, x0, y0, w, h) {
  for (let y = y0 - 1; y < y0 + h + 1; y++) {
    for (let x = x0 - 1; x < x0 + w + 1; x++) {
      const e = world.edits.get(x + ',' + y);
      if (e !== undefined && e !== T.GRASS && e !== T.ROAD) return false;
      const b = baseTile(world.seed, x, y);
      if (b === T.WATER || b === T.DEEP_WATER || b === T.ROCK) return false;
    }
  }
  return true;
}

// Спиральный поиск места под постройку вокруг центра поселения
export function findBuildSite(world, s, w, h, rand) {
  for (let r = 8; r <= 26; r += 3) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = rand() * Math.PI * 2;
      const x0 = Math.round(s.x + Math.cos(a) * r) - Math.floor(w / 2);
      const y0 = Math.round(s.y + Math.sin(a) * r) - Math.floor(h / 2);
      if (siteFree(world, x0, y0, w, h)) return { x: x0, y: y0 };
    }
  }
  return null;
}

// Рантайм-постройки. Возвращают занятые тайлы (для remap чанков).
export function buildHouse(world, s, site, rand) {
  const w = randInt(rand, 4, 6), h = randInt(rand, 4, 5);
  stampHouse(world, site.x, site.y, w, h, s.anchors);
  return { w, h };
}

export function buildField(world, s, site) {
  for (let y = site.y; y < site.y + 3; y++)
    for (let x = site.x; x < site.x + 4; x++) set(world, x, y, T.FIELD);
  s.anchors.works.push({ x: site.x + 2, y: site.y + 1 });
  return { w: 4, h: 3 };
}

export function buildTower(world, s, site) {
  for (let y = site.y; y < site.y + 2; y++)
    for (let x = site.x; x < site.x + 2; x++) set(world, x, y, T.TOWER);
  return { w: 2, h: 2 };
}

// Дом размером w x h с дверью снизу; внутри кровать (+стол в больших)
export function stampHouse(world, x0, y0, w, h, anchors) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const border = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      set(world, x, y, border ? T.WALL : T.FLOOR_WOOD);
    }
  const doorX = x0 + Math.floor(w / 2);
  set(world, doorX, y0 + h - 1, T.DOOR);
  const bedX = x0 + 1, bedY = y0 + 1;
  set(world, bedX, bedY, T.BED);
  anchors.beds.push({ x: bedX, y: bedY, doorX, doorY: y0 + h });
  if (w >= 5) set(world, x0 + w - 2, y0 + 1, T.TABLE);
}

export function stampSettlement(world, s, rand) {
  const anchors = { beds: [], works: [], stalls: [], fire: null, well: null, tavern: null };
  const cx = s.x, cy = s.y;

  // расчистка площадки под деревню (перекрываем декор травой)
  const R = 16;
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) set(world, x, y, T.GRASS);

  // центр: колодец + костёр рядом
  set(world, cx, cy, T.WELL);
  anchors.well = { x: cx, y: cy };
  set(world, cx + 2, cy + 1, T.CAMPFIRE);
  anchors.fire = { x: cx + 2, y: cy + 1 };

  // дома по кругу
  const houseCount = randInt(rand, 4, 6);
  const slots = [
    [-12, -12], [2, -12], [-12, 2], [8, 4], [-14, -2], [6, -4],
  ];
  for (let i = 0; i < houseCount && i < slots.length; i++) {
    const [ox, oy] = slots[i];
    const w = randInt(rand, 4, 6), h = randInt(rand, 4, 5);
    stampHouse(world, cx + ox, cy + oy, w, h, anchors);
  }
  // таверна — первый (самый большой) дом
  if (anchors.beds.length) anchors.tavern = { x: cx - 10, y: cy - 10 };

  // рынок: прилавки
  set(world, cx - 3, cy + 3, T.STALL);
  anchors.stalls.push({ x: cx - 3, y: cy + 4 });

  // поле — рабочее место
  for (let y = cy + 7; y < cy + 11; y++)
    for (let x = cx - 8; x < cx - 2; x++) set(world, x, y, T.FIELD);
  anchors.works.push({ x: cx - 5, y: cy + 9 });
  anchors.works.push({ x: cx, y: cy + 1 }); // у колодца

  s.anchors = anchors;
}
