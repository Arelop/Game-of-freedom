// Сидируемый PRNG (mulberry32) и хэш для детерминизма мира и паттернов.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(seed, x, y) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x * 374761393), 668265263);
  h = Math.imul(h ^ (y * 1274126177), 2246822519);
  h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return h >>> 0;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
export function randRange(rand, a, b) { return a + rand() * (b - a); }
export function randInt(rand, a, b) { return a + Math.floor(rand() * (b - a + 1)); }
