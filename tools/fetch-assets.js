// Скачивает CC0-паки Kenney в assets/raw/. Любая ошибка нефатальна —
// недостающие спрайты догенерирует tools/gen-sprites.js через build-atlas.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets', 'raw');

const PACKS = [
  {
    name: 'tiny-dungeon',
    url: 'https://kenney.nl/media/pages/assets/tiny-dungeon/f8422efb44-1674742415/kenney_tiny-dungeon.zip',
  },
  {
    name: 'tiny-town',
    url: 'https://kenney.nl/media/pages/assets/tiny-town/a415fbeb49-1735736916/kenney_tiny-town.zip',
  },
  {
    name: 'pixel-shmup',
    url: 'https://kenney.nl/media/pages/assets/pixel-shmup/640246b9cc-1677495782/kenney_pixel-shmup.zip',
  },
  {
    name: 'roguelike-rpg',
    url: 'https://kenney.nl/media/pages/assets/roguelike-rpg-pack/12c03cd78b-1677697420/kenney_roguelike-rpg-pack.zip',
  },
  {
    name: 'roguelike-chars',
    url: 'https://kenney.nl/media/pages/assets/roguelike-characters/53ffff4133-1729196490/kenney_roguelike-characters.zip',
  },
  {
    name: 'roguelike-caves',
    url: 'https://kenney.nl/media/pages/assets/roguelike-caves-dungeons/5195ceb8ca-1677694831/kenney_roguelike-caves-dungeons.zip',
  },
  { // Dungeon Crawl Stone Soup tiles — CC0, тысячи предметов и монстров 32x32
    name: 'crawl-tiles',
    url: 'https://opengameart.org/sites/default/files/crawl-tiles%20Oct-5-2010.zip',
  },
];

mkdirSync(RAW, { recursive: true });
let ok = 0, failed = [];

for (const pack of PACKS) {
  const dir = join(RAW, pack.name);
  if (existsSync(join(dir, '.done'))) { ok++; console.log(`[skip] ${pack.name} уже скачан`); continue; }
  try {
    console.log(`[get ] ${pack.name} <- ${pack.url}`);
    const res = await fetch(pack.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    zip.extractAllTo(dir, true);
    writeFileSync(join(dir, '.done'), new Date().toISOString());
    ok++;
    console.log(`[ ok ] ${pack.name} (${(buf.length / 1024).toFixed(0)} КБ)`);
  } catch (e) {
    failed.push(pack.name);
    console.warn(`[fail] ${pack.name}: ${e.message} — будет процедурный фолбэк`);
  }
}

console.log(`\nГотово: ${ok}/${PACKS.length} паков.` + (failed.length ? ` Фолбэк для: ${failed.join(', ')}` : ''));
