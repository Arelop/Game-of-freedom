// Выжженные земли: вулканический регион за обсидиановым порталом.
// Отдельный инстанс 160×160 (5×5 чанков): пепельные пустоши, лавовые озёра,
// обсидиановые гряды, тлеющие жилы кристалла, лагерь огнеходцев на юге
// и логово големов на севере. Финальный босс региона придёт позже —
// его трон уже стоит пустым.
import { T } from '../../shared/constants.js';
import { mulberry32, hash2, randInt } from '../../shared/rng.js';

export const ASH_SIZE = 160;

export function generateAshlands(seed) {
  const S = ASH_SIZE;
  const rand = mulberry32(hash2(seed, 666, 13));
  const g = new Uint8Array(S * S).fill(T.ASH);
  const idx = (x, y) => y * S + x;
  const inB = (x, y) => x > 1 && y > 1 && x < S - 2 && y < S - 2;

  // рваная обсидиановая кромка мира
  for (let i = 0; i < S; i++) {
    const w1 = 2 + (hash2(seed, i, 1) % 3), w2 = 2 + (hash2(seed, i, 2) % 3);
    const w3 = 2 + (hash2(seed, i, 3) % 3), w4 = 2 + (hash2(seed, i, 4) % 3);
    for (let k = 0; k < w1; k++) g[idx(i, k)] = T.OBSIDIAN;
    for (let k = 0; k < w2; k++) g[idx(i, S - 1 - k)] = T.OBSIDIAN;
    for (let k = 0; k < w3; k++) g[idx(k, i)] = T.OBSIDIAN;
    for (let k = 0; k < w4; k++) g[idx(S - 1 - k, i)] = T.OBSIDIAN;
  }

  const camp = { x: 80, y: 138 };           // лагерь огнеходцев (юг)
  const lair = { x: 80, y: 26 };            // логово големов (север)
  const farFromCamp = (x, y, r) => (x - camp.x) ** 2 + (y - camp.y) ** 2 > r * r;

  // лавовые озёра: кляксы из слипшихся кругов
  for (let L = 0; L < 11; L++) {
    const cx = randInt(rand, 14, S - 14), cy = randInt(rand, 14, S - 44);
    if (!farFromCamp(cx, cy, 26)) continue;
    for (let b = 0; b < 4; b++) {
      const bx = cx + randInt(rand, -6, 6), by = cy + randInt(rand, -6, 6);
      const r = randInt(rand, 3, 6);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r && inB(bx + x, by + y) && farFromCamp(bx + x, by + y, 18))
          g[idx(bx + x, by + y)] = T.LAVA;
    }
  }

  // обсидиановые гряды: ломаные хребты, формируют коридоры боя
  for (let R = 0; R < 16; R++) {
    let x = randInt(rand, 10, S - 10), y = randInt(rand, 10, S - 40);
    let dir = rand() * Math.PI * 2;
    const len = randInt(rand, 8, 22);
    for (let i = 0; i < len; i++) {
      if (inB(x, y) && farFromCamp(x, y, 20) && g[idx(x, y)] === T.ASH) {
        g[idx(x, y)] = T.OBSIDIAN;
        if (rand() < 0.5 && inB(x + 1, y)) g[idx(x + 1, y)] = T.OBSIDIAN;
      }
      dir += (rand() - 0.5) * 0.9;
      x += Math.round(Math.cos(dir)); y += Math.round(Math.sin(dir));
    }
  }

  // обугленные деревья и жилы тлеющего кристалла
  for (let i = 0; i < 240; i++) {
    const x = randInt(rand, 4, S - 4), y = randInt(rand, 4, S - 4);
    if (g[idx(x, y)] !== T.ASH || !farFromCamp(x, y, 14)) continue;
    g[idx(x, y)] = rand() < 0.82 ? T.BURNT_TREE : T.EMBER;
  }

  // ---- логово големов: кольцо обсидиана с проходом, сундук ордена, пустой трон ----
  for (let a = 0; a < 40; a++) {
    const ang = a / 40 * Math.PI * 2;
    if (ang > Math.PI * 0.4 && ang < Math.PI * 0.6) continue; // проход с юга
    const x = lair.x + Math.round(Math.cos(ang) * 11);
    const y = lair.y + Math.round(Math.sin(ang) * 8);
    if (inB(x, y)) g[idx(x, y)] = T.OBSIDIAN;
  }
  for (let y = -7; y <= 7; y++) for (let x = -10; x <= 10; x++)
    if (g[idx(lair.x + x, lair.y + y)] === T.LAVA) g[idx(lair.x + x, lair.y + y)] = T.ASH;
  g[idx(lair.x, lair.y - 4)] = T.CHEST;       // сундук ордена — раз на мир
  g[idx(lair.x - 3, lair.y - 4)] = T.STATUE;  // пустой трон грядущего владыки
  g[idx(lair.x + 3, lair.y - 4)] = T.STATUE;
  g[idx(lair.x, lair.y - 6)] = T.PILLAR;

  // ---- лагерь огнеходцев: безопасная поляна ----
  for (let y = -9; y <= 9; y++) for (let x = -11; x <= 11; x++) {
    const t = g[idx(camp.x + x, camp.y + y)];
    if (t === T.LAVA || t === T.OBSIDIAN || t === T.BURNT_TREE) g[idx(camp.x + x, camp.y + y)] = T.ASH;
  }
  // частокол с проёмами на север и юг
  for (let a = 0; a < 44; a++) {
    const ang = a / 44 * Math.PI * 2;
    if (Math.abs(Math.sin(ang)) > 0.92) continue; // проходы
    const x = camp.x + Math.round(Math.cos(ang) * 10);
    const y = camp.y + Math.round(Math.sin(ang) * 7);
    if (inB(x, y)) g[idx(x, y)] = T.FENCE;
  }
  g[idx(camp.x, camp.y)] = T.CAMPFIRE;
  g[idx(camp.x - 4, camp.y - 2)] = T.STALL;   // прилавок торговца
  g[idx(camp.x + 4, camp.y - 2)] = T.TABLE;   // стол зачарователя
  g[idx(camp.x - 3, camp.y + 3)] = T.BED;     // отдых путника
  g[idx(camp.x + 4, camp.y + 3)] = T.ANVIL;

  // обсидиановый портал домой — южный проём лагеря
  const entrance = { x: camp.x, y: camp.y + 9 };
  g[idx(entrance.x, entrance.y)] = T.PORTAL;

  return {
    size: S, grid: g, rooms: [], entrance, camp, lair,
    seed, difficulty: 5, depth: 1, cursed: false, isAsh: true,
  };
}
