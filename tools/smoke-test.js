// Смоук-тест: поднимает сервер, подключает 2 ws-ботов, 8 секунд синтетики.
// Проверяет: снапшоты идут, позиция меняется, выстрелы доходят, чистый выход.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;

const server = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT, SEED: 4242 },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; console.error('[server]', String(d).trim()); });

const fail = msg => { console.error('FAIL:', msg); console.error(serverLog.slice(-2000)); cleanup(1); };
const cleanup = code => { server.kill(); process.exit(code); };

await new Promise(r => setTimeout(r, 1500));

function makeBot(name) {
  const bot = {
    name, ws: new WebSocket(`ws://localhost:${PORT}`),
    snaps: 0, shots: 0, welcome: null, firstPos: null, lastPos: null, seq: 0,
  };
  bot.ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') bot.welcome = m;
    if (m.t === 'batch') {
      for (const msg of m.msgs) {
        if (msg.t === 'snap') {
          bot.snaps++;
          if (!bot.firstPos) bot.firstPos = { x: msg.you.x, y: msg.you.y };
          bot.lastPos = { x: msg.you.x, y: msg.you.y };
        }
        if (msg.t === 'shot' || msg.t === 'swing') bot.shots++;
      }
    }
  });
  bot.ws.on('open', () => bot.ws.send(JSON.stringify({ t: 'join', name })));
  return bot;
}

const b1 = makeBot('Бот-1');
const b2 = makeBot('Бот-2');
await new Promise(r => setTimeout(r, 800));

if (!b1.welcome || !b2.welcome) fail('welcome не получен');
if (!b1.welcome.mapInfo.settlements.length) fail('в мире нет поселений');
console.log(`ok: welcome, поселений: ${b1.welcome.mapInfo.settlements.length}, POI: ${b1.welcome.mapInfo.pois.length}`);

// бот-1 берёт лук (слот 1) — проверяем сетевую передачу снарядов
b1.ws.send(JSON.stringify({ t: 'switchWeapon', slot: 1 }));

// бот-1 бежит вправо и стреляет, бот-2 стоит
const timer = setInterval(() => {
  for (let i = 0; i < 4; i++) {
    b1.seq++;
    b1.ws.send(JSON.stringify({ t: 'input', seq: b1.seq, dt: 1 / 60, mx: 1, my: 0, aim: 0, fire: b1.seq % 20 === 0, roll: b1.seq % 90 === 0 }));
  }
  b1.ws.send(JSON.stringify({ t: 'chunkReq', cx: 3, cy: 4 }));
}, 66);

await new Promise(r => setTimeout(r, 8000));
clearInterval(timer);

if (b1.snaps < 60) fail(`мало снапшотов у бота-1: ${b1.snaps}`);
if (b2.snaps < 60) fail(`мало снапшотов у бота-2: ${b2.snaps}`);
const moved = Math.hypot(b1.lastPos.x - b1.firstPos.x, b1.lastPos.y - b1.firstPos.y);
if (moved < 100) fail(`бот-1 почти не сдвинулся: ${moved.toFixed(1)} px`);
if (b2.shots < 3) fail(`бот-2 не видел выстрелов бота-1: ${b2.shots}`);
if (/перегруз/.test(serverLog)) console.warn('warn: были перегрузы тика');
if (/Error|TypeError|ReferenceError/.test(serverLog)) fail('ошибки в логе сервера');

console.log(`ok: снапшоты ${b1.snaps}/${b2.snaps}, движение ${moved.toFixed(0)} px, выстрелов увидено: ${b2.shots}`);
b1.ws.close(); b2.ws.close();
await new Promise(r => setTimeout(r, 300));
console.log('СМОУК-ТЕСТ ПРОЙДЕН');
cleanup(0);
