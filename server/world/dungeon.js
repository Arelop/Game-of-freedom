// Данжи в стиле Gungeon: отдельный инстанс 64x64, комнаты + коридоры,
// боевые комнаты запечатываются до зачистки, сокровищница, комната босса.
import { T } from '../../shared/constants.js';
import { mulberry32, randInt, pick } from '../../shared/rng.js';
import { ENEMIES, enemiesOfTier } from '../../shared/enemies.js';

const SIZE = 64;

// Тайлсет подземелья по имени места: шахта, склеп, пещера или форт.
// Клиент рисует пол/стены/факелы по этому стилю.
export function dungeonStyle(name = '') {
  if (/шахт/i.test(name)) return 'mine';
  if (/склеп|курган|руин/i.test(name)) return 'crypt';
  if (/пещер|логов/i.test(name)) return 'cave';
  return 'fort'; // форт, лагерь и прочие рукотворные места
}

// Летопись на каменных табличках: обрывки историй Пограничья
const LORE_LINES = [
  ['«Здесь пал отряд Белого Ворона.', 'Девять вошли. Записку оставил один»'],
  ['«Не будите то, что спит под нижним этажом.', 'Мы разбудили» — нацарапано наспех'],
  ['«Тьма приходит не снаружи.', 'Она просыпается внутри» — знак Радогоста'],
  ['«Золото здесь дешевле воды.', 'Вода закончилась на третий день»'],
  ['Старый счёт: «стрел — 200, хлеба — 3 дня,', 'надежды — на донышке»'],
  ['«Кормите пламя бочек, и оно накормит вас».', 'Ниже — выцарапанный череп'],
  ['«Хранитель ключа обезумел и заперся у босса.', 'Ключ теперь носит с собой»'],
  ['«Слышишь шаги в коридоре — стой.', 'Их дозор ходит одной тропой»'],
  ['«За треснувшей стеной — то, что прятали', 'от самих себя» — рука мастера-каменщика'],
  ['«Владыка Пепла не миф. Мы видели зарево', 'за обсидиановым порталом»'],
  ['«Молись у статуй осторожно:', 'иные из них молятся в ответ»'],
  ['«Съел последний сухарь. Иду наверх.', 'Если читаешь это — я не дошёл»'],
];

export function generateDungeon(seed, difficulty, withBoss, depth = 1, name = '') {
  const rand = mulberry32(seed);
  const g = new Uint8Array(SIZE * SIZE).fill(T.DUNGEON_WALL);
  const rooms = [];
  const style = dungeonStyle(name);
  // проклятое подземелье: все враги — элита, добыча богаче (глубже — чаще)
  const cursed = rand() < (depth > 1 ? 0.45 : 0.2) && difficulty >= 2;

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
    // дверь босса заперта: весь проход вдоль нижней кромки комнаты
    // перегорожен решёткой (комнаты могут сливаться — точечной двери мало)
    let lockedTiles = null;
    if (isBoss) {
      lockedTiles = [];
      const row = ny + rh + 1;
      for (let cx = nx - rw - 1; cx <= nx + rw + 2; cx++) {
        if (cx <= 0 || cx >= SIZE - 1) continue;
        if (g[row * SIZE + cx] === T.DUNGEON_FLOOR) {
          g[row * SIZE + cx] = T.LOCKED_DOOR;
          lockedTiles.push({ x: cx, y: row });
        }
      }
      if (!lockedTiles.length) lockedTiles = null;
    }

    const room = {
      id: 'r' + i, x: nx, y: ny, w: rw, h: rh,
      doors,          // тайлы-двери коридора (для запечатывания)
      cleared: false, sealed: false,
      isBoss,
      isTreasure: false,
      spawns: [],
    };
    if (lockedTiles) room.lockedTiles = lockedTiles;
    // ТЕМА комнаты: у каждого зала своё лицо, население и находки
    if (!isBoss && rand() < 0.75) {
      const pool = ['barracks', 'crypt', 'shrine'];
      if (!rooms.some(r => r.theme === 'prison')) pool.push('prison', 'prison'); // тюрьма — не чаще одной
      room.theme = pick(rand, pool);
    }
    const n = isBoss ? 1 : Math.max(2, randInt(rand, 3, 4 + difficulty) - (room.theme === 'prison' ? 1 : 0));
    // спавн по таблице тиров; тема отбирает жильцов под себя
    const base = isBoss ? ['bossOgre'] : enemiesOfTier(1, Math.min(4, difficulty + 1));
    const THEME_KINDS = {
      crypt: ['skeleton', 'ghoul', 'necromancer', 'imp'],
      barracks: ['bandit', 'banditHeavy', 'archer', 'orcWarrior', 'orcShieldbearer', 'hobgoblin', 'gnollRaider', 'orcKnight'],
      shrine: ['imp', 'demonologist', 'demon', 'orcPriest'],
      prison: ['bandit', 'banditHeavy', 'hobgoblin', 'orcWarrior'],
    };
    const themed = room.theme ? base.filter(k => THEME_KINDS[room.theme].includes(k)) : base;
    const kinds = themed.length ? themed : base;
    for (let k = 0; k < n; k++) {
      room.spawns.push({
        kind: isBoss ? 'bossOgre' : pick(rand, kinds),
        x: nx + randInt(rand, -Math.floor(rw / 2) + 1, Math.floor(rw / 2) - 1),
        y: ny + randInt(rand, -Math.floor(rh / 2) + 1, Math.floor(rh / 2) - 1),
      });
    }
    // тематический декор и особые обитатели
    const set = (dx, dy, t) => {
      const xx = nx + dx, yy = ny + dy;
      if (xx > 0 && yy > 0 && xx < SIZE - 1 && yy < SIZE - 1 && g[yy * SIZE + xx] === T.DUNGEON_FLOOR)
        g[yy * SIZE + xx] = t;
    };
    if (room.theme === 'barracks') {         // казарма: столы, кровь и оружейная стойка
      set(-2, -1, T.TABLE); set(2, 1, T.TABLE); set(0, 2, T.BLOOD); set(-1, 1, T.BLOOD);
      room.lootWeapon = true;                // за зачистку — трофей со стойки
    } else if (room.theme === 'crypt') {     // склеп: статуи древних и старые кости
      set(-2, 0, T.STATUE); set(2, 0, T.STATUE); set(0, -2, T.BLOOD); set(1, 2, T.BLOOD); set(-1, -1, T.RUBBLE);
    } else if (room.theme === 'shrine') {    // осквернённое святилище: кровавый алтарь
      set(0, 0, T.DARK_ALTAR);
      room.altar = { x: nx, y: ny };
    } else if (room.theme === 'prison') {    // тюрьма: клетка с пленником
      const px2 = nx + rw - 2, py2 = ny - rh + 2;
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const xx = px2 + dx, yy = py2 + dy;
        if (xx > 0 && yy > 0 && xx < SIZE - 1 && yy < SIZE - 1 && g[yy * SIZE + xx] === T.DUNGEON_FLOOR)
          g[yy * SIZE + xx] = T.FENCE;
      }
      room.prisoner = { x: px2, y: py2 };
    }
    rooms.push(room);
    prev = { x: nx, y: ny };
  }

  // мини-босс с ключом в средней комнате (только если дверь босса заперта)
  if (withBoss && rooms.length >= 3) {
    const midRoom = rooms[Math.floor((rooms.length - 1) / 2)];
    midRoom.spawns.push({
      kind: difficulty >= 3 ? 'minotaur' : 'orcWarlord',
      x: midRoom.x, y: midRoom.y, keyBearer: true,
    });
  }

  // сокровищница: сундук в последней небоссовой комнате
  const treasureRoom = rooms[withBoss ? rooms.length - 2 : rooms.length - 1];
  if (treasureRoom) {
    treasureRoom.isTreasure = true;
    g[(treasureRoom.y) * SIZE + treasureRoom.x] = T.CHEST;
    treasureRoom.chest = { x: treasureRoom.x, y: treasureRoom.y, opened: false };
  }

  // --- СОБЫТИЙНЫЕ КОМНАТЫ: до двух случайных историй на данж ---
  // испытание (плита → волна на время → награда), проклятая статуя (50/50),
  // гоблин-барыга (мирный торг), павший искатель (кости, записка, добыча)
  {
    const evPool = ['trial', 'statue', 'goblin', 'seeker'];
    // перемешать пул сидированно
    for (let i = evPool.length - 1; i > 0; i--) {
      const j = randInt(rand, 0, i); [evPool[i], evPool[j]] = [evPool[j], evPool[i]];
    }
    const candidates = rooms.filter(r => !r.isBoss && !r.isTreasure
      && r.theme !== 'prison' && r.theme !== 'shrine'
      && !r.spawns.some(sp => sp.keyBearer)); // хранителя ключа не выселяем
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = randInt(rand, 0, i); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const nEvents = Math.min(candidates.length, rand() < 0.6 ? 2 : 1);
    for (let i = 0; i < nEvents; i++) {
      const room = candidates[i], ev = evPool[i];
      room.event = ev;
      // свободная клетка у центра комнаты под объект события
      let spot = null;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
        const xx = room.x + dx, yy = room.y + dy;
        if (g[yy * SIZE + xx] === T.DUNGEON_FLOOR) { spot = { x: xx, y: yy }; break; }
      }
      if (!spot) { room.event = null; continue; }
      if (ev === 'trial') {
        room.spawns = []; room.cleared = true; // бой начнётся с плиты, не с порога
        g[spot.y * SIZE + spot.x] = T.PLATE;
        room.trial = { x: spot.x, y: spot.y, done: false };
      } else if (ev === 'statue') {
        g[spot.y * SIZE + spot.x] = T.STATUE;
        room.eventStatue = { x: spot.x, y: spot.y, used: false };
      } else if (ev === 'goblin') {
        room.spawns = []; room.cleared = true; // барыге нужен покой
        room.goblin = { x: spot.x, y: spot.y };
      } else if (ev === 'seeker') {
        g[spot.y * SIZE + spot.x] = T.BONES;
        const bx = spot.x + 1, by = spot.y;
        if (g[by * SIZE + bx] === T.DUNGEON_FLOOR) g[by * SIZE + bx] = T.BLOOD;
        room.seeker = { x: spot.x, y: spot.y, looted: false };
      }
    }
  }

  // --- РЕКВИЗИТ: бочки, ящики, мешки вдоль стен комнат (окружение — оружие) ---
  const PROP_BY_STYLE = {
    mine: [T.BARREL, T.BARREL, T.CRATE],
    crypt: [T.SACK, T.CRATE],
    cave: [T.SACK, T.BARREL],
    fort: [T.CRATE, T.BARREL, T.SACK],
  };
  for (const room of rooms) {
    if (room.isBoss) continue;
    const nProps = randInt(rand, 2, 4);
    for (let k = 0; k < nProps; k++) {
      const xx = room.x + randInt(rand, -room.w + 1, room.w - 1);
      const yy = room.y + randInt(rand, -room.h + 1, room.h - 1);
      // центр комнаты — перекрёсток маршрутов, его не загромождаем
      if (Math.abs(xx - room.x) <= 1 && Math.abs(yy - room.y) <= 1) continue;
      if (g[yy * SIZE + xx] !== T.DUNGEON_FLOOR) continue;
      // огненная бочка — редкий подарок тактику (взрыв, цепная детонация)
      g[yy * SIZE + xx] = rand() < 0.15 ? T.BARREL_FIRE : pick(rand, PROP_BY_STYLE[style]);
    }
  }

  // --- СЕКРЕТНАЯ КОМНАТА: тайник за треснувшей стеной ---
  let secret = null;
  if (rand() < 0.85) {
    outer2: for (let attempt = 0; attempt < 24; attempt++) {
      const r = pick(rand, rooms);
      const dir = pick(rand, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const sx = r.x + dir[0] * (r.w + 3), sy = r.y + dir[1] * (r.h + 3);
      if (sx < 3 || sy < 3 || sx > SIZE - 4 || sy > SIZE - 4) continue;
      for (let yy = sy - 2; yy <= sy + 2; yy++)
        for (let xx = sx - 2; xx <= sx + 2; xx++)
          if (g[yy * SIZE + xx] !== T.DUNGEON_WALL) continue outer2;
      const cx = r.x + dir[0] * (r.w + 1), cy = r.y + dir[1] * (r.h + 1);
      if (g[cy * SIZE + cx] !== T.DUNGEON_WALL) continue;
      carveRoom(g, sx, sy, 1, 1);
      g[sy * SIZE + sx] = T.CHEST;
      const bx = sx - dir[0], by = sy - dir[1];
      if (g[by * SIZE + bx] === T.DUNGEON_FLOOR) g[by * SIZE + bx] = T.BONES;
      g[cy * SIZE + cx] = T.CRACKED_WALL;
      // прокоп от кромки комнаты до тайника (стена толщиной больше 1)
      for (let step = 2; step < 3; step++) {
        const mx = r.x + dir[0] * (r.w + step), my = r.y + dir[1] * (r.h + step);
        if ((mx !== sx || my !== sy) && g[my * SIZE + mx] === T.DUNGEON_WALL)
          g[my * SIZE + mx] = T.DUNGEON_FLOOR;
      }
      secret = { x: sx, y: sy, opened: false };
      break;
    }
  }

  // --- ТАБЛИЧКИ ЛЕТОПИСИ: обрывки историй на стенах ---
  const plaques = [];
  {
    const usedLore = new Set();
    for (const room of rooms) {
      if (plaques.length >= 2 || rand() > 0.4) continue;
      // клетка пола у стены комнаты
      let spot = null;
      for (let tries = 0; tries < 10 && !spot; tries++) {
        const xx = room.x + randInt(rand, -room.w + 1, room.w - 1);
        const yy = room.y - room.h; // верхняя кромка — табличка «на стене»
        if (g[yy * SIZE + xx] === T.DUNGEON_FLOOR && g[(yy - 1) * SIZE + xx] === T.DUNGEON_WALL)
          spot = { x: xx, y: yy };
      }
      if (!spot) continue;
      let li = randInt(rand, 0, LORE_LINES.length - 1);
      while (usedLore.has(li)) li = (li + 1) % LORE_LINES.length;
      usedLore.add(li);
      g[spot.y * SIZE + spot.x] = T.PLAQUE;
      plaques.push({ x: spot.x, y: spot.y, lines: LORE_LINES[li] });
    }
  }

  // --- ДОЗОР: группа врагов ходит маршрутом между комнатами ---
  let patrol = null;
  {
    // центр комнаты должен быть проходим (алтари/статуи/сундуки перегораживают путь)
    const PASSABLE = new Set([T.DUNGEON_FLOOR, T.BLOOD, T.TRAP, T.BONES, T.PLATE, T.RUBBLE]);
    // точка маршрута: центр или сосед в пределах ширины коридора (2 тайла)
    const wayPoint = r => {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        if (PASSABLE.has(g[(r.y + dy) * SIZE + r.x + dx])) return { x: r.x + dx, y: r.y + dy };
      return null;
    };
    const start = randInt(rand, 0, Math.max(0, rooms.length - 2));
    for (let k = 0; k < rooms.length - 1; k++) {
      const i0 = (start + k) % (rooms.length - 1);
      const a = rooms[i0], b = rooms[i0 + 1];
      if (b.isBoss) continue;
      const wa = wayPoint(a), wb = wayPoint(b);
      if (!wa || !wb) continue;
      // коридор копался: сперва по X, потом по Y — угол (b.x, a.y)
      const route = [wa, { x: wb.x, y: wa.y }, wb];
      // в дозор годятся только ходячие (турелям маршрут не по ногам)
      const pool = enemiesOfTier(1, Math.min(4, difficulty + 1)).filter(k2 => (ENEMIES[k2]?.speed || 0) > 0);
      patrol = { route, kinds: Array.from({ length: randInt(rand, 2, 3) }, () => pick(rand, pool)) };
      break;
    }
  }

  // --- декор: кровь на полу, колонны, светящиеся кристаллы, статуи, ловушки ---
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x;
      if (g[i] === T.DUNGEON_FLOOR) {
        const r = rand();
        if (r < 0.03) g[i] = T.BLOOD;                       // следы старых боёв
        else if (r < 0.045 && !nearTile(g, x, y, T.DUNGEON_EXIT)) g[i] = T.PILLAR; // обломки колонн
        else if (r < 0.062 && y < SIZE - 14) g[i] = T.TRAP; // лезвия под ногами (не у входа)
        else if (r < 0.082 && style === 'crypt') g[i] = T.BONES; // склеп устлан костями
        else if (r < 0.072 && style === 'mine') g[i] = T.RUBBLE; // осыпи в шахте
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
  // (декор тем мог занять клетку — перебираем кандидатов вокруг сундука)
  if (treasureRoom) {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) {
      const fx2 = treasureRoom.x + dx, fy2 = treasureRoom.y + dy;
      if (g[fy2 * SIZE + fx2] === T.DUNGEON_FLOOR) { g[fy2 * SIZE + fx2] = T.FOUNTAIN; break; }
    }
  }

  // лестница на нижний этаж — в комнате босса (глубина ограничена)
  if (withBoss && depth < 2) {
    const br = rooms.find(r => r.isBoss);
    if (br) {
      const sx = br.x, sy = br.y - br.h + 1;
      if (g[sy * SIZE + sx] === T.DUNGEON_FLOOR) g[sy * SIZE + sx] = T.STAIRS;
    }
  }

  // выход = вход (портал наружу)
  g[entrance.y * SIZE + entrance.x] = T.DUNGEON_EXIT;

  // ГАРАНТИЯ ПРОХОДИМОСТИ: декор (колонны, мебель, решётки) не смеет
  // перегораживать путь. BFS от входа сквозь декор — всё, через что
  // пришлось бы пройти к комнате, сносится в пол.
  repairConnectivity(g, entrance, rooms);

  return { size: SIZE, grid: g, rooms, entrance, seed, difficulty, depth, cursed, style, secret, plaques, patrol };
}

// декоративные преграды, которые можно снести ради прохода
const DECOR_SOLID = new Set([T.PILLAR, T.STATUE, T.TABLE, T.STALL, T.FENCE, T.CRYSTAL_WALL, T.WELL, T.BED, T.ANVIL,
  T.BARREL, T.CRATE, T.SACK, T.BARREL_FIRE, T.PLAQUE]);

function repairConnectivity(g, entrance, rooms) {
  const S = SIZE;
  // сначала честная проверка: если всё достижимо БЕЗ сноса — не трогаем декор
  const clean = t => !DECOR_SOLID.has(t) && !(t === T.DUNGEON_WALL || t === T.CRACKED_WALL || t === T.CHEST || t === T.OBELISK
    || t === T.DARK_ALTAR || t === T.MINE || t === T.TOWER || t === T.SHRINE);
  const cvis = new Uint8Array(S * S);
  cvis[entrance.y * S + entrance.x] = 1;
  const cq = [entrance.y * S + entrance.x];
  for (let qi = 0; qi < cq.length; qi++) {
    const i = cq[qi], x = i % S, y = (i / S) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1) continue;
      const ni = ny * S + nx;
      if (cvis[ni] || !clean(g[ni])) continue;
      cvis[ni] = 1; cq.push(ni);
    }
  }
  const stuck = rooms.some(r => {
    for (let y = r.y - r.h + 1; y <= r.y + r.h - 1; y++)
      for (let x = r.x - r.w + 1; x <= r.x + r.w - 1; x++)
        if (cvis[y * S + x]) return false;
    return true;
  });
  if (!stuck) return;

  const walkable = t => !(t === T.DUNGEON_WALL || t === T.CRACKED_WALL || t === T.CHEST || t === T.OBELISK
    || t === T.DARK_ALTAR || t === T.MINE || t === T.TOWER || t === T.SHRINE);
  // BFS: декор проходим, но помечаем родителя, чтобы потом вытоптать путь
  const parent = new Int32Array(S * S).fill(-1);
  const vis = new Uint8Array(S * S);
  const start = entrance.y * S + entrance.x;
  vis[start] = 1;
  const q = [start];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % S, y = (i / S) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= S - 1 || ny >= S - 1) continue;
      const ni = ny * S + nx;
      if (vis[ni] || !walkable(g[ni])) continue;
      vis[ni] = 1; parent[ni] = i;
      q.push(ni);
    }
  }
  for (const r of rooms) {
    // ищем достижимую клетку комнаты; декор на пути к ней — в щебень
    let cell = -1;
    outer: for (let y = r.y - r.h + 1; y <= r.y + r.h - 1; y++)
      for (let x = r.x - r.w + 1; x <= r.x + r.w - 1; x++)
        if (vis[y * S + x]) { cell = y * S + x; break outer; }
    for (let i = cell; i >= 0 && i !== start; i = parent[i])
      if (DECOR_SOLID.has(g[i])) g[i] = T.RUBBLE;
  }
}

// Арена-колизей: круглый зал для волновых боёв (отдельный инстанс)
export function generateArena() {
  const S = 40;
  const g = new Uint8Array(S * S).fill(T.DUNGEON_WALL);
  const C = S / 2, R = 16;
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++)
      if ((x - C) ** 2 + (y - C) ** 2 < R * R) g[y * S + x] = T.DUNGEON_FLOOR;
  // трибуны-статуи и светящиеся кристаллы по кругу
  for (let a = 0; a < 8; a++) {
    const sx = Math.round(C + Math.cos(a / 8 * Math.PI * 2) * (R - 2));
    const sy = Math.round(C + Math.sin(a / 8 * Math.PI * 2) * (R - 2));
    g[sy * S + sx] = a % 2 ? T.STATUE : T.CRYSTAL_WALL;
  }
  const entrance = { x: C, y: C + R - 3 };
  g[entrance.y * S + entrance.x] = T.DUNGEON_EXIT;
  return { size: S, grid: g, rooms: [], entrance, seed: 1, difficulty: 1, depth: 1, cursed: false, isArena: true };
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
