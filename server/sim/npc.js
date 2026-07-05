// Поведение NPC в горячей зоне: распорядок дня, стража, торговец, бегство.
// NPC — сущности { id, kind:'npc', role, x, y, home (поселение), anchor... }.
import { TILE } from '../../shared/constants.js';
import { moveWithCollision, dist2 } from '../../shared/simCore.js';
import { isHostileToPlayer } from './factions.js';

const NPC_SPEED = 40;
const GUARD_SPEED = 60;

// Куда NPC хочет по времени суток (t: 0..1, 0=полночь)
function scheduleAnchor(npc, s, t) {
  if (npc.role === 'guard') return null;       // стража патрулирует всегда
  if (npc.role === 'merchant') {
    if (t > 0.28 && t < 0.75) return s.anchors.stalls[0] || s.anchors.fire;
    return npc.bed;
  }
  if (t < 0.27 || t > 0.9) return npc.bed;                     // ночь — сон
  if (t < 0.72) return npc.work || s.anchors.works[0];         // день — работа
  return s.anchors.fire;                                       // вечер — костёр
}

export function updateNpc(npc, dt, map, game) {
  const s = game.world.settlements.find(x => x.id === npc.home);
  if (!s) return;

  // опасность: враги рядом или враждебный игрок
  const danger = findDanger(npc, game);
  if (npc.role === 'guard') {
    if (danger) {
      const ang = Math.atan2(danger.y - npc.y, danger.x - npc.x);
      const d2 = dist2(npc.x, npc.y, danger.x, danger.y);
      npc.aim = ang;
      if (d2 > 30 * 30)
        moveWithCollision(npc, Math.cos(ang) * GUARD_SPEED * dt, Math.sin(ang) * GUARD_SPEED * dt, 5, map);
      npc.fireT = (npc.fireT ?? 0.5) - dt;
      if (npc.fireT <= 0 && d2 < 200 * 200) {
        npc.fireT = 1.2;
        game.npcShoot(npc, ang);
      }
      return;
    }
    // патруль вокруг центра
    npc.patrolT = (npc.patrolT ?? 0) - dt;
    if (npc.patrolT <= 0) {
      npc.patrolT = 3 + game.rand() * 4;
      const a = game.rand() * Math.PI * 2;
      npc.tx = s.x * TILE + Math.cos(a) * 100;
      npc.ty = s.y * TILE + Math.sin(a) * 100;
    }
    walkTo(npc, npc.tx, npc.ty, GUARD_SPEED * 0.6, dt, map);
    return;
  }

  if (danger) { // жители убегают от опасности к колодцу/дому
    const ang = Math.atan2(npc.y - danger.y, npc.x - danger.x);
    moveWithCollision(npc, Math.cos(ang) * NPC_SPEED * 1.6 * dt, Math.sin(ang) * NPC_SPEED * 1.6 * dt, 5, map);
    npc.fleeing = true;
    return;
  }
  npc.fleeing = false;

  const anchor = scheduleAnchor(npc, s, game.world.time);
  if (anchor) walkTo(npc, anchor.x * TILE + 8, anchor.y * TILE + 8, NPC_SPEED, dt, map);
}

function walkTo(npc, tx, ty, speed, dt, map) {
  const dx = tx - npc.x, dy = ty - npc.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) return;
  let ang = Math.atan2(dy, dx);
  // обход препятствий: если упёрлись — вильнуть
  const ox = npc.x, oy = npc.y;
  moveWithCollision(npc, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, 5, map);
  if (Math.abs(npc.x - ox) < 0.01 && Math.abs(npc.y - oy) < 0.01) {
    npc.dodge = (npc.dodge || 1) * (Math.random() < 0.02 ? -1 : 1);
    ang += 1.1 * npc.dodge;
    moveWithCollision(npc, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, 5, map);
  }
  npc.aim = ang;
}

function findDanger(npc, game) {
  let best = null, bestD = 150 * 150;
  for (const e of game.entities.values()) {
    if (e.kind !== 'enemy' || e.mapId !== npc.mapId) continue;
    const d = dist2(npc.x, npc.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  // враждебные игроки (низкая репутация или недавно атаковали фракцию)
  const s = game.world.settlements.find(x => x.id === npc.home);
  for (const p of game.players.values()) {
    if (p.dead || p.mapId !== npc.mapId) continue;
    if (!isHostileToPlayer(s.faction, p.rep) && !p.aggroFactions?.has(s.faction)) continue;
    const d = dist2(npc.x, npc.y, p.x, p.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
