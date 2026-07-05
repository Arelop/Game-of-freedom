// Юнит-тесты детерминизма и базовой математики.
import { test } from 'node:test';
import assert from 'node:assert';
import { mulberry32, hash2 } from '../shared/rng.js';
import { fbm2 } from '../shared/noise.js';
import { rleEncode, rleDecode } from '../shared/protocol.js';
import { emitDirections, PATTERNS } from '../shared/patterns.js';
import { makePlayerState, stepPlayer, circleHitsSolid } from '../shared/simCore.js';
import { baseTile } from '../server/world/worldgen.js';
import { generateDungeon } from '../server/world/dungeon.js';

test('rng детерминирован', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a(), b());
  assert.strictEqual(hash2(1, 5, 7), hash2(1, 5, 7));
  assert.notStrictEqual(hash2(1, 5, 7), hash2(2, 5, 7));
});

test('шум детерминирован и в диапазоне', () => {
  for (let i = 0; i < 50; i++) {
    const v = fbm2(123, i * 0.7, i * 1.3);
    assert.ok(v >= 0 && v <= 1);
    assert.strictEqual(v, fbm2(123, i * 0.7, i * 1.3));
  }
});

test('мир детерминирован от seed', () => {
  for (let i = 0; i < 200; i++) {
    const x = (i * 37) % 512, y = (i * 91) % 512;
    assert.strictEqual(baseTile(999, x, y), baseTile(999, x, y));
  }
});

test('RLE круговой', () => {
  const arr = new Uint8Array(1024);
  for (let i = 0; i < arr.length; i++) arr[i] = i < 500 ? 3 : (i % 7 === 0 ? 10 : 3);
  const rle = rleEncode(Array.from(arr));
  const back = rleDecode(rle, 1024);
  assert.deepStrictEqual(Array.from(back), Array.from(arr));
});

test('паттерны пуль детерминированы', () => {
  for (const [name, pat] of Object.entries(PATTERNS)) {
    const d1 = emitDirections(pat, 1.2, 5, 777);
    const d2 = emitDirections(pat, 1.2, 5, 777);
    assert.deepStrictEqual(d1, d2, name);
    assert.ok(d1.length >= 1);
  }
});

test('движение игрока и коллизии', () => {
  const solid = new Set(['5,3']);
  const map = { isSolid: (x, y) => solid.has(x + ',' + y), isBulletSolid: () => false };
  const p = makePlayerState(40, 56); // тайл (2,3)
  for (let i = 0; i < 60; i++) stepPlayer(p, { mx: 1, my: 0, aim: 0, roll: false }, 1 / 60, map);
  // должен упереться в тайл (5,3) = x: 80..96, радиус 5 -> x < 75.01
  assert.ok(p.x > 70 && p.x < 76, `упёрся в стену: x=${p.x.toFixed(1)}`);
  assert.ok(circleHitsSolid(80, 56, 5, map));
});

test('перекат даёт скорость и кулдаун', () => {
  const map = { isSolid: () => false, isBulletSolid: () => false };
  const p = makePlayerState(0, 0);
  stepPlayer(p, { mx: 1, my: 0, aim: 0, roll: true }, 1 / 60, map);
  assert.ok(p.rollT > 0, 'перекат начался');
  const x1 = p.x;
  for (let i = 0; i < 20; i++) stepPlayer(p, { mx: 0, my: 0, aim: 0, roll: false }, 1 / 60, map);
  assert.ok(p.x > x1 + 20, 'перекат несёт вперёд');
});

test('данж генерируется и проходим', () => {
  const d = generateDungeon(555, 2, true);
  assert.ok(d.rooms.length >= 4);
  assert.ok(d.rooms.some(r => r.isBoss));
  assert.ok(d.rooms.some(r => r.isTreasure));
  const d2 = generateDungeon(555, 2, true);
  assert.deepStrictEqual(Array.from(d.grid), Array.from(d2.grid), 'детерминирован');
});
