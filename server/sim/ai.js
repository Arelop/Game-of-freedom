// Мозги врагов по архетипам. Работают над сущностью e и картой map,
// возвращают массив «выстрелов» {pattern, x, y, aim, shotIndex} для game.js.
import { ENEMIES } from '../../shared/enemies.js';
import { moveWithCollision, dist2 } from '../../shared/simCore.js';

const AGGRO_R2 = 190 * 190;
const FORGET_R2 = 320 * 320;

let flankSeq = 0; // чередование сторон обхода при фланкировании

// бесстрашные: нежить, конструкты, демоны и войско Тьмы не бегут от ран
const FEARLESS = new Set([
  'skeleton', 'ghoul', 'necromancer', 'golem', 'magmaGolem', 'fireElemental',
  'demon', 'imp', 'demonologist', 'gasSpore', 'mimic', 'turret', 'spiralTurret', 'dasher',
  'darkSoldier', 'darkArcher', 'darkMage', 'darkKnight', 'darkLord', 'heartKeeper',
]);

// npcs — жители/стража: монстры враждебны им так же, как игрокам
export function updateEnemy(e, dt, map, players, rand, npcs = []) {
  const def = ENEMIES[e.kind];
  const shots = [];

  // СТАГГЕР (слом стойкости): враг шатается, беззащитен — окно добивания
  if ((e.staggerT || 0) > 0) return shots;
  // стан (боевой клич, теневой рывок): полная заморозка мозгов.
  // Боссы и элита сопротивляются: стан тает для них в 4×/1.7× быстрее —
  // честный контроль тяжеловесов только через слом СТОЙКОСТИ
  if (e.stunT > 0) {
    e.stunT -= dt * (def.archetype === 'boss' ? 4 : e.elite ? 1.7 : 1);
    return shots;
  }

  // слепота (дымовое облако): не видит целей, бредёт наугад
  if (e.blindT > 0) e.blindT -= dt;

  // ═══ характеры рядовых (Боёвка 4.0, data-флаги в enemies.js) ═══
  // свирепеет при малом здоровье: быстрее бегает и замахивается
  if (def.berserkLowHp && !e.berserk && e.hp < e.maxHp * 0.3) {
    e.berserk = true;
    e.hasteF = (e.hasteF || 1) * 1.3;
    shots.push({ react: 'СВИРЕПЕЕТ!' });
  }
  // поднимает щит: периодический фронтальный блок (реюз shielded-математики)
  if (def.guardUp) {
    e.guardCd = (e.guardCd ?? 2 + rand() * 2) - dt;
    if ((e.guardT || 0) > 0) e.guardT -= dt;
    else if (e.guardCd <= 0) { e.guardT = 1.5; e.guardCd = 4 + rand() * 2; }
  }
  // вожак воет: стая рядом ускоряется (обрабатывает game.js)
  if (def.packHowl && e.aggro) {
    e.howlCd = (e.howlCd ?? 3 + rand() * 4) - dt;
    if (e.howlCd <= 0) { e.howlCd = 8; shots.push({ howl: true }); }
  }

  // замедление (лёд): множитель скорости, пока действует slowT
  let slowF = 1;
  if (e.slowT > 0) { e.slowT -= dt; slowF = e.slowMult || 0.65; }
  if (e.hasteF) slowF *= e.hasteF; // элита «Стремительный»
  if ((e.howlBuffT || 0) > 0) { e.howlBuffT -= dt; slowF *= 1.25; } // вой стаи
  e.slowF = slowF;

  // цель — ближайший игрок ИЛИ житель (игроки чуть приоритетнее);
  // невидимых (дымовая завеса) монстры не видят
  let target = null, bestD = Infinity;
  // охотник за головой: преследует ТОЛЬКО свою цель и не забывает её
  if (e.huntTarget) {
    const prey = players.find(p => p.id === e.huntTarget && !p.dead && p.mapId === e.mapId);
    if (prey) {
      e.aggro = true;
      const ang0 = Math.atan2(prey.y - e.y, prey.x - e.x);
      e.aim = ang0;
      return chaseTarget(e, def, prey, ang0, Math.sqrt(dist2(e.x, e.y, prey.x, prey.y)), dt, map, slowF, shots, rand);
    }
    wander(e, def, dt, map, rand);
    return shots;
  }
  // «Вызов» воина: пока действует, враг видит только танка
  if ((e.tauntT || 0) > 0) {
    e.tauntT -= dt;
    const tank = players.find(p => p.id === e.tauntBy && !p.dead && p.mapId === e.mapId);
    if (tank) { target = tank; bestD = dist2(e.x, e.y, tank.x, tank.y); e.aggro = true; }
  }
  if (!target && (e.blindT || 0) <= 0) for (const p of players) {
    if (p.dead || p.mapId !== e.mapId || p.invisT > 0) continue;
    const d = dist2(e.x, e.y, p.x, p.y);
    if (d < bestD) { bestD = d; target = p; }
  }
  if ((e.tauntT || 0) <= 0 && (e.blindT || 0) <= 0) for (const n of npcs) { // под «Вызовом» и в дыму NPC не видны
    if (n.mapId !== e.mapId) continue;
    // боевые призывы (элементаль, наёмник) ПРИТЯГИВАЮТ агро — работают танком;
    // мирных жителей монстры замечают неохотнее, чем игроков
    const mult = n.role === 'elemental' || n.role === 'mercenary' ? 0.6 : 1.3;
    const d = dist2(e.x, e.y, n.x, n.y) * mult;
    if (d < bestD) { bestD = d; target = n; }
  }
  if (target && bestD < AGGRO_R2) e.aggro = true;
  if (!target || bestD > FORGET_R2) e.aggro = false;
  if (!e.aggro || !target) { wander(e, def, dt, map, rand); return shots; }

  const ang = Math.atan2(target.y - e.y, target.x - e.x);
  const dist = Math.sqrt(bestD);
  e.aim = ang;

  // раненый зверь дрогнул: раз за жизнь отступает на 2 с (нежить и Тьма бесстрашны)
  if (e.fleeT > 0) {
    e.fleeT -= dt;
    const away = ang + Math.PI + (rand() - 0.5) * 0.6;
    moveWithCollision(e, Math.cos(away) * def.speed * 1.3 * slowF * dt, Math.sin(away) * def.speed * 1.3 * slowF * dt, def.radius, map);
    return shots;
  }
  if (!e.fled && def.archetype !== 'boss' && !FEARLESS.has(e.kind)
    && e.hp > 0 && e.hp < (e.maxHp || def.hp) * 0.2) {
    e.fled = true;
    e.fleeT = 2;
  }

  // сайд-степ ловких: быстрые твари дёргаются вбок — попробуй попади издалека
  if (def.speed >= 70 && dist > 60 && dist < 240) {
    e.stepT = (e.stepT ?? rand() * 1.5) - dt;
    if (e.stepT <= 0) {
      e.stepT = 1.2 + rand() * 0.8;
      const side = ang + Math.PI / 2 * (rand() < 0.5 ? 1 : -1);
      moveWithCollision(e, Math.cos(side) * 18, Math.sin(side) * 18, def.radius, map);
    }
  }

  switch (def.archetype) {
    case 'chaser': {
      // Боёвка 4.0: удар — СОБЫТИЕ, а не жгучее тело. Замах (телеграф, стоит,
      // направление ФИКСИРУЕТСЯ — читаемо для уворота) → выпад по прямой →
      // СТРАЙК дугой перед собой → раскрытие (recover, +урон по врагу).
      if (e.state === 'windup') {
        e.stateT -= dt;
        if (e.stateT <= 0) { e.state = 'lunge'; e.stateT = 0.3; }
      } else if (e.state === 'lunge') {
        e.stateT -= dt;
        moveWithCollision(e, Math.cos(e.lungeA) * def.lungeSpeed * slowF * dt, Math.sin(e.lungeA) * def.lungeSpeed * slowF * dt, def.radius, map);
        // долетел до цели — бьёт СРАЗУ (не пролетает сквозь); иначе — в конце выпада
        const reached = target && dist2(e.x, e.y, target.x, target.y) < (def.radius + 12) ** 2;
        if (e.stateT <= 0 || reached) {
          shots.push({ strike: { aim: e.lungeA, range: def.radius + 16 } }); // удар!
          e.state = 'recover'; e.stateT = 0.5;
        }
      } else if (e.state === 'recover') {
        e.stateT -= dt; // раскрыт после удара — окно наказания
        if (e.stateT <= 0) { e.state = 'chase'; e.cd = 0.8 * (e.berserk ? 0.55 : 1); }
      } else {
        e.cd = Math.max(0, (e.cd || 0) - dt);
        if (dist < def.lungeRange && e.cd <= 0) {
          e.state = 'windup';
          e.stateT = def.lungeWindup * (e.berserk ? 0.75 : 1);
          e.lungeA = ang; // направление удара решено ЗДЕСЬ — уворот читается
          shots.push({ windupArc: { aim: ang, w: e.stateT + 0.3, range: def.radius + 16 } });
        }
        else {
          // фланкирование: издали каждый заходит по СВОЕЙ дуге — стая окружает,
          // а не выстраивается в очередь за спиной друг у друга
          let moveA = ang;
          if (dist > 60) {
            // персональный угол обхода: детерминированный веер (±0.5, ±0.95, ±1.4…),
            // чтобы стая гарантированно расходилась по разным дугам
            if (e.flankA === undefined) {
              const i = flankSeq++;
              e.flankA = ((i % 2) ? 1 : -1) * (0.5 + ((i >> 1) % 3) * 0.55);
            }
            const fromTarget = Math.atan2(e.y - target.y, e.x - target.x);
            const wantA = fromTarget + e.flankA;
            const tx = target.x + Math.cos(wantA) * 55, ty = target.y + Math.sin(wantA) * 55;
            moveA = Math.atan2(ty - e.y, tx - e.x);
          }
          moveWithCollision(e, Math.cos(moveA) * def.speed * slowF * dt, Math.sin(moveA) * def.speed * slowF * dt, def.radius, map);
        }
      }
      break;
    }
    case 'shooter': {
      // Боёвка 4.0: перед залпом — прицел-телеграф (линия), направление
      // фиксируется — уход с линии спасает. Залпы реже, но больнее (+30%)
      if ((e.aimT || 0) > 0) {
        e.aimT -= dt;
        e.aim = e.aimA;
        if (e.aimT <= 0) shots.push({ pattern: def.pattern, aim: e.aimA, boost: 1.3 });
        break; // целится — стоит
      }
      const [minR, maxR] = def.preferRange;
      let mx = 0, my = 0;
      if (dist > maxR) { mx = Math.cos(ang); my = Math.sin(ang); }
      else if (dist < minR) { mx = -Math.cos(ang); my = -Math.sin(ang); }
      else { // стрейф по кругу
        const s = e.strafeDir || (e.strafeDir = rand() < 0.5 ? 1 : -1);
        mx = -Math.sin(ang) * s; my = Math.cos(ang) * s;
        if (rand() < 0.01) e.strafeDir = -s;
      }
      moveWithCollision(e, mx * def.speed * slowF * dt, my * def.speed * slowF * dt, def.radius, map);
      e.fireT = (e.fireT ?? def.fireInterval * rand()) - dt;
      if (e.fireT <= 0 && dist < 240) {
        e.fireT = def.fireInterval * 1.3;
        e.aimT = 0.35; e.aimA = ang;
        shots.push({ aimLine: { aim: ang, w: 0.35 } });
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
        moveWithCollision(e, Math.cos(e.lungeA) * def.dashSpeed * slowF * dt, Math.sin(e.lungeA) * def.dashSpeed * slowF * dt, def.radius, map);
        if (e.stateT <= 0) { e.state = 'idle'; e.cd = 1.2; }
      } else {
        e.cd = Math.max(0, (e.cd || 0) - dt);
        moveWithCollision(e, Math.cos(ang + 0.5) * def.speed * slowF * dt, Math.sin(ang + 0.5) * def.speed * slowF * dt, def.radius, map);
        if (e.cd <= 0 && dist < 180) { e.state = 'windup'; e.stateT = def.dashWindup; e.lungeA = ang; }
      }
      break;
    }
    case 'boss': {
      const phase = def.phases.find(ph => e.hp / def.hp > ph.hpAbove) || def.phases[def.phases.length - 1];
      if (e.phase !== phase) { // смена фазы: приспешники и ярость — обрабатывает game
        e.phase = phase; e.stepIdx = 0; e.stepT = 0;
        if (phase.adds || phase.enrage) shots.push({ phase });
      }
      e.stepT -= dt;
      const step = phase.steps[e.stepIdx % phase.steps.length];
      if (e.stepT <= 0) {
        e.stepT = step.interval * (e.enraged ? 0.75 : 1); // в ярости бьёт чаще
        e.stepIdx++;
        if (step.slam) { // телеграфированный удар по области — обрабатывает game
          shots.push({ slam: step.slam });
          break;
        }
        if (step.charge) { // телеграфированный рывок по прямой — обрабатывает game
          shots.push({ charge: step.charge, aim: ang });
          break;
        }
        e.shotIndex = (e.shotIndex || 0) + 1;
        shots.push({ pattern: step.pattern, aim: ang, shotIndex: e.shotIndex });
      }
      const mv = step.move === 'strafe'
        ? { x: -Math.sin(ang), y: Math.cos(ang) }
        : { x: Math.cos(ang), y: Math.sin(ang) };
      if (dist > 40 || step.move === 'strafe')
        moveWithCollision(e, mv.x * def.speed * slowF * dt, mv.y * def.speed * slowF * dt, def.radius, map);
      break;
    }
  }
  return shots;
}

// Погоня за конкретной жертвой (охотники за головой): чейзер или стрелок
function chaseTarget(e, def, target, ang, dist, dt, map, slowF, shots, rand) {
  if (def.archetype === 'shooter') {
    const [minR, maxR] = def.preferRange || [80, 140];
    let mx = 0, my = 0;
    if (dist > maxR) { mx = Math.cos(ang); my = Math.sin(ang); }
    else if (dist < minR) { mx = -Math.cos(ang); my = -Math.sin(ang); }
    moveWithCollision(e, mx * def.speed * slowF * dt, my * def.speed * slowF * dt, def.radius, map);
    e.fireT = (e.fireT ?? def.fireInterval * rand()) - dt;
    if (e.fireT <= 0 && dist < 240) {
      e.fireT = def.fireInterval;
      shots.push({ pattern: def.pattern, aim: ang });
    }
    return shots;
  }
  // чейзер с выпадом
  if (e.state === 'windup') {
    e.stateT -= dt;
    if (e.stateT <= 0) { e.state = 'lunge'; e.stateT = 0.35; e.lungeA = ang; }
  } else if (e.state === 'lunge') {
    e.stateT -= dt;
    moveWithCollision(e, Math.cos(e.lungeA) * def.lungeSpeed * slowF * dt, Math.sin(e.lungeA) * def.lungeSpeed * slowF * dt, def.radius, map);
    if (e.stateT <= 0) { e.state = 'chase'; e.cd = 0.8; }
  } else {
    e.cd = Math.max(0, (e.cd || 0) - dt);
    if (dist < (def.lungeRange || 45) && e.cd <= 0) { e.state = 'windup'; e.stateT = def.lungeWindup || 0.35; }
    else moveWithCollision(e, Math.cos(ang) * def.speed * slowF * dt, Math.sin(ang) * def.speed * slowF * dt, def.radius, map);
  }
  return shots;
}

function wander(e, def, dt, map, rand) {
  if (def.speed === 0) return;
  // дозор: вне боя группа мерно ходит маршрутом по коридорам (тайловые точки)
  if (e.patrol) {
    const wp = e.patrol[e.patrolI ?? 0];
    const tx = wp.x * 16 + 8, ty = wp.y * 16 + 8;
    const d2 = (tx - e.x) ** 2 + (ty - e.y) ** 2;
    if (d2 < 14 * 14) {
      e.patrolDir = e.patrolDir || 1;
      let ni = (e.patrolI ?? 0) + e.patrolDir;
      if (ni < 0 || ni >= e.patrol.length) { e.patrolDir = -e.patrolDir; ni = (e.patrolI ?? 0) + e.patrolDir; }
      e.patrolI = ni;
    } else {
      const a = Math.atan2(ty - e.y, tx - e.x);
      e.aim = a;
      const px = e.x, py = e.y;
      moveWithCollision(e, Math.cos(a) * def.speed * 0.55 * dt, Math.sin(a) * def.speed * 0.55 * dt, def.radius, map);
      // упёрся в бочку или колонну — потоптался и разворачивается
      if ((e.x - px) ** 2 + (e.y - py) ** 2 < 0.01) {
        e.patrolStuckT = (e.patrolStuckT || 0) + dt;
        if (e.patrolStuckT > 1.5) {
          e.patrolStuckT = 0;
          e.patrolDir = -(e.patrolDir || 1);
          e.patrolI = Math.max(0, Math.min(e.patrol.length - 1, (e.patrolI ?? 0) + e.patrolDir));
        }
      } else e.patrolStuckT = 0;
    }
    return;
  }
  e.wanderT = (e.wanderT ?? 0) - dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + rand() * 2.5;
    e.wanderA = rand() * Math.PI * 2;
    e.wanderMove = rand() < 0.6;
  }
  if (e.wanderMove)
    moveWithCollision(e, Math.cos(e.wanderA) * def.speed * 0.4 * dt, Math.sin(e.wanderA) * def.speed * 0.4 * dt, def.radius, map);
}
