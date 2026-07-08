// Штамповка построек поселения в world.edits + запись якорей для
// распорядка дня NPC (кровати, рабочие места, костёр, прилавки).
// Также рантайм-строительство: цивилизации возводят дома/поля/башни на лету.
import { T } from '../../shared/constants.js';
import { randInt } from '../../shared/rng.js';
import { baseTile } from './worldgen.js';

function set(world, x, y, t) { world.edits.set(x + ',' + y, t); }

// строительный почерк народов: северный сруб, озёрная кладка, степной саман
export const WALL_OF = {
  severane: T.WALL_LOG, ozerny: T.WALL_STONE2, stepnyaki: T.WALL_CLAY,
};
const wallOf = s => WALL_OF[s?.faction] || T.WALL;

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
  stampHouse(world, site.x, site.y, w, h, s.anchors, wallOf(s));
  return { w, h };
}

export function buildField(world, s, site) {
  for (let y = site.y; y < site.y + 3; y++)
    for (let x = site.x; x < site.x + 4; x++) set(world, x, y, T.FIELD);
  s.anchors.works.push({ x: site.x + 2, y: site.y + 1 });
  return { w: 4, h: 3 };
}

export function buildTower(world, s, site) {
  // одинокая дозорная башня: рисуется высоким спрайтом на клиенте
  set(world, site.x, site.y, T.TOWER);
  return { w: 1, h: 1 };
}

export function buildMine(world, s, site) {
  for (let y = site.y; y < site.y + 2; y++)
    for (let x = site.x; x < site.x + 2; x++) set(world, x, y, T.MINE);
  s.anchors.works.push({ x: site.x, y: site.y + 2 });
  return { w: 2, h: 2 };
}

export function buildShrine(world, s, site) {
  set(world, site.x, site.y, T.SHRINE);
  return { w: 1, h: 1 };
}

// Дом размером w x h с дверью снизу; внутри кровать (+стол в больших)
export function stampHouse(world, x0, y0, w, h, anchors, wallT = T.WALL) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const border = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      set(world, x, y, border ? wallT : T.FLOOR_WOOD);
    }
  const doorX = x0 + Math.floor(w / 2);
  set(world, doorX, y0 + h - 1, T.DOOR);
  const bedX = x0 + 1, bedY = y0 + 1;
  set(world, bedX, bedY, T.BED);
  anchors.beds.push({ x: bedX, y: bedY, doorX, doorY: y0 + h });
  if (w >= 5) set(world, x0 + w - 2, y0 + 1, T.TABLE);
}

// Деревня v2: мощёная площадь с колодцем, таверна, кузница, рынок,
// дома по кольцу, огороды и палисад с воротами по四 сторонам.
export function stampSettlement(world, s, rand) {
  const anchors = {
    beds: [], works: [], stalls: [], fire: null, well: null,
    tavern: null, smithy: null,
  };
  const cx = s.x, cy = s.y;
  const R = 18;

  // расчистка площадки (перекрываем декор травой)
  for (let y = cy - R; y <= cy + R; y++)
    for (let x = cx - R; x <= cx + R; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) set(world, x, y, T.GRASS);

  // центральная площадь: мощёный круг с колодцем и костром
  for (let y = cy - 3; y <= cy + 3; y++)
    for (let x = cx - 3; x <= cx + 3; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 11) set(world, x, y, T.ROAD);
  set(world, cx, cy, T.WELL);
  anchors.well = { x: cx, y: cy };
  set(world, cx + 2, cy + 2, T.CAMPFIRE);
  anchors.fire = { x: cx + 2, y: cy + 2 };

  // дорожки от площади к воротам
  for (let d = 4; d <= R; d++) {
    set(world, cx + d, cy, T.ROAD); set(world, cx - d, cy, T.ROAD);
    set(world, cx, cy + d, T.ROAD); set(world, cx, cy - d, T.ROAD);
  }

  const wallT = wallOf(s);
  // таверна — большой дом на севере площади (кровати «для постояльцев»)
  stampHouse(world, cx - 4, cy - 12, 8, 6, anchors, wallT);
  set(world, cx - 2, cy - 9, T.TABLE);
  set(world, cx + 1, cy - 9, T.TABLE);
  anchors.tavern = { x: cx - 1, y: cy - 8 };
  // доска заказов гильдии на углу площади (подальше от дверей)
  set(world, cx + 4, cy - 4, T.BOARD);

  // кузница — дом с наковальней на востоке
  stampHouse(world, cx + 6, cy - 6, 5, 5, anchors, wallT);
  set(world, cx + 7, cy - 5, T.ANVIL);
  anchors.smithy = { x: cx + 8, y: cy - 3 };

  // жилые дома по кольцу (юг и запад)
  const homeSlots = [
    [-14, -6, 5, 4], [-15, 3, 5, 5], [-8, 8, 5, 4],
    [3, 8, 6, 5], [10, 2, 5, 4],
  ];
  const houses = randInt(rand, 3, homeSlots.length);
  for (let i = 0; i < houses; i++) {
    const [ox, oy, w, h] = homeSlots[i];
    stampHouse(world, cx + ox, cy + oy, w, h, anchors, wallT);
  }

  // фракционный колорит двора
  if (s.faction === 'stepnyaki') {
    // юрты кочевников меж домов и загон для скота
    for (const [ox, oy] of [[9, 8], [13, 6], [-11, -10]]) {
      if (world.edits.get((cx + ox) + ',' + (cy + oy)) === T.GRASS) set(world, cx + ox, cy + oy, T.YURT);
    }
    for (let x = cx + 10; x <= cx + 15; x++) { set(world, x, cy + 11, T.FENCE); set(world, x, cy + 14, T.FENCE); }
    for (let y = cy + 12; y <= cy + 13; y++) set(world, cx + 15, y, T.FENCE);
  } else if (s.faction === 'ozerny') {
    // причал: мостки уходят к ближайшей воде (озёрный народ живёт рыбой)
    outer: for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let d = R - 2; d <= R + 16; d++) {
        const wx = cx + dx * d, wy = cy + dy * d;
        if (baseTile(world.seed, wx, wy) === T.WATER || baseTile(world.seed, wx, wy) === T.DEEP_WATER) {
          for (let k = -3; k <= 4; k++) {
            const px = cx + dx * (d + k), py = cy + dy * (d + k);
            if (world.edits.get(px + ',' + py) === undefined || k <= 0) set(world, px, py, T.PIER);
          }
          anchors.works.push({ x: cx + dx * (d + 3), y: cy + dy * (d + 3) }); // рыбацкое место
          break outer;
        }
      }
    }
  } else if (s.faction === 'severane') {
    // трофейные тотемы у ворот — север встречает силой
    if (world.edits.get((cx + 3) + ',' + (cy - R + 2)) === T.GRASS) set(world, cx + 3, cy - R + 2, T.STATUE);
    if (world.edits.get((cx - 3) + ',' + (cy - R + 2)) === T.GRASS) set(world, cx - 3, cy - R + 2, T.STATUE);
  }

  // рынок: ряд прилавков у западного входа площади
  for (let i = 0; i < 2 + (rand() < 0.5 ? 1 : 0); i++) {
    set(world, cx - 5, cy - 2 + i * 2, T.STALL);
    anchors.stalls.push({ x: cx - 5, y: cy - 1 + i * 2 });
  }

  // огороды
  for (let y = cy + 9; y < cy + 12; y++)
    for (let x = cx - 3; x < cx + 2; x++) set(world, x, y, T.FIELD);
  anchors.works.push({ x: cx - 1, y: cy + 10 });
  anchors.works.push({ x: cx, y: cy + 1 }); // у колодца

  // палисад по кругу с воротами по осям
  for (let a = 0; a < 360; a += 2) {
    const rad = a * Math.PI / 180;
    const fx = cx + Math.round(Math.cos(rad) * R);
    const fy = cy + Math.round(Math.sin(rad) * R);
    // ворота: пропуски у осей
    if (Math.abs(fx - cx) <= 1 || Math.abs(fy - cy) <= 1) continue;
    const key = fx + ',' + fy;
    if (world.edits.get(key) === T.GRASS) set(world, fx, fy, T.FENCE);
  }

  s.anchors = anchors;
}
