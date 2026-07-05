// Входная точка: HTTP-статика + WebSocket + игровой цикл 30 Гц.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { TICK_RATE } from '../shared/constants.js';
import { Game } from './game.js';
import { Net } from './net.js';
import { saveWorld, loadWorld, applySavedPlayer } from './persist.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8080);
const SEED = +(process.env.SEED || 1337);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
};

const http = createServer(async (req, res) => {
  let url = (req.url || '/').split('?')[0];
  if (url === '/') url = '/client/index.html';
  const file = normalize(join(ROOT, url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
});

const game = new Game(SEED);
loadWorld(game);
const _addPlayer = game.addPlayer.bind(game);
game.addPlayer = (...args) => {
  const p = _addPlayer(...args);
  applySavedPlayer(game, p);
  return p;
};

const net = new Net(game, http);

// цикл с коррекцией дрейфа
const TICK_MS = 1000 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  let steps = 0;
  while (acc >= TICK_MS && steps < 5) {
    const t0 = performance.now();
    game.step();
    net.broadcast();
    game.pendingFx.length = 0;   // события разосланы — можно очищать
    acc -= TICK_MS;
    steps++;
    const el = performance.now() - t0;
    if (el > TICK_MS) console.warn(`[tick] перегруз: ${el.toFixed(1)} мс (сущностей: ${game.entities.size})`);
  }
  if (steps === 5) acc = 0; // спираль смерти — сброс
}, TICK_MS / 2);

setInterval(() => saveWorld(game), 60000);
process.on('SIGINT', () => { saveWorld(game); process.exit(0); });

http.listen(PORT, () => {
  console.log(`\n=== ПОГРАНИЧЬЕ — кооп-шутер ===`);
  console.log(`Локально:  http://localhost:${PORT}`);
  for (const [name, addrs] of Object.entries(networkInterfaces()))
    for (const a of addrs || [])
      if (a.family === 'IPv4' && !a.internal)
        console.log(`По сети:   http://${a.address}:${PORT}  (${name})`);
  console.log(`Seed: ${SEED}. Ctrl+C — сохранить и выйти.\n`);
});
