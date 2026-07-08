// Нарезка VFX-паков (CC0, OpenGameArt) в кадры для атласа:
//   assets/raw/vfx/** -> assets/raw/vfx/out/fx_*.png
// Источники: Pixelart Spells (DevWizard), Weapon Slash (CC0), M484 Explosion Set 2.
// Запуск: node tools/build-vfx.js && node tools/build-atlas.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VFX = join(ROOT, 'assets', 'raw', 'vfx');
const OUT = join(VFX, 'out');
mkdirSync(OUT, { recursive: true });

const save = (name, img) => {
  const png = new PNG({ width: img.w, height: img.h });
  png.data.set(img.data);
  writeFileSync(join(OUT, name + '.png'), PNG.sync.write(png));
};

const crop = (p, x0, y0, w, h) => {
  const out = { w, h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * p.width + x0 + x) * 4, di = (y * w + x) * 4;
    out.data[di] = p.data[si]; out.data[di+1] = p.data[si+1];
    out.data[di+2] = p.data[si+2]; out.data[di+3] = p.data[si+3];
  }
  return out;
};

// чёрный фон -> прозрачность (для листов на чёрном)
const unblack = img => {
  for (let i = 0; i < img.data.length; i += 4)
    if (img.data[i] + img.data[i+1] + img.data[i+2] < 36) img.data[i+3] = 0;
  return img;
};

// даунскейл nearest по центрам ячеек
const shrink = (img, W, H) => {
  const out = { w: W, h: H, data: new Uint8Array(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(img.w - 1, Math.floor((x + 0.5) * img.w / W));
    const sy = Math.min(img.h - 1, Math.floor((y + 0.5) * img.h / H));
    const si = (sy * img.w + sx) * 4, di = (y * W + x) * 4;
    out.data[di] = img.data[si]; out.data[di+1] = img.data[si+1];
    out.data[di+2] = img.data[si+2]; out.data[di+3] = img.data[si+3];
  }
  return out;
};

// ── M484: «шар → вспышка → искры», 8 кадров 30×30, ряды-цвета ──
{
  const m = PNG.sync.read(readFileSync(join(VFX, 'm484_explosions.png')));
  const rows = { boom: 238, poison: 274, blood: 310, dark: 346 };
  for (const [name, y0] of Object.entries(rows))
    for (let f = 0; f < 8; f++)
      save(`fx_${name}_${f}`, unblack(crop(m, 22 + f * 31, y0, 30, 30)));
}

// ── Weapon Slash (Classic/1): 6 кадров 126×150 → 34px ──
{
  for (let f = 0; f < 6; f++) {
    const p = PNG.sync.read(readFileSync(join(VFX, 'slash', 'Classic', '1', `Classic_0${f + 1}.png`)));
    save(`fx_slash_${f}`, shrink(crop(p, 0, 0, p.width, p.height), 34, 40));
  }
}

// ── Pixelart Spells: всплеск (лёд/вода) и огненный вихрь ──
{
  const splash = PNG.sync.read(readFileSync(join(VFX, 'Pixelart Spells', 'PNG Files', 'Splash.png')));
  for (let f = 0; f < 6; f++) save(`fx_splash_${f}`, crop(splash, f * 32, 0, 32, 32));
  const fb = PNG.sync.read(readFileSync(join(VFX, 'Pixelart Spells', 'PNG Files', 'Fireball.png')));
  for (let f = 0; f < 6; f++) save(`fx_fire_${f}`, crop(fb, f * 16, 0, 16, 16));
  const sparks = PNG.sync.read(readFileSync(join(VFX, 'Pixelart Spells', 'PNG Files', 'Magic Sparks.png')));
  for (let f = 0; f < 6; f++) save(`fx_spark_${f}`, crop(sparks, f * 16, 0, 16, 16));
}

console.log('VFX нарезаны -> assets/raw/vfx/out');
