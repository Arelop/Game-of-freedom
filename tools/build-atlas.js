// Собирает assets/atlas.png + atlas.json из манифеста.
// Источник каждого спрайта: пак Kenney (тайл 16x16) или процедурный генератор.
// Если файл пака отсутствует — молча падаем на процедурный аналог (если задан
// в PROC_FALLBACK) или на пурпурную заглушку, но сборка всегда успешна.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { genSprite } from './gen-sprites.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets', 'manifest.json'), 'utf8'));

// Фолбэки для спрайтов из паков, если пак не скачался
const PROC_FALLBACK = {
  tile_grass: ['sand'], player_0: null, // null -> заглушка
};

const packs = {};
for (const [key, rel] of Object.entries(manifest.packs)) {
  const p = join(ROOT, rel);
  if (existsSync(p)) packs[key] = PNG.sync.read(readFileSync(p));
  else console.warn(`[warn] пак ${key} (${rel}) не найден — процедурный фолбэк`);
}

function extract(pack, tx, ty, tw = 1, th = 1) {
  const w = tw * 16, h = th * 16;
  const out = { w, h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((ty * 16 + y) * pack.width + (tx * 16 + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = pack.data[si]; out.data[di + 1] = pack.data[si + 1];
      out.data[di + 2] = pack.data[si + 2]; out.data[di + 3] = pack.data[si + 3];
    }
  }
  return out;
}

function placeholder() {
  const s = { w: 16, h: 16, data: new Uint8Array(16 * 16 * 4) };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const on = ((x >> 2) + (y >> 2)) % 2;
    s.data[i] = on ? 255 : 0; s.data[i + 2] = on ? 255 : 0; s.data[i + 3] = 255;
  }
  return s;
}

// Собираем все спрайты
const sprites = [];
for (const [name, spec] of Object.entries(manifest.sprites)) {
  let img;
  try {
    if (spec.proc) {
      img = genSprite(spec.proc, spec.args);
    } else if (packs[spec.pack]) {
      img = extract(packs[spec.pack], spec.tx, spec.ty, spec.tw || 1, spec.th || 1);
    } else {
      const fb = PROC_FALLBACK[name];
      img = fb ? genSprite(fb[0], fb[1]) : placeholder();
    }
  } catch (e) {
    console.warn(`[warn] ${name}: ${e.message} — заглушка`);
    img = placeholder();
  }
  sprites.push({ name, img });
}

// Простая shelf-упаковка: сортируем по высоте, кладём рядами в ширину 256
const ATLAS_W = 256;
sprites.sort((a, b) => b.img.h - a.img.h || b.img.w - a.img.w);
let cx = 0, cy = 0, rowH = 0;
const placed = {};
for (const sp of sprites) {
  const { w, h } = sp.img;
  if (cx + w > ATLAS_W) { cx = 0; cy += rowH + 1; rowH = 0; }
  placed[sp.name] = { x: cx, y: cy, w, h };
  sp.x = cx; sp.y = cy;
  cx += w + 1;
  rowH = Math.max(rowH, h);
}
const ATLAS_H = cy + rowH + 1;

const atlas = new PNG({ width: ATLAS_W, height: ATLAS_H });
for (const sp of sprites) {
  const { img } = sp;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const si = (y * img.w + x) * 4;
    const di = ((sp.y + y) * ATLAS_W + (sp.x + x)) * 4;
    atlas.data[di] = img.data[si]; atlas.data[di + 1] = img.data[si + 1];
    atlas.data[di + 2] = img.data[si + 2]; atlas.data[di + 3] = img.data[si + 3];
  }
}

mkdirSync(join(ROOT, 'assets'), { recursive: true });
writeFileSync(join(ROOT, 'assets', 'atlas.png'), PNG.sync.write(atlas));
writeFileSync(join(ROOT, 'assets', 'atlas.json'), JSON.stringify(placed));
console.log(`Атлас: ${sprites.length} спрайтов, ${ATLAS_W}x${ATLAS_H} px -> assets/atlas.png`);
