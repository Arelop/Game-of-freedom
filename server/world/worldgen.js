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
    roads: [],                  // точки дорог для карты мира
    time: 0.3,                  // доля суток (0.3 = утро)
    day: 1,
    war: { stage: 0 },          // «Война с Тьмой»: 0 не начата, 1 союз, 2 реликвии, 3 штурм, 10/11 финалы
    // кампания «Тень над Пограничьем»: мировые последствия выборов
    // (главы — личные, p.story.mq; выборы отряда — общие)
    mq: {
      prisoner: null,   // выбор 1: 'dead' | 'freed'
      priest: null,     // выбор 2: 'exposed' | 'cleansed'
      dispute: null,    // выбор 3: 'steppe' | 'north' | 'peace'
      dungeon: null,    // целевой данж гл.1 (id POI)
      lair: null,       // целевое логово гл.2 (id POI)
      northId: null,    // «дальняя северная» деревня гл.2
      lairDone: false,  // логово пало — наводчик ждёт суда
      taint: null,      // улика гл.3 {x,y}
      cache: null,      // тайник наводчика {x,y}
      emberDone: false, // Уголь Первой Тьмы добыт
    },
    stash: {},                  // общий сундук группы (таверна)
    weather: 'clear',           // погода дня: clear | rain | snow
  };

  // Поселения: 9 сайтов, три городские фракции по кругу
  const townFactions = ['severane', 'ozerny', 'stepnyaki'];
  const sites = [];
  for (let i = 0; i < 9; i++) {
    const site = findFlatSite(seed, rand, sites, 95);
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
      guards: 2, garrison: { militia: 2, archer: 0, veteran: 0 }, // 3 архетипа стражи
      towers: 0, fields: 1, mines: 0, shrines: 0,
      housingCap: 0,        // заполнит stampSettlement по числу домов
      forestRich: Math.min(4, 1 + Math.floor(forest / 5)),
      rockRich: Math.min(3, Math.floor(rock / 4)),        // руда: только у скал
      crystalRich: Math.min(2, Math.floor(swamp / 5)),    // кристаллы: у болот
      project: null,        // { type, progress, need }
      wardT: 0,             // обережный ритуал: тиков защиты
      spiritT: 0,           // призванный дух-хранитель: тиков службы
      captured: false, ruined: false,
      anchors: null, // заполнит stampSettlement: beds, works, fire, stalls
    };
    stampSettlement(world, s, rand);
    s.housingCap = s.anchors.beds.length * 2;
    world.settlements.push(s);
  });

  // POI: данжи и лагеря
  const poiCount = 20;
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

  // Необычные места: хижина отшельника, каменные круги, обелиски, источники
  const SPECIALS = [
    { type: 'hermit', name: 'Хижина отшельника', n: 1 },
    { type: 'circle', name: 'Каменный круг', n: 3 },
    { type: 'obelisk', name: 'Древний обелиск', n: 3 },
    { type: 'spring', name: 'Целебный источник', n: 3 },
    { type: 'barrow', name: 'Древний курган', n: 3 },
    { type: 'oldwell', name: 'Заброшенный колодец', n: 1 },
    { type: 'ashportal', name: 'Обсидиановый портал', n: 1 },
  ];
  let si = 0;
  for (const spec of SPECIALS) {
    for (let k = 0; k < spec.n; k++) {
      const site = findFlatSite(seed, rand, allSites, 40);
      if (!site) continue;
      allSites.push(site);
      const poi = {
        id: 'sp' + si++, x: site.x, y: site.y, type: spec.type,
        name: spec.name, cleared: spec.type !== 'circle', // зачищать нужно только круги
        difficulty: 2, special: true,
      };
      // курган: загадка — 4 статуи, порядок активации задан сидом
      if (spec.type === 'barrow') {
        poi.order = [0, 1, 2, 3].sort(() => rand() - 0.5);
        poi.pressed = [];
        poi.looted = false;
      }
      if (spec.type === 'ashportal') world.ashPortal = { x: site.x, y: site.y };
      stampSpecial(world, poi, rand);
      world.pois.push(poi);
    }
  }

  // Дикие сундуки: редкие тайники в глуши — награда исследователям
  world.wildChests = [];
  for (let i = 0; i < 14; i++) {
    const site = findFlatSite(seed, rand, allSites, 30);
    if (!site) break;
    allSites.push(site);
    world.edits.set(site.x + ',' + site.y, T.CHEST);
    world.wildChests.push({ x: site.x, y: site.y, opened: false });
  }

  // Логова боссов биомов: колдунья в болоте, король в скалах, вожак в лесу
  const LAIRS = [
    { type: 'lair', name: 'Логово болотной колдуньи', biome: T.SWAMP, kinds: ['swampWitch', 'slime', 'slime'] },
    { type: 'lair', name: 'Трон каменного короля', biome: T.ROCK, kinds: ['rockKing', 'golem'] },
    { type: 'lair', name: 'Логово вожака варгов', biome: T.FOREST_FLOOR, kinds: ['packLeader', 'wolf', 'wolf', 'wolf'] },
  ];
  for (const L of LAIRS) {
    let site = null;
    for (let tries = 0; tries < 600 && !site; tries++) {
      const x = randInt(rand, 40, WORLD_TILES - 40), y = randInt(rand, 40, WORLD_TILES - 40);
      if (baseTile(seed, x, y) !== L.biome) continue;
      if (allSites.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < 45 * 45)) continue;
      site = { x, y };
    }
    if (!site) continue; // биома не нашлось — босс останется легендой
    allSites.push(site);
    const poi = {
      id: 'lair' + si++, x: site.x, y: site.y, type: 'lair', name: L.name,
      cleared: false, difficulty: 4, kinds: L.kinds, special: false,
    };
    // сцена логова: кровь, черепа камней и колонны
    const set = (dx, dy, t) => world.edits.set((site.x + dx) + ',' + (site.y + dy), t);
    set(0, 0, T.BLOOD); set(1, 1, T.BLOOD); set(-2, 1, T.BLOOD);
    set(-3, -2, T.PILLAR); set(3, 2, T.PILLAR);
    set(-2, -3, T.ROCK_SOLID); set(2, -2, T.ROCK_SOLID); set(3, -3, T.ROCK_SOLID);
    world.pois.push(poi);
  }

  // Чернокаменная Цитадель — оплот Армии Тьмы на юге мира
  let cSite = null;
  for (let tries = 0; tries < 400 && !cSite; tries++) {
    const x = randInt(rand, 60, WORLD_TILES - 60);
    const y = randInt(rand, WORLD_TILES - 110, WORLD_TILES - 45);
    let ok = true;
    for (let dy = -10; dy <= 10 && ok; dy += 5)
      for (let dx = -10; dx <= 10 && ok; dx += 5) {
        const b = baseTile(seed, x + dx, y + dy);
        if (b === T.WATER || b === T.DEEP_WATER) ok = false;
      }
    if (ok && !sites.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < 80 * 80)) cSite = { x, y };
  }
  if (!cSite) cSite = { x: Math.floor(WORLD_TILES / 2), y: WORLD_TILES - 60 }; // крайний случай: юг по центру
  world.citadel = {
    x: cSite.x, y: cSite.y, name: 'Чернокаменная Цитадель',
    power: 8,        // мощь Тьмы: растёт каждый цив-тик, питает рейды
    forts: [],       // id захваченных деревень — форты Тьмы
    ziggurats: [],   // возведённые зиккураты { id, x, y, taintR, taintMax }
    zigCd: 0,        // кулдаун постройки зиккурата (цив-тики)
    nextZig: 1,      // счётчик id зиккуратов
  };
  stampCitadel(world, cSite);

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

// Штампы необычных мест: у каждого типа — своя маленькая сцена
function stampSpecial(world, poi, rand) {
  const { x, y, type } = poi;
  const set = (dx, dy, t) => world.edits.set((x + dx) + ',' + (y + dy), t);
  if (type === 'hermit') {
    // хижина 5×4 с дверью на юг, костёр и грядка снаружи
    for (let dy = -2; dy <= 1; dy++)
      for (let dx = -2; dx <= 2; dx++)
        set(dx, dy, (dy === -2 || dy === 1 || dx === -2 || dx === 2) ? T.WALL : T.FLOOR_WOOD);
    set(0, 1, T.DOOR);
    set(-1, 0, T.BED);
    set(1, 0, T.TABLE);
    set(0, 3, T.CAMPFIRE);
    set(2, 3, T.BUSH);
    set(-2, 3, T.BUSH);
  } else if (type === 'circle') {
    // кольцо валунов вокруг осквернённого идола, кровь на земле
    for (let a = 0; a < 8; a++) {
      const dx = Math.round(Math.cos(a / 8 * Math.PI * 2) * 4);
      const dy = Math.round(Math.sin(a / 8 * Math.PI * 2) * 4);
      set(dx, dy, T.ROCK_SOLID);
    }
    set(0, 0, T.DARK_ALTAR);
    set(1, 1, T.BLOOD);
    set(-1, 0, T.BLOOD);
    set(0, -2, T.BLOOD);
  } else if (type === 'obelisk') {
    // обелиск на древних плитах, обломанные колонны по углам
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (Math.abs(dx) + Math.abs(dy) <= 3) set(dx, dy, T.FLOOR_STONE);
    set(0, 0, T.OBELISK);
    set(-2, -2, T.PILLAR);
    set(2, -2, T.PILLAR);
    set(-2, 2, T.PILLAR);
    set(2, 2, T.PILLAR);
  } else if (type === 'ashportal') {
    // врата в Выжженные земли: обсидиановая арка среди выжженной травы
    set(0, 0, T.PORTAL);
    set(-1, -1, T.OBSIDIAN); set(1, -1, T.OBSIDIAN);
    set(-2, 0, T.OBSIDIAN); set(2, 0, T.OBSIDIAN);
    set(-1, 2, T.BURNT_TREE); set(2, 2, T.BURNT_TREE); set(0, -2, T.RUBBLE);
    set(-2, 1, T.ASH); set(2, 1, T.ASH); set(0, 1, T.ASH); set(1, 1, T.ASH); set(-1, 1, T.ASH);
  } else if (type === 'oldwell') {
    // забытый колодец: из глубины шепчет голос
    set(0, 0, T.WELL);
    set(1, 1, T.BLOOD); set(-1, -1, T.BLOOD);
    set(2, 0, T.BUSH); set(-2, 1, T.BUSH); set(0, -2, T.RUBBLE);
  } else if (type === 'barrow') {
    // курган: кольцо валунов, 4 статуи по сторонам света, сундук в центре
    for (let a = 0; a < 10; a++) {
      const dx = Math.round(Math.cos(a / 10 * Math.PI * 2) * 5);
      const dy = Math.round(Math.sin(a / 10 * Math.PI * 2) * 5);
      set(dx, dy, T.ROCK_SOLID);
    }
    set(0, -3, T.STATUE); set(3, 0, T.STATUE); set(0, 3, T.STATUE); set(-3, 0, T.STATUE);
    set(0, 0, T.CHEST);
    set(1, 1, T.BLOOD);
  } else if (type === 'spring') {
    // целебный фонтан среди цветов и воды
    set(0, 0, T.FOUNTAIN);
    set(-1, 0, T.WATER_EDGE);
    set(1, 0, T.WATER_EDGE);
    set(0, 1, T.WATER_EDGE);
    set(0, -1, T.WATER_EDGE);
    for (const [dx, dy] of [[-2, -1], [2, 1], [-1, 2], [1, -2], [2, -1], [-2, 1]])
      set(dx, dy, T.BUSH);
  }
}

// Крепость Тьмы: чёрные стены 19×15, башни по углам, ворота на севере,
// внутри тёмный двор — гарнизон приходит от гидратации (game.hydrateCitadel)
function stampCitadel(world, c) {
  const W = 19, H = 15;
  const x0 = c.x - Math.floor(W / 2), y0 = c.y - Math.floor(H / 2);
  for (let y = y0; y < y0 + H; y++) {
    for (let x = x0; x < x0 + W; x++) {
      const key = x + ',' + y;
      const border = x === x0 || x === x0 + W - 1 || y === y0 || y === y0 + H - 1;
      const corner = (x <= x0 + 1 || x >= x0 + W - 2) && (y <= y0 + 1 || y >= y0 + H - 2);
      if (corner) world.edits.set(key, T.TOWER);
      else if (border) {
        // ворота: три тайла по центру северной стены
        if (y === y0 && Math.abs(x - c.x) <= 1) world.edits.set(key, T.DUNGEON_FLOOR);
        else world.edits.set(key, T.DUNGEON_WALL);
      } else world.edits.set(key, T.DUNGEON_FLOOR);
    }
  }
  // дорожка от ворот на север — приглашение к штурму
  for (let y = y0 - 6; y < y0; y++) world.edits.set(c.x + ',' + y, T.ROAD);
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
    if (guard % 4 === 0) world.roads.push([x, y]);
  }
}

// Карта биомов для клиентской карты мира: 128x128 (шаг 4 тайла), коды 0..6
export function buildBiomeMap(world) {
  const N = 256;
  const step = WORLD_TILES / N; // карта-миниатюра 256×256 при любом размере мира
  const out = new Uint8Array(N * N);
  const CODE = {
    [T.DEEP_WATER]: 0, [T.WATER]: 1, [T.SAND]: 2, [T.GRASS]: 3,
    [T.FOREST_FLOOR]: 4, [T.ROCK]: 5, [T.SWAMP]: 6,
  };
  for (let my = 0; my < N; my++)
    for (let mx = 0; mx < N; mx++)
      out[my * N + mx] = CODE[baseTile(world.seed, Math.floor(mx * step + step / 2), Math.floor(my * step + step / 2))] ?? 3;
  return out;
}
