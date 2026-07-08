// Конвейер ИИ-артов: «Generated arts for rpg»/*.png -> assets/raw/ai/<sprite>.png (16x16).
// Убирает маджента-фон, кропит по силуэту, даунскейлит nearest-ом по центрам ячеек.
// Маппинг файл->спрайт задаётся в MAP; новые арты — добавь строку и перезапусти:
//   node tools/convert-ai.js && node tools/build-atlas.js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Generated arts for rpg');
const OUT = join(ROOT, 'assets', 'raw', 'ai');

// имя файла ChatGPT -> спрайт (строка = 16x16; объект задаёт размер).
// Стиль v2 (14_0x): чистые крупные пиксели — уменьшаются без каши.
const MAP = {
  // из первой партии оставлены только удачные (детализованные не пережили 16px)
  'ChatGPT Image 8 июл. 2026 г., 04_40_29 (2).png': 'obj_yurt',
  'ChatGPT Image 8 июл. 2026 г., 04_41_50 (1).png': { name: 'enemy_ash_lord', w: 24, h: 24 },
  'ChatGPT Image 8 июл. 2026 г., 04_41_50 (2).png': 'obj_darkheart',
  // ═══ зеленокожие враги ═══
  'ChatGPT Image 8 июл. 2026 г., 14_04_59 (1).png': 'enemy_goblin',
  'ChatGPT Image 8 июл. 2026 г., 14_05_00 (2).png': 'enemy_hobgoblin',
  'ChatGPT Image 8 июл. 2026 г., 14_05_00 (3).png': 'enemy_orc_warrior',
  'ChatGPT Image 8 июл. 2026 г., 14_05_00 (4).png': 'enemy_demonologist',
  'ChatGPT Image 8 июл. 2026 г., 14_05_01 (5).png': 'enemy_gnoll',
  'ChatGPT Image 8 июл. 2026 г., 14_05_01 (6).png': 'enemy_orc_knight',
  'ChatGPT Image 8 июл. 2026 г., 14_05_02 (7).png': 'enemy_shieldbearer',
  'ChatGPT Image 8 июл. 2026 г., 14_05_02 (8).png': 'enemy_orc_warlord',
  'ChatGPT Image 8 июл. 2026 г., 14_05_03 (10).png': 'enemy_orc_priest',
  'ChatGPT Image 8 июл. 2026 г., 14_05_03 (9).png': { name: 'enemy_ogre', w: 18, h: 18 },
  // ═══ жители ═══
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (1).png': 'npc_villager_sev',
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (2).png': 'npc_hermit', // дед с косой — отшельник Радогост
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (3).png': 'npc_smith',
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (4).png': 'npc_merchant_sev',
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (5).png': 'npc_villager_oz',
  'ChatGPT Image 8 июл. 2026 г., 14_07_16 (6).png': 'npc_merchant_oz',
  'ChatGPT Image 8 июл. 2026 г., 14_07_17 (7).png': 'npc_widow',
  'ChatGPT Image 8 июл. 2026 г., 14_07_17 (8).png': 'npc_innkeeper',
  'ChatGPT Image 8 июл. 2026 г., 14_08_55.png': { name: 'obj_tower', w: 16, h: 32 },
  // ═══ классы игроков ═══
  'Thief.png': 'player_rogue',
  'Priest.png': 'player_priest',
  // ═══ монстры ═══
  'ChatGPT Image 8 июл. 2026 г., 16_59_45 (1).png': 'enemy_skeleton',
  'ChatGPT Image 8 июл. 2026 г., 16_59_45 (2).png': 'enemy_wolf',
  'ChatGPT Image 8 июл. 2026 г., 16_59_47 (3).png': 'enemy_dark_mage',
  'ChatGPT Image 8 июл. 2026 г., 16_59_48 (4).png': 'enemy_spider',
  'ChatGPT Image 8 июл. 2026 г., 16_59_50 (5).png': 'enemy_demon',
  'ChatGPT Image 8 июл. 2026 г., 16_59_52 (6).png': { name: 'enemy_boss', w: 20, h: 20 },
  'ChatGPT Image 8 июл. 2026 г., 16_59_54 (7).png': 'enemy_imp',
  'ChatGPT Image 8 июл. 2026 г., 16_59_55 (8).png': 'enemy_dark_knight',
  'ChatGPT Image 8 июл. 2026 г., 16_59_57 (9).png': 'enemy_spore',
  'ChatGPT Image 8 июл. 2026 г., 16_59_58 (10).png': { name: 'enemy_iron_troll', w: 18, h: 18 },
  // ═══ важные люди ═══
  'ChatGPT Image 8 июл. 2026 г., 17_18_00 (1).png': 'npc_elder2',       // король-старейшина
  'ChatGPT Image 8 июл. 2026 г., 17_18_00 (2).png': 'npc_wanderer',     // Мирослава в синем
  'ChatGPT Image 8 июл. 2026 г., 17_18_01 (3).png': 'npc_wizard',       // синий маг
  'ChatGPT Image 8 июл. 2026 г., 17_18_01 (4).png': 'npc_priest2',      // верховная жрица
  'ChatGPT Image 8 июл. 2026 г., 17_18_02 (5).png': 'npc_guard_sev',    // командир севера
  'ChatGPT Image 8 июл. 2026 г., 17_18_02 (6).png': 'npc_smith',        // кузнец с клинком
  'ChatGPT Image 8 июл. 2026 г., 17_18_02 (7).png': 'npc_darkscout',    // плут-наводчик (кампания)
  'ChatGPT Image 8 июл. 2026 г., 17_18_03 (8).png': 'npc_hunter2',      // охотник с луком
  'ChatGPT Image 8 июл. 2026 г., 17_18_03 (9).png': 'enemy_necromancer',// лич
  'ChatGPT Image 8 июл. 2026 г., 17_18_03 (10).png': 'npc_innkeeper',   // трактирщик
};

function isMagenta(r, g, b) { return r > 150 && b > 150 && g < Math.min(r, b) - 40; }

function convert(srcPath, outPath, W = 16, H = 16) {
  const p = PNG.sync.read(readFileSync(srcPath));
  // фон долой (+ подкрашенные маджентой кромки)
  for (let i = 0; i < p.data.length; i += 4)
    if (isMagenta(p.data[i], p.data[i + 1], p.data[i + 2])) p.data[i + 3] = 0;
  // рамка силуэта (у бесшовных тайлов — весь кадр)
  let x0 = p.width, y0 = p.height, x1 = 0, y1 = 0;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = Math.max(bw / W, bh / H);
  const ow = Math.max(1, Math.round(bw / scale)), oh = Math.max(1, Math.round(bh / scale));
  const o = new PNG({ width: W, height: H });
  const dx = Math.floor((W - ow) / 2), dy = H - oh; // прижать к «полу»
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    // выборка по центру ячейки — сохраняет контур толстых «фейк-пикселей»
    const sx = x0 + Math.min(bw - 1, Math.floor((x + 0.5) * scale));
    const sy = y0 + Math.min(bh - 1, Math.floor((y + 0.5) * scale));
    const si = (sy * p.width + sx) * 4, di = ((dy + y) * W + dx + x) * 4;
    if (p.data[si + 3] > 40) {
      o.data[di] = p.data[si]; o.data[di + 1] = p.data[si + 1];
      o.data[di + 2] = p.data[si + 2]; o.data[di + 3] = 255;
    }
  }
  writeFileSync(outPath, PNG.sync.write(o));
}

mkdirSync(OUT, { recursive: true });
let n = 0;
for (const [file, spec] of Object.entries(MAP)) {
  const src = join(SRC, file);
  if (!existsSync(src)) { console.warn(`[warn] нет файла: ${file}`); continue; }
  const { name, w, h } = typeof spec === 'string' ? { name: spec, w: 16, h: 16 } : spec;
  convert(src, join(OUT, name + '.png'), w, h);
  n++;
}
console.log(`Сконвертировано ИИ-артов: ${n} -> assets/raw/ai/`);
