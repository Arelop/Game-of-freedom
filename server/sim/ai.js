// Мозги врагов по архетипам. Работают над сущностью e и картой map,
// возвращают массив «выстрелов» {pattern, x, y, aim, shotIndex} для game.js.
import { ENEMIES } from '../../shared/enemies.js';
import { moveWithCollision, dist2 } from '../../shared/simCore.js';

const AGGRO_R2 = 190 * 190;
const FORGET_R2 = 320 * 320;

export function updateEnemy(e, dt, map, players, rand) {
  const def = ENEMIES[e.kind];
  const shots = [];

  // цель — ближайший живой игрок
  let target = null, bestD = Infinity;
  for (const p of players) {
    if (p.dead || p.mapId !== e.mapId) continue;
    const d = dist2(e.x, e.y, p.x, p.y);
    if (d < bestD) { bestD = d; target = p; }
  }
  if (target && bestD < AGGRO_R2) e.aggro = true;
  if (!target || bestD > FORGET_R2) e.aggro = false;
  if (!e.aggro || !target) { wander(e, def, dt, map, rand); return shots; }

  const ang = Math.atan2(target.y - e.y, target.x - e.x);
  const dist = Math.sqrt(bestD);
  e.aim = ang;

  switch (def.archetype) {
    case 'chaser': {
      if (e.state === 'windup') {
        e.stateT -= dt;
        if (e.stateT <= 0) { e.state = 'lunge'; e.stateT = 0.35; e.lungeA = ang; }
      } else if (e.state === 'lunge') {
        e.stateT -= dt;
        moveWithCollision(e, Math.cos(e.lungeA) * def.lungeSpeed * dt, Math.sin(e.lungeA) * def.lungeSpeed * dt, def.radius, map);
        if (e.stateT <= 0) { e.state = 'chase'; e.cd = 0.8; }
      } else {
        e.cd = Math.max(0, (e.cd || 0) - dt);
        if (dist < def.lungeRange && e.cd <= 0) { e.state = 'windup'; e.stateT = def.lungeWindup; }
        else moveWithCollision(e, Math.cos(ang) * def.speed * dt, Math.sin(ang) * def.speed * dt, def.radius, map);
      }
      break;
    }
    case 'shooter': {
      const [minR, maxR] = def.preferRange;
      let mx = 0, my = 0;
      if (dist > maxR) { mx = Math.cos(ang); my = Math.sin(ang); }
      else if (dist < minR) { mx = -Math.cos(ang); my = -Math.sin(ang); }
      else { // стрейф по кругу
        const s = e.strafeDir || (e.strafeDir = rand() < 0.5 ? 1 : -1);
        mx = -Math.sin(ang) * s; my = Math.cos(ang) * s;
        if (rand() < 0.01) e.strafeDir = -s;
      }
      moveWithCollision(e, mx * def.speed * dt, my * def.speed * dt, def.radius, map);
      e.fireT = (e.fireT ?? def.fireInterval * rand()) - dt;
      if (e.fireT <= 0 && dist < 240) {
        e.fireT = def.fireInterval;
        shots.push({ pattern: def.pattern, aim: ang });
      }
      break;
    }
    case 'turret': {
      e.fireT = (e.fireT ?? def.fireInterval * rand()) - dt;
      if (e.fireT <= 0 && dist < 260) {
        e.fireT = def.fireInterval;
        e.shotIndex = (e.shotIndex || 0) + 1;
        shots.push({ pattern: def.pattern, aim: ang, shotIndex: e.shotIndex });
      }
      break;
    }
    case 'dasher': {
      if (e.state === 'windup') {
        e.stateT -= dt;
        if (e.stateT <= 0) { e.state = 'dash'; e.stateT = def.dashTime; }
      } else if (e.state === 'dash') {
        e.stateT -= dt;
        moveWithCollision(e, Math.cos(e.lungeA) * def.dashSpeed * dt, Math.sin(e.lungeA) * def.dashSpeed * dt, def.radius, map);
        if (e.stateT <= 0) { e.state = 'idle'; e.cd = 1.2; }
      } else {
        e.cd = Math.max(0, (e.cd || 0) - dt);
        moveWithCollision(e, Math.cos(ang + 0.5) * def.speed * dt, Math.sin(ang + 0.5) * def.speed * dt, def.radius, map);
        if (e.cd <= 0 && dist < 180) { e.state = 'windup'; e.stateT = def.dashWindup; e.lungeA = ang; }
      }
      break;
    }
    case 'boss': {
      const phase = def.phases.find(ph => e.hp / def.hp > ph.hpAbove) || def.phases[def.phases.length - 1];
      if (e.phase !== phase) { e.phase = phase; e.stepIdx = 0; e.stepT = 0; }
      e.stepT -= dt;
      const step = phase.steps[e.stepIdx % phase.steps.length];
      if (e.stepT <= 0) {
        e.stepT = step.interval;
        e.stepIdx++;
        e.shotIndex = (e.shotIndex || 0) + 1;
        shots.push({ pattern: step.pattern, aim: ang, shotIndex: e.shotIndex });
      }
      const mv = step.move === 'strafe'
        ? { x: -Math.sin(ang), y: Math.cos(ang) }
        : { x: Math.cos(ang), y: Math.sin(ang) };
      if (dist > 40 || step.move === 'strafe')
        moveWithCollision(e, mv.x * def.speed * dt, mv.y * def.speed * dt, def.radius, map);
      break;
    }
  }
  return shots;
}

function wander(e, def, dt, map, rand) {
  if (def.speed === 0) return;
  e.wanderT = (e.wanderT ?? 0) - dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + rand() * 2.5;
    e.wanderA = rand() * Math.PI * 2;
    e.wanderMove = rand() < 0.6;
  }
  if (e.wanderMove)
    moveWithCollision(e, Math.cos(e.wanderA) * def.speed * 0.4 * dt, Math.sin(e.wanderA) * def.speed * 0.4 * dt, def.radius, map);
}
