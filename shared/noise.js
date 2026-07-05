// Автономный 2D value-noise с fBm — без зависимостей, детерминирован от seed.
import { hash2 } from './rng.js';

function smooth(t) { return t * t * (3 - 2 * t); }

export function valueNoise2(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(seed, xi, yi) / 4294967296;
  const v10 = hash2(seed, xi + 1, yi) / 4294967296;
  const v01 = hash2(seed, xi, yi + 1) / 4294967296;
  const v11 = hash2(seed, xi + 1, yi + 1) / 4294967296;
  const u = smooth(xf), v = smooth(yf);
  const a = v00 + (v10 - v00) * u;
  const b = v01 + (v11 - v01) * u;
  return a + (b - a) * v; // 0..1
}

export function fbm2(seed, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(seed + i * 1013, x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm; // 0..1
}
