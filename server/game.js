// Авторитетная симуляция: игроки, враги, NPC, пули, данжи, квесты, голод.
import {
  TICK_DT, TILE, SOLID, BULLET_SOLID, T, PLAYER_MAX_HP, PLAYER_HURT_INVULN,
  HUNGER_MAX, HUNGER_RATE, DAY_LENGTH, PLAYER_RADIUS, DESTRUCTIBLE,
} from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { ENEMIES } from '../shared/enemies.js';
import { PATTERNS, emitDirections } from '../shared/patterns.js';
import {
  makePlayerState, stepPlayer, stepProjectile, hasIFrames, circlesOverlap, dist2,
  moveWithCollision,
} from '../shared/simCore.js';
import { mulberry32, hash2, randInt, pick } from '../shared/rng.js';
import { makeWorld } from './world/worldgen.js';
import { ChunkStore } from './world/chunks.js';
import { generateDungeon, roomAt } from './world/dungeon.js';
import { updateEnemy } from './sim/ai.js';
import { updateNpc } from './sim/npc.js';
import { AbstractSim } from './sim/abstract.js';
import { CivSim } from './sim/civ.js';
import { EventLog } from './sim/events.js';
import { makeReputation, FACTIONS, RELATIONS, priceMultiplier } from './sim/factions.js';
import { STR, ITEM_NAMES } from '../shared/strings.js';
import { ITEMS, GEAR_SLOTS, isGear, isPotion, describeItem, isWeaponItem, weaponIdOf, sellPrice } from '../shared/items.js';
import { AMMO_NAMES } from '../shared/weapons.js';
import { CLASSES, STAT_KEYS, statBonuses, xpNeed, MAX_LEVEL } from '../shared/classes.js';
import { TALENTS, findTalent, canLearn } from '../shared/talents.js';
import { getWeapon, getItem, splitId, rollRarity, withRarity, sellPriceR } from '../shared/rarity.js';
import { abilitiesOf } from '../shared/abilities.js';

const NPC_NAMES = [
  'Радомир', 'Всеслав', 'Милана', 'Ярина', 'Добрыня', 'Горазд', 'Любава',
  'Светозар', 'Мстислав', 'Забава', 'Тихомир', 'Велеслава', 'Богдан',
  'Дарёна', 'Огнеслав', 'Рогнеда', 'Путята', 'Умила', 'Ратибор', 'Злата',
];

const HOT_RADIUS = 600;            // px: враги думают только рядом с игроками
const SETTLEMENT_HYDRATE_R = 400;  // px
const REVIVE_DIST = 26;
const FOOD_VALUE = { meat: 15, cooked_meat: 40, bread: 30 };

const RECIPES = [
  { id: 'bandage', name: 'Бинт (2 травы)', needs: { herb: 2 }, gives: { bandage: 1 } },
  { id: 'cooked_meat', name: 'Жареное мясо (сырое мясо)', needs: { meat: 1 }, gives: { cooked_meat: 1 } },
  { id: 'ammo_arrow', name: 'Стрелы x10 (1 древесина)', needs: { wood: 1 }, gives: { ammo_arrow: 10 } },
  { id: 'ammo_knife', name: 'Ножи x4 (1 древесина, 1 шкура)', needs: { wood: 1, hide: 1 }, gives: { ammo_knife: 4 } },
];

// Крафт у наковальни: металл в дело
const ANVIL_RECIPES = [
  { id: 'ammo_bolt', name: 'Болты x8 (1 металл, 1 древесина)', needs: { metal: 1, wood: 1 }, gives: { ammo_bolt: 8 } },
  { id: 'ammo_bomb', name: 'Бомбы x2 (2 металла, 1 древесина)', needs: { metal: 2, wood: 1 }, gives: { ammo_bomb: 2 } },
  { id: 'fire_arrows_c', name: 'Горящие стрелы (1 металл, 2 травы)', needs: { metal: 1, herb: 2 }, gives: { fire_arrows: 1 } },
];

const SHOP = [
  { item: 'bread', price: 8 }, { item: 'bandage', price: 15 }, { item: 'wood', price: 6 },
  { item: 'heal_potion', price: 30 }, { item: 'swift_potion', price: 35 },
  { item: 'ammo_arrow', price: 10, count: 20 }, { item: 'ammo_bolt', price: 15, count: 8 },
  { item: 'ammo_mana', price: 18, count: 15 }, { item: 'ammo_knife', price: 14, count: 8 },
  { item: 'leather_armor', price: 40 }, { item: 'wood_shield', price: 25 },
  { item: 'leather_boots', price: 30 }, { item: 'iron_greaves', price: 70 },
  { item: 'iron_helmet', price: 65 }, { item: 'wolf_amulet', price: 55 },
  { item: 'weapon:huntbow', price: 85 }, { item: 'weapon:firestaff', price: 100 },
  { item: 'weapon:axe', price: 90 }, { item: 'weapon:bombs', price: 140 },
  { item: 'weapon:spear', price: 55 }, { item: 'padded_armor', price: 25 }, { item: 'iron_ring', price: 45 },
  { item: 'ammo_bomb', price: 20, count: 3 }, { item: 'fire_arrows', price: 25 },
  { item: 'metal', price: 14 },
];

const MAX_WEAPON_SLOTS = 4;
const SCHOOL_NAMES = { melee: 'ближний бой', ranged: 'дальний бой', magic: 'магия' };

// какое оружие использует данный тип боеприпасов (для подсказок в магазине)
function ammoUsers(type) {
  return Object.values(WEAPONS).filter(w => w.ammoType === type).map(w => w.name).join('/');
}

// Плавающие цены: дефицит в деревне делает товар дороже, избыток — дешевле.
// mode 'buy' — покупка игроком, 'sell' — продажа игроком (дефицит платит больше).
function scarcityMult(s, item, mode) {
  if (!s) return 1;
  let level = null; // [запас, дефицитный порог, порог избытка]
  if (item === 'bread' || item === 'meat' || item === 'cooked_meat') level = [s.food, 30, 90];
  else if (item === 'wood') level = [s.wood, 15, 60];
  else if (item === 'metal') level = [s.metal, 5, 35];
  if (!level) return 1;
  const [have, lo, hi] = level;
  if (have < lo) return mode === 'buy' ? 1.6 : 1.8;   // дефицит: дорого купить, выгодно продать
  if (have > hi) return mode === 'buy' ? 0.75 : 0.5;  // избыток: дёшево
  return 1;
}

export class Game {
  constructor(seed) {
    this.world = makeWorld(seed);
    this.chunks = new ChunkStore(this.world);
    this.events = new EventLog();
    this.abstract = new AbstractSim(this);
    this.civ = new CivSim(this);
    this.rand = mulberry32(seed ^ 0x5eed);
    this.players = new Map();
    this.entities = new Map();   // враги, NPC, дропы
    this.projectiles = [];
    this.nextId = 1;
    this.tick = 0;
    this.pendingFx = [];         // события за тик для рассылки
    this.dungeons = new Map();   // mapId -> { dungeon, poi }
    this.hydratedSettlements = new Map(); // id -> [entIds]
    this.tileHp = new Map();     // "mapId:x,y" -> накопленный урон по тайлу
    this.abstract.seedTokens();
    this.events.push(1, 'Мир сотворён. Говорят, в руинах слышен рык…');
  }

  // ---------- карты / коллизии ----------
  mapFor(mapId) {
    const at = (tx, ty) => this.chunks.tileAt(mapId, tx, ty);
    return {
      isSolid: (tx, ty) => SOLID.has(at(tx, ty)) || at(tx, ty) === T.DUNGEON_DOOR,
      isBulletSolid: (tx, ty) => BULLET_SOLID.has(at(tx, ty)) || at(tx, ty) === T.DUNGEON_DOOR,
    };
  }

  fx(ev, mapId, x, y) { this.pendingFx.push({ ev, mapId, x, y }); }

  // ---------- разрушение построек ----------
  // Возвращает true, если тайл разрушен. attacker — для репутации (вандализм).
  damageTile(mapId, tx, ty, dmg, attacker) {
    if (dmg <= 0) return false;
    const tile = this.chunks.tileAt(mapId, tx, ty);
    const def = DESTRUCTIBLE[tile];
    if (!def) return false;
    const key = mapId + ':' + tx + ',' + ty;
    const hp = (this.tileHp.get(key) ?? def.hp) - dmg;
    if (hp > 0) {
      this.tileHp.set(key, hp);
      this.fx({ t: 'hit', kind: 'wall', x: tx * TILE + 8, y: ty * TILE + 8 }, mapId, tx * TILE, ty * TILE);
      return false;
    }
    this.tileHp.delete(key);
    this.chunks.setTile(mapId, tx, ty, def.becomes);
    this.fx({ t: 'tile', mapId, x: tx, y: ty, tile: def.becomes }, null);
    this.fx({ t: 'rubble', x: tx * TILE + 8, y: ty * TILE + 8 }, mapId, tx * TILE, ty * TILE);
    // дроп материалов
    for (const [item, chance] of Object.entries(def.drops || {})) {
      let n = Math.floor(chance) + (this.rand() < chance % 1 ? 1 : 0);
      if (n > 0) this.spawnDrop(item, n, mapId, tx * TILE + 8, ty * TILE + 8);
    }
    // вандализм в живой деревне портит репутацию
    if (attacker && mapId === 'over' && tile !== T.TREE && tile !== T.BUSH && tile !== T.ROCK_SOLID) {
      const s = this.world.settlements.find(s => !s.ruined && !s.captured &&
        (s.x - tx) ** 2 + (s.y - ty) ** 2 < 40 * 40);
      if (s) {
        attacker.rep[s.faction] = (attacker.rep[s.faction] || 0) - 4;
        attacker.aggroFactions.add(s.faction);
        this.toast(attacker, STR.repDown(FACTIONS[s.faction]?.name || s.faction));
      }
    }
    return true;
  }

  // ---------- игроки ----------
  addPlayer(id, name, ws, cls = 'warrior') {
    const C = CLASSES[cls] || CLASSES.warrior;
    const s = this.world.settlements[0];
    const px = (s ? s.x : 256) * TILE + 40, py = (s ? s.y : 256) * TILE + 40;
    const p = {
      ...makePlayerState(px, py),
      id, name, ws, mapId: 'over',
      cls: C.id, sprite: C.sprite,
      hp: PLAYER_MAX_HP + (C.maxHpBonus || 0), maxHp: PLAYER_MAX_HP + (C.maxHpBonus || 0),
      level: 1, xp: 0, statPts: 0, talentPts: 0,
      stats: { ...C.baseStats }, talents: [],
      weapons: [...C.weapons], weaponIdx: 0,
      mags: Object.fromEntries(C.weapons.map(w => [w, WEAPONS[w].magSize || 1])),
      ammo: { ...C.ammo },
      inventory: { bread: 2, bandage: 1 },
      equipment: { head: null, chest: null, legs: null, offhand: null, acc1: null, acc2: null, ring: null },
      buffs: {},                 // { speed: { mult, t } }
      dmgMult: 1, shadowT: 0, prevRollT: 0, manaRegenT: 0,
      abCd: [0, 0, 0], invisT: 0,
      coins: 20, hunger: HUNGER_MAX,
      rep: makeReputation(), aggroFactions: new Set(),
      dead: false, downT: 0,
      quest: null,
      lastSeq: 0, inputs: [],
      fireHeld: false, fireLatch: false,
      hungerTickT: 0,
    };
    if (process.env.DEV_GEAR) { // отладка: стартовый набор экипировки и оружия
      Object.assign(p.inventory, {
        leather_armor: 1, iron_helmet: 1, wolf_amulet: 1, heal_potion: 2, swift_potion: 1,
        'weapon:fireball': 1, 'weapon:stormstaff': 1, 'weapon:axe@e': 1, 'weapon:bombs': 1,
        'weapon:warhammer@r': 1, 'fox_amulet@r': 1, 'scale_armor@e': 1,
        fire_arrows: 2,
      });
      p.ammo.mana = 60;
      p.ammo.bomb = 12;
    }
    if (process.env.DEV_LEVEL) { // отладка: сразу N уровней
      for (let i = 1; i < +process.env.DEV_LEVEL; i++) { p.level++; p.statPts++; p.talentPts++; }
    }
    this.players.set(id, p);
    this.recomputeStats(p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }

  weapon(p) { return getWeapon(p.weapons[p.weaponIdx]); }

  // ---------- экипировка, характеристики, таланты ----------
  hasTalent(p, flag) { return p.talents.some(id => findTalent(p.cls, id)?.flag === flag); }

  recomputeStats(p) {
    const C = CLASSES[p.cls] || CLASSES.warrior;
    // 1-й проход: экипировка может давать сами атрибуты (СИЛ/ЛОВ/ИНТ/УДЧ)
    const eff = { ...p.stats };
    for (const slot of GEAR_SLOTS) {
      const it = getItem(p.equipment[slot]);
      if (!it?.stats) continue;
      for (const k of STAT_KEYS) eff[k] = (eff[k] || 0) + (it.stats[k] || 0);
    }
    p.effStats = eff;
    const sb = statBonuses(eff);
    const d = {
      dmgMelee: 1 + sb.dmgMelee, dmgRanged: 1, dmgMagic: 1 + sb.dmgMagic,
      critChance: 0.03, critMult: 2, coinMult: 1 + sb.coinMult,
      atkSpeed: 1 + sb.atkSpeed, dodge: sb.dodge, manaRegen: sb.manaRegen,
      dropBonus: sb.dropBonus,
      arcBonus: 0, magicProj: 0, knifeProj: 0,
    };
    let maxHp = PLAYER_MAX_HP + (C.maxHpBonus || 0) + sb.maxHp;
    let speed = 1 + (C.speedBonus || 0);
    let gearDmg = 1;
    let rollCd = 1;

    for (const slot of GEAR_SLOTS) {
      const it = getItem(p.equipment[slot]);
      if (!it?.stats) continue;
      maxHp += it.stats.maxHp || 0;
      speed += it.stats.speed || 0;
      gearDmg += it.stats.damage || 0;
      rollCd -= it.stats.rollCd || 0;
      d.dodge += it.stats.dodge || 0;
      d.manaRegen += it.stats.manaRegen || 0;
    }
    for (const id of p.talents) {
      const t = findTalent(p.cls, id);
      if (!t?.effects) continue;
      const e = t.effects;
      maxHp += e.maxHp || 0;
      speed += e.speed || 0;
      rollCd -= e.rollCd || 0;
      d.dmgMelee += e.dmgMelee || 0;
      d.dmgRanged += e.dmgRanged || 0;
      d.dmgMagic += e.dmgMagic || 0;
      d.critChance += e.critChance || 0;
      d.coinMult += e.coinMult || 0;
      d.atkSpeed += e.atkSpeed || 0;
      d.arcBonus += e.arcBonus || 0;
      d.magicProj += e.magicProj || 0;
      d.knifeProj += e.knifeProj || 0;
      d.manaRegen += e.manaRegen || 0;
    }
    if (this.hasTalent(p, 'deadly')) d.critMult = 3;
    if (p.buffs.speed) speed += p.buffs.speed.mult;
    if (p.buffs.blessed) { // благословение жреца: весь урон
      const b = 1 + p.buffs.blessed.mult;
      d.dmgMelee *= b; d.dmgRanged *= b; d.dmgMagic *= b;
    }

    // амулеты с общим уроном (медвежий) усиливают все школы
    d.dmgMelee *= gearDmg; d.dmgRanged *= gearDmg; d.dmgMagic *= gearDmg;

    p.derived = d;
    p.maxHp = maxHp;
    p.hp = Math.min(p.hp, maxHp);
    p.speedMult = Math.max(0.4, speed);
    p.rollCdMult = Math.max(0.2, rollCd);
  }

  // Урон атаки с учётом школы, талантов, ковки и крита
  rollAttack(p, w) {
    const d = p.derived;
    const schoolMult = w.school === 'melee' ? d.dmgMelee : w.school === 'magic' ? d.dmgMagic : d.dmgRanged;
    let mult = schoolMult * (1 + 0.1 * (p.weaponUp?.[w.id] || 0));
    if (this.hasTalent(p, 'rage') && p.hp <= p.maxHp * 0.3) mult *= 1.4;
    if (p.shadowT > 0 && this.hasTalent(p, 'shadow')) { mult *= 1.5; p.shadowT = 0; }
    const crit = this.rand() < d.critChance;
    if (crit) mult *= d.critMult;
    return { dmg: Math.round(w.damage * mult * 10) / 10, crit };
  }

  // ---------- опыт и уровни ----------
  addXp(p, n) {
    if (p.level >= MAX_LEVEL || p.dead) return;
    p.xp += n;
    while (p.level < MAX_LEVEL && p.xp >= xpNeed(p.level)) {
      p.xp -= xpNeed(p.level);
      p.level++;
      p.statPts++;
      p.talentPts++;
      p.hp = Math.min(p.maxHp, p.hp + 2);
      this.toast(p, `Уровень ${p.level}! Очко характеристики и талант (C)`);
      this.fx({ t: 'levelup', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    }
  }

  spendStat(p, stat) {
    if (p.statPts <= 0 || !STAT_KEYS.includes(stat)) return;
    p.statPts--;
    p.stats[stat] = (p.stats[stat] || 0) + 1;
    this.recomputeStats(p);
  }

  learnTalent(p, id) {
    if (!canLearn(p.cls, id, p.talents, p.talentPts)) return;
    p.talentPts--;
    p.talents.push(id);
    this.recomputeStats(p);
    this.toast(p, `Талант изучен: ${findTalent(p.cls, id).name}`);
  }

  // Общее имя предмета (включая оружие-предметы weapon:xxx)
  itemName(itemId) {
    if (isWeaponItem(itemId)) return getWeapon(weaponIdOf(itemId))?.name || itemId;
    return getItem(itemId)?.name || ITEM_NAMES[itemId] || itemId;
  }

  equipItem(p, itemId) {
    if ((p.inventory[itemId] || 0) <= 0) return;
    if (isWeaponItem(itemId)) { this.equipWeapon(p, itemId); return; }
    const it = getItem(itemId);
    if (!it?.slot) return;
    // аксессуары занимают любой из двух слотов
    let slot = it.slot;
    if (slot === 'acc') slot = !p.equipment.acc1 ? 'acc1' : !p.equipment.acc2 ? 'acc2' : 'acc1';
    p.inventory[itemId]--;
    const prev = p.equipment[slot];
    if (prev) p.inventory[prev] = (p.inventory[prev] || 0) + 1;
    p.equipment[slot] = itemId;
    this.recomputeStats(p);
    this.toast(p, `Надето: ${it.name}`);
  }

  equipWeapon(p, itemId) {
    const wid = weaponIdOf(itemId);
    if (!getWeapon(wid)) return;
    if (p.weapons.includes(wid)) { this.toast(p, 'Такое оружие уже в руках'); return; }
    p.inventory[itemId]--;
    if (p.inventory[itemId] <= 0) delete p.inventory[itemId];
    if (p.weapons.length < MAX_WEAPON_SLOTS) {
      p.weapons.push(wid);
    } else {
      // все ячейки заняты — меняем с активным
      const old = p.weapons[p.weaponIdx];
      p.inventory['weapon:' + old] = (p.inventory['weapon:' + old] || 0) + 1;
      p.weapons[p.weaponIdx] = wid;
    }
    if (p.mags[wid] === undefined) p.mags[wid] = getWeapon(wid).magSize || 1;
    this.toast(p, `В руках: ${getWeapon(wid).name}`);
  }

  // slot: 'armor'|'helmet'|... или 'w0'..'w3' (ячейка оружия)
  unequipItem(p, slot) {
    if (slot.startsWith('w')) {
      const idx = +slot.slice(1);
      if (!(idx >= 0 && idx < p.weapons.length)) return;
      if (p.weapons.length <= 1) { this.toast(p, 'Нельзя остаться без оружия'); return; }
      const wid = p.weapons[idx];
      p.weapons.splice(idx, 1);
      p.inventory['weapon:' + wid] = (p.inventory['weapon:' + wid] || 0) + 1;
      if (p.weaponIdx >= p.weapons.length) p.weaponIdx = p.weapons.length - 1;
      p.reloadT = 0; p.reloadPending = false;
      return;
    }
    const itemId = p.equipment[slot];
    if (!itemId) return;
    p.equipment[slot] = null;
    p.inventory[itemId] = (p.inventory[itemId] || 0) + 1;
    this.recomputeStats(p);
  }

  // Продажа торговцу (нужен торговец в 45px)
  sellItem(p, itemId) {
    if ((p.inventory[itemId] || 0) <= 0) return;
    let merchant = null;
    for (const e of this.entities.values()) {
      if (e.entType !== 'npc' || e.mapId !== p.mapId) continue;
      if (e.role !== 'merchant' && e.role !== 'trader') continue;
      if (dist2(p.x, p.y, e.x, e.y) < 45 * 45) { merchant = e; break; }
    }
    if (!merchant) { this.toast(p, 'Рядом нет торговца'); return; }
    const s = this.world.settlements.find(x => x.id === merchant.home);
    const price = Math.max(1, Math.round(sellPriceR(itemId) * scarcityMult(s, itemId, 'sell')));
    p.inventory[itemId]--;
    if (p.inventory[itemId] <= 0) delete p.inventory[itemId];
    p.coins += price;
    // проданный ресурс пополняет запасы деревни
    if (s) {
      if (itemId === 'wood') s.wood = Math.min(90, s.wood + 1);
      if (itemId === 'metal') s.metal = Math.min(60, s.metal + 1);
      if (itemId === 'meat' || itemId === 'bread') s.food = Math.min(140, s.food + 2);
    }
    this.toast(p, `Продано: ${this.itemName(itemId)} (+${price} мон.)`);
  }

  // ---------- главный тик ----------
  // Внимание: pendingFx НЕ очищается здесь — события, порождённые обработчиками
  // сетевых сообщений между тиками (interact, dialogChoice), должны дожить до
  // ближайшего broadcast(). Очистку делает игровой цикл после рассылки.
  step() {
    this.tick++;
    const dt = TICK_DT;

    // время суток
    const wasNight = this.isNight();
    this.world.time += dt / DAY_LENGTH;
    if (this.world.time >= 1) { this.world.time -= 1; this.world.day++; }
    if (this.isNight() !== wasNight)
      this.toastAll(this.isNight() ? STR.night : STR.morning);

    for (const p of this.players.values()) this.stepPlayerTick(p, dt);

    this.hydrateSettlements();
    this.stepEntities(dt);
    this.separateEntities();
    this.stepProjectiles(dt);
    this.abstract.update(dt);
    this.civ.update(dt);
    this.checkDungeonRooms();
  }

  isNight() { return this.world.time < 0.22 || this.world.time > 0.85; }

  stepPlayerTick(p, dt) {
    const map = this.mapFor(p.mapId);

    if (p.dead) {
      p.downT -= dt;
      if (p.downT <= 0) this.respawn(p);
      return;
    }

    // бафы от зелий
    let buffEnded = false;
    for (const [key, b] of Object.entries(p.buffs)) {
      b.t -= dt;
      if (b.t <= 0) { delete p.buffs[key]; buffEnded = true; }
    }
    if (buffEnded) this.recomputeStats(p);

    // Реген маны: 1 базово + интеллект + экипировка/таланты, каждые 5 секунд
    p.manaRegenT -= dt;
    if (p.manaRegenT <= 0) {
      p.manaRegenT = 5;
      p.ammo.mana = Math.min(99, (p.ammo.mana || 0) + 1 + Math.round(p.derived?.manaRegen || 0));
    }
    p.shadowT = Math.max(0, p.shadowT - dt);
    p.invisT = Math.max(0, (p.invisT || 0) - dt);
    if (p.abCd) for (let i = 0; i < 3; i++) p.abCd[i] = Math.max(0, (p.abCd[i] || 0) - dt);

    // Начало переката: Таран и Барьер
    if (p.rollT > p.prevRollT) {
      p.rollHits = new Set();
      if (this.hasTalent(p, 'barrier')) p.hurtT = Math.max(p.hurtT, 0.75);
    }
    // Конец переката: окно Тени
    if (p.prevRollT > 0 && p.rollT === 0 && this.hasTalent(p, 'shadow')) p.shadowT = 2;
    // Таран: сбиваем врагов по пути переката
    if (p.rollT > 0 && this.hasTalent(p, 'ram')) {
      for (const e of [...this.entities.values()]) {
        if (e.entType !== 'enemy' || e.mapId !== p.mapId || p.rollHits?.has(e.id)) continue;
        const def = ENEMIES[e.kind];
        if (!circlesOverlap(p.x, p.y, PLAYER_RADIUS + 6, e.x, e.y, def.radius)) continue;
        p.rollHits.add(e.id);
        this.damageEnemy(e, Math.round(4 * p.derived.dmgMelee * 10) / 10,
          { vx: p.rollDx, vy: p.rollDy, knockback: 160, owner: p.id, school: 'melee' });
      }
    }
    p.prevRollT = p.rollT;

    // голод
    p.hunger = Math.max(0, p.hunger - HUNGER_RATE * dt);
    if (p.hunger <= 0) {
      p.hungerTickT -= dt;
      if (p.hungerTickT <= 0) {
        p.hungerTickT = 10;
        this.damagePlayer(p, 1, null);
        this.toast(p, STR.starving);
      }
    } else if (p.hunger < 20 && Math.floor((p.hunger + HUNGER_RATE * dt) / 5) !== Math.floor(p.hunger / 5)) {
      this.toast(p, STR.hungry);
    }

    // применяем накопленные инпуты
    const w = this.weapon(p);
    for (const inp of p.inputs) {
      stepPlayer(p, inp, inp.dt, map);
      p.lastSeq = inp.seq;
      if (inp.fire) this.tryFire(p, inp.aim);
    }
    p.inputs.length = 0;

    // сначала завершаем идущую перезарядку, потом при нужде запускаем новую
    if (!w.melee) {
      if (p.reloadPending && p.reloadT <= 0) {
        p.mags[w.id] = this.finishReload(p, w);
        p.reloadPending = false;
      }
      if (!p.reloadPending && p.mags[w.id] <= 0 && p.reloadT <= 0) this.startReload(p);
    }
  }

  startReload(p) {
    const w = this.weapon(p);
    if (w.melee || w.infiniteAmmo && p.mags[w.id] >= w.magSize) return;
    if (p.reloadPending || p.reloadT > 0) return;
    if (p.mags[w.id] >= w.magSize) return;
    if (!w.infiniteAmmo && (p.ammo[w.ammoType] || 0) <= 0) return;
    p.reloadT = w.reloadTime;
    p.reloadPending = true;
  }

  finishReload(p, w) {
    if (w.infiniteAmmo) return w.magSize;
    const need = w.magSize - (p.mags[w.id] || 0);
    const take = Math.min(need, p.ammo[w.ammoType] || 0);
    p.ammo[w.ammoType] -= take;
    return (p.mags[w.id] || 0) + take;
  }

  tryFire(p, aim) {
    const w = this.weapon(p);
    if (p.fireCd > 0 || p.rollT > 0 || p.dead) return;
    if (w.melee) { this.meleeSwing(p, w, aim); return; }
    if (p.reloadT > 0) return;
    if ((p.mags[w.id] || 0) <= 0) { this.startReload(p); return; }
    p.fireCd = 1 / (w.fireRate * (p.derived?.atkSpeed || 1));
    // Архимаг: шанс не потратить ману
    if (!(w.ammoType === 'mana' && this.hasTalent(p, 'arcane') && this.rand() < 0.3))
      p.mags[w.id]--;
    const seed = hash2(this.world.seed, this.tick, p.id);
    this.spawnPlayerBullets(p, w, aim, seed);
    // событие остальным клиентам (стрелявший рисует свои пули сам)
    this.fx({ t: 'shot', pid: p.id, weapon: w.id, x: p.x, y: p.y, aim, seed, tick: this.tick }, p.mapId, p.x, p.y);
  }

  // Ближний бой: мгновенный удар по дуге перед игроком.
  meleeSwing(p, w, aim) {
    p.fireCd = 1 / (w.fireRate * (p.derived?.atkSpeed || 1));
    let arcDeg = (w.arcDeg || 100) + (p.derived?.arcBonus || 0);
    if (this.hasTalent(p, 'whirl')) arcDeg = 360;
    const half = arcDeg * Math.PI / 360;
    const r = w.range || 26;
    const atk = this.rollAttack(p, w);
    const hitFake = { vx: Math.cos(aim), vy: Math.sin(aim), knockback: w.knockback, owner: p.id, school: 'melee', crit: atk.crit };
    for (const e of [...this.entities.values()]) {
      if (e.entType === 'enemy' && e.mapId === p.mapId) {
        const def = ENEMIES[e.kind];
        if (dist2(p.x, p.y, e.x, e.y) > (r + def.radius) ** 2) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (arcDeg >= 360 || Math.abs(da) <= half) this.damageEnemy(e, atk.dmg, hitFake);
      } else if (e.entType === 'npc' && e.mapId === p.mapId) {
        if (dist2(p.x, p.y, e.x, e.y) > (r + 5) ** 2) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (arcDeg >= 360 || Math.abs(da) <= half) this.damageNpc(e, w.damage, p);
      }
    }
    // удар по постройкам: дерево рубится, стены крошатся (по structDmg оружия)
    if (w.structDmg > 0) {
      for (const dd of [12, 22]) {
        const tx = Math.floor((p.x + Math.cos(aim) * dd) / TILE);
        const ty = Math.floor((p.y + Math.sin(aim) * dd) / TILE);
        if (DESTRUCTIBLE[this.chunks.tileAt(p.mapId, tx, ty)]) {
          this.damageTile(p.mapId, tx, ty, Math.round(w.structDmg * (p.derived?.dmgMelee || 1)), p);
          break;
        }
      }
    }
    this.fx({ t: 'swing', pid: p.id, weapon: w.id, x: p.x, y: p.y, aim, range: r, arc: arcDeg }, p.mapId, p.x, p.y);
  }

  // Сколько снарядов даёт оружие этому игроку (таланты магов/воров)
  projCount(p, w) {
    let n = w.projectilesPerShot || 1;
    if (w.school === 'magic') n += p.derived?.magicProj || 0;
    if (splitId(w.id).base === 'knives') n += p.derived?.knifeProj || 0;
    return n;
  }

  spawnPlayerBullets(p, w, aim, seed) {
    const rand = mulberry32(seed);
    const atk = this.rollAttack(p, w);
    const count = this.projCount(p, w);
    // замедление льдом; талант мага усиливает
    let slow = w.slow;
    if (slow && this.hasTalent(p, 'frostMaster')) slow = { mult: 0.45, time: 2.5 };
    // горящие стрелы: луки и арбалеты жгут и ломают стены
    let structDmg = w.structDmg || 0;
    let dmg = atk.dmg;
    const fiery = p.buffs.fireArrows && (w.ammoType === 'arrow' || w.ammoType === 'bolt');
    if (fiery) { structDmg = Math.max(structDmg, 3); dmg = Math.round((dmg + 1) * 10) / 10; }
    for (let i = 0; i < count; i++) {
      const extraSpread = count > (w.projectilesPerShot || 1) ? Math.max(w.spreadDeg, 10) : w.spreadDeg;
      const spread = (rand() - 0.5) * extraSpread * Math.PI / 180;
      const a = aim + spread;
      this.projectiles.push({
        x: p.x, y: p.y - 4, vx: Math.cos(a) * w.projectileSpeed, vy: Math.sin(a) * w.projectileSpeed,
        life: w.projLife, radius: w.projRadius, dmg, crit: atk.crit,
        knockback: w.knockback, slow, school: w.school,
        explode: w.explode, chain: w.chain, structDmg, fiery,
        owner: p.id, friendly: true, mapId: p.mapId,
      });
    }
  }

  npcShoot(npc, ang) {
    this.projectiles.push({
      x: npc.x, y: npc.y - 4, vx: Math.cos(ang) * 280, vy: Math.sin(ang) * 280,
      life: 1.2, radius: 2, dmg: 2, knockback: 20,
      owner: npc.id, friendly: true, guard: true, mapId: npc.mapId,
    });
    this.fx({ t: 'shot', pid: npc.id, weapon: 'bow', x: npc.x, y: npc.y, aim: ang, seed: 1, tick: this.tick }, npc.mapId, npc.x, npc.y);
  }

  // ---------- сущности ----------
  spawnEnemy(kind, mapId, x, y, extra = {}) {
    const def = ENEMIES[kind];
    if (!def) return null;
    const id = 'e' + this.nextId++;
    this.entities.set(id, {
      id, kind, entType: 'enemy', mapId, x, y, aim: 0,
      hp: def.hp, maxHp: def.hp, state: 'idle', stateT: 0, aggro: false,
      ...extra,
    });
    return id;
  }

  spawnNpc(role, home, mapId, x, y, extra = {}) {
    const id = 'n' + this.nextId++;
    // стабильное имя: от деревни, роли и номера — NPC «узнаваем» между визитами
    const name = NPC_NAMES[hash2(hashId(String(home)), hashId(role), extra.ni || 0) % NPC_NAMES.length];
    this.entities.set(id, {
      id, entType: 'npc', role, home, mapId, x, y, aim: 0, name,
      hp: role === 'guard' ? 12 : 6, maxHp: role === 'guard' ? 12 : 6,
      kind: extra.kind || ({
        guard: 'npc_guard', merchant: 'npc_merchant', elder: 'npc_elder',
        wizard: 'npc_wizard', priest: 'npc_wizard', blacksmith: 'npc_smith',
        innkeeper: 'npc_innkeeper', hunter: 'npc_hunter',
      }[role] || (this.rand() < 0.5 ? 'npc_villager' : 'npc_villager2')),
      ...extra,
    });
    return id;
  }

  spawnCaravanNpc(tok, unit) {
    return this.spawnNpc(unit === 'guard' ? 'guard' : 'trader', tok.faction, 'over',
      tok.x + (Math.random() - 0.5) * 40, tok.y + (Math.random() - 0.5) * 40,
      { caravan: tok.id, kind: unit === 'guard' ? 'npc_guard' : 'npc_merchant' });
  }

  spawnDrop(item, count, mapId, x, y) {
    const id = 'd' + this.nextId++;
    this.entities.set(id, { id, entType: 'drop', item, count, mapId, x, y, hp: 1, ttl: 120 });
  }

  // гидратация поселений: NPC существуют только рядом с игроками
  hydrateSettlements() {
    for (const s of this.world.settlements) {
      const sx = s.x * TILE, sy = s.y * TILE;
      let near = false;
      for (const p of this.players.values()) {
        if (p.mapId === 'over' && dist2(p.x, p.y, sx, sy) < SETTLEMENT_HYDRATE_R ** 2) { near = true; break; }
      }
      const hyd = this.hydratedSettlements.get(s.id);
      if (s.ruined) { // руины пусты
        if (hyd) { for (const id of hyd) this.entities.delete(id); this.hydratedSettlements.delete(s.id); }
        continue;
      }
      if (s.captured) { // в захваченной деревне хозяйничают бандиты или гарнизон Тьмы
        if (near && !hyd) {
          const ids = [];
          const darkFort = s.faction === 'darkness';
          const kinds = darkFort
            ? ['darkKnight', 'darkSoldier', 'darkSoldier', 'darkArcher', 'darkMage', 'darkSoldier', 'darkArcher']
            : ['banditHeavy', 'bandit', 'bandit', 'bandit', 'bandit', 'banditHeavy', 'bandit'];
          const n = (darkFort ? 5 : 4) + Math.min(3, Math.floor(s.prosperity / 25));
          for (let i = 0; i < n; i++) {
            ids.push(this.spawnEnemy(kinds[i % kinds.length], 'over',
              sx + (this.rand() - 0.5) * 120, sy + (this.rand() - 0.5) * 120,
              { captor: s.id, faction: s.faction }));
          }
          this.hydratedSettlements.set(s.id, ids);
        } else if (near && hyd) {
          // все захватчики перебиты — деревня свободна!
          if (!hyd.some(id => this.entities.has(id))) {
            this.hydratedSettlements.delete(s.id);
            const liberator = [...this.players.values()].find(p =>
              p.mapId === 'over' && dist2(p.x, p.y, sx, sy) < SETTLEMENT_HYDRATE_R ** 2);
            this.civ.liberateSettlement(s, liberator);
          }
        } else if (!near && hyd) {
          for (const id of hyd) this.entities.delete(id);
          this.hydratedSettlements.delete(s.id);
        }
        continue;
      }
      if (near && !hyd) {
        const ids = [];
        const a = s.anchors;
        ids.push(this.spawnNpc('elder', s.id, 'over', sx + 20, sy - 10));
        ids.push(this.spawnNpc('merchant', s.id, 'over', (a.stalls[0]?.x ?? s.x) * TILE + 8, (a.stalls[0]?.y ?? s.y) * TILE + 8));
        // ремесленники и служители — если деревня их «выучила»
        if (a.smithy) ids.push(this.spawnNpc('blacksmith', s.id, 'over', a.smithy.x * TILE + 8, a.smithy.y * TILE + 8));
        if (a.tavern) ids.push(this.spawnNpc('innkeeper', s.id, 'over', a.tavern.x * TILE + 8, a.tavern.y * TILE + 8));
        if (s.shrines > 0) ids.push(this.spawnNpc('priest', s.id, 'over', sx - 20, sy - 24));
        if (s.forestRich >= 2) ids.push(this.spawnNpc('hunter', s.id, 'over', sx - 40, sy + 30));
        for (let gi = 0; gi < (s.guards || 2); gi++) {
          const ga = gi / Math.max(1, s.guards) * Math.PI * 2;
          ids.push(this.spawnNpc('guard', s.id, 'over', sx + Math.cos(ga) * 34, sy + Math.sin(ga) * 34));
        }
        // призванный дух-хранитель: парит у святилища, разит врагов
        if (s.spiritT > 0) {
          const id = this.spawnNpc('guard', s.id, 'over', sx + 12, sy - 20, { kind: 'npc_spirit' });
          const spirit = this.entities.get(id);
          spirit.hp = spirit.maxHp = 24;
          ids.push(id);
        }
        // на экране не всё население: остальные «по домам» (иначе толпа)
        const villagers = Math.min(9, Math.max(2, s.population - 4));
        for (let i = 0; i < villagers; i++) {
          const bed = a.beds[i % a.beds.length];
          const npc = this.spawnNpc('villager', s.id, 'over', sx + (this.rand() - 0.5) * 120, sy + (this.rand() - 0.5) * 120);
          const ent = this.entities.get(npc);
          ent.bed = bed ? { x: bed.x, y: bed.y } : { x: s.x, y: s.y };
          ent.work = pick(this.rand, a.works);
          ids.push(npc);
        }
        this.hydratedSettlements.set(s.id, ids);
      } else if (!near && hyd) {
        for (const id of hyd) this.entities.delete(id);
        this.hydratedSettlements.delete(s.id);
      }
    }

    // лагеря-POI: засада на подходе
    for (const poi of this.world.pois) {
      if (poi.type !== 'camp' || poi.cleared) continue;
      const cx = poi.x * TILE, cy = poi.y * TILE;
      let near = false;
      for (const p of this.players.values())
        if (p.mapId === 'over' && dist2(p.x, p.y, cx, cy) < 350 ** 2) { near = true; break; }
      if (near && !poi.spawned) {
        poi.spawned = [];
        const kinds = ['bandit', 'bandit', 'banditHeavy', 'bandit'];
        for (let i = 0; i <= poi.difficulty + 1; i++) {
          poi.spawned.push(this.spawnEnemy(kinds[i % kinds.length], 'over',
            cx + (this.rand() - 0.5) * 90, cy + (this.rand() - 0.5) * 90, { camp: poi.id, faction: 'bandits' }));
        }
      }
      if (poi.spawned && !poi.spawned.some(id => this.entities.has(id))) {
        poi.cleared = true;
        this.events.push(this.world.day, `Зачищен лагерь: ${poi.name}`, { x: poi.x, y: poi.y });
        this.toastAll(`${poi.name} — зачищено!`);
        this.onPoiCleared(poi);
      }
    }
  }

  stepEntities(dt) {
    for (const e of [...this.entities.values()]) {
      if (e.entType === 'drop') {
        e.ttl -= dt;
        if (e.ttl <= 0) { this.entities.delete(e.id); continue; }
        this.checkPickup(e);
        continue;
      }
      // LOD: обновляем только рядом с игроками
      let near = false;
      for (const p of this.players.values()) {
        if (p.mapId !== e.mapId || p.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) < HOT_RADIUS ** 2) { near = true; break; }
      }
      if (!near) continue;

      const map = this.mapFor(e.mapId);
      if (e.entType === 'enemy') {
        const npcs = [...this.entities.values()].filter(n => n.entType === 'npc' && n.mapId === e.mapId);
        const shots = updateEnemy(e, dt, map, [...this.players.values()], this.rand, npcs);
        for (const s of shots) this.enemyFire(e, s);
        // контактный урон
        const def = ENEMIES[e.kind];
        if (def.touchDamage > 0) {
          for (const p of this.players.values()) {
            if (p.dead || p.mapId !== e.mapId) continue;
            if (circlesOverlap(e.x, e.y, def.radius, p.x, p.y, PLAYER_RADIUS))
              this.damagePlayer(p, def.touchDamage, e);
          }
        }
        // стража дерётся с врагами
        for (const n of this.entities.values()) {
          if (n.entType !== 'npc' || n.mapId !== e.mapId) continue;
          if (circlesOverlap(e.x, e.y, def.radius, n.x, n.y, 5) && def.touchDamage > 0) {
            n.touchCd = (n.touchCd || 0) - dt;
            if (n.touchCd <= 0) { n.touchCd = 1; this.damageNpc(n, def.touchDamage, null); }
          }
        }
      } else if (e.entType === 'npc') {
        updateNpc(e, dt, map, this);
      }
    }
  }

  // ---------- активные способности (Q/E/R) ----------
  useAbility(p, slot) {
    if (p.dead || p.rollT > 0) return;
    const ab = abilitiesOf(p.cls)[slot];
    if (!ab || p.level < ab.lvl) return;
    p.abCd = p.abCd || [0, 0, 0];
    if ((p.abCd[slot] || 0) > 0) return;
    if (ab.mana > 0 && (p.ammo.mana || 0) < ab.mana) { this.toast(p, 'Не хватает маны'); return; }
    if (ab.mana > 0) p.ammo.mana -= ab.mana;
    p.abCd[slot] = ab.cd;
    const aim = p.aim || 0;
    const d = p.derived || {};
    const map = this.mapFor(p.mapId);
    // урон всем врагам в радиусе (опц. фильтр по конусу)
    const hitAround = (cx, cy, radius, dmg, kb, filter) => {
      for (const e of [...this.entities.values()]) {
        if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
        const def = ENEMIES[e.kind];
        if (dist2(cx, cy, e.x, e.y) > (radius + def.radius) ** 2) continue;
        if (filter && !filter(e)) continue;
        const a = Math.atan2(e.y - cy, e.x - cx);
        this.damageEnemy(e, dmg, {
          vx: Math.cos(a), vy: Math.sin(a), knockback: kb, owner: p.id,
          school: p.cls === 'mage' ? 'magic' : 'melee',
        });
      }
    };
    switch (ab.id) {
      case 'power_strike': { // воин Q: сокрушительный удар по площади
        const mult = this.hasTalent(p, 'ab_power') ? 3.5 : 2.5;
        const wDmg = this.weapon(p).melee ? this.weapon(p).damage : 4;
        hitAround(p.x, p.y, 44, Math.round(wDmg * (d.dmgMelee || 1) * mult * 10) / 10, 200);
        break;
      }
      case 'war_cry': { // воин E: стан вокруг, талант — лечит группу
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) < 95 * 95) { e.stunT = 1.5; e.aggro = true; }
        }
        if (this.hasTalent(p, 'ab_cryheal')) {
          for (const q of this.players.values()) {
            if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 95 * 95) continue;
            q.hp = Math.min(q.maxHp, q.hp + 1);
          }
        }
        break;
      }
      case 'whirlwind': { // воин R: рывок с вращением, урон по пути
        const dash = this.hasTalent(p, 'ab_whirlfar') ? 120 : 80;
        for (let i = 0; i < 8; i++) {
          moveWithCollision(p, Math.cos(aim) * dash / 8, Math.sin(aim) * dash / 8, PLAYER_RADIUS, map);
          hitAround(p.x, p.y, 30, Math.round(4 * (d.dmgMelee || 1) * 10) / 10, 80);
        }
        p.hurtT = Math.max(p.hurtT, 0.4);
        break;
      }
      case 'flame_wave': { // маг Q: конус огня перед собой
        const wide = this.hasTalent(p, 'ab_wave');
        const half = (wide ? 50 : 35) * Math.PI / 180;
        hitAround(p.x, p.y, wide ? 140 : 100, Math.round(5 * (d.dmgMagic || 1) * 1.5 * 10) / 10, 60, e => {
          let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          return Math.abs(da) <= half;
        });
        break;
      }
      case 'frost_nova': { // маг E: кольцо льда — заморозка и урон
        const deep = this.hasTalent(p, 'ab_nova');
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 85 * 85) continue;
          e.slowT = deep ? 4 : 3;
          e.slowMult = deep ? 0.08 : 0.35;
          this.damageEnemy(e, Math.round(4 * (d.dmgMagic || 1) * 10) / 10,
            { vx: 0, vy: 0, knockback: 0, owner: p.id, school: 'magic' });
        }
        break;
      }
      case 'blink': { // маг R: телепорт по прицелу до первой стены
        const sx = p.x, sy = p.y;
        let bx = p.x, by = p.y;
        for (let i = 1; i <= 14; i++) {
          const nx = p.x + Math.cos(aim) * 140 * i / 14;
          const ny = p.y + Math.sin(aim) * 140 * i / 14;
          if (map.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) break;
          bx = nx; by = ny;
        }
        p.x = bx; p.y = by;
        p.hurtT = Math.max(p.hurtT, 0.3);
        if (this.hasTalent(p, 'ab_blink'))
          this.explodeAt(p.mapId, sx, sy, Math.round(6 * (d.dmgMagic || 1) * 10) / 10, 30, p.id, 0);
        break;
      }
      case 'shadow_dash': { // вор Q: рывок сквозь врагов, режет по линии
        const sx = p.x, sy = p.y;
        for (let i = 0; i < 8; i++)
          moveWithCollision(p, Math.cos(aim) * 95 / 8, Math.sin(aim) * 95 / 8, PLAYER_RADIUS, map);
        const len2 = dist2(sx, sy, p.x, p.y) || 1;
        for (const e of [...this.entities.values()]) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          const t = Math.max(0, Math.min(1, ((e.x - sx) * (p.x - sx) + (e.y - sy) * (p.y - sy)) / len2));
          const lx = sx + (p.x - sx) * t, ly = sy + (p.y - sy) * t;
          if (dist2(e.x, e.y, lx, ly) < 26 * 26) {
            this.damageEnemy(e, Math.round(5 * (d.dmgMelee || 1) * 10) / 10,
              { vx: Math.cos(aim), vy: Math.sin(aim), knockback: 60, owner: p.id, school: 'melee' });
            if (this.hasTalent(p, 'ab_dash')) e.stunT = 1;
          }
        }
        p.hurtT = Math.max(p.hurtT, 0.35);
        break;
      }
      case 'smoke_bomb': { // вор E: невидимость, враги теряют цель
        const long = this.hasTalent(p, 'ab_smoke');
        p.invisT = long ? 5 : 3;
        if (long) { p.buffs.speed = { mult: 0.3, t: 5 }; this.recomputeStats(p); }
        for (const e of this.entities.values())
          if (e.entType === 'enemy' && e.mapId === p.mapId) e.aggro = false;
        break;
      }
      case 'blade_storm': { // вор R: веер клинков во все стороны
        const count = this.hasTalent(p, 'ab_blades') ? 18 : 12;
        const atk = this.rollAttack(p, getWeapon('knives'));
        for (let i = 0; i < count; i++) {
          const a = aim + (i / count) * Math.PI * 2;
          this.projectiles.push({
            x: p.x, y: p.y - 4, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
            life: 0.6, radius: 2, dmg: Math.round(3 * (d.dmgRanged || 1) * 10) / 10, crit: atk.crit,
            knockback: 40, school: 'ranged', owner: p.id, friendly: true, mapId: p.mapId,
          });
        }
        break;
      }
    }
    this.fx({ t: 'ability', pid: p.id, id: ab.id, x: p.x, y: p.y, aim }, p.mapId, p.x, p.y);
  }

  // Сепарация тел: модели не наслаиваются; игрок в перекате проскальзывает
  separateEntities() {
    const bodies = [];
    for (const p of this.players.values()) {
      if (p.dead) continue;
      bodies.push({ e: p, r: PLAYER_RADIUS, rolling: p.rollT > 0 });
    }
    for (const e of this.entities.values()) {
      if (e.entType === 'enemy') bodies.push({ e, r: ENEMIES[e.kind].radius });
      else if (e.entType === 'npc') bodies.push({ e, r: 5 });
    }
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (A.e.mapId !== B.e.mapId) continue;
        if (A.rolling || B.rolling) continue; // перекат проходит сквозь
        const minD = A.r + B.r;
        let dx = B.e.x - A.e.x, dy = B.e.y - A.e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        if (d2 < 1e-6) { dx = 1; dy = 0; }
        const d = Math.sqrt(d2) || 1;
        const push = Math.min(3, (minD - d) / 2); // мягкое расталкивание
        const nx = dx / d, ny = dy / d;
        const map = this.mapFor(A.e.mapId);
        moveWithCollision(A.e, -nx * push, -ny * push, A.r, map);
        moveWithCollision(B.e, nx * push, ny * push, B.r, map);
      }
    }
  }

  enemyFire(e, shot) {
    const pat = PATTERNS[shot.pattern];
    if (!pat) return;
    const seed = hash2(this.world.seed, this.tick, hashId(e.id));
    const shotIndex = shot.shotIndex || 0;
    const dirs = emitDirections(pat, shot.aim, shotIndex, seed);
    const bursts = pat.burst || 1;
    for (let b = 0; b < bursts; b++) {
      const delay = b * (pat.burstInterval || 0);
      for (const a of dirs) {
        this.projectiles.push({
          x: e.x, y: e.y - 3, vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed,
          life: pat.life + delay, delay, radius: pat.projRadius, dmg: 1, knockback: 15,
          owner: e.id, friendly: false, mapId: e.mapId,
        });
      }
    }
    this.fx({ t: 'eshot', eid: e.id, pattern: shot.pattern, x: e.x, y: e.y, aim: shot.aim, shotIndex, seed, tick: this.tick }, e.mapId, e.x, e.y);
  }

  // Взрыв: урон всем врагам в радиусе + ломает стены (несколько блоков!)
  explodeAt(mapId, x, y, dmg, radius, owner, structDmg = 0) {
    for (const e of [...this.entities.values()]) {
      if (e.entType !== 'enemy' || e.mapId !== mapId) continue;
      const def = ENEMIES[e.kind];
      const d = Math.sqrt(dist2(x, y, e.x, e.y));
      if (d > radius + def.radius) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      this.damageEnemy(e, dmg, { vx: Math.cos(a), vy: Math.sin(a), knockback: 90, owner, school: 'magic' });
    }
    if (structDmg > 0) {
      const attacker = this.players.get(owner);
      const t0x = Math.floor((x - radius) / TILE), t1x = Math.floor((x + radius) / TILE);
      const t0y = Math.floor((y - radius) / TILE), t1y = Math.floor((y + radius) / TILE);
      for (let ty = t0y; ty <= t1y; ty++) {
        for (let tx = t0x; tx <= t1x; tx++) {
          const cx = tx * TILE + 8, cy = ty * TILE + 8;
          if (dist2(x, y, cx, cy) > (radius + 8) ** 2) continue;
          this.damageTile(mapId, tx, ty, structDmg, attacker);
        }
      }
    }
    this.fx({ t: 'boom', x, y, r: radius }, mapId, x, y);
  }

  // Цепная молния: перескакивает на ближайших врагов
  chainLightning(pr, firstTarget) {
    const hitIds = new Set([firstTarget.id]);
    const pts = [[Math.round(firstTarget.x), Math.round(firstTarget.y)]];
    let from = firstTarget;
    let dmg = pr.dmg;
    for (let hop = 0; hop < pr.chain.count; hop++) {
      dmg = Math.round(dmg * pr.chain.falloff * 10) / 10;
      let next = null, best = pr.chain.radius ** 2;
      for (const e of this.entities.values()) {
        if (e.entType !== 'enemy' || e.mapId !== pr.mapId || hitIds.has(e.id)) continue;
        const d = dist2(from.x, from.y, e.x, e.y);
        if (d < best) { best = d; next = e; }
      }
      if (!next) break;
      hitIds.add(next.id);
      pts.push([Math.round(next.x), Math.round(next.y)]);
      this.damageEnemy(next, dmg, { vx: 0, vy: 0, knockback: 0, owner: pr.owner, school: 'magic' });
      from = next;
    }
    if (pts.length > 1) this.fx({ t: 'chain', pts }, pr.mapId, pts[0][0], pts[0][1]);
  }

  stepProjectiles(dt) {
    const alive = [];
    for (const pr of this.projectiles) {
      if (pr.delay > 0) { pr.delay -= dt; alive.push(pr); continue; }
      const map = this.mapFor(pr.mapId);
      if (!stepProjectile(pr, dt, map)) {
        if (pr.explode) {
          this.explodeAt(pr.mapId, pr.x, pr.y, pr.dmg, pr.explode.radius, pr.owner, pr.structDmg || 0);
        } else if (pr.structDmg > 0 && pr.life > 0) {
          // пуля упёрлась в стену: бьём тайл по направлению полёта
          const tx = Math.floor((pr.x + Math.sign(pr.vx) * 6) / TILE);
          const ty = Math.floor((pr.y + Math.sign(pr.vy) * 6) / TILE);
          if (!this.damageTile(pr.mapId, tx, ty, pr.structDmg, this.players.get(pr.owner)))
            this.fx({ t: 'hit', kind: 'wall', x: pr.x, y: pr.y }, pr.mapId, pr.x, pr.y);
        } else {
          this.fx({ t: 'hit', kind: 'wall', x: pr.x, y: pr.y }, pr.mapId, pr.x, pr.y);
        }
        continue;
      }
      let hit = false;
      if (pr.friendly) {
        // по врагам
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== pr.mapId) continue;
          const def = ENEMIES[e.kind];
          if (circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, def.radius)) {
            if (pr.explode) {
              this.explodeAt(pr.mapId, pr.x, pr.y, pr.dmg, pr.explode.radius, pr.owner, pr.structDmg || 0);
            } else {
              this.damageEnemy(e, pr.dmg, pr);
              if (pr.chain) this.chainLightning(pr, e);
            }
            hit = true; break;
          }
        }
        // по NPC (только пули игроков — стража своих не заденет)
        if (!hit && !pr.guard) {
          for (const n of this.entities.values()) {
            if (n.entType !== 'npc' || n.mapId !== pr.mapId) continue;
            if (circlesOverlap(pr.x, pr.y, pr.radius, n.x, n.y, 5)) {
              this.damageNpc(n, pr.dmg, this.players.get(pr.owner));
              hit = true; break;
            }
          }
        }
        // пули стражи бьют враждебных игроков
        if (!hit && pr.guard) {
          for (const p of this.players.values()) {
            if (p.dead || p.mapId !== pr.mapId || !p.aggroFactions.size) continue;
            if (circlesOverlap(pr.x, pr.y, pr.radius, p.x, p.y, PLAYER_RADIUS)) {
              this.damagePlayer(p, pr.dmg, null);
              hit = true; break;
            }
          }
        }
      } else {
        for (const p of this.players.values()) {
          if (p.dead || p.mapId !== pr.mapId) continue;
          if (circlesOverlap(pr.x, pr.y, pr.radius, p.x, p.y, PLAYER_RADIUS)) {
            this.damagePlayer(p, pr.dmg, null);
            hit = true; break;
          }
        }
        // снаряды монстров ранят и жителей со стражей
        if (!hit) {
          for (const n of this.entities.values()) {
            if (n.entType !== 'npc' || n.mapId !== pr.mapId) continue;
            if (circlesOverlap(pr.x, pr.y, pr.radius, n.x, n.y, 5)) {
              this.damageNpc(n, pr.dmg, null);
              hit = true; break;
            }
          }
        }
      }
      if (!hit) alive.push(pr);
      else this.fx({ t: 'hit', kind: 'flesh', x: pr.x, y: pr.y }, pr.mapId, pr.x, pr.y);
    }
    this.projectiles = alive;
  }

  // ---------- урон ----------
  damageEnemy(e, dmg, pr) {
    e.hp -= dmg;
    e.aggro = true;
    if (pr && pr.knockback) {
      const kb = pr.knockback / 60;
      const map = this.mapFor(e.mapId);
      const a = Math.atan2(pr.vy, pr.vx);
      const dx = Math.cos(a) * kb, dy = Math.sin(a) * kb;
      if (!map.isSolid(Math.floor((e.x + dx) / TILE), Math.floor((e.y + dy) / TILE))) { e.x += dx; e.y += dy; }
    }
    // замедление льдом
    if (pr && pr.slow) { e.slowT = Math.max(e.slowT || 0, pr.slow.time); e.slowMult = pr.slow.mult; }
    this.fx({ t: 'hurt', id: e.id, x: e.x, y: e.y, dmg: Math.round(dmg * 10) / 10, crit: pr?.crit ? 1 : 0 }, e.mapId, e.x, e.y);
    if (e.hp <= 0) this.killEnemy(e, pr);
  }

  killEnemy(e, pr) {
    const def = ENEMIES[e.kind];
    const killer = pr && this.players.get(pr.owner);
    this.entities.delete(e.id);
    this.fx({ t: 'die', id: e.id, kind: def.sprite, x: e.x, y: e.y }, e.mapId, e.x, e.y);
    // опыт — всем игрокам рядом (кооп-дружелюбно), иначе убийце
    const nearby = [...this.players.values()].filter(q =>
      !q.dead && q.mapId === e.mapId && dist2(q.x, q.y, e.x, e.y) < 350 ** 2);
    const gainers = nearby.length ? nearby : (killer ? [killer] : []);
    for (const q of gainers) this.addXp(q, def.xp);
    // Кровожадность: лечение за убийство в ближнем бою
    if (killer && pr.school === 'melee' && this.hasTalent(killer, 'bloodlust'))
      killer.hp = Math.min(killer.maxHp, killer.hp + 1);
    // дроп: удача повышает количество, шанс и редкость добычи
    const luck = killer?.effStats?.lck ?? killer?.stats?.lck ?? 0;
    const dropBonus = killer?.derived?.dropBonus || 0;
    for (const [item, range] of Object.entries(def.drops || {})) {
      if (item === 'weapon') { this.dropRandomWeapon(e.mapId, e.x, e.y, luck, 2); continue; }
      let n = Array.isArray(range) ? randInt(this.rand, range[0], range[1]) : range;
      if (item === 'coin' && killer) n = Math.round(n * (killer.derived?.coinMult || 1));
      if (n > 0) this.spawnDrop(item, n, e.mapId, e.x + (this.rand() - 0.5) * 14, e.y + (this.rand() - 0.5) * 14);
    }
    if (this.rand() < 0.15 * (1 + dropBonus * 2)) this.spawnDrop('herb', 1, e.mapId, e.x, e.y);
    if (this.rand() < 0.05 * (1 + dropBonus * 3)) this.spawnDrop('heal_potion', 1, e.mapId, e.x, e.y);
    if (e.kind === 'wolf' && this.rand() < 0.5 * (1 + dropBonus)) this.spawnDrop('hide', 1, e.mapId, e.x, e.y);
    if (e.kind === 'banditHeavy' && this.rand() < 0.25 * (1 + dropBonus)) this.dropRandomGear(e.mapId, e.x, e.y, false, luck);
    // удача: шанс дополнительной находки
    if (this.rand() < dropBonus) this.spawnDrop('coin', 2 + Math.floor(this.rand() * 3), e.mapId, e.x + 8, e.y);
    if (e.token) this.abstract.onTokenUnitKilled(e.token);
    if (e.kind === 'bossOgre') {
      this.dropRandomGear(e.mapId, e.x + 12, e.y, true, luck);
      this.toastAll(STR.bossDefeated(def.name));
      this.events.push(this.world.day, `Пал грозный ${def.name}!`);
    }
    // квест «убить стаю» проверяется в onTokenUnitKilled через журнал
    if (killer && killer.quest && killer.quest.type === 'kill' && e.token === killer.quest.token) {
      const tokenGone = !this.abstract.tokens.some(t => t.id === e.token);
      if (tokenGone) this.completeQuestObjective(killer);
    }
  }

  damageNpc(n, dmg, attacker) {
    n.hp -= dmg;
    this.fx({ t: 'hurt', id: n.id, x: n.x, y: n.y }, n.mapId, n.x, n.y);
    const s = this.world.settlements.find(x => x.id === n.home);
    if (attacker && s) {
      attacker.rep[s.faction] = (attacker.rep[s.faction] || 0) - 6;
      attacker.aggroFactions.add(s.faction);
      this.toast(attacker, STR.repDown(FACTIONS[s.faction]?.name || s.faction));
    }
    if (n.hp <= 0) {
      this.entities.delete(n.id);
      this.fx({ t: 'die', id: n.id, kind: n.kind, x: n.x, y: n.y }, n.mapId, n.x, n.y);
      this.spawnDrop('coin', randInt(this.rand, 1, 4), n.mapId, n.x, n.y);
      if (s) {
        s.population = Math.max(0, s.population - 1);
        if (attacker) {
          attacker.rep[s.faction] -= 20;
          this.events.push(this.world.day, `${attacker.name} убил жителя ${s.name}`, { x: s.x, y: s.y });
        } else {
          this.events.push(this.world.day, `Житель ${s.name} погиб от чудовищ`, { x: s.x, y: s.y });
        }
      }
    }
  }

  damagePlayer(p, dmg, source) {
    if (p.dead || hasIFrames(p)) return;
    // уворот от ловкости и экипировки: урон полностью игнорируется
    if (this.rand() < (p.derived?.dodge || 0)) {
      this.fx({ t: 'dodge', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      return;
    }
    // блок щитом в левой руке (ПКМ): режет урон, гасит полностью удары спереди
    if (p.blocking) {
      const off = getItem(p.equipment.offhand);
      if (off?.block) {
        let frontal = false;
        if (source && source.x !== undefined) {
          let da = Math.atan2(source.y - p.y, source.x - p.x) - p.aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          frontal = Math.abs(da) <= Math.PI / 2.5;
        }
        this.fx({ t: 'block', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        if (frontal) { p.hurtT = 0.3; return; } // лобовой удар полностью погашен
        dmg = Math.max(0.5, Math.round(dmg * 0.5 * 10) / 10);
      }
    }
    p.hp -= dmg;
    p.hurtT = PLAYER_HURT_INVULN;
    // урон вблизи: обоих отбрасывает друг от друга — не залипаем в тушке
    if (source && source.x !== undefined && dist2(p.x, p.y, source.x, source.y) < 40 * 40) {
      const a = Math.atan2(p.y - source.y, p.x - source.x);
      const map = this.mapFor(p.mapId);
      moveWithCollision(p, Math.cos(a) * 22, Math.sin(a) * 22, PLAYER_RADIUS, map);
      if (source.entType === 'enemy') {
        const def = ENEMIES[source.kind];
        moveWithCollision(source, -Math.cos(a) * 10, -Math.sin(a) * 10, def?.radius || 5, map);
      }
    }
    this.fx({ t: 'phurt', id: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    if (p.hp <= 0) {
      p.dead = true;
      p.downT = 25;
      p.coins = Math.floor(p.coins * 0.8);
      this.fx({ t: 'pdown', id: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.events.push(this.world.day, `${p.name} пал в бою`);
    }
  }

  respawn(p) {
    const s = this.world.settlements[0];
    p.dead = false;
    p.hp = p.maxHp;
    p.hunger = Math.max(p.hunger, 40);
    p.mapId = 'over';
    p.x = (s ? s.x : 256) * TILE + 40;
    p.y = (s ? s.y : 256) * TILE + 40;
    p.aggroFactions.clear();
  }

  checkPickup(drop) {
    for (const p of this.players.values()) {
      if (p.dead || p.mapId !== drop.mapId) continue;
      if (!circlesOverlap(p.x, p.y, PLAYER_RADIUS + 6, drop.x, drop.y, 4)) continue;
      if (drop.item === 'coin') p.coins += drop.count;
      else if (drop.item.startsWith('weapon:')) {
        p.inventory[drop.item] = (p.inventory[drop.item] || 0) + 1;
        this.toast(p, STR.pickupWeapon(this.itemName(drop.item)) + ' (в сумке)');
      } else if (drop.item.startsWith('ammo_')) {
        const type = drop.item.slice(5);
        p.ammo[type] = (p.ammo[type] || 0) + drop.count * 6;
        this.toast(p, STR.pickup(ITEM_NAMES[drop.item] || drop.item));
      } else {
        p.inventory[drop.item] = (p.inventory[drop.item] || 0) + drop.count;
        this.toast(p, STR.pickup(ITEMS[drop.item]?.name || ITEM_NAMES[drop.item] || drop.item));
      }
      this.entities.delete(drop.id);
      this.fx({ t: 'pickup', x: drop.x, y: drop.y }, drop.mapId, drop.x, drop.y);
      return;
    }
  }

  // Дроп оружия: редкость зависит от удачи убийцы и источника (boost)
  dropRandomWeapon(mapId, x, y, luck = 0, boost = 0) {
    const pool = ['axe', 'huntbow', 'crossbow', 'knives', 'firestaff', 'froststaff',
      'fireball', 'stormstaff', 'spear', 'warhammer', 'dagger', 'taxes', 'venomstaff', 'bombs'];
    const rar = rollRarity(this.rand, luck, boost);
    this.spawnDrop('weapon:' + withRarity(pick(this.rand, pool), rar), 1, mapId, x, y);
  }

  dropRandomGear(mapId, x, y, elite = false, luck = 0) {
    const pool = elite
      ? ['chain_armor', 'plate_armor', 'scale_armor', 'bear_amulet', 'owl_amulet', 'swift_ring',
         'iron_shield', 'tower_shield', 'berserk_armor', 'mage_robe', 'shadow_cloak',
         'crown', 'rune_amulet', 'totem_amulet', 'gladiator_shield']
      : ['leather_armor', 'padded_armor', 'hunter_hood', 'leather_cap', 'iron_helmet',
         'wolf_amulet', 'fox_amulet', 'iron_ring', 'wood_shield', 'swift_ring',
         'sage_helmet', 'war_helm', 'lucky_charm'];
    const rar = rollRarity(this.rand, luck, elite ? 2 : 1);
    this.spawnDrop(withRarity(pick(this.rand, pool), rar), 1, mapId, x, y);
  }

  // ---------- данжи ----------
  enterDungeon(p, poi) {
    const mapId = 'dg:' + poi.id;
    if (!this.dungeons.has(mapId)) {
      const d = generateDungeon(hash2(this.world.seed, poi.x, poi.y), poi.difficulty, poi.boss);
      this.dungeons.set(mapId, { dungeon: d, poi });
      this.chunks.dungeons.set(mapId, d);
    }
    const { dungeon } = this.dungeons.get(mapId);
    p.mapId = mapId;
    p.x = dungeon.entrance.x * TILE + 8;
    p.y = (dungeon.entrance.y - 1) * TILE + 8;
    this.sendMapChange(p, poi.name);
  }

  exitDungeon(p) {
    const inst = this.dungeons.get(p.mapId);
    if (!inst) return;
    p.mapId = 'over';
    p.x = inst.poi.entrance.x * TILE + 8;
    p.y = (inst.poi.entrance.y + 2) * TILE + 8;
    this.sendMapChange(p, null);
  }

  sendMapChange(p, title) {
    this.fx({ t: 'mapChange', pid: p.id, mapId: p.mapId, x: p.x, y: p.y, title }, null);
  }

  checkDungeonRooms() {
    for (const [mapId, inst] of this.dungeons) {
      const { dungeon, poi } = inst;
      const playersHere = [...this.players.values()].filter(p => p.mapId === mapId && !p.dead);
      if (!playersHere.length) continue;
      for (const room of dungeon.rooms) {
        if (room.cleared) continue;
        const inside = playersHere.some(p => {
          const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
          return tx >= room.x - room.w + 1 && tx <= room.x + room.w - 1 && ty >= room.y - room.h + 1 && ty <= room.y + room.h - 1;
        });
        if (inside && !room.sealed && room.spawns.length) {
          room.sealed = true;
          room.enemyIds = room.spawns.map(sp =>
            this.spawnEnemy(sp.kind, mapId, sp.x * TILE + 8, sp.y * TILE + 8, { room: room.id }));
          for (const d of room.doors) this.setDungeonDoor(mapId, d, true);
          this.toastMap(mapId, STR.roomSealed);
        }
        if (room.sealed && room.enemyIds && !room.enemyIds.some(id => this.entities.has(id))) {
          room.cleared = true; room.sealed = false;
          for (const d of room.doors) this.setDungeonDoor(mapId, d, false);
          this.toastMap(mapId, STR.roomCleared);
          if (!dungeon.rooms.some(r => !r.cleared)) {
            poi.cleared = true;
            this.events.push(this.world.day, `Путники зачистили ${poi.name}`, { x: poi.x, y: poi.y });
            this.toastMap(mapId, `${poi.name} — зачищено!`);
            this.onPoiCleared(poi);
          }
        }
      }
    }
  }

  setDungeonDoor(mapId, d, closed) {
    const { dungeon } = this.dungeons.get(mapId);
    const cur = dungeon.grid[d.y * dungeon.size + d.x];
    if (closed && cur === T.DUNGEON_FLOOR) this.chunks.setTile(mapId, d.x, d.y, T.DUNGEON_DOOR);
    if (!closed && cur === T.DUNGEON_DOOR) this.chunks.setTile(mapId, d.x, d.y, T.DUNGEON_FLOOR);
    this.fx({ t: 'tile', mapId, x: d.x, y: d.y, tile: closed ? T.DUNGEON_DOOR : T.DUNGEON_FLOOR }, mapId, d.x * TILE, d.y * TILE);
  }

  onPoiCleared(poi) {
    for (const p of this.players.values()) {
      if (p.quest && p.quest.type === 'clear' && p.quest.poi === poi.id) this.completeQuestObjective(p);
    }
  }

  // ---------- взаимодействие (E) ----------
  interact(p) {
    if (p.dead) return;
    // поднять союзника
    for (const ally of this.players.values()) {
      if (ally === p || !ally.dead || ally.mapId !== p.mapId) continue;
      if (dist2(p.x, p.y, ally.x, ally.y) < REVIVE_DIST ** 2) {
        ally.dead = false; ally.hp = 3; ally.hurtT = 2;
        this.toastAll(`${p.name} поднял ${ally.name}!`);
        return;
      }
    }
    // NPC рядом: приоритет «полезным» ролям над стражей/жителями
    const ROLE_PRIO = { elder: 3, merchant: 2, trader: 2, blacksmith: 2, priest: 2, innkeeper: 2, hunter: 2 };
    let npc = null, bestScore = -Infinity;
    const R2 = 26 * 26; // ближе — иначе NPC перехватывают колодцы и доски
    for (const e of this.entities.values()) {
      if (e.entType !== 'npc' || e.mapId !== p.mapId) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d > R2) continue;
      const score = (ROLE_PRIO[e.role] || 0) * 1e7 - d;
      if (score > bestScore) { bestScore = score; npc = e; }
    }
    if (npc) { this.openDialog(p, npc); return; }

    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    // тайлы вокруг: у каждого здания своя польза
    p.useCd = p.useCd || {};
    const cdReady = (key, sec) => {
      if ((p.useCd[key] || 0) > this.tick) { this.toast(p, 'Ещё не время (' + Math.ceil((p.useCd[key] - this.tick) / 30) + ' с)'); return false; }
      p.useCd[key] = this.tick + sec * 30;
      return true;
    };
    const homeTown = () => this.world.settlements.find(s => !s.ruined && !s.captured &&
      (s.x - tx) ** 2 + (s.y - ty) ** 2 < 40 * 40);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = this.chunks.tileAt(p.mapId, tx + dx, ty + dy);
      if (t === T.CAMPFIRE) { this.openCrafting(p); return; }
      if (t === T.ANVIL) { this.openAnvilCrafting(p); return; }
      if (t === T.BOARD) { this.openBoard(p, homeTown()); return; }
      if (t === T.CHEST) { this.openChest(p, tx + dx, ty + dy); return; }
      if (t === T.DUNGEON_EXIT && p.mapId !== 'over') { this.exitDungeon(p); return; }
      if (t === T.BED) {
        if (p.hp >= p.maxHp) { this.toast(p, 'Ты не устал'); return; }
        if (!cdReady('bed', 90)) return;
        p.hp = Math.min(p.maxHp, p.hp + 2);
        this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toast(p, '💤 Вздремнул: +1 сердце');
        return;
      }
      if (t === T.WELL) {
        if (!cdReady('well', 45)) return;
        p.hunger = Math.min(HUNGER_MAX, p.hunger + 8);
        this.toast(p, '💧 Свежая вода: +сытость');
        return;
      }
      if (t === T.MINE) {
        if (!cdReady('mine', 60)) return;
        p.inventory.metal = (p.inventory.metal || 0) + 1;
        this.toast(p, '⛏ Добыл 1 металл');
        this.fx({ t: 'hit', kind: 'wall', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        return;
      }
      if (t === T.SHRINE) {
        if ((p.inventory.crystal || 0) < 1 && (p.ammo.mana || 0) < 5) {
          this.toast(p, 'Духи ждут подношения (5 маны)');
          return;
        }
        if (!cdReady('shrine', 60)) return;
        p.ammo.mana = Math.max(0, (p.ammo.mana || 0) - 5);
        p.buffs.blessed = { mult: 0.1, t: 120 };
        this.recomputeStats(p);
        this.toast(p, '✦ Духи довольны: +10% урона на 2 мин');
        return;
      }
      if (t === T.TOWER) {
        if (!cdReady('tower', 30)) return;
        let found = 0;
        for (const poi of this.world.pois) {
          if (poi.cleared) continue;
          if ((poi.x - tx) ** 2 + (poi.y - ty) ** 2 > 100 * 100) continue;
          this.fx({ t: 'marker', pid: p.id, x: poi.x, y: poi.y, text: poi.name }, null);
          found++;
        }
        this.toast(p, found ? `👁 С башни видно: ${found} лог. отмечено на карте` : '👁 Горизонт чист');
        return;
      }
      if (t === T.FIELD && p.mapId === 'over') {
        const s = homeTown();
        if (s && (p.rep[s.faction] || 0) < 10) { this.toast(p, 'Жители против — это их урожай'); return; }
        if (!cdReady('field', 120)) return;
        p.inventory.bread = (p.inventory.bread || 0) + 1;
        this.toast(p, '🌾 Собрал колосья: +1 хлеб');
        return;
      }
    }
    // вход в данж
    if (p.mapId === 'over') {
      for (const poi of this.world.pois) {
        if (poi.type !== 'dungeon') continue;
        if (dist2(p.x, p.y, poi.x * TILE + 8, poi.y * TILE + 8) < 30 * 30) {
          this.enterDungeon(p, poi);
          return;
        }
      }
    }
  }

  openChest(p, tx, ty) {
    this.chunks.setTile(p.mapId, tx, ty, p.mapId === 'over' ? T.GRASS : T.DUNGEON_FLOOR);
    this.fx({ t: 'tile', mapId: p.mapId, x: tx, y: ty, tile: p.mapId === 'over' ? T.GRASS : T.DUNGEON_FLOOR }, p.mapId, tx * TILE, ty * TILE);
    const luck = p.effStats?.lck ?? p.stats?.lck ?? 0;
    this.dropRandomWeapon(p.mapId, tx * TILE + 8, ty * TILE + 20, luck, 1);
    this.spawnDrop('coin', randInt(this.rand, 10, 25), p.mapId, tx * TILE - 4, ty * TILE + 20);
    if (this.rand() < 0.6 + (p.derived?.dropBonus || 0)) this.dropRandomGear(p.mapId, tx * TILE + 20, ty * TILE + 20, false, luck);
    this.fx({ t: 'chest', x: tx * TILE, y: ty * TILE }, p.mapId, tx * TILE, ty * TILE);
  }

  // ---------- диалоги / магазин / квесты / слухи ----------
  // NPC помнят знакомых: первая встреча — представление, дальше — приветствие
  npcGreeting(p, npc) {
    p.met = p.met || new Set();
    const key = npc.home + ':' + npc.role + ':' + npc.name;
    if (p.met.has(key)) {
      const warm = (p.rep[this.world.settlements.find(x => x.id === npc.home)?.faction] || 0) > 30;
      return warm ? `«Рад видеть тебя снова, ${p.name}!»` : `«А, это снова ты, ${p.name}».`;
    }
    p.met.add(key);
    return `«Будем знакомы — ${npc.name}».`;
  }

  openDialog(p, npc) {
    const s = this.world.settlements.find(x => x.id === npc.home);
    const fname = s ? (FACTIONS[s.faction]?.name || '') : '';
    if (npc.role === 'merchant' || npc.role === 'trader') {
      const mult = priceMultiplier(s ? p.rep[s.faction] : 0);
      const choices = SHOP.map((it, i) => {
        const name = this.itemName(it.item);
        let note = '';
        if (it.item.startsWith('ammo_')) {
          const type = it.item.slice(5);
          const users = ammoUsers(type);
          const hasWeapon = p.weapons.some(w => getWeapon(w)?.ammoType === type)
            || Object.keys(p.inventory).some(k => isWeaponItem(k) && getWeapon(weaponIdOf(k))?.ammoType === type);
          note = hasWeapon ? '' : ` [нужен: ${users}]`;
        } else if (ITEMS[it.item]?.slot) {
          note = ` (${describeItem(it.item)})`;
        } else if (isWeaponItem(it.item)) {
          const w = getWeapon(weaponIdOf(it.item));
          note = ` (${SCHOOL_NAMES[w.school]}, урон ${w.damage})`;
        }
        const price = Math.ceil(it.price * mult * scarcityMult(s, it.item, 'buy'));
        const trend = scarcityMult(s, it.item, 'buy') > 1 ? '▲' : scarcityMult(s, it.item, 'buy') < 1 ? '▼' : '';
        return {
          id: 'buy:' + i,
          label: `${name}${it.count ? ' x' + it.count : ''}${note} — ${price}${trend} мон.`,
        };
      });
      choices.push({ id: 'sell', label: '💰 Продать вещи' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Торговец ${npc.name}`, [this.npcGreeting(p, npc), `Добро пожаловать! (у тебя ${p.coins} мон.)`], choices);
    } else if (npc.role === 'elder') {
      this.checkDeliver(p, npc);
      const lines = [`Старейшина ${s ? s.name : ''} (${fname})`];
      if (s) {
        lines.push(`Жителей: ${s.population}/${Math.floor(s.housingCap)} · стражи: ${s.guards}${s.wardT > 0 ? ' · ✦оберег' : ''}`);
        lines.push(`Пшеница: ${Math.round(s.food)} · лес: ${Math.round(s.wood)} · металл: ${Math.round(s.metal)} · кристаллы: ${Math.round(s.crystal)}`);
        if (s.project) {
          const pct = Math.round(100 * s.project.progress / s.project.ticks);
          lines.push(`Идёт стройка (${pct}%)`);
        }
        if (s.food < 25) lines.push('⚠ Припасы на исходе — нам нужна еда!');
      }
      const choices = [];
      // дипломатия: посредничество между враждующими фракциями
      if (s && (p.rep[s.faction] || 0) >= 30) {
        for (const [f, v] of Object.entries(RELATIONS[s.faction] || {})) {
          if (v < -10 && FACTIONS[f] && !FACTIONS[f].hostileToPlayers) {
            choices.push({ id: 'mediate:' + f, label: `☮ Помирить с «${FACTIONS[f].name}» (50 мон.)` });
            break;
          }
        }
      }
      if (p.quest && p.quest.type === 'supply' && !p.quest.done && p.quest.giver === npc.home) {
        const have = p.inventory[p.quest.item] || 0;
        choices.push({ id: 'supply', label: `Отдать припасы (${Math.min(have, p.quest.count)}/${p.quest.count})` });
      } else if (p.quest && !p.quest.done && p.quest.giver === npc.home) {
        lines.push('Как продвигается дело?');
      } else if (p.quest && p.quest.done && p.quest.giver === npc.home) {
        choices.push({ id: 'turnin', label: STR.questTurnIn });
      } else if (!p.quest) {
        choices.push({ id: 'quest', label: STR.questAccept });
      }
      if (s?.project && (p.inventory.wood || 0) >= 5)
        choices.push({ id: 'donate', label: 'Пожертвовать 5 древесины на стройку (+реп)' });
      choices.push({ id: 'rumor', label: STR.rumor });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Старейшина ${npc.name}`, [this.npcGreeting(p, npc), ...lines.slice(1)], choices);
    } else if (npc.role === 'blacksmith') {
      const w = this.weapon(p);
      const lvl = p.weaponUp?.[w.id] || 0;
      const lines = [`Кузнец: «Покажи, что у тебя в руках…»`];
      const choices = [];
      if (lvl >= 3) lines.push(`${w.name} +${lvl} — лучше уже не выковать.`);
      else {
        const costM = 3 * (lvl + 1), costC = 30 * (lvl + 1);
        lines.push(`${w.name}${lvl ? ' +' + lvl : ''} → +${(lvl + 1) * 10}% урона`);
        choices.push({ id: 'forge', label: `Улучшить (${costM} металла, ${costC} мон.)` });
      }
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Кузнец ${npc.name}`, [this.npcGreeting(p, npc), ...lines.slice(1)], choices);
    } else if (npc.role === 'priest') {
      const choices = [
        { id: 'healme', label: 'Исцеление (12 мон.)' },
        { id: 'bless', label: 'Благословение: +15% урона на 3 мин (30 мон.)' },
        { id: 'close', label: STR.bye },
      ];
      this.sendDialog(p, npc.id, `Жрец ${npc.name}`, [this.npcGreeting(p, npc), '«Духи иного мира благосклонны к тебе».'], choices);
    } else if (npc.role === 'innkeeper') {
      const hasMerc = p.mercId && this.entities.has(p.mercId);
      const choices = [
        { id: 'rest', label: 'Отдых: полное восстановление (15 мон.)' },
        ...(hasMerc ? [] : [{ id: 'hire', label: '⚔ Нанять бойца-компаньона (60 мон.)' }]),
        { id: 'rumor', label: STR.rumor },
        { id: 'close', label: STR.bye },
      ];
      this.sendDialog(p, npc.id, `Трактирщик ${npc.name}`, [this.npcGreeting(p, npc), '«Присаживайся! Эль свежий, слухи свежее».'], choices);
    } else if (npc.role === 'hunter') {
      const choices = [];
      if (!p.quest) choices.push({ id: 'huntquest', label: 'Взять заказ: 3 шкуры' });
      else if (p.quest.type === 'supply' && p.quest.item === 'hide' && p.quest.giver === npc.home)
        choices.push({ id: 'supply', label: `Отдать шкуры (${Math.min(p.inventory.hide || 0, p.quest.count)}/${p.quest.count})` });
      choices.push({ id: 'buyarrows', label: 'Купить стрелы x20 (7 мон.)' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Охотник ${npc.name}`, [this.npcGreeting(p, npc), '«Волки нынче жирные. Шкуры нужны — платим честно».'], choices);
    } else {
      const rumors = this.events.rumors(1);
      const line = rumors.length ? `Говорят, ${lc(rumors[0].text)}…` : 'Тихо у нас, и слава богам.';
      this.sendDialog(p, npc.id, `${npc.name}`, [this.npcGreeting(p, npc), line], [{ id: 'close', label: STR.bye }]);
    }
  }

  openCrafting(p) {
    const choices = RECIPES.map(r => ({ id: 'craft:' + r.id, label: r.name }));
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, 'campfire', STR.craft, ['Что будем делать?'], choices);
  }

  // Доска заказов гильдии: три задания на выбор
  openBoard(p, s) {
    if (!s) return;
    if (p.quest) {
      this.sendDialog(p, 'board', '📜 Доска заказов',
        [`У тебя уже есть дело: «${p.quest.title}»`], [{ id: 'close', label: STR.close }]);
      return;
    }
    const sx = s.x * TILE, sy = s.y * TILE;
    const list = [];
    const poi = this.world.pois.filter(x => !x.cleared)
      .sort((a, b) => dist2(a.x * TILE, a.y * TILE, sx, sy) - dist2(b.x * TILE, b.y * TILE, sx, sy))[0];
    if (poi) list.push({
      type: 'clear', poi: poi.id, giver: s.id, done: false,
      title: `Зачистить: ${poi.name}`, tx: poi.x, ty: poi.y,
      reward: { coins: 40 + poi.difficulty * 25, rep: 15, xp: 40 + poi.difficulty * 20 },
    });
    const tok = this.abstract.tokens.filter(t => t.type === 'pack')
      .sort((a, b) => dist2(a.x, a.y, sx, sy) - dist2(b.x, b.y, sx, sy))[0];
    if (tok) list.push({
      type: 'kill', token: tok.id, giver: s.id, done: false,
      title: `Истребить: ${tok.name}`, tx: Math.round(tok.x / TILE), ty: Math.round(tok.y / TILE),
      reward: { coins: 35, rep: 12, xp: 45 },
    });
    const to = this.world.settlements.filter(x => x.id !== s.id && !x.ruined && !x.captured)[0];
    if (to) list.push({
      type: 'deliver', to: to.id, giver: s.id, done: false,
      title: `Доставить письмо в ${to.name}`, tx: to.x, ty: to.y,
      reward: { coins: 25, rep: 10, xp: 30 },
    });
    const captured = this.world.settlements.find(x => x.captured);
    if (captured) {
      const dark = captured.faction === 'darkness';
      list.push({
        type: 'clear', poi: null, giver: s.id, done: false, liberate: captured.id,
        title: `⚔ ОСОБЫЙ: освободить ${captured.name} от ${dark ? 'Армии Тьмы' : 'бандитов'}!`,
        tx: captured.x, ty: captured.y,
        reward: { coins: dark ? 120 : 80, rep: 20, xp: dark ? 120 : 80 },
      });
    }
    p.pendingBoard = list;
    const choices = list.map((q, i) => ({ id: 'takeq:' + i, label: `${q.title} (+${q.reward.coins} мон.)` }));
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, 'board', '📜 Доска заказов гильдии', ['Свежие объявления:'], choices);
  }

  // Наковальня: кузнечный крафт из металла
  openAnvilCrafting(p) {
    const choices = ANVIL_RECIPES.map(r => ({ id: 'craft:' + r.id, label: r.name }));
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, 'anvil', '⚒ Наковальня', ['Металл звенит под молотом…'], choices);
  }

  sendDialog(p, id, name, lines, choices) {
    this.fx({ t: 'dialog', pid: p.id, id, name, lines, choices }, null);
  }

  dialogChoice(p, dialogId, choice) {
    if (choice === 'close') return;
    if (choice.startsWith('buy:')) {
      const it = SHOP[+choice.split(':')[1]];
      if (!it) return;
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      const price = Math.ceil(it.price * priceMultiplier(s ? p.rep[s.faction] : 0) * scarcityMult(s, it.item, 'buy'));
      if (p.coins < price) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= price;
      if (it.item.startsWith('ammo_')) p.ammo[it.item.slice(5)] = (p.ammo[it.item.slice(5)] || 0) + (it.count || 1);
      else p.inventory[it.item] = (p.inventory[it.item] || 0) + 1;
      this.toast(p, STR.pickup(this.itemName(it.item)));
      if (s) { p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + 1); }
      return;
    }
    if (choice.startsWith('craft:')) {
      const rid = choice.split(':')[1];
      const r = RECIPES.find(x => x.id === rid) || ANVIL_RECIPES.find(x => x.id === rid);
      if (!r) return;
      for (const [item, n] of Object.entries(r.needs))
        if ((p.inventory[item] || 0) < n) { this.toast(p, 'Не хватает ресурсов'); return; }
      for (const [item, n] of Object.entries(r.needs)) p.inventory[item] -= n;
      for (const [item, n] of Object.entries(r.gives)) {
        if (item.startsWith('ammo_')) p.ammo[item.slice(5)] = (p.ammo[item.slice(5)] || 0) + n;
        else p.inventory[item] = (p.inventory[item] || 0) + n;
      }
      this.toast(p, STR.pickup(ITEM_NAMES[Object.keys(r.gives)[0]]));
      return;
    }
    if (choice === 'sell') { this.fx({ t: 'sellMode', pid: p.id }, null); return; }
    if (choice.startsWith('mediate:')) {
      const other = choice.split(':')[1];
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!s || !FACTIONS[other] || p.coins < 50 || (p.rep[s.faction] || 0) < 30) {
        this.toast(p, p.coins < 50 ? STR.notEnoughCoins : 'Тебе не доверяют настолько');
        return;
      }
      p.coins -= 50;
      RELATIONS[s.faction][other] = Math.min(100, (RELATIONS[s.faction][other] || 0) + 25);
      RELATIONS[other][s.faction] = RELATIONS[s.faction][other];
      p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + 8);
      p.rep[other] = Math.min(100, (p.rep[other] || 0) + 8);
      this.toast(p, `☮ Мир между «${FACTIONS[s.faction].name}» и «${FACTIONS[other].name}» крепче`);
      this.events.push(this.world.day, `${p.name} примирил ${FACTIONS[s.faction].name} и ${FACTIONS[other].name}`);
      return;
    }
    if (choice === 'donate') {
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!s?.project || (p.inventory.wood || 0) < 5) return;
      p.inventory.wood -= 5;
      s.project.progress += 2;
      p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + 8);
      this.toast(p, STR.repUp(FACTIONS[s.faction]?.name || s.faction));
      this.events.push(this.world.day, `${p.name} помог стройке в ${s.name}`, { x: s.x, y: s.y });
      return;
    }
    if (choice === 'supply') {
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      const q = p.quest;
      if (!s || !q || q.type !== 'supply' || q.giver !== s.id) return;
      const have = p.inventory[q.item] || 0;
      const give = Math.min(have, q.count - (q.given || 0));
      if (give <= 0) { this.toast(p, 'Нечего отдать — принеси ' + (ITEM_NAMES[q.item] || q.item)); return; }
      p.inventory[q.item] -= give;
      q.given = (q.given || 0) + give;
      if (q.item === 'meat' || q.item === 'bread') s.food = Math.min(140, s.food + give * 6);
      else s.prosperity = Math.min(100, s.prosperity + give * 2);
      if (q.given >= q.count) { q.done = true; this.turnInQuest(p); }
      else this.toast(p, `Отдано ${q.given}/${q.count}`);
      return;
    }
    if (choice === 'forge') {
      const npc = this.entities.get(dialogId);
      const w = this.weapon(p);
      p.weaponUp = p.weaponUp || {};
      const lvl = p.weaponUp[w.id] || 0;
      if (!npc || lvl >= 3) return;
      const costM = 3 * (lvl + 1), costC = 30 * (lvl + 1);
      if ((p.inventory.metal || 0) < costM || p.coins < costC) {
        this.toast(p, `Нужно: ${costM} металла и ${costC} мон.`);
        return;
      }
      p.inventory.metal -= costM;
      p.coins -= costC;
      p.weaponUp[w.id] = lvl + 1;
      this.toast(p, `⚒ ${w.name} +${lvl + 1}: урон +${(lvl + 1) * 10}%`);
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      return;
    }
    if (choice === 'healme') {
      if (p.coins < 12) { this.toast(p, STR.notEnoughCoins); return; }
      if (p.hp >= p.maxHp) { this.toast(p, 'Ты и так здоров'); return; }
      p.coins -= 12;
      p.hp = p.maxHp;
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      return;
    }
    if (choice === 'bless') {
      if (p.coins < 30) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= 30;
      p.buffs.blessed = { mult: 0.15, t: 180 };
      this.recomputeStats(p);
      this.toast(p, '✦ Благословение: +15% урона на 3 минуты');
      return;
    }
    if (choice === 'rest') {
      if (p.coins < 15) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= 15;
      p.hp = p.maxHp;
      p.hunger = HUNGER_MAX;
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, '☘ Выспался и наелся — как новенький');
      return;
    }
    if (choice === 'hire') {
      if (p.mercId && this.entities.has(p.mercId)) return;
      if (p.coins < 60) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= 60;
      const id = this.spawnNpc('mercenary', null, p.mapId, p.x + 14, p.y, { owner: p.id, kind: 'npc_merc' });
      const merc = this.entities.get(id);
      merc.hp = merc.maxHp = 20;
      p.mercId = id;
      this.toast(p, `⚔ ${merc.name} теперь сражается за тебя`);
      return;
    }
    if (choice.startsWith('takeq:')) {
      const q = p.pendingBoard?.[+choice.split(':')[1]];
      if (!q || p.quest) return;
      p.quest = q;
      p.pendingBoard = null;
      this.toast(p, STR.questNew(q.title));
      return;
    }
    if (choice === 'huntquest') {
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!s || p.quest) return;
      p.quest = {
        type: 'supply', item: 'hide', count: 3, given: 0, giver: s.id, done: false,
        title: `Принести 3 шкуры охотнику ${s.name}`, tx: s.x, ty: s.y,
        reward: { coins: 25, rep: 8, xp: 30 },
      };
      this.toast(p, STR.questNew(p.quest.title));
      return;
    }
    if (choice === 'buyarrows') {
      if (p.coins < 7) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= 7;
      p.ammo.arrow = (p.ammo.arrow || 0) + 20;
      this.toast(p, STR.pickup(ITEM_NAMES.ammo_arrow));
      return;
    }
    if (choice === 'quest') { this.giveQuest(p, dialogId); return; }
    if (choice === 'turnin') { this.turnInQuest(p); return; }
    if (choice === 'rumor') {
      const rumors = this.events.rumors(3);
      const lines = rumors.length ? rumors.map(r => `День ${r.day}: ${r.text}`) : ['Пока всё спокойно.'];
      // маркеры на карту
      for (const r of rumors) if (r.x) this.fx({ t: 'marker', pid: p.id, x: r.x, y: r.y, text: r.text }, null);
      this.sendDialog(p, dialogId, 'Старейшина', lines, [{ id: 'close', label: STR.close }]);
    }
  }

  giveQuest(p, npcId) {
    const npc = this.entities.get(npcId);
    const s = npc && this.world.settlements.find(x => x.id === npc.home);
    if (!s) return;
    const sx = s.x * TILE, sy = s.y * TILE;
    const roll = this.rand();
    let quest = null;
    // голодающая деревня просит еду в первую очередь
    if (s.food < 35) {
      quest = {
        type: 'supply', item: 'meat', count: 6, given: 0, giver: s.id, done: false,
        title: `Принести 6 сырого мяса в ${s.name}`, tx: s.x, ty: s.y,
        reward: { coins: 30, rep: 15, xp: 35 },
      };
      p.quest = quest;
      this.toast(p, STR.questNew(quest.title));
      return;
    }
    // караван этой деревни в пути — предложи сопровождение
    const caravan = this.abstract.tokens.find(t =>
      t.type === 'caravan' && !t.dead && t.from === s.id && t.cargo);
    if (caravan && roll < 0.5) {
      const to = this.world.settlements.find(x => x.id === caravan.target);
      quest = {
        type: 'escort', token: caravan.id, giver: s.id, done: false,
        title: `Сопроводить караван в ${to?.name || '…'}`,
        tx: to?.x, ty: to?.y,
        reward: { coins: 45, rep: 12, xp: 40 },
      };
      p.quest = quest;
      this.toast(p, STR.questNew(quest.title) + ' (держись рядом с караваном!)');
      return;
    }
    if (roll < 0.45) {
      const poi = this.world.pois
        .filter(x => !x.cleared)
        .sort((a, b) => dist2(a.x * TILE, a.y * TILE, sx, sy) - dist2(b.x * TILE, b.y * TILE, sx, sy))[0];
      if (poi) quest = {
        type: 'clear', poi: poi.id, giver: s.id, done: false,
        title: `Зачистить: ${poi.name}`, tx: poi.x, ty: poi.y,
        reward: { coins: 40 + poi.difficulty * 25, rep: 15, xp: 40 + poi.difficulty * 20 },
      };
    } else if (roll < 0.75) {
      const tok = this.abstract.tokens
        .filter(t => t.type === 'pack')
        .sort((a, b) => dist2(a.x, a.y, sx, sy) - dist2(b.x, b.y, sx, sy))[0];
      if (tok) quest = {
        type: 'kill', token: tok.id, giver: s.id, done: false,
        title: `Истребить: ${tok.name}`, tx: Math.round(tok.x / TILE), ty: Math.round(tok.y / TILE),
        reward: { coins: 35, rep: 12, xp: 45 },
      };
    }
    if (!quest) {
      const to = pick(this.rand, this.world.settlements.filter(x => x.id !== s.id));
      if (to) quest = {
        type: 'deliver', to: to.id, giver: s.id, done: false,
        title: `Доставить письмо в ${to.name}`, tx: to.x, ty: to.y,
        reward: { coins: 25, rep: 10, xp: 30 },
      };
    }
    if (!quest) return;
    p.quest = quest;
    this.toast(p, STR.questNew(quest.title));
  }

  completeQuestObjective(p) {
    if (!p.quest || p.quest.done) return;
    p.quest.done = true;
    this.toast(p, `${p.quest.title} — выполнено! Вернись за наградой.`);
  }

  turnInQuest(p) {
    const q = p.quest;
    if (!q || !q.done) return;
    p.coins += q.reward.coins;
    const s = this.world.settlements.find(x => x.id === q.giver);
    if (s) {
      p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + q.reward.rep);
      this.toast(p, STR.repUp(FACTIONS[s.faction]?.name || s.faction));
      this.events.push(this.world.day, `${p.name} помог ${s.name}: ${lc(q.title)}`);
    }
    this.toast(p, STR.questDone(q.title) + ` (+${q.reward.coins} мон.)`);
    p.quest = null;
  }

  // доставка: пришёл к старейшине цели
  checkDeliver(p, npc) {
    if (p.quest && p.quest.type === 'deliver' && !p.quest.done && npc.home === p.quest.to)
      this.completeQuestObjective(p);
  }

  useItem(p, item) {
    if ((p.inventory[item] || 0) <= 0 || p.dead) return;
    if (FOOD_VALUE[item]) {
      p.inventory[item]--;
      p.hunger = Math.min(HUNGER_MAX, p.hunger + FOOD_VALUE[item]);
      if (item === 'cooked_meat') p.hp = Math.min(p.maxHp, p.hp + 1);
      this.fx({ t: 'eat', pid: p.id }, p.mapId, p.x, p.y);
      return;
    }
    if (item === 'bandage') {
      if (p.hp >= p.maxHp) return;
      p.inventory[item]--;
      p.hp = Math.min(p.maxHp, p.hp + 2);
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      return;
    }
    if (isGear(item)) { this.equipItem(p, item); return; }
    if (isPotion(item)) {
      const u = getItem(item).use;
      if (u.heal && p.hp >= p.maxHp) return;
      p.inventory[item]--;
      if (u.heal) p.hp = Math.min(p.maxHp, p.hp + u.heal);
      if (u.mana) p.ammo.mana = (p.ammo.mana || 0) + u.mana;
      if (u.buff) {
        p.buffs[u.buff] = { mult: u.mult, t: u.time };
        this.recomputeStats(p);
        this.toast(p, `${ITEMS[item].name}: ${describeItem(item)}`);
      }
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    }
  }

  toast(p, text) { this.fx({ t: 'toast', pid: p.id, text }, null); }
  toastAll(text) { this.fx({ t: 'toast', text }, null); }
  toastMap(mapId, text) { this.fx({ t: 'toast', mapId, text }, null); }
}

function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h >>> 0;
}
