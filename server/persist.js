// Сохранение/загрузка мира в saves/world.json (раз в 60 с и при выключении).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES } from '../shared/classes.js';

const SAVES = join(dirname(fileURLToPath(import.meta.url)), '..', 'saves');
const FILE = join(SAVES, 'world.json');

export function saveWorld(game) {
  try {
    mkdirSync(SAVES, { recursive: true });
    const w = game.world;
    const data = {
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
      pois: w.pois.map(o => ({ id: o.id, cleared: o.cleared })),
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
        ascended: p.ascended || false,
      })),
      banditsWeakT: w.banditsWeakT || 0,
    };
    writeFileSync(FILE, JSON.stringify(data));
  } catch (e) { console.warn('[save] не удалось сохранить:', e.message); }
}

export function loadWorld(game) {
  if (!existsSync(FILE)) return false;
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    if (data.seed !== game.world.seed) return false;
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
    if (data.war) w.war.stage = data.war.stage;
    if (data.stash) w.stash = data.stash;
    if (data.weather) w.weather = data.weather;
    if (data.events) game.events.entries = data.events;
    game.savedPlayers = new Map((data.players || []).map(p => [p.name, p]));
    game.chunks.cache.clear();
    console.log(`[save] мир загружен (день ${w.day})`);
    return true;
  } catch (e) { console.warn('[save] не удалось загрузить:', e.message); return false; }
}

// применить сохранённый профиль при входе игрока с тем же именем
export function applySavedPlayer(game, p) {
  const rec = game.savedPlayers?.get(p.name);
  if (!rec) return;
  Object.assign(p, {
    x: rec.x, y: rec.y, hp: Math.max(1, rec.hp), hunger: rec.hunger, coins: rec.coins,
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
  }
  for (const wid of p.weapons) if (p.mags[wid] === undefined) p.mags[wid] = 0;
  game.recomputeStats(p);
}
