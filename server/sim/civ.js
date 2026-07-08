// Цивилизации: поселения добывают ресурсы (пшеница, древесина, металл,
// кристаллы), растут, строят дома/поля/башни/шахты/святилища, нанимают
// стражу за металл, проводят магические ритуалы, голодают и вымирают.
// Все значимые исходы идут в журнал событий и тостами игрокам поблизости.
import { TILE, CHUNK, SEASONS, seasonOf, SEASON_HARVEST } from '../../shared/constants.js';
import { findBuildSite, buildHouse, buildField, buildTower, buildMine, buildShrine } from '../world/structures.js';
import { RELATIONS, FACTIONS } from './factions.js';
import { DARK_KINDS } from '../../shared/enemies.js';
import { pick } from '../../shared/rng.js';

export const CIV_DT = process.env.CIV_FAST ? 2 : 12; // сек на цив-тик (CIV_FAST — отладка)

// Стройки: стоимость ресурсов и число тиков работы
const PROJECTS = {
  house: { name: 'дом', wood: 12, ticks: 5, size: [6, 5] },
  field: { name: 'поле', wood: 5, ticks: 3, size: [4, 3] },
  tower: { name: 'сторожевая башня', wood: 12, metal: 4, ticks: 6, size: [2, 2] },
  mine: { name: 'шахта', wood: 10, ticks: 5, size: [2, 2] },
  shrine: { name: 'святилище', wood: 10, ticks: 4, size: [1, 1] },
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
    // смена сезона — общее событие
    const season = seasonOf(this.game.world.day);
    if (season !== this.lastSeason) {
      this.lastSeason = season;
      this.game.events.push(this.game.world.day, `Наступает ${SEASONS[season].toLowerCase()}`);
      this.game.toastAll(`— ${SEASONS[season]} —`);
    }
    for (const s of this.game.world.settlements) this.tickSettlement(s);
    this.tickRivalry();
    this.tickResettlement();
    this.tickDarkness();
    this.game.tickBountyHunters();
    this.game.checkRepRanks();
  }

  // --- Армия Тьмы: мощь Цитадели растёт, войска идут войной на всех ---
  tickDarkness() {
    const g = this.game;
    const c = g.world.citadel;
    if (!c) return;
    g.warUpkeep(); // страховка реликвий/Сердца кампании
    if (c.dead) return; // Тьма повержена в Войне — Цитадель мертва
    c.power = Math.min(200, c.power + 0.05 + c.forts.length * 0.05);
    if (c.raidCd > 0) c.raidCd--;

    // гарнизон Цитадели: Лорд Тьмы и элита всегда на месте
    // (после великого ритуала — ослабленный состав)
    if (!g.abstract.tokens.some(t => t.garrison && !t.dead)) {
      if (c.power >= 12) c.power -= 10; // возрождение гарнизона стоит мощи
      g.abstract.tokens.push({
        id: 'tok' + g.abstract.nextId++, type: 'pack', name: 'гарнизон Цитадели',
        faction: 'darkness', garrison: true,
        units: c.weakened
          ? ['darkLord', 'darkKnight', 'darkArcher']
          : ['darkLord', 'darkKnight', 'darkMage', 'darkArcher', 'darkSoldier', 'darkSoldier'],
        x: c.x * TILE, y: c.y * TILE, home: { x: c.x * TILE, y: c.y * TILE },
        hydrated: null,
      });
    }

    // лимит полевых отрядов Тьмы: мир не должен тонуть в нежити
    const darkPacks = g.abstract.tokens.filter(t => t.faction === 'darkness' && !t.garrison && !t.dead).length;
    if (darkPacks >= 2 + c.forts.length) return;

    // рейд: копим мощь, ходим редко (кулдаун), войско стоит мощи
    if (c.raidCd > 0 || c.power < 25) return;
    const raidChance = Math.min(0.25, 0.05 + c.power / 800);
    if (g.rand() >= raidChance) return;
    const targets = g.world.settlements.filter(s => !s.ruined && !s.captured);
    if (!targets.length) return;
    c.raidCd = 35; // ~7 минут между рейдами (тик 12 с)
    // ближние к Цитадели и фортам деревни страдают первыми
    targets.sort((a, b) =>
      ((a.x - c.x) ** 2 + (a.y - c.y) ** 2) - ((b.x - c.x) ** 2 + (b.y - c.y) ** 2));
    const target = targets[Math.floor(g.rand() * Math.min(3, targets.length))];
    const size = Math.min(6, 2 + Math.floor(c.power / 50));
    const units = [];
    for (let i = 0; i < size; i++) units.push(pick(g.rand, DARK_KINDS));
    // войско выходит из ближайшего к цели опорного пункта
    let src = c;
    for (const fid of c.forts) {
      const f = g.world.settlements.find(s => s.id === fid);
      if (f && !f.ruined &&
        (f.x - target.x) ** 2 + (f.y - target.y) ** 2 < (src.x - target.x) ** 2 + (src.y - target.y) ** 2) src = f;
    }
    c.power = Math.max(3, c.power - size * 3);
    g.abstract.tokens.push({
      id: 'tok' + g.abstract.nextId++, type: 'pack', name: 'войско Тьмы',
      faction: 'darkness', units, march: target.id,
      x: src.x * TILE, y: src.y * TILE, hydrated: null,
    });
    g.events.push(g.world.day, `⛧ Войско Тьмы выступило из ${src.name || 'Цитадели'} к ${target.name}!`, { x: src.x, y: src.y });
    g.toastAll(`⛧ Войско Тьмы идёт к ${target.name}!`, true); // война — всплывает
  }

  // Процветающая деревня отправляет поселенцев возрождать руины
  tickResettlement() {
    const g = this.game;
    if (g.rand() > 0.08) return;
    const ruin = g.world.settlements.find(s => s.ruined);
    if (!ruin) return;
    const donor = g.world.settlements.find(s =>
      !s.ruined && !s.captured && s.prosperity > 70 && s.population >= s.housingCap - 2);
    if (!donor) return;
    donor.population -= 2;
    donor.prosperity -= 10;
    g.abstract.tokens.push({
      id: 'tok' + g.abstract.nextId++, type: 'caravan', name: 'поселенцы',
      faction: donor.faction, units: ['npc', 'npc', 'guard'],
      x: donor.x * TILE, y: donor.y * TILE, target: ruin.id, from: donor.id,
      settlers: true, hydrated: null,
    });
    g.events.push(g.world.day, `Поселенцы из ${donor.name} отправились возрождать ${ruin.name}`);
  }

  say(s, text, data = {}) {
    const g = this.game;
    g.events.push(g.world.day, text, { x: s.x, y: s.y, ...data });
    g.fx({ t: 'toast', text: `[${s.name}] ${text}` }, 'over', s.x * TILE, s.y * TILE);
  }

  tickSettlement(s) {
    const g = this.game;
    const rand = g.rand;
    if (s.ruined) return;
    if (s.captured && s.faction === 'darkness') {
      // форт Тьмы: гарнизон копит силы, изредка высылает патрули (в пределах лимита)
      s.food = Math.max(0, s.food - 1);
      const c2 = g.world.citadel;
      const darkPacks = g.abstract.tokens.filter(t => t.faction === 'darkness' && !t.garrison && !t.dead).length;
      if (rand() < 0.015 && darkPacks < 2 + (c2?.forts.length || 0)) {
        g.abstract.tokens.push({
          id: 'tok' + g.abstract.nextId++, type: 'pack', name: 'патруль Тьмы',
          faction: 'darkness', units: ['darkSoldier', 'darkSoldier', 'darkArcher'],
          x: s.x * TILE, y: s.y * TILE, hydrated: null,
        });
        this.say(s, '⛧ Из форта Тьмы вышел патруль');
      }
      return;
    }
    if (s.captured) {
      // бандиты проедают запасы и проводят тёмные ритуалы
      s.food = Math.max(0, s.food - 1);
      s.prosperity = Math.max(0, s.prosperity - 1);
      if (rand() < 0.06) {
        this.game.events.push(this.game.world.day,
          `⛧ В захваченной ${s.name} провели тёмный ритуал — демоны вырвались в мир!`, { x: s.x, y: s.y });
        this.game.fx({ t: 'toast', text: `⛧ Тёмный ритуал в ${s.name}!` }, 'over', s.x * TILE, s.y * TILE);
        this.game.abstract.spawnDemonPack(s.x + 8, s.y + 8);
      }
      return;
    }

    // --- добыча: урожай зависит от сезона ---
    const harvest = SEASON_HARVEST[seasonOf(g.world.day)];
    s.food = Math.min(140, s.food + Math.round((1 + s.fields * 2) * harvest));
    s.wood = Math.min(90, s.wood + s.forestRich);
    s.metal = Math.min(60, s.metal + s.mines * 2 + (s.rockRich > 0 ? 1 : 0) * 0);
    if (s.rockRich > 0 && rand() < 0.4) s.metal = Math.min(60, s.metal + 1); // кустарная добыча
    if (s.crystalRich > 0 && rand() < 0.3) s.crystal = Math.min(20, s.crystal + 1);
    if (s.shrines > 0 && rand() < 0.25) s.crystal = Math.min(20, s.crystal + 1); // жрецы собирают

    // --- потребление и голод/рост ---
    s.food -= Math.ceil(s.population * 0.5);
    if (s.food <= 0) {
      s.food = 0;
      s.prosperity = Math.max(0, s.prosperity - 6);
      if (rand() < 0.5 && s.population > 0) {
        s.population--;
        if (s.population <= 0) { this.ruinSettlement(s, 'вымерла от голода'); return; }
        this.say(s, `Голод! Жители умирают (${s.population} ост.)`);
      }
    } else if (s.food > 60 && s.population < s.housingCap && rand() < 0.5) {
      s.population++;
      s.food -= 15;
      s.prosperity = Math.min(100, s.prosperity + 2);
      this.say(s, `Деревня растёт: уже ${s.population} жителей`);
    }

    // --- наём стражи: нужен металл на снаряжение ---
    const guardQuota = 2 + s.towers;
    if (s.guards < guardQuota && s.prosperity >= 25 && s.population > 3) {
      if (s.metal >= 2) {
        s.metal -= 2;
        s.guards++;
        s.prosperity -= 8;
        this.say(s, 'Нанят новый стражник (−2 металла)');
        this.rehydrate(s);
      } else if (rand() < 0.3) {
        this.say(s, 'Не хватает металла для снаряжения стражи');
      }
    }

    // --- магические ритуалы за кристаллы ---
    if (s.shrines > 0 && s.crystal >= 3) {
      if (s.food < 30) {
        s.crystal -= 3;
        s.food = Math.min(140, s.food + 50);
        this.say(s, '✦ Ритуал урожая: закрома полны!');
      } else if (s.crystal >= 5 && s.guards < 2 + s.towers && s.spiritT <= 0 && rand() < 0.3) {
        // ритуал призыва: дух-хранитель... или прорыв из иного мира
        s.crystal -= 5;
        if (rand() < 0.15) {
          this.say(s, '⛧ Ритуал призыва ВЫШЕЛ ИЗ-ПОД КОНТРОЛЯ — в мир вырвались демоны!');
          this.game.abstract.spawnDemonPack(s.x + 6, s.y + 6);
        } else {
          s.spiritT = 20;
          this.say(s, '✦ Из иного мира призван дух-хранитель');
          this.rehydrate(s);
        }
      } else if (s.wardT <= 0 && rand() < 0.25) {
        s.crystal -= 3;
        s.wardT = 12;
        this.say(s, '✦ Обережный ритуал: деревня под защитой духов');
      }
    }
    if (s.wardT > 0) s.wardT--;
    if (s.spiritT > 0) { s.spiritT--; if (s.spiritT === 0) this.rehydrate(s); }

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

  canAfford(s, def) {
    return s.wood >= (def.wood || 0) && s.metal >= (def.metal || 0) && s.crystal >= (def.crystal || 0);
  }

  chooseProject(s) {
    // приоритеты: жильё -> еда -> шахта -> святилище -> башня
    let type = null;
    if (s.population >= s.housingCap && this.canAfford(s, PROJECTS.house)) type = 'house';
    else if (s.food < 35 && this.canAfford(s, PROJECTS.field)) type = 'field';
    else if (s.mines < 1 && s.rockRich > 0 && this.canAfford(s, PROJECTS.mine)) type = 'mine';
    else if (s.shrines < 1 && s.prosperity > 45 && this.canAfford(s, PROJECTS.shrine)) type = 'shrine';
    else if (s.towers < 2 && s.prosperity > 50 && this.canAfford(s, PROJECTS.tower)) type = 'tower';
    else if (s.wood >= PROJECTS.house.wood + 8 && this.game.rand() < 0.3) type = 'house';
    if (!type) return;
    const def = PROJECTS[type];
    const site = findBuildSite(this.game.world, s, def.size[0], def.size[1], this.game.rand);
    if (!site) return;
    s.wood -= def.wood || 0;
    s.metal -= def.metal || 0;
    s.crystal -= def.crystal || 0;
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
    else if (type === 'mine') { rect = buildMine(g.world, s, site); s.mines++; }
    else if (type === 'shrine') { rect = buildShrine(g.world, s, site); s.shrines++; }
    else { rect = buildTower(g.world, s, site); s.towers++; }
    s.project = null;
    this.say(s, `Стройка завершена: ${def.name}!`);
    this.remapArea(site.x - 1, site.y - 1, rect.w + 2, rect.h + 2);
    this.rehydrate(s);
  }

  // Деревня погибла: руины навсегда, стаи заселяют округу
  ruinSettlement(s, reason) {
    const g = this.game;
    s.ruined = true;
    s.population = 0; s.guards = 0;
    this.rehydrate(s);
    g.events.push(g.world.day, `${s.name} ${reason}. Остались руины…`, { x: s.x, y: s.y });
    g.toastAll(`☠ ${s.name} ${reason}`);
  }

  // Бандиты захватили деревню
  captureSettlement(s) {
    const g = this.game;
    s.captured = true;
    s.faction = 'bandits';
    s.guards = 0;
    s.population = Math.max(0, s.population - 2);
    this.rehydrate(s);
    g.events.push(g.world.day, `Вольница захватила ${s.name}! Кто освободит жителей?`, { x: s.x, y: s.y });
    g.toastAll(`⚔ ${s.name} захвачена бандитами!`, true); // война — всплывает
  }

  // Армия Тьмы захватила деревню — теперь это её форт
  captureByDarkness(s) {
    const g = this.game;
    s.captured = true;
    s.faction = 'darkness';
    s.guards = 0;
    s.population = Math.max(0, s.population - 3);
    const c = g.world.citadel;
    if (c && !c.forts.includes(s.id)) { c.forts.push(s.id); c.power += 5; }
    this.rehydrate(s);
    g.events.push(g.world.day, `⛧ Армия Тьмы захватила ${s.name} — теперь это форт Тьмы!`, { x: s.x, y: s.y });
    g.toastAll(`⛧ ${s.name} пала под натиском Тьмы!`, true); // война — всплывает
  }

  // Игроки перебили захватчиков — деревня свободна
  liberateSettlement(s, liberator) {
    const g = this.game;
    const wasDark = s.faction === 'darkness';
    s.captured = false;
    s.faction = s.homeFaction;
    s.guards = 1;
    s.population = Math.max(3, s.population);
    const c = g.world.citadel;
    if (c) {
      const i = c.forts.indexOf(s.id);
      if (i >= 0) { c.forts.splice(i, 1); c.power = Math.max(3, c.power - 8); }
    }
    this.rehydrate(s);
    g.events.push(g.world.day, `${liberator?.name || 'Путники'} освободили ${s.name} от ${wasDark ? 'Армии Тьмы' : 'бандитов'}!`, { x: s.x, y: s.y });
    g.toastAll(`★ ${s.name} освобождена!`, true); // война — всплывает
    if (liberator) {
      liberator.rep[s.homeFaction] = Math.min(100, (liberator.rep[s.homeFaction] || 0) + 25);
      g.addXp(liberator, 60);
    }
    // квесты «освободить деревню» с доски заказов
    for (const p of g.players.values()) {
      for (const q of p.quests || [])
        if (q.liberate === s.id && !q.done) g.completeQuestObjective(p, q);
    }
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
