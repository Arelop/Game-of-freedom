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
  // спасённый пленник: безоружный, просто держится за спасителем
  if (npc.role === 'lostman') {
    if (!npc.owner) return;
    const owner = game.players.get(npc.owner);
    if (!owner || owner.mapId !== npc.mapId) return;
    const od = dist2(npc.x, npc.y, owner.x, owner.y);
    if (od > 200 * 200) { npc.x = owner.x + 12; npc.y = owner.y + 6; } // отстал — догоняет бегом
    else if (od > 34 * 34) walkTo(npc, owner.x, owner.y, NPC_SPEED * 1.4, dt, map);
    return;
  }
  // нежить-миньон некроманта (скелет/вурдалак/голем): рвётся в ближний бой,
  // держится хозяина в затишье; вурдалак лечится за убийства, голем крушит по площади
  if (npc.role === 'minion') {
    const owner = game.players.get(npc.owner);
    if (!owner || owner.mapId !== npc.mapId) return;
    const speed = (npc.golem ? GUARD_SPEED : GUARD_SPEED * (npc.fast ? 1.5 : 1.15));
    let target = null, bd = 260 * 260;
    for (const e of game.entities.values()) {
      if (e.entType !== 'enemy' || e.mapId !== npc.mapId) continue;
      const d = dist2(npc.x, npc.y, e.x, e.y);
      if (d < bd) { bd = d; target = e; }
    }
    if (target) {
      const ang = Math.atan2(target.y - npc.y, target.x - npc.x);
      npc.aim = ang;
      const reach = npc.golem ? 26 : 20;
      if (bd > reach * reach) walkTo(npc, target.x, target.y, speed, dt, map);
      npc.swingT = (npc.swingT ?? 0) - dt;
      if (bd <= (reach + 8) * (reach + 8) && npc.swingT <= 0) {
        npc.swingT = npc.fast ? 0.7 : 1.0;
        const before = target.hp;
        game.damageEnemy(target, npc.dmg || 3,
          { vx: Math.cos(ang), vy: Math.sin(ang), knockback: npc.golem ? 60 : 25, owner: npc.owner, school: 'melee' });
        game.fx({ t: 'swing', pid: npc.id, weapon: 'sword', x: npc.x, y: npc.y, aim: ang, range: reach, arc: 90 }, npc.mapId, npc.x, npc.y);
        // костяной голем: удар сотрясает землю — задевает соседей
        if (npc.golem) {
          for (const e of game.entities.values()) {
            if (e === target || e.entType !== 'enemy' || e.mapId !== npc.mapId) continue;
            if (dist2(target.x, target.y, e.x, e.y) > 30 * 30) continue;
            game.damageEnemy(e, Math.round((npc.dmg || 8) * 0.5), { vx: 0, vy: 0, knockback: 40, owner: npc.owner, school: 'melee' });
          }
        }
        // вурдалак: пожирая добычу, латает раны
        if (npc.ghoul && !game.entities.has(target.id) && npc.hp < npc.maxHp) {
          npc.hp = Math.min(npc.maxHp, npc.hp + 3);
          game.fx({ t: 'heal', pid: npc.id, x: npc.x, y: npc.y }, npc.mapId, npc.x, npc.y);
        }
        void before;
      }
      return;
    }
    const od = dist2(npc.x, npc.y, owner.x, owner.y);
    if (od > 200 * 200) { npc.x = owner.x + 14; npc.y = owner.y; }
    else if (od > 46 * 46) walkTo(npc, owner.x, owner.y, speed, dt, map);
    return;
  }

  // наёмник и призванный элементаль: следуют за хозяином, бьют врагов поблизости
  if (npc.role === 'mercenary' || npc.role === 'elemental') {
    const fiery = npc.role === 'elemental' && !npc.frost && !npc.holySpirit;
    const owner = game.players.get(npc.owner);
    if (!owner || owner.mapId !== npc.mapId) return; // ждёт хозяина
    let target = null, bd = 200 * 200;
    for (const e of game.entities.values()) {
      if (e.entType !== 'enemy' || e.mapId !== npc.mapId) continue;
      const d = dist2(npc.x, npc.y, e.x, e.y);
      if (d < bd) { bd = d; target = e; }
    }
    if (target) {
      const ang = Math.atan2(target.y - npc.y, target.x - npc.x);
      npc.aim = ang;
      if (bd > 60 * 60) walkTo(npc, target.x, target.y, GUARD_SPEED, dt, map);
      npc.fireT = (npc.fireT ?? 0.4) - dt;
      if (npc.fireT <= 0) {
        // «Пылающий дух»: заряженный талантом дух бьёт вдвое чаще
        npc.fireT = fiery ? 0.9 : npc.spirit2 ? 0.5 : 1.0;
        // характер призыва: огонь жжёт, лёд студит (метка!), свет лечит своих
        const shot = npc.frost ? { dmg: 2, weapon: 'froststaff', speed: 250, chill: { time: 2.5 }, slow: { mult: 0.65, time: 1.5 }, school: 'magic' }
          : npc.holySpirit ? { dmg: 2, weapon: 'lightstaff', speed: 250, holy: 1, school: 'magic',
            ignite: npc.spirit2 ? { time: 2, dmg: 1 } : undefined } // и его лучи жгут
          : fiery ? { dmg: 3, weapon: 'firestaff', speed: 240 } : {};
        game.npcShoot(npc, ang, shot);
      }
      return;
    }
    // дух-заступник в мирную минуту штопает раненых
    if (npc.holySpirit) {
      npc.healT = (npc.healT ?? 1) - dt;
      if (npc.healT <= 0) {
        npc.healT = 2;
        let worst = null, wf = 1;
        for (const q of game.players.values()) {
          if (q.dead || q.mapId !== npc.mapId) continue;
          if (dist2(npc.x, npc.y, q.x, q.y) > 130 * 130) continue;
          const f = q.hp / q.maxHp;
          if (f < wf) { wf = f; worst = q; }
        }
        if (worst && wf < 1) {
          worst.hp = Math.min(worst.maxHp, worst.hp + 1);
          game.fx({ t: 'heal', pid: worst.id, x: worst.x, y: worst.y }, npc.mapId, worst.x, worst.y);
          game.fx({ t: 'chain', pts: [[npc.x, npc.y - 6], [worst.x, worst.y]] }, npc.mapId, npc.x, npc.y);
        }
      }
    }
    const od = dist2(npc.x, npc.y, owner.x, owner.y);
    if (od > 160 * 160) { npc.x = owner.x + 14; npc.y = owner.y; } // отстал/застрял — догоняет бегом
    else if (od > 42 * 42) walkTo(npc, owner.x, owner.y, GUARD_SPEED * 1.2, dt, map);
    return;
  }

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
  if (!anchor) return;
  // личное место у якоря: жители не сбиваются в одну точку
  if (npc.spotA === undefined) {
    npc.spotA = game.rand() * Math.PI * 2;
    npc.spotR = 12 + game.rand() * 22;
  }
  const tx = anchor.x * TILE + 8 + Math.cos(npc.spotA) * npc.spotR;
  const ty = anchor.y * TILE + 8 + Math.sin(npc.spotA) * npc.spotR;
  if (dist2(npc.x, npc.y, tx, ty) > 18 * 18) {
    npc.strollX = null;
    walkTo(npc, tx, ty, NPC_SPEED, dt, map);
    return;
  }
  // на месте: постоять за делом, прогуляться по округе, сменить занятие
  npc.idleT = (npc.idleT ?? 0) - dt;
  if (npc.idleT <= 0) {
    npc.idleT = 2.5 + game.rand() * 4;
    const roll = game.rand();
    if (roll < 0.45) { // короткая прогулка рядом
      npc.strollX = tx + (game.rand() - 0.5) * 60;
      npc.strollY = ty + (game.rand() - 0.5) * 60;
    } else if (roll < 0.60) { // новое дело: другое рабочее место или прилавок
      const spots = [...(s.anchors.works || []), ...(s.anchors.stalls || [])];
      if (spots.length) npc.work = spots[Math.floor(game.rand() * spots.length)];
      npc.spotA = game.rand() * Math.PI * 2;
      npc.strollX = null;
    } else {
      npc.strollX = null; // просто постоять
    }
  }
  if (npc.strollX != null) walkTo(npc, npc.strollX, npc.strollY, NPC_SPEED * 0.5, dt, map);
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
    if (e.entType !== 'enemy' || e.mapId !== npc.mapId) continue;
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
