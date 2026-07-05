// Декларативные эмиттеры пуль врагов. Детерминированы: (эмиттер, seed, время) -> пули.
// Сервер и клиент вызывают одно и то же и получают одинаковые пули.
import { mulberry32 } from './rng.js';

export const PATTERNS = {
  aimedSingle: { count: 1, arcDeg: 0, aim: 'atPlayer', speed: 130, proj: 'proj_orb', projRadius: 3, life: 3 },
  aimedTriple: { count: 3, arcDeg: 30, aim: 'atPlayer', speed: 120, proj: 'proj_orb', projRadius: 3, life: 3 },
  ring8: { count: 8, arcDeg: 360, aim: 'fixed', speed: 85, proj: 'proj_orb', projRadius: 3, life: 4 },
  ring12: { count: 12, arcDeg: 360, aim: 'fixed', speed: 75, proj: 'proj_orb', projRadius: 3, life: 4.5 },
  spiral: { count: 1, arcDeg: 0, aim: 'spiral', spiralDegPerShot: 23, speed: 95, proj: 'proj_orb', projRadius: 3, life: 4 },
  fan5: { count: 5, arcDeg: 70, aim: 'atPlayer', speed: 110, proj: 'proj_orb', projRadius: 3, life: 3.5 },
  burst3aimed: { count: 1, arcDeg: 0, aim: 'atPlayer', burst: 3, burstInterval: 0.11, speed: 150, proj: 'proj_orb', projRadius: 3, life: 3 },
  wideWave: { count: 9, arcDeg: 120, aim: 'atPlayer', speed: 90, proj: 'proj_orb', projRadius: 3, life: 4 },
};

// Выдаёт массив направлений (радианы) для одного «залпа» эмиттера.
// baseAngle — угол на игрока (или фиксированный), shotIndex — номер залпа (для спирали),
// jitterSeed — для воспроизводимого разброса.
export function emitDirections(pat, baseAngle, shotIndex, jitterSeed) {
  const dirs = [];
  const rand = mulberry32(jitterSeed >>> 0);
  if (pat.aim === 'spiral') {
    const a = (shotIndex * (pat.spiralDegPerShot || 20)) * Math.PI / 180;
    dirs.push(a);
    return dirs;
  }
  const arc = (pat.arcDeg || 0) * Math.PI / 180;
  const n = pat.count;
  for (let i = 0; i < n; i++) {
    let a;
    if (arc >= Math.PI * 1.99) {
      a = (i / n) * Math.PI * 2 + baseAngle;
    } else if (n === 1) {
      a = baseAngle + (rand() - 0.5) * arc;
    } else {
      a = baseAngle - arc / 2 + (i / (n - 1)) * arc;
    }
    dirs.push(a);
  }
  return dirs;
}
