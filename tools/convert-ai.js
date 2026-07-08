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

// имя файла ChatGPT -> спрайт (строка = 16x16; объект задаёт размер)
const MAP = {
  'ChatGPT Image 8 июл. 2026 г., 04_33_19 (1).png': 'npc_captain',
  'ChatGPT Image 8 июл. 2026 г., 04_33_19 (2).png': 'npc_arena',
  'ChatGPT Image 8 июл. 2026 г., 04_33_19 (3).png': 'npc_elder2',
  'ChatGPT Image 8 июл. 2026 г., 04_33_20 (4).png': 'npc_smith',
  'ChatGPT Image 8 июл. 2026 г., 04_36_03 (1).png': 'npc_villager_sev',
  'ChatGPT Image 8 июл. 2026 г., 04_36_04 (2).png': 'npc_guard_sev',
  'ChatGPT Image 8 июл. 2026 г., 04_36_04 (3).png': 'npc_merchant_sev',
  'ChatGPT Image 8 июл. 2026 г., 04_38_23 (1).png': 'npc_villager_oz',
  'ChatGPT Image 8 июл. 2026 г., 04_38_23 (2).png': 'npc_guard_oz',
  'ChatGPT Image 8 июл. 2026 г., 04_38_23 (3).png': 'npc_merchant_oz',
  'ChatGPT Image 8 июл. 2026 г., 04_40_28 (1).png': { name: 'obj_tower', w: 16, h: 32 },
  'ChatGPT Image 8 июл. 2026 г., 04_40_29 (2).png': 'obj_yurt',
  'ChatGPT Image 8 июл. 2026 г., 04_40_29 (3).png': 'tile_wall_log',
  'ChatGPT Image 8 июл. 2026 г., 04_40_29 (4).png': 'tile_pier',
  'ChatGPT Image 8 июл. 2026 г., 04_41_50 (1).png': { name: 'enemy_ash_lord', w: 24, h: 24 },
  'ChatGPT Image 8 июл. 2026 г., 04_41_50 (2).png': 'obj_darkheart',
};

function isMagenta(r, g, b) { return r > 160 && b > 160 && g < Math.min(r, b) - 60; }

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
