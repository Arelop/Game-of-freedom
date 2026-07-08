// Сохранение/загрузка мира в saves/world.json (раз в 60 с и при выключении).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES } from '../shared/classes.js';
import { RELATIONS } from './sim/factions.js';

// SAVES_DIR — куда класть сейвы (для тестов и внешних дисков хостинга)
const SAVES = process.env.SAVES_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'saves');
const FILE = join(SAVES, 'world.json');
export const SAVE_FILE = FILE;

// Версия устройства мира: растёт при несовместимых изменениях генерации
// (размер карты и т.п.). Сейв старой версии не грузится целиком —
// но ПРОФИЛИ ГЕРОЕВ переносятся в новый мир (без координат).
export const WORLD_VER = 2;

export function saveWorld(game) {
  try {
    mkdirSync(SAVES, { recursive: true });
    const w = game.world;
    const data = {
      worldVer: WORLD_VER,
      seed: w.seed, time: w.time, day: w.day,
      edits: [...w.edits.entries()],
      settlements: w.settlements.map(s => ({
        id: s.id, population: s.population, prosperity: s.prosperity, food: s.food,
        wood: s.wood, metal: s.metal, crystal: s.crystal,
        guards: s.guards, towers: s.towers, fields: s.fields,
        mines: s.mines, shrines: s.shrines, wardT: s.wardT,
        housingCap: s.housingCap, project: s.project,
        captured: s.captured, ruined: s.ruined, faction: s.faction,
      })),
      pois: w.pois.map(o => ({ id: o.id, cleared: o.cleared, pressed: o.pressed, looted: o.looted })),
      wildChests: w.wildChests || [],
      citadel: w.citadel
        ? { power: w.citadel.power, forts: w.citadel.forts, weakened: w.citadel.weakened, dead: w.citadel.dead, owned: w.citadel.owned }
        : null,
      war: w.war ? { stage: w.war.stage } : null,
      stash: w.stash || {},
      weather: w.weather,
      tokens: game.abstract.tokens.filter(t => !t.hydrated).map(({ hydrated, ...t }) => t),
      events: game.events.entries,
      players: [...game.players.values()].map(p => ({
        name: p.name, x: p.x, y: p.y, mapId: 'over',
        hp: p.hp, hunger: p.hunger, coins: p.coins,
        weapons: p.weapons, ammo: p.ammo, inventory: p.inventory, rep: p.rep,
        equipment: p.equipment, quests: p.quests || [],
        cls: p.cls, level: p.level, xp: p.xp,
        statPts: p.statPts, talentPts: p.talentPts, stats: p.stats, talents: p.talents,
        weaponUp: p.weaponUp || {},
        story: p.story,
        home: p.home || null, homeStash: p.homeStash || {}, hintStage: p.hintStage,
        ascended: p.ascended || false, bestiary: p.bestiary || {},
        mana: Math.round(p.mana || 0),
        bounty: p.bounty || 0, contract: p.contract || null,
        repRanks: p.repRanks || {}, daily: p.daily || null,
        abilities: p.abilities || null,
        mkey: p.mkey || 0,
      })),
      relations: RELATIONS, // дипломатия народов дрейфует — помним её
      banditsWeakT: w.banditsWeakT || 0,
      smithBoon: w.smithBoon || false,
      arenaRecord: w.arenaRecord || null,
      daily: w.daily || null,
      ashLooted: w.ashLooted || false,
      plagueExposed: w.plagueExposed || false,
      ashLordDead: w.ashLordDead || false, ashLordFirst: w.ashLordFirst || null,
      mplusRecord: w.mplusRecord || null,
    };
    writeFileSync(FILE, JSON.stringify(data));
  } catch (e) { console.warn('[save] не удалось сохранить:', e.message); }
}

export function loadWorld(game) {
  if (!existsSync(FILE)) return false;
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    if (data.seed !== game.world.seed) return false;
    // мир прежнего устройства: ландшафт не совпадает — берём только героев
    if ((data.worldVer || 1) !== WORLD_VER) {
      game.savedPlayers = new Map((data.players || []).map(p => {
        const { x, y, home, homeStash, ...keep } = p; // позиции и дом — из старого мира
        return [p.name, keep];
      }));
      console.log(`[save] мир пересоздан (новая версия ${WORLD_VER}), герои перенесены: ${game.savedPlayers.size}`);
      return false;
    }
    applyWorldData(game, data);
    console.log(`[save] мир загружен (день ${game.world.day})`);
    return true;
  } catch (e) { console.warn('[save] не удалось загрузить:', e.message); return false; }
}

// применить данные сейва к игровому миру (общая часть загрузки с диска и через админку)
export function applyWorldData(game, data) {
  {
    const w = game.world;
    w.time = data.time; w.day = data.day;
    for (const [k, v] of data.edits) w.edits.set(k, v);
    for (const rec of data.settlements) {
      const s = w.settlements.find(x => x.id === rec.id);
      if (s) Object.assign(s, rec);
    }
    for (const rec of data.pois) {
      const o = w.pois.find(x => x.id === rec.id);
      if (o) o.cleared = rec.cleared;
    }
    if (data.tokens) {
      game.abstract.tokens = data.tokens.map(t => ({ ...t, hydrated: null }));
      // страховка от разбушевавшихся сейвов: полевых отрядов Тьмы — не больше лимита
      let darkN = 0;
      const cap = 2 + (data.citadel?.forts?.length || 0);
      game.abstract.tokens = game.abstract.tokens.filter(t =>
        t.faction !== 'darkness' || t.garrison || ++darkN <= cap);
    }
    if (data.citadel && w.citadel) {
      w.citadel.power = data.citadel.power;
      w.citadel.forts = data.citadel.forts || [];
      w.citadel.weakened = data.citadel.weakened || false;
      w.citadel.dead = data.citadel.dead || false;
      w.citadel.owned = data.citadel.owned || false;
    }
    if (data.banditsWeakT) w.banditsWeakT = data.banditsWeakT;
    if (data.smithBoon) w.smithBoon = true;
    if (data.arenaRecord) w.arenaRecord = data.arenaRecord;
    if (data.daily) w.daily = data.daily;
    if (data.ashLooted) w.ashLooted = true;
    if (data.plagueExposed) w.plagueExposed = true;
    if (data.ashLordDead) w.ashLordDead = true;
    if (data.ashLordFirst) w.ashLordFirst = data.ashLordFirst;
    if (data.mplusRecord) w.mplusRecord = data.mplusRecord;
    if (data.wildChests) for (const rec of data.wildChests) {
      const c = w.wildChests?.find(x => x.x === rec.x && x.y === rec.y);
      if (c) c.opened = rec.opened;
    }
    if (data.relations) { // дипломатия народов из сейва
      for (const [f, rels] of Object.entries(data.relations))
        if (RELATIONS[f]) Object.assign(RELATIONS[f], rels);
    }
    if (data.war) w.war.stage = data.war.stage;
    if (data.stash) w.stash = data.stash;
    if (data.weather) w.weather = data.weather;
    if (data.events) game.events.entries = data.events;
    game.savedPlayers = new Map((data.players || []).map(p => [p.name, p]));
    game.chunks.cache.clear();
  }
}

// применить сохранённый профиль при входе игрока с тем же именем
export function applySavedPlayer(game, p) {
  const rec = game.savedPlayers?.get(p.name);
  if (!rec) return;
  Object.assign(p, {
    x: rec.x ?? p.x, y: rec.y ?? p.y, // перенос из старого мира — позиция спавна
    hp: Math.max(1, rec.hp), hunger: rec.hunger, coins: rec.coins,
    weapons: rec.weapons, ammo: rec.ammo, inventory: rec.inventory, rep: rec.rep,
  });
  if (rec.equipment) {
    // миграция старых слотов на новые
    const mig = { armor: 'chest', helmet: 'head', amulet: 'acc1', shield: 'offhand' };
    const eq = { head: null, chest: null, legs: null, offhand: null, acc1: null, acc2: null, ring: null };
    for (const [k, v] of Object.entries(rec.equipment)) {
      if (!v) continue;
      eq[mig[k] || k] = v;
    }
    p.equipment = eq;
  }
  if (rec.cls) { // сохранённый персонаж: класс и прокачка из сейва
    p.cls = rec.cls;
    p.sprite = CLASSES[rec.cls]?.sprite || p.sprite;
    p.level = rec.level ?? 1; p.xp = rec.xp ?? 0;
    p.statPts = rec.statPts ?? 0; p.talentPts = rec.talentPts ?? 0;
    if (rec.stats) p.stats = rec.stats;
    if (rec.talents) p.talents = rec.talents;
    if (rec.weaponUp) p.weaponUp = rec.weaponUp;
    if (rec.story) p.story = { ...p.story, ...rec.story };
    if (rec.home) { p.home = rec.home; p.homeStash = rec.homeStash || {}; }
    if (rec.hintStage !== undefined) p.hintStage = rec.hintStage;
    // журнал заданий (миграция старых сейвов с одиночным quest)
    if (rec.quests) p.quests = rec.quests;
    else if (rec.quest) p.quests = [rec.quest];
    if (rec.ascended) p.ascended = true;
    if (rec.bestiary) p.bestiary = rec.bestiary;
    // мана: новое поле; старые сейвы хранили её как боеприпас ammo.mana
    if (rec.mana !== undefined) p.mana = rec.mana;
    else if (rec.ammo?.mana) p.mana = rec.ammo.mana;
    if (p.ammo?.mana !== undefined) delete p.ammo.mana;
    if (rec.bounty) p.bounty = rec.bounty;
    if (rec.contract) p.contract = rec.contract;
    if (rec.repRanks) p.repRanks = rec.repRanks;
    if (rec.daily) p.daily = rec.daily;
    if (rec.abilities) p.abilities = rec.abilities;
    if (rec.mkey) p.mkey = rec.mkey;
  }
  for (const wid of p.weapons) if (p.mags[wid] === undefined) p.mags[wid] = 0;
  game.recomputeStats(p);
}
