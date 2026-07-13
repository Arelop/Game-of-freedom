// Панель управления сервером: /admin (страница) + /api/admin/* (JSON API).
// Доступ по токену: переменная окружения ADMIN_KEY или случайный ключ,
// напечатанный в консоли при старте. Без ключа API отвечает 403.
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { TILE } from '../shared/constants.js';
import { getItem, getWeapon, splitId } from '../shared/rarity.js';
import { RELATIONS } from './sim/factions.js';
import { saveWorld, applyWorldData, applySavedPlayer, SAVE_FILE, WORLD_VER } from './persist.js';

export class Admin {
  constructor(game) {
    this.game = game;
    this.key = process.env.ADMIN_KEY || randomBytes(8).toString('hex');
  }

  // true — запрос наш и обработан
  async handle(req, res, url) {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (url.searchParams.get('key') !== this.key) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"нет доступа: неверный ключ"}');
      return true;
    }
    const route = url.pathname.slice('/api/admin/'.length);
    try {
      if (route === 'status') return this.json(res, this.status());
      if (route === 'events') {
        const n = Math.min(200, +url.searchParams.get('n') || 60);
        return this.json(res, { events: this.game.events.entries.slice(-n) });
      }
      if (route === 'save') { saveWorld(this.game); return this.json(res, { ok: true }); }
      if (route === 'download') {
        saveWorld(this.game);
        if (!existsSync(SAVE_FILE)) return this.json(res, { error: 'сейв не создан' }, 500);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="world-day${this.game.world.day}.json"`,
        });
        res.end(readFileSync(SAVE_FILE));
        return true;
      }
      if (route === 'upload' && req.method === 'POST')
        return this.json(res, this.liveLoad(await readBody(req)));
      if (route === 'action' && req.method === 'POST')
        return this.json(res, this.action(await readBody(req)));
      return this.json(res, { error: 'нет такого пути' }, 404);
    } catch (e) {
      return this.json(res, { error: e.message }, 500);
    }
  }

  json(res, data, code = 200) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
    return true;
  }

  status() {
    const g = this.game, w = g.world;
    return {
      day: w.day, time: w.time, weather: w.weather || 'clear',
      seed: w.seed, tickMs: g.lastTickMs || 0,
      entities: g.entities.size, tokens: g.abstract.tokens.length,
      event: w.event ? { type: w.event.type, t: Math.round(w.event.t) } : null,
      arena: { active: w.arena ? { wave: w.arena.wave, fighters: w.arena.lastName } : null, record: w.arenaRecord },
      dark: w.citadel ? { power: Math.round(w.citadel.power), forts: w.citadel.forts.length, dead: w.citadel.dead, owned: w.citadel.owned,
        ziggurats: (w.citadel.ziggurats || []).length } : null,
      sieges: w.settlements.filter(s => s.siege).map(s =>
        ({ name: s.name, wave: s.siege.wave, waves: s.siege.waves, faction: s.siege.faction })),
      wars: this.game.abstract.tokens.filter(t => t.army && !t.dead).map(t => {
        const s = w.settlements.find(x => x.id === t.march);
        return { faction: t.faction, target: s?.name || '?', units: t.units.length };
      }),
      daily: w.daily ? { name: w.daily.name } : null,
      players: [...g.players.values()].map(p => ({
        id: p.id, name: p.name, cls: p.cls, level: p.level,
        hp: p.hp, maxHp: p.maxHp, coins: p.coins, mapId: p.mapId,
        x: Math.round(p.x / TILE), y: Math.round(p.y / TILE),
        dead: !!p.dead, bounty: p.bounty || 0, ascended: !!p.ascended,
      })),
      settlements: w.settlements.map((s, i) => ({
        sid: s.id ?? i, name: s.name, faction: s.faction, population: s.population,
        prosperity: Math.round(s.prosperity), food: Math.round(s.food),
        guards: s.guards || 0,
        garrison: s.garrison ? `${s.garrison.militia || 0}/${s.garrison.archer || 0}/${s.garrison.veteran || 0}` : '—',
        siege: s.siege ? `${s.siege.wave}/${s.siege.waves}` : null,
        status: s.ruined ? 'руины' : s.captured ? (s.faction === 'darkness' ? 'форт Тьмы' : 'захвачена') : 'живёт',
      })),
    };
  }

  // ---------- гейм-мастер ----------
  action(m) {
    const g = this.game;
    const p = m.pid ? g.players.get(+m.pid) : null;
    const chronicle = text => g.events.push(g.world.day, `Рука судьбы: ${text}`);
    switch (m.type) {
      case 'level': { // рука судьбы двигает героя по лестнице уровней
        if (!p) return { error: 'игрок не найден' };
        const d = m.delta > 0 ? 1 : -1;
        if (d > 0 && p.level < 20) {
          p.level++; p.statPts++; p.talentPts++;
          p.xp = 0;
          g.toast(p, `✨ Судьба возвысила тебя: уровень ${p.level} (+очко характеристики и талант)`);
        } else if (d < 0 && p.level > 1) {
          p.level--;
          p.statPts = Math.max(0, p.statPts - 1);
          p.talentPts = Math.max(0, p.talentPts - 1);
          p.xp = 0;
          g.toast(p, `⬇ Судьба смирила тебя: уровень ${p.level}`);
        } else return { error: d > 0 ? 'уже 20 уровень' : 'уже 1 уровень' };
        g.recomputeStats(p);
        chronicle(`изменила судьбу ${p.name} (уровень ${p.level})`);
        return { ok: true, level: p.level };
      }
      case 'heal': {
        if (!p) return { error: 'игрок не найден' };
        p.hp = p.maxHp; p.mana = p.manaMax; p.hunger = 100;
        if (p.dead) { p.dead = false; p.downT = 0; }
        g.toast(p, '✨ Рука судьбы исцелила тебя');
        chronicle(`исцелила ${p.name}`);
        return { ok: true };
      }
      case 'kick': {
        if (!p) return { error: 'игрок не найден' };
        g.toast(p, 'Ты изгнан с сервера');
        setTimeout(() => p.ws?.close(), 100); // тост успевает уйти
        chronicle(`изгнала ${p.name}`);
        return { ok: true };
      }
      case 'tp': {
        if (!p) return { error: 'игрок не найден' };
        const s = g.world.settlements.find(x => !x.ruined && !x.captured) || g.world.settlements[0];
        p.mapId = 'over'; p.x = s.x * TILE + 40; p.y = s.y * TILE + 40;
        g.sendMapChange(p, s.name);
        chronicle(`перенесла ${p.name} в ${s.name}`);
        return { ok: true };
      }
      case 'give': {
        if (!p) return { error: 'игрок не найден' };
        const item = String(m.item || '').trim();
        const count = Math.max(1, Math.min(999, +m.count || 1));
        if (item === 'coins') { p.coins += count; }
        else {
          const { base } = splitId(item);
          if (!getItem(item) && !getWeapon(base)) return { error: `нет такого предмета: ${item}` };
          const id = getWeapon(base) && !item.startsWith('weapon:') ? 'weapon:' + item : item;
          p.inventory[id] = (p.inventory[id] || 0) + count;
        }
        g.toast(p, `🎁 Дар судьбы: ${item === 'coins' ? count + ' мон.' : item + ' ×' + count}`);
        chronicle(`одарила ${p.name} (${item} ×${count})`);
        return { ok: true };
      }
      case 'time': {
        g.world.time = m.value === 'night' ? 0.9 : 0.3;
        g.toastAll(m.value === 'night' ? '🌙 Судьба призвала ночь' : '☀ Судьба призвала день', true);
        return { ok: true };
      }
      case 'weather': {
        if (!['clear', 'rain', 'snow'].includes(m.value)) return { error: 'clear | rain | snow' };
        g.world.weather = m.value;
        return { ok: true };
      }
      case 'event': {
        if (!['bloodMoon', 'rift', 'meteor', 'trader', 'hunt', 'cult'].includes(m.value))
          return { error: 'неизвестное событие' };
        g.rollWorldEvent(m.value);
        chronicle(`наслала событие (${m.value})`);
        return { ok: true };
      }
      case 'announce': {
        const text = String(m.text || '').slice(0, 160);
        if (!text) return { error: 'пустое объявление' };
        g.toastAll(`📣 ${text}`, true);
        g.events.push(g.world.day, `Глас небес: ${text}`);
        return { ok: true };
      }
      // ---------- война и Тьма (тест новых механик) ----------
      case 'darkpower': { // задать мощь Тьмы (питает рейды/зиккураты)
        const c = g.world.citadel;
        if (!c) return { error: 'Цитадели нет' };
        c.power = Math.max(0, Math.min(200, +m.value || 0));
        c.dead = false;
        chronicle(`задала мощь Тьмы: ${Math.round(c.power)}`);
        return { ok: true, power: Math.round(c.power) };
      }
      case 'ziggurat': { // форсировать постройку зиккурата
        const c = g.world.citadel;
        if (!c) return { error: 'Цитадели нет' };
        c.power = Math.max(c.power, 45); c.zigCd = 0; c.dead = false;
        const before = (c.ziggurats || []).length;
        g.civ.buildZigguratMaybe(c);
        if ((c.ziggurats || []).length <= before) return { error: 'не удалось поставить (лимит/нет места)' };
        chronicle('воздвигла зиккурат Тьмы');
        return { ok: true, ziggurats: c.ziggurats.length };
      }
      case 'cleanse': { // снять всю порчу и убрать зиккураты
        g.civ.cleanseAllTaint();
        chronicle('очистила порчу зиккуратов');
        return { ok: true };
      }
      case 'siege': { // форсировать живую осаду деревни (у которой стоит игрок)
        let s = null;
        if (m.sid != null) s = g.world.settlements.find(x => (x.id ?? -1) === m.sid) || g.world.settlements[+m.sid];
        else if (p) { // ближняя к игроку живая деревня
          let bd = Infinity;
          for (const x of g.world.settlements) {
            if (x.ruined || x.captured || x.siege) continue;
            const d = (x.x * TILE - p.x) ** 2 + (x.y * TILE - p.y) ** 2;
            if (d < bd) { bd = d; s = x; }
          }
        }
        if (!s) return { error: 'деревня не найдена (встань в живую деревню или выбери её)' };
        if (s.ruined || s.captured) return { error: 'эта деревня уже пала' };
        if (s.siege) return { error: 'уже в осаде' };
        const tok = {
          id: 'tok' + g.abstract.nextId++, type: 'pack', faction: 'darkness',
          units: ['darkSoldier', 'darkSoldier', 'darkArcher', 'darkKnight'],
          x: s.x * TILE, y: s.y * TILE, hydrated: null,
        };
        g.abstract.tokens.push(tok);
        g.startSiege(s, tok);
        chronicle(`наслала осаду на ${s.name}`);
        return { ok: true, name: s.name };
      }
      case 'factionwar': { // война народов: чужая фракция идёт на деревню игрока
        let target = null;
        if (p) { // ближняя к игроку живая деревня
          let bd = Infinity;
          for (const x of g.world.settlements) {
            if (x.ruined || x.captured) continue;
            const d = (x.x * TILE - p.x) ** 2 + (x.y * TILE - p.y) ** 2;
            if (d < bd) { bd = d; target = x; }
          }
        } else target = g.world.settlements.find(x => !x.ruined && !x.captured);
        if (!target) return { error: 'живая деревня не найдена' };
        // агрессор — богатый город другой фракции
        const aggr = g.world.settlements.find(x =>
          !x.ruined && !x.captured && x.faction !== target.faction &&
          ['severane', 'ozerny', 'stepnyaki'].includes(x.faction));
        if (!aggr) return { error: 'нет города-агрессора другой фракции' };
        // разжигаем вражду, чтобы бойцы рубились при встрече, и шлём армию
        RELATIONS[aggr.faction][target.faction] = -60;
        RELATIONS[target.faction][aggr.faction] = -60;
        aggr.prosperity = Math.max(aggr.prosperity, 60);
        if (!g.civ.musterFactionArmy(aggr, target)) return { error: 'лимит войн (2) исчерпан' };
        chronicle(`разожгла войну: ${aggr.faction} → ${target.name}`);
        return { ok: true, from: aggr.name, to: target.name };
      }
      default: return { error: 'неизвестное действие' };
    }
  }

  // ---------- загрузка сейва на лету (спасение мира на эфемерных хостингах) ----------
  liveLoad(data) {
    const g = this.game;
    if (!data || typeof data !== 'object') return { error: 'это не сейв' };
    if (data.seed !== g.world.seed)
      return { error: `сид сейва (${data.seed}) не совпадает с сидом сервера (${g.world.seed})` };
    if ((data.worldVer || 1) !== WORLD_VER)
      return { error: `сейв от мира старого устройства (v${data.worldVer || 1}, сейчас v${WORLD_VER})` };
    // снести всё живое и инстансы — мир пересобирается из сейва
    g.entities.clear();
    g.hydratedSettlements.clear();
    g.dungeons.clear();
    g.chunks.dungeons.clear();
    g.world.arena = null;
    g.world.edits.clear();
    applyWorldData(g, data);
    // вернуть игроков: профиль из сейва, все — в верхний мир
    for (const p of g.players.values()) {
      applySavedPlayer(g, p);
      p.mapId = 'over';
      p.dead = false; p.downT = 0;
      g.sendMapChange(p, 'МИР ВОССТАНОВЛЕН');
    }
    // клиенты перерисовывают все чанки, что успели увидеть
    const chunks = [];
    for (let cy = 0; cy < 16; cy++) for (let cx = 0; cx < 16; cx++) chunks.push([cx, cy]);
    g.fx({ t: 'remap', mapId: 'over', chunks }, null);
    g.toastAll(`📜 Мир восстановлен из летописи (день ${g.world.day})`, true);
    console.log(`[admin] сейв загружен на лету (день ${g.world.day})`);
    return { ok: true, day: g.world.day };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 30e6) { reject(new Error('слишком большой запрос')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('битый JSON')); } });
    req.on('error', reject);
  });
}
