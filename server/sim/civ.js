// Цивилизации: поселения производят еду и древесину, растут, строят
// дома/поля/башни, нанимают стражу, голодают, соперничают за угодья.
// Все значимые исходы идут в журнал событий и тостами игрокам поблизости.
import { TILE, CHUNK } from '../../shared/constants.js';
import { findBuildSite, buildHouse, buildField, buildTower } from '../world/structures.js';
import { RELATIONS, FACTIONS } from './factions.js';

export const CIV_DT = process.env.CIV_FAST ? 2 : 12; // сек на цив-тик (CIV_FAST — отладка)

// Стройки: стоимость древесины и число тиков работы
const PROJECTS = {
  house: { name: 'дом', wood: 12, ticks: 5, size: [6, 5] },
  field: { name: 'поле', wood: 5, ticks: 3, size: [4, 3] },
  tower: { name: 'сторожевая башня', wood: 15, ticks: 6, size: [2, 2] },
};

export class CivSim {
  constructor(game) {
    this.game = game;
    this.timer = 3; // первый тик скоро после старта
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CIV_DT;
    for (const s of this.game.world.settlements) this.tickSettlement(s);
    this.tickRivalry();
  }

  say(s, text, data = {}) {
    const g = this.game;
    g.events.push(g.world.day, text, { x: s.x, y: s.y, ...data });
    g.fx({ t: 'toast', text: `[${s.name}] ${text}` }, 'over', s.x * TILE, s.y * TILE);
  }

  tickSettlement(s) {
    const g = this.game;
    const rand = g.rand;

    // --- производство ---
    const farmers = Math.min(s.population, 2 + s.fields * 2);
    s.food = Math.min(140, s.food + 1 + s.fields * 2);
    s.wood = Math.min(90, s.wood + s.forestRich);

    // --- потребление и голод/рост ---
    s.food -= Math.ceil(s.population * 0.5);
    if (s.food <= 0) {
      s.food = 0;
      s.prosperity = Math.max(0, s.prosperity - 6);
      if (rand() < 0.5 && s.population > 2) {
        s.population--;
        this.say(s, `Голод! Жители умирают (${s.population} ост.)`);
      }
    } else if (s.food > 60 && s.population < s.housingCap && rand() < 0.5) {
      s.population++;
      s.food -= 15;
      s.prosperity = Math.min(100, s.prosperity + 2);
      this.say(s, `Деревня растёт: уже ${s.population} жителей`);
    }

    // --- наём стражи ---
    const guardQuota = 2 + s.towers;
    if (s.guards < guardQuota && s.prosperity >= 25 && s.population > 3) {
      s.guards++;
      s.prosperity -= 8;
      this.say(s, 'Нанят новый стражник');
      this.rehydrate(s);
    }

    // --- строительство ---
    if (s.project) {
      s.project.progress++;
      if (s.project.progress >= s.project.ticks) this.finishProject(s);
    } else {
      this.chooseProject(s);
    }

    // --- процветание от торговли/сытости ---
    if (s.food > 40 && rand() < 0.3) s.prosperity = Math.min(100, s.prosperity + 1);
  }

  chooseProject(s) {
    // приоритеты: жильё переполнено -> дом; еды мало -> поле; стая рядом/богато -> башня
    let type = null;
    if (s.population >= s.housingCap && s.wood >= PROJECTS.house.wood) type = 'house';
    else if (s.food < 35 && s.wood >= PROJECTS.field.wood) type = 'field';
    else if (s.towers < 2 && s.prosperity > 50 && s.wood >= PROJECTS.tower.wood) type = 'tower';
    else if (s.wood >= PROJECTS.house.wood + 8 && this.game.rand() < 0.3) type = 'house';
    if (!type) return;
    const def = PROJECTS[type];
    const site = findBuildSite(this.game.world, s, def.size[0], def.size[1], this.game.rand);
    if (!site) return;
    s.wood -= def.wood;
    s.project = { type, progress: 0, ticks: def.ticks, site };
    this.say(s, `Началась стройка: ${def.name}`);
  }

  finishProject(s) {
    const g = this.game;
    const { type, site } = s.project;
    const def = PROJECTS[type];
    let rect;
    if (type === 'house') { rect = buildHouse(g.world, s, site, g.rand); s.housingCap += 2; }
    else if (type === 'field') { rect = buildField(g.world, s, site); s.fields++; }
    else { rect = buildTower(g.world, s, site); s.towers++; }
    s.project = null;
    this.say(s, `Стройка завершена: ${def.name}!`);
    this.remapArea(site.x - 1, site.y - 1, rect.w + 2, rect.h + 2);
    this.rehydrate(s);
  }

  // Сброс чанков: сервер и клиенты перечитывают тайлы построенного
  remapArea(tx, ty, w, h) {
    const g = this.game;
    const chunks = new Set();
    for (let y = ty; y < ty + h; y += CHUNK) chunks.add(cKey(tx, y)), chunks.add(cKey(tx + w, y));
    chunks.add(cKey(tx, ty + h)); chunks.add(cKey(tx + w, ty + h));
    const list = [...chunks].map(k => k.split(',').map(Number));
    for (const [cx, cy] of list) g.chunks.cache.delete('over:' + cx + ',' + cy);
    g.fx({ t: 'remap', mapId: 'over', chunks: list }, null);
  }

  // Пересоздать NPC поселения (появились новые жители/стража)
  rehydrate(s) {
    const g = this.game;
    const ids = g.hydratedSettlements.get(s.id);
    if (!ids) return;
    for (const id of ids) g.entities.delete(id);
    g.hydratedSettlements.delete(s.id);
  }

  // --- соперничество фракций за угодья ---
  tickRivalry() {
    const g = this.game;
    const stl = g.world.settlements;
    if (g.rand() > 0.25) return;
    for (let i = 0; i < stl.length; i++) {
      for (let j = i + 1; j < stl.length; j++) {
        const a = stl[i], b = stl[j];
        if (a.faction === b.faction) continue;
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d2 > 150 ** 2) continue;
        // обе богатые и близко — трения за лес и землю
        if (a.prosperity > 55 && b.prosperity > 55 && g.rand() < 0.35) {
          RELATIONS[a.faction][b.faction] = Math.max(-100, (RELATIONS[a.faction][b.faction] || 0) - 6);
          RELATIONS[b.faction][a.faction] = RELATIONS[a.faction][b.faction];
          this.say(a, `Спор за угодья с ${b.name}: отношения портятся`);
          // при вражде — стычка с потерями
          if (RELATIONS[a.faction][b.faction] < -25 && g.rand() < 0.5) {
            const winner = g.rand() < 0.5 ? a : b;
            const loser = winner === a ? b : a;
            loser.population = Math.max(2, loser.population - 1);
            loser.prosperity = Math.max(0, loser.prosperity - 8);
            winner.prosperity = Math.min(100, winner.prosperity + 4);
            g.events.push(g.world.day,
              `Стычка на границе: ${winner.name} потеснили ${loser.name}`,
              { x: loser.x, y: loser.y });
          }
          return; // не больше одного конфликта за тик
        }
      }
    }
  }
}

function cKey(tx, ty) {
  return Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK);
}
