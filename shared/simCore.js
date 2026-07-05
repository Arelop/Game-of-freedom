// Общее ядро симуляции: движение игрока, перекат, полёт пуль, коллизии с тайлами.
// Один и тот же код гоняет клиент (предсказание) и сервер (авторитет).
import {
  TILE, PLAYER_SPEED, PLAYER_RADIUS,
  ROLL_TIME, ROLL_IFRAMES, ROLL_COOLDOWN, ROLL_SPEED_MULT,
} from './constants.js';

// map: { isSolid(tx,ty), isBulletSolid(tx,ty) }

export function makePlayerState(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    aim: 0,
    rollT: 0,          // >0 — в перекате (осталось сек)
    rollCd: 0,
    rollDx: 0, rollDy: 0,
    hp: 6, hurtT: 0,   // время неуязвимости после урона
    fireCd: 0, reloadT: 0, mag: 0,
  };
}

export function isRolling(p) { return p.rollT > 0; }
export function hasIFrames(p) {
  return (p.rollT > ROLL_TIME - ROLL_IFRAMES && p.rollT > 0) || p.hurtT > 0;
}

// input: { mx, my (-1..1 движение), aim (рад), roll (bool) }
export function stepPlayer(p, input, dt, map) {
  p.rollCd = Math.max(0, p.rollCd - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.reloadT > 0) p.reloadT = Math.max(0, p.reloadT - dt);
  p.aim = input.aim;

  let dx = 0, dy = 0;
  if (p.rollT > 0) {
    p.rollT = Math.max(0, p.rollT - dt);
    dx = p.rollDx * PLAYER_SPEED * ROLL_SPEED_MULT * dt;
    dy = p.rollDy * PLAYER_SPEED * ROLL_SPEED_MULT * dt;
  } else {
    let mx = input.mx, my = input.my;
    const len = Math.hypot(mx, my);
    if (len > 1e-6) { mx /= Math.max(1, len); my /= Math.max(1, len); }
    if (input.roll && p.rollCd <= 0 && len > 1e-6) {
      p.rollT = ROLL_TIME;
      p.rollCd = ROLL_TIME + ROLL_COOLDOWN;
      p.rollDx = mx / len * Math.min(1, len) || mx;
      p.rollDy = my / len * Math.min(1, len) || my;
      const n = Math.hypot(p.rollDx, p.rollDy) || 1;
      p.rollDx /= n; p.rollDy /= n;
      dx = p.rollDx * PLAYER_SPEED * ROLL_SPEED_MULT * dt;
      dy = p.rollDy * PLAYER_SPEED * ROLL_SPEED_MULT * dt;
    } else {
      dx = mx * PLAYER_SPEED * dt;
      dy = my * PLAYER_SPEED * dt;
    }
  }
  moveWithCollision(p, dx, dy, PLAYER_RADIUS, map);
}

// Скользящая коллизия круга с сеткой тайлов: оси раздельно.
export function moveWithCollision(e, dx, dy, radius, map) {
  if (dx !== 0 && !circleHitsSolid(e.x + dx, e.y, radius, map)) e.x += dx;
  if (dy !== 0 && !circleHitsSolid(e.x, e.y + dy, radius, map)) e.y += dy;
}

export function circleHitsSolid(x, y, r, map) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.isSolid(tx, ty)) continue;
      // ближайшая точка тайла к центру круга
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const ddx = x - cx, ddy = y - cy;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  return false;
}

// Пуля: прямолинейный полёт; возвращает true если жива.
export function stepProjectile(pr, dt, map) {
  pr.life -= dt;
  if (pr.life <= 0) return false;
  const nx = pr.x + pr.vx * dt;
  const ny = pr.y + pr.vy * dt;
  const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
  if (map.isBulletSolid(tx, ty)) return false;
  pr.x = nx; pr.y = ny;
  return true;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function circlesOverlap(ax, ay, ar, bx, by, br) {
  return dist2(ax, ay, bx, by) < (ar + br) * (ar + br);
}
