// Генерация мира: биомы из шума, поселения, POI, дороги.
// Всё детерминировано от worldSeed. Правки поверх базового рельефа
// (здания, дороги) лежат в world.edits: Map<"x,y" -> тайл>.
import { T, WORLD_TILES } from '../../shared/constants.js';
import { fbm2, valueNoise2 } from '../../shared/noise.js';
import { mulberry32, hash2, pick, randInt } from '../../shared/rng.js';
import { stampSettlement } from './structures.js';
import { FACTIONS } from '../sim/factions.js';

const SYL_A = ['Верх', 'Ниж', 'Старо', 'Ново', 'Бело', 'Черно', 'Красно', 'Даль', 'Тихо', 'Гор'];
const SYL_B = ['речье', 'горье', 'поле', 'бор', 'водье', 'камень', 'луг', 'острог', 'двор', 'яр'];
const POI_NAMES = ['Гнилые руины', 'Волчье логово', 'Старая шахта', 'Проклятый склеп', 'Лагерь разбойников', 'Забытый форт', 'Тёмная пещера', 'Курган вождя'];

export function baseTile(seed, x, y) {
  const e = fbm2(seed, x / 90, y / 90, 4);          // высота
  const m = fbm2(seed + 999, x / 70, y / 70, 3);    // влажность
  // край мира — океан
  const edge = Math.min(x, y, WORLD_TILES - 1 - x, WORLD_TILES - 1 - y);
  const elev = e - Math.max(0, (24 - edge)) * 0.03;
  if (elev < 0.30) return T.DEEP_WATER;
  if (elev < 0.36) return T.WATER;
  if (elev < 0.39) return T.SAND;
  if (elev > 0.72) return T.ROCK;
  if (m > 0.62 && elev < 0.45) return T.SWAMP;
  if (m > 0.55) return T.FOREST_FLOOR;
  if (m < 0.34) return T.SAND;
  return T.GRASS;
}

// Декор поверх базового тайла (деревья, камни, кусты) — по хэшу тайла.
export function decorTile(seed, x, y, base) {
  const h = hash2(seed + 777, x, y) % 1000;
  if (base === T.FOREST_FLOOR) {
    if (h < 190) return T.TREE;
    if (h < 230) return T.BUSH;
  } else if (base === T.GRASS) {
    if (h < 22) return T.TREE;
    if (h < 40) return T.BUSH;
  } else if (base === T.ROCK) {
    if (h < 90) return T.ROCK_SOLID;
  } else if (base === T.SWAMP) {
    if (h < 50) return T.BUSH;
  }
  return null;
}

function findFlatSite(seed, rand, taken, minDist) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = randInt(rand, 50, WORLD_TILES - 50);
    const y = randInt(rand, 50, WORLD_TILES - 50);
    const t = baseTile(seed, x, y);
    if (t !== T.GRASS && t !== T.SAND) continue;
    // проверка ровной площадки 24x24
    let ok = true;
    for (let dy = -12; dy <= 12 && ok; dy += 6)
      for (let dx = -12; dx <= 12 && ok; dx += 6) {
        const tt = baseTile(seed, x + dx, y + dy);
        if (tt === T.WATER || tt === T.DEEP_WATER || tt === T.ROCK) ok = false;
      }
    if (!ok) continue;
    if (taken.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < minDist * minDist)) continue;
    return { x, y };
  }
  return null;
}

export function makeWorld(seed) {
  const rand = mulberry32(seed);
  const world = {
    seed,
    edits: new Map(),           // "x,y" -> тайл
    settlements: [],
    pois: [],
    time: 0.3,                  // доля суток (0.3 = утро)
    day: 1,
  };

  // Поселения: 6 сайтов, три городские фракции по кругу
  const townFactions = ['severane', 'ozerny', 'stepnyaki'];
  const sites = [];
  for (let i = 0; i < 6; i++) {
    const site = findFlatSite(seed, rand, sites, 90);
    if (!site) break;
    sites.push(site);
  }
  sites.forEach((site, i) => {
    const faction = townFactions[i % townFactions.length];
    const name = pick(rand, SYL_A) + pick(rand, SYL_B);
    // богатство окрестностей — скорость добычи ресурсов
    let forest = 0, rock = 0, swamp = 0;
    for (let a = 0; a < 24; a++) {
      const fx = site.x + Math.round(Math.cos(a / 24 * Math.PI * 2) * 24);
      const fy = site.y + Math.round(Math.sin(a / 24 * Math.PI * 2) * 24);
      const b = baseTile(seed, fx, fy);
      if (b === T.FOREST_FLOOR) forest++;
      if (b === T.ROCK) rock++;
      if (b === T.SWAMP) swamp++;
    }
    const s = {
      id: 'stl' + i, x: site.x, y: site.y, faction, name,
      homeFaction: faction,
      population: randInt(rand, 6, 10), prosperity: randInt(rand, 40, 70),
      food: randInt(rand, 50, 90),
      // --- цивилизация: ресурсы и добыча ---
      wood: randInt(rand, 4, 10),
      metal: randInt(rand, 2, 6),
      crystal: randInt(rand, 0, 2),
      guards: 2, towers: 0, fields: 1, mines: 0, shrines: 0,
      housingCap: 0,        // заполнит stampSettlement по числу домов
      forestRich: Math.min(4, 1 + Math.floor(forest / 5)),
      rockRich: Math.min(3, Math.floor(rock / 4)),        // руда: только у скал
      crystalRich: Math.min(2, Math.floor(swamp / 5)),    // кристаллы: у болот
      project: null,        // { type, progress, need }
      wardT: 0,             // обережный ритуал: тиков защиты
      captured: false, ruined: false,
      anchors: null, // заполнит stampSettlement: beds, works, fire, stalls
    };
    stampSettlement(world, s, rand);
    s.housingCap = s.anchors.beds.length * 2;
    world.settlements.push(s);
  });

  // POI: данжи и лагеря
  const poiCount = 12;
  const allSites = [...sites];
  for (let i = 0; i < poiCount; i++) {
    const site = findFlatSite(seed, rand, allSites, 45);
    if (!site) break;
    allSites.push(site);
    const isCamp = rand() < 0.35;
    const poi = {
      id: 'poi' + i, x: site.x, y: site.y,
      type: isCamp ? 'camp' : 'dungeon',
      name: pick(rand, POI_NAMES),
      cleared: false,
      difficulty: 1 + Math.floor(rand() * 3),
      boss: !isCamp && rand() < 0.4,
    };
    world.edits.set(site.x + ',' + site.y, T.DUNGEON_FLOOR); // вход обозначим объектом на клиенте
    poi.entrance = { x: site.x, y: site.y };
    world.pois.push(poi);
  }

  // Дороги между ближайшими поселениями (цепочка + пара перемычек)
  const stl = world.settlements;
  const linked = new Set();
  for (let i = 0; i < stl.length; i++) {
    let best = -1, bestD = Infinity;
    for (let j = 0; j < stl.length; j++) {
      if (i === j) continue;
      const key = Math.min(i, j) + '-' + Math.max(i, j);
      if (linked.has(key)) continue;
      const d = (stl[i].x - stl[j].x) ** 2 + (stl[i].y - stl[j].y) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0) {
      linked.add(Math.min(i, best) + '-' + Math.max(i, best));
      stampRoad(world, stl[i], stl[best], rand);
    }
  }

  return world;
}

// Дорога: волнистый Брезенхэм, вода не мостится (обрыв дороги у берега)
function stampRoad(world, a, b, rand) {
  let x = a.x, y = a.y;
  const n = mulberry32(hash2(world.seed, a.x, b.y));
  let guard = 0;
  while ((x !== b.x || y !== b.y) && guard++ < 2000) {
    const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
    if (n() < 0.5 && dx !== 0) x += dx; else if (dy !== 0) y += dy; else x += dx;
    // лёгкое виляние
    if (n() < 0.15) { x += n() < 0.5 ? 1 : -1; }
    const key = x + ',' + y;
    const base = baseTile(world.seed, x, y);
    if (base === T.WATER || base === T.DEEP_WATER) continue;
    if (!world.edits.has(key)) world.edits.set(key, T.ROAD);
  }
}
