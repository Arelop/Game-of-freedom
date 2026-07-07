// Авторитетная симуляция: игроки, враги, NPC, пули, данжи, квесты, голод.
import {
  TICK_DT, TILE, SOLID, BULLET_SOLID, T, PLAYER_MAX_HP, PLAYER_HURT_INVULN,
  HUNGER_MAX, HUNGER_RATE, DAY_LENGTH, PLAYER_RADIUS, DESTRUCTIBLE, seasonOf,
} from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { ENEMIES, tierTouchBonus, tierProjDmg } from '../shared/enemies.js';
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
  { id: 'mana_potion', name: 'Зелье маны (1 кристалл, 1 трава)', needs: { crystal: 1, herb: 1 }, gives: { mana_potion: 1 } },
];

// Крафт у наковальни: металл в дело
const ANVIL_RECIPES = [
  { id: 'ammo_bolt', name: 'Болты x8 (1 металл, 1 древесина)', needs: { metal: 1, wood: 1 }, gives: { ammo_bolt: 8 } },
  { id: 'ammo_bomb', name: 'Бомбы x2 (2 металла, 1 древесина)', needs: { metal: 2, wood: 1 }, gives: { ammo_bomb: 2 } },
  { id: 'fire_arrows_c', name: 'Горящие стрелы (1 металл, 2 травы)', needs: { metal: 1, herb: 2 }, gives: { fire_arrows: 1 } },
];

// Кровавые контракты: добровольная сложность за множитель наград (8 минут)
const CONTRACTS = {
  elite: { name: 'Элитная кровь', desc: 'Все твари вокруг тебя — элитные' },
  glass: { name: 'Стеклянная пушка', desc: 'Получаешь ×2 урона, наносишь +30%' },
  horde: { name: 'Орда', desc: 'Стаи в полтора раза больше' },
};
const CONTRACT_TIME = 480; // сек

const SHOP = [
  { item: 'bread', price: 8 }, { item: 'bandage', price: 15 }, { item: 'wood', price: 6 },
  { item: 'heal_potion', price: 30 }, { item: 'swift_potion', price: 35 },
  { item: 'ammo_arrow', price: 10, count: 20 }, { item: 'ammo_bolt', price: 15, count: 8 },
  { item: 'ammo_knife', price: 14, count: 8 }, { item: 'mana_potion', price: 28 },
  { item: 'leather_armor', price: 40 }, { item: 'wood_shield', price: 25 },
  { item: 'leather_boots', price: 30 }, { item: 'iron_greaves', price: 70 },
  { item: 'wizard_hat', price: 90 }, { item: 'ring_str', price: 70 },
  { item: 'flame_tome', price: 145 }, { item: 'lucky_deck', price: 120 },
  { item: 'throwing_net', price: 95 }, { item: 'crystal_orb', price: 130 },
  { item: 'weapon:mace', price: 75 }, { item: 'weapon:greatsword', price: 150 }, { item: 'weapon:halberd', price: 125 },
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
    this.ascensions = new Map(); // pid -> состояние Ритуала Вознесения
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
      dmgMult: 1, shadowT: 0, prevRollT: 0,
      mana: C.manaBase || 20, manaMax: C.manaBase || 20, // настоящая мана (не боеприпас)
      combatT: 0,                 // сек с последнего каста/выстрела — реген вне боя быстрее
      arcaneN: 0, arcaneT: 0,     // Чародейские заряды мага
      abCd: [0, 0, 0], invisT: 0, offCd: 0, shieldHp: 0, shieldT: 0,
      coins: 20, hunger: HUNGER_MAX,
      rep: makeReputation(), aggroFactions: new Set(),
      dead: false, downT: 0,
      quests: [], // журнал: до 3 активных заданий
      // сюжетные цепочки именных NPC: стадии, счётчики, осколки
      story: { rado: 0, capt: 0, mira: 0, bandits: 0, banditsGoal: 0, shards: [], captCamp: null },
      hintStage: 0, hintKills: 0, // онбординг: цепочка первых целей в HUD
      bestiary: {},               // счётчики убийств по видам монстров
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
      p.mana = 60;
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
    // божественность: +4 ко всем атрибутам
    if (p.ascended) for (const k of STAT_KEYS) eff[k] = (eff[k] || 0) + 4;
    p.effStats = eff;
    const sb = statBonuses(eff);
    const d = {
      dmgMelee: 1 + sb.dmgMelee, dmgRanged: 1, dmgMagic: 1 + sb.dmgMagic,
      critChance: 0.03, critMult: 2, coinMult: 1 + sb.coinMult,
      atkSpeed: 1 + sb.atkSpeed, dodge: sb.dodge, manaRegen: sb.manaRegen,
      dropBonus: sb.dropBonus,
      arcBonus: 0, magicProj: 0, knifeProj: 0,
    };
    let maxHp = PLAYER_MAX_HP + (C.maxHpBonus || 0) + sb.maxHp + (p.ascended ? 6 : 0);
    let speed = 1 + (C.speedBonus || 0) + (p.ascended ? 0.08 : 0);
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
      d.coinMult += it.stats.coinMult || 0;
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
      d.dodge += e.dodge || 0;
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
    // запас маны: база класса + 4 за очко интеллекта (+20 богу)
    p.manaMax = (C.manaBase || 20) + (eff.int || 0) * 4 + (p.ascended ? 20 : 0);
    p.mana = Math.min(p.mana ?? p.manaMax, p.manaMax);
    // блок на ПКМ возможен только со щитом в левой руке
    p.canBlock = !!getItem(p.equipment.offhand)?.block;
  }

  // Урон атаки с учётом школы, талантов, ковки и крита
  rollAttack(p, w) {
    const d = p.derived;
    const schoolMult = w.school === 'melee' ? d.dmgMelee : w.school === 'magic' ? d.dmgMagic : d.dmgRanged;
    let mult = schoolMult * (1 + 0.1 * (p.weaponUp?.[w.id] || 0));
    // Чародейские заряды мага: +4% урона магии за заряд
    if (w.school === 'magic' && p.cls === 'mage' && p.arcaneN)
      mult *= 1 + 0.04 * p.arcaneN;
    if (this.hasTalent(p, 'rage') && p.hp <= p.maxHp * 0.3) mult *= 1.4;
    if (p.contract?.type === 'glass') mult *= 1.3; // Стеклянная пушка
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
    if (p.hintStage === 3) { p.hintStage = 4; this.toast(p, '✅ Очко вложено! Последний шаг подсказок в HUD'); }
  }

  learnTalent(p, id) {
    if (!canLearn(p.cls, id, p.talents, p.talentPts)) return;
    p.talentPts--;
    p.talents.push(id);
    this.recomputeStats(p);
    const t = findTalent(p.cls, id);
    const rank = p.talents.filter(x => x === id).length;
    this.toast(p, `Талант изучен: ${t.name}${(t.ranks || 1) > 1 ? ` (ранг ${rank}/${t.ranks})` : ''}`);
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
    if (this.world.time >= 1) {
      this.world.time -= 1;
      this.world.day++;
      this.rollWeather();
    }
    if (this.isNight() !== wasNight)
      this.toastAll(this.isNight() ? STR.night : STR.morning);

    // мировые события: мир живёт и подбрасывает сюрпризы
    if (this.world.event) {
      this.world.event.t -= dt;
      if (this.world.event.t <= 0) {
        if (this.world.event.type === 'bloodMoon') this.toastAll('🌕 Кровавая луна погасла — твари успокаиваются');
        this.world.event = null;
      }
    }
    this.world.eventT = (this.world.eventT ?? 240) - dt;
    if (this.world.eventT <= 0) {
      // после финала войны события чаще — мир не должен скучать
      this.world.eventT = ((this.world.war?.stage ?? 0) >= 10 ? 210 : 320) + this.rand() * 180;
      this.rollWorldEvent();
    }

    for (const p of this.players.values()) this.stepPlayerTick(p, dt);

    this.hydrateSettlements();
    this.stepEntities(dt);
    this.separateEntities();
    this.stepProjectiles(dt);
    this.abstract.update(dt);
    this.civ.update(dt);
    this.checkDungeonRooms();
    this.checkAscensions();
  }

  isNight() { return this.world.time < 0.22 || this.world.time > 0.85; }

  // ---------- мировые события ----------
  rollWorldEvent() {
    if (!this.players.size || this.world.event) return; // пустой сервер / событие уже идёт
    const pool = ['bloodMoon', 'rift', 'meteor', 'trader', 'hunt'];
    if (this.world.citadel?.owned) pool.push('cult', 'cult'); // узурпатору мстит культ
    const type = pick(this.rand, pool);
    const alive = this.world.settlements.filter(s => !s.ruined && !s.captured);
    switch (type) {
      case 'bloodMoon': {
        this.world.event = { type, t: 100 };
        this.toastAll('🌕 КРОВАВАЯ ЛУНА! Твари свирепеют — элита повсюду (100 с)');
        this.events.push(this.world.day, 'Кровавая луна взошла над Пограничьем');
        break;
      }
      case 'rift': { // разлом: демоны маршируют на деревню
        const s = pick(this.rand, alive.length ? alive : this.world.settlements);
        if (!s) break;
        for (let i = 0; i < 2; i++) {
          this.abstract.tokens.push({
            id: 'tok' + this.abstract.nextId++, type: 'pack', name: 'демоны разлома',
            faction: 'monsters', units: ['demon', 'imp', 'imp'],
            x: (s.x + 25 + i * 6) * TILE, y: (s.y + 20) * TILE, march: s.id, hydrated: null,
          });
        }
        for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: s.x + 25, y: s.y + 20 }, null);
        this.toastAll(`⛧ РАЗЛОМ: демоны иного мира идут на ${s.name}!`);
        this.events.push(this.world.day, `Разлом открылся у ${s.name} — демоны рвутся в мир`, { x: s.x, y: s.y });
        break;
      }
      case 'meteor': { // метеорит: кристаллы под охраной големов
        const mx = 60 + Math.floor(this.rand() * 390), my = 60 + Math.floor(this.rand() * 390);
        for (let i = 0; i < 6; i++)
          this.spawnDrop('crystal', 1, 'over', mx * TILE + (this.rand() - 0.5) * 50, my * TILE + (this.rand() - 0.5) * 50, 600);
        for (let i = 0; i < 2; i++)
          this.spawnEnemy('golem', 'over', mx * TILE + (this.rand() - 0.5) * 60, my * TILE + (this.rand() - 0.5) * 60, { forceElite: true });
        for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: mx, y: my }, null);
        this.toastAll('☄ Метеорит упал в глуши! Кристаллы ждут смельчаков (метка на карте)');
        this.events.push(this.world.day, 'С неба упал метеорит — искатели спешат к кратеру', { x: mx, y: my });
        break;
      }
      case 'trader': { // странствующий торговец на площади
        const s = alive[0] || this.world.settlements[0];
        if (!s) break;
        const id = this.spawnNpc('trader', s.id, 'over', s.x * TILE + 16, s.y * TILE - 16, { kind: 'npc_merchant' });
        const n = this.entities.get(id);
        n.name = 'Заезжий купец';
        n.dieAtTick = this.tick + 200 * 30;
        this.toastAll(`🧳 Странствующий торговец заглянул в ${s.name} (на ~3 мин)`);
        break;
      }
      case 'hunt': { // странствующий именной зверь — трофей для смельчаков
        const NAMES_H = ['Кровавый Клык', 'Старый Хрыч', 'Гроза Дорог', 'Косматый Ужас', 'Одноглазый'];
        const KINDS_H = ['bear', 'packLeader', 'ogre', 'ironTroll', 'minotaur'];
        const i = Math.floor(this.rand() * NAMES_H.length);
        const hx = 60 + Math.floor(this.rand() * 390), hy = 60 + Math.floor(this.rand() * 390);
        this.abstract.tokens.push({
          id: 'tok' + this.abstract.nextId++, type: 'pack', name: NAMES_H[i],
          faction: 'monsters', units: [KINDS_H[i]], hunt: NAMES_H[i],
          x: hx * TILE, y: hy * TILE, hydrated: null,
        });
        for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: hx, y: hy }, null);
        this.toastAll(`🎯 ОХОТА: в глуши замечен «${NAMES_H[i]}» — награда тому, кто добудет трофей!`);
        this.events.push(this.world.day, `Объявлена охота на зверя по кличке ${NAMES_H[i]}`, { x: hx, y: hy });
        break;
      }
      case 'cult': { // культ Тьмы мстит узурпатору Сердца
        const s = pick(this.rand, alive.length ? alive : this.world.settlements);
        if (!s) break;
        this.abstract.tokens.push({
          id: 'tok' + this.abstract.nextId++, type: 'pack', name: 'культ Тьмы',
          faction: 'monsters', units: ['darkMage', 'darkSoldier', 'darkSoldier'],
          x: (s.x - 28) * TILE, y: (s.y + 24) * TILE, march: s.id, hydrated: null,
        });
        this.toastAll(`⛧ Культ Тьмы восстал против узурпатора — идут на ${s.name}!`);
        this.events.push(this.world.day, `Культ Тьмы объявился у ${s.name}`, { x: s.x, y: s.y });
        break;
      }
    }
  }

  // Погода нового дня: зимой — снегопады, весной/осенью — дожди
  rollWeather() {
    const season = seasonOf(this.world.day);
    const r = this.rand();
    const old = this.world.weather;
    if (season === 3) this.world.weather = r < 0.55 ? 'snow' : 'clear';
    else if (season === 0 || season === 2) this.world.weather = r < 0.35 ? 'rain' : 'clear';
    else this.world.weather = r < 0.15 ? 'rain' : 'clear';
    if (this.world.weather !== old && this.world.weather !== 'clear')
      this.toastAll(this.world.weather === 'rain' ? '🌧 Зарядил дождь…' : '❄ Пошёл снег…');
  }

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

    // Реген маны: непрерывный; вне боя (5 с без каста) — в 2.5 раза быстрее
    p.combatT += dt;
    const regen = (0.5 + 0.4 * (p.derived?.manaRegen || 0)) * (p.combatT > 5 ? 2.5 : 1);
    p.mana = Math.min(p.manaMax, p.mana + regen * dt);
    // Чародейские заряды мага спадают при простое
    if (p.arcaneT > 0) {
      p.arcaneT -= dt;
      if (p.arcaneT <= 0) p.arcaneN = 0;
    }
    p.shadowT = Math.max(0, p.shadowT - dt);
    p.invisT = Math.max(0, (p.invisT || 0) - dt);
    // божественная аура: полсердца каждые 10 секунд
    if (p.ascended && p.hp < p.maxHp) {
      p.ascRegenT = (p.ascRegenT ?? 10) - dt;
      if (p.ascRegenT <= 0) { p.ascRegenT = 10; p.hp = Math.min(p.maxHp, p.hp + 1); }
    }
    if (p.abCd) for (let i = 0; i < 3; i++) p.abCd[i] = Math.max(0, (p.abCd[i] || 0) - dt);
    p.offCd = Math.max(0, (p.offCd || 0) - dt);
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shieldT = 0; p.shieldHp = 0; } }
    // кровавый контракт: тикает; дожил до конца — сундук в награду
    if (p.contract) {
      p.contract.t -= dt;
      if (p.contract.t <= 0) {
        this.toast(p, `⛧✓ Контракт «${CONTRACTS[p.contract.type]?.name}» исполнен! Духи довольны`);
        this.dropRandomGear(p.mapId, p.x + 12, p.y, true, (p.effStats?.lck || 0) + 3);
        this.spawnDrop('coin', 40, p.mapId, p.x - 12, p.y);
        this.events.push(this.world.day, `${p.name} исполнил кровавый контракт`);
        p.contract = null;
      }
    }

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

    // ловушки подземелий: лезвия под ногами (перекат проскакивает)
    if (p.mapId !== 'over' && p.rollT <= 0) {
      const ttx = Math.floor(p.x / TILE), tty = Math.floor(p.y / TILE);
      if (this.chunks.tileAt(p.mapId, ttx, tty) === T.TRAP) {
        const key = p.mapId + ':' + ttx + ',' + tty;
        this.trapCd = this.trapCd || new Map();
        if ((this.trapCd.get(key) || 0) <= this.tick) {
          this.trapCd.set(key, this.tick + 75); // ловушка взводится 2.5 с
          this.damagePlayer(p, 1, null);
          this.fx({ t: 'hit', kind: 'wall', x: p.x, y: p.y }, p.mapId, p.x, p.y);
          this.toast(p, '⚔ Лезвия из пола! Перекатом ловушки можно проскочить');
        }
      }
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
    if (!w.melee && !w.manaCost) {
      if (p.reloadPending && p.reloadT <= 0) {
        p.mags[w.id] = this.finishReload(p, w);
        p.reloadPending = false;
      }
      if (!p.reloadPending && p.mags[w.id] <= 0 && p.reloadT <= 0) this.startReload(p);
    }
  }

  startReload(p) {
    const w = this.weapon(p);
    if (w.manaCost) return; // посохи не перезаряжаются — они пьют ману
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

  // Оплата маной. Маг при нехватке доплачивает кровью: 1 сердце -> 10 маны.
  // allowArcane — Архимаг (30% бесплатно) действует на посохи.
  payMana(p, cost, allowArcane = false) {
    p.combatT = 0;
    if (allowArcane && this.hasTalent(p, 'arcane') && this.rand() < 0.3) return true;
    if (p.mana < cost && p.cls === 'mage' && p.hp > 2) {
      p.hp -= 2;
      p.mana = Math.min(p.manaMax, p.mana + 10);
      this.fx({ t: 'bloodcast', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, '🩸 Кровавый каст: −1 сердце, +10 маны');
    }
    if (p.mana < cost) return false;
    p.mana -= cost;
    return true;
  }

  // Чародейский заряд мага: агрессивный ритм = больше урона магии
  gainArcane(p) {
    if (p.cls !== 'mage') return;
    p.arcaneN = Math.min(5, (p.arcaneN || 0) + 1);
    p.arcaneT = 4;
  }

  tryFire(p, aim) {
    const w = this.weapon(p);
    if (p.fireCd > 0 || p.rollT > 0 || p.dead) return;
    if (w.melee) { p.combatT = 0; this.meleeSwing(p, w, aim); return; }
    if (w.manaCost) {
      // посохи: кастуют из маны напрямую, без магазина и перезарядки
      if (!this.payMana(p, w.manaCost, true)) {
        if ((p.noManaT || 0) <= this.tick) { p.noManaT = this.tick + 45; this.toast(p, 'Не хватает маны'); }
        return;
      }
      p.fireCd = 1 / (w.fireRate * (p.derived?.atkSpeed || 1));
      const seed = hash2(this.world.seed, this.tick, p.id);
      this.spawnPlayerBullets(p, w, aim, seed);
      this.gainArcane(p);
      this.fx({ t: 'shot', pid: p.id, weapon: w.id, x: p.x, y: p.y, aim, seed, tick: this.tick }, p.mapId, p.x, p.y);
      return;
    }
    if (p.reloadT > 0) return;
    if ((p.mags[w.id] || 0) <= 0) { this.startReload(p); return; }
    p.combatT = 0;
    p.fireCd = 1 / (w.fireRate * (p.derived?.atkSpeed || 1));
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
        if (arcDeg >= 360 || Math.abs(da) <= half) {
          this.damageEnemy(e, atk.dmg, hitFake);
          // Оглушающий удар: шанс ошеломить врага
          if (this.hasTalent(p, 'stunhit') && this.rand() < 0.15 && this.entities.has(e.id))
            e.stunT = Math.max(e.stunT || 0, 0.6);
        }
      } else if (e.entType === 'npc' && e.mapId === p.mapId) {
        if (dist2(p.x, p.y, e.x, e.y) > (r + 5) ** 2) continue;
        let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (arcDeg >= 360 || Math.abs(da) <= half) this.damageNpc(e, w.damage, p);
      }
    }
    // friendly fire: замах цепляет и союзников в дуге
    for (const q of this.players.values()) {
      if (q === p || q.dead || q.mapId !== p.mapId) continue;
      if (dist2(p.x, p.y, q.x, q.y) > (r + PLAYER_RADIUS) ** 2) continue;
      let da = Math.atan2(q.y - p.y, q.x - p.x) - aim;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (arcDeg >= 360 || Math.abs(da) <= half) this.damagePlayer(q, atk.dmg, p);
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

  npcShoot(npc, ang, opts = {}) {
    this.projectiles.push({
      x: npc.x, y: npc.y - 4, vx: Math.cos(ang) * (opts.speed || 280), vy: Math.sin(ang) * (opts.speed || 280),
      life: 1.2, radius: 2, dmg: opts.dmg || 2, knockback: 20,
      owner: npc.id, friendly: true, guard: true, mapId: npc.mapId,
    });
    this.fx({ t: 'shot', pid: npc.id, weapon: opts.weapon || 'bow', x: npc.x, y: npc.y, aim: ang, seed: 1, tick: this.tick }, npc.mapId, npc.x, npc.y);
  }

  // ---------- сущности ----------
  spawnEnemy(kind, mapId, x, y, extra = {}) {
    const def = ENEMIES[kind];
    if (!def) return null;
    const id = 'e' + this.nextId++;
    const e = {
      id, kind, entType: 'enemy', mapId, x, y, aim: 0,
      hp: def.hp, maxHp: def.hp, state: 'idle', stateT: 0, aggro: false,
      ...extra,
    };
    // элитные аффиксы: редкие усиленные монстры с лучшей добычей;
    // кровавая луна, проклятые данжи и контракт «Элитная кровь» повышают шанс
    let contractElite = false;
    if (!extra.noElite) {
      for (const q of this.players.values()) {
        if (q.contract?.type === 'elite' && !q.dead && q.mapId === mapId
          && dist2(q.x, q.y, x, y) < 420 ** 2) { contractElite = true; break; }
      }
    }
    const eliteChance = (extra.forceElite || contractElite) ? 1
      : this.world.event?.type === 'bloodMoon' ? 0.3 : 0.07;
    if (!extra.noElite && def.archetype !== 'boss' && def.faction !== 'darkness' && this.rand() < eliteChance) {
      const affix = pick(this.rand, ['Свирепый', 'Живучий', 'Стремительный', 'Золотой']);
      e.elite = affix;
      e.hp = e.maxHp = Math.round(def.hp * (affix === 'Живучий' ? 2.4 : 1.7));
      e.xpMult = 2.5;
      if (affix === 'Свирепый') e.dmgBonus = 1;
      if (affix === 'Стремительный') e.hasteF = 1.35;
      if (affix === 'Золотой') e.goldMult = 3;
    }
    this.entities.set(id, e);
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

  spawnDrop(item, count, mapId, x, y, ttl = 120) {
    const id = 'd' + this.nextId++;
    this.entities.set(id, { id, entType: 'drop', item, count, mapId, x, y, hp: 1, ttl });
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
        // именной NPC: капитан стражи Ярослава живёт в первой деревне
        if (s === this.world.settlements[0]) {
          const cid = this.spawnNpc('captain', s.id, 'over', sx + 42, sy + 12, { kind: 'npc_guard' });
          const cpt = this.entities.get(cid);
          cpt.name = 'Ярослава';
          cpt.hp = cpt.maxHp = 24;
          ids.push(cid);
        }
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

    // лагеря, каменные круги и логова боссов: засада на подходе
    for (const poi of this.world.pois) {
      if ((poi.type !== 'camp' && poi.type !== 'circle' && poi.type !== 'lair') || poi.cleared) continue;
      const cx = poi.x * TILE, cy = poi.y * TILE;
      let near = false;
      for (const p of this.players.values())
        if (p.mapId === 'over' && dist2(p.x, p.y, cx, cy) < 350 ** 2) { near = true; break; }
      if (near && !poi.spawned) {
        poi.spawned = [];
        const kinds = poi.kinds
          || (poi.type === 'circle' ? ['imp', 'imp', 'demon', 'imp'] : ['bandit', 'bandit', 'banditHeavy', 'bandit']);
        const n = poi.kinds ? poi.kinds.length : poi.difficulty + 2;
        for (let i = 0; i < n; i++) {
          poi.spawned.push(this.spawnEnemy(kinds[i % kinds.length], 'over',
            cx + (this.rand() - 0.5) * 90, cy + (this.rand() - 0.5) * 90,
            { camp: poi.id, faction: poi.type === 'camp' ? 'bandits' : 'monsters', noElite: true }));
        }
      }
      if (poi.spawned && !poi.spawned.some(id => this.entities.has(id))) {
        poi.cleared = true;
        this.events.push(this.world.day, `Зачищено: ${poi.name}`, { x: poi.x, y: poi.y });
        this.toastAll(`${poi.name} — зачищено!`);
        this.onPoiCleared(poi);
      }
    }

    // именные NPC у особых мест: отшельник у хижины, странница у обелиска
    for (const poi of this.world.pois) {
      if (!poi.special) continue;
      const role = poi.type === 'hermit' ? 'hermit'
        : poi.type === 'obelisk' && this.world.pois.find(o => o.type === 'obelisk') === poi ? 'wanderer' : null;
      if (!role) continue;
      const cx = poi.x * TILE, cy = poi.y * TILE;
      let near = false;
      for (const p of this.players.values())
        if (p.mapId === 'over' && dist2(p.x, p.y, cx, cy) < SETTLEMENT_HYDRATE_R ** 2) { near = true; break; }
      const alive = poi.npcId && this.entities.has(poi.npcId);
      if (near && !alive) {
        poi.npcId = this.spawnNpc(role, poi.id, 'over', cx + 8, cy + 28, {
          kind: 'npc_wizard',
        });
        const n = this.entities.get(poi.npcId);
        n.name = role === 'hermit' ? 'Радогост' : 'Мирослава';
        n.hp = n.maxHp = 20;
      } else if (!near && alive) {
        this.entities.delete(poi.npcId);
        poi.npcId = null;
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
        // доты: яд и горение тикают раз в секунду
        if ((e.dotT || 0) > 0) {
          e.dotT -= dt;
          e.dotAcc = (e.dotAcc || 0) + dt;
          if (e.dotAcc >= 1) {
            e.dotAcc -= 1;
            this.damageEnemy(e, e.dotDmg || 1,
              { owner: e.dotSrc, school: 'magic', isDot: true, vx: 0, vy: 0, knockback: 0 });
            if (!this.entities.has(e.id)) continue; // дот добил
          }
        }
        const def0 = ENEMIES[e.kind];
        // шаман-лекарь: лечит самого раненого союзника рядом
        if (def0.healer && (e.stunT || 0) <= 0) {
          e.healT = (e.healT ?? def0.healer.interval * this.rand()) - dt;
          if (e.healT <= 0) {
            e.healT = def0.healer.interval;
            let worst = null, worstFrac = 1;
            for (const a of this.entities.values()) {
              if (a === e || a.entType !== 'enemy' || a.mapId !== e.mapId) continue;
              if (dist2(e.x, e.y, a.x, a.y) > def0.healer.range ** 2) continue;
              const frac = a.hp / (a.maxHp || ENEMIES[a.kind].hp);
              if (frac < worstFrac && frac < 1) { worstFrac = frac; worst = a; }
            }
            if (worst) {
              worst.hp = Math.min(worst.maxHp || ENEMIES[worst.kind].hp, worst.hp + def0.healer.amount);
              this.fx({ t: 'heal', pid: -1, x: worst.x, y: worst.y }, e.mapId, worst.x, worst.y);
              this.fx({ t: 'chain', pts: [[e.x, e.y], [worst.x, worst.y]] }, e.mapId, e.x, e.y);
            }
          }
        }
        // призыватель: тянет миньонов, пока их меньше лимита
        if (def0.summoner && (e.stunT || 0) <= 0 && e.aggro) {
          e.minions = (e.minions || []).filter(id => this.entities.has(id));
          e.sumT = (e.sumT ?? def0.summoner.interval * 0.5) - dt;
          if (e.sumT <= 0 && e.minions.length < def0.summoner.max) {
            e.sumT = def0.summoner.interval;
            const a = this.rand() * Math.PI * 2;
            const id = this.spawnEnemy(def0.summoner.kind, e.mapId,
              e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, { noElite: true });
            const mob = this.entities.get(id);
            if (mob) { mob.aggro = true; e.minions.push(id); }
            this.fx({ t: 'summon', x: e.x, y: e.y }, e.mapId, e.x, e.y);
          }
        }
        // слэм босса: телеграф идёт — стоим и караем зазевавшихся
        if ((e.slamT || 0) > 0) {
          e.slamT -= dt;
          if (e.slamT <= 0) {
            const s = e.slamSpec;
            this.fx({ t: 'boom', x: e.x, y: e.y, r: s.radius }, e.mapId, e.x, e.y);
            for (const p of this.players.values()) {
              if (p.dead || p.mapId !== e.mapId) continue;
              if (dist2(p.x, p.y, e.x, e.y) <= (s.radius + PLAYER_RADIUS) ** 2)
                this.damagePlayer(p, s.dmg, { x: e.x, y: e.y });
            }
          }
          continue; // во время замаха не двигается и не стреляет
        }
        const npcs = [...this.entities.values()].filter(n => n.entType === 'npc' && n.mapId === e.mapId);
        const shots = updateEnemy(e, dt, map, [...this.players.values()], this.rand, npcs);
        for (const s of shots) {
          if (s.slam) { // телеграфированный удар по области
            e.slamT = s.slam.windup;
            e.slamSpec = s.slam;
            this.fx({ t: 'telegraph', x: e.x, y: e.y, r: s.slam.radius, w: s.slam.windup }, e.mapId, e.x, e.y);
            continue;
          }
          this.enemyFire(e, s);
        }
        // контактный урон
        const def = ENEMIES[e.kind];
        if (def.touchDamage > 0) {
          const touch = def.touchDamage + tierTouchBonus(def.tier) + (e.dmgBonus || 0);
          for (const p of this.players.values()) {
            if (p.dead || p.mapId !== e.mapId) continue;
            if (circlesOverlap(e.x, e.y, def.radius, p.x, p.y, PLAYER_RADIUS))
              this.damagePlayer(p, touch, e);
          }
          // стража дерётся с врагами
          for (const n of this.entities.values()) {
            if (n.entType !== 'npc' || n.mapId !== e.mapId) continue;
            if (circlesOverlap(e.x, e.y, def.radius, n.x, n.y, 5)) {
              n.touchCd = (n.touchCd || 0) - dt;
              if (n.touchCd <= 0) { n.touchCd = 1; this.damageNpc(n, touch, null); }
            }
          }
        }
      } else if (e.entType === 'npc') {
        // временные союзники (элементаль) развеиваются по сроку службы
        if (e.dieAtTick && this.tick >= e.dieAtTick) {
          this.entities.delete(e.id);
          this.fx({ t: 'poof', x: e.x, y: e.y }, e.mapId, e.x, e.y);
          continue;
        }
        updateNpc(e, dt, map, this);
      }
    }
  }

  // ---------- активный предмет левой руки (ПКМ) ----------
  useOffhand(p) {
    if (p.dead || p.rollT > 0) return;
    const it = getItem(p.equipment.offhand);
    if (!it?.active) return;
    if ((p.offCd || 0) > 0) return;
    switch (it.active) {
      case 'summon_fire': { // гримуар: огненный элементаль-союзник
        for (const e of [...this.entities.values()])
          if (e.entType === 'npc' && e.role === 'elemental' && e.owner === p.id) this.entities.delete(e.id);
        p.offCd = 60;
        const id = this.spawnNpc('elemental', null, p.mapId, p.x + 14, p.y - 6, { kind: 'npc_elemental' });
        const el = this.entities.get(id);
        el.owner = p.id;
        el.name = 'Элементаль';
        el.hp = el.maxHp = 10;
        el.dieAtTick = this.tick + 25 * 30;
        this.fx({ t: 'summon', x: el.x, y: el.y }, p.mapId, el.x, el.y);
        this.toast(p, '🔥 Огненный элементаль служит тебе (25 с)');
        break;
      }
      case 'barrier': { // сфера: поглощающий щит
        p.offCd = 30;
        p.shieldHp = 4;
        p.shieldT = 6;
        this.fx({ t: 'barrier', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'net': { // сеть: сковывает врагов в зоне у прицела
        p.offCd = 15;
        const aim = p.aim || 0;
        const tx = p.x + Math.cos(aim) * 70, ty = p.y + Math.sin(aim) * 70;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(tx, ty, e.x, e.y) < 55 * 55) { e.slowT = 2.5; e.slowMult = 0.05; e.aggro = true; }
        }
        this.fx({ t: 'net', x: tx, y: ty }, p.mapId, tx, ty);
        break;
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
    if (ab.mana > 0 && !this.payMana(p, ab.mana)) { this.toast(p, 'Не хватает маны'); return; }
    p.combatT = 0;
    // Ледяные жилы и божественность: способности перезаряжаются быстрее
    p.abCd[slot] = ab.cd * (this.hasTalent(p, 'cdr') ? 0.8 : 1) * (p.ascended ? 0.75 : 1);
    // Эхо маны: иногда способность почти не уходит в кулдаун
    if (this.hasTalent(p, 'echo') && this.rand() < 0.2) {
      p.abCd[slot] = 0.5;
      this.toast(p, '✨ Эхо маны!');
    }
    const aim = p.aim || 0;
    // Чародейские заряды усиливают и способности мага
    const arcMult = p.cls === 'mage' ? 1 + 0.04 * (p.arcaneN || 0) : 1;
    const d = { ...(p.derived || {}), dmgMagic: (p.derived?.dmgMagic || 1) * arcMult };
    this.gainArcane(p);
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
        // Вождь: клич воодушевляет группу на бой
        if (this.hasTalent(p, 'ab_crydmg')) {
          for (const q of this.players.values()) {
            if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 95 * 95) continue;
            q.buffs.blessed = { mult: 0.15, t: 10 };
            this.recomputeStats(q);
            this.toast(q, '⚔ Клич вождя: +15% урона на 10 с');
          }
        }
        // Рог войны: клич укрывает группу барьером
        if (this.hasTalent(p, 'ab_cryarmor')) {
          for (const q of this.players.values()) {
            if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 95 * 95) continue;
            q.shieldHp = Math.max(q.shieldHp || 0, 2);
            q.shieldT = Math.max(q.shieldT || 0, 6);
            this.fx({ t: 'barrier', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
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
        // урон снаряда растёт с тиром монстра (+ аффикс «Свирепый»)
        const dmg = tierProjDmg(ENEMIES[e.kind]?.tier) + (e.dmgBonus || 0);
        this.projectiles.push({
          x: e.x, y: e.y - 3, vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed,
          life: pat.life + delay, delay, radius: pat.projRadius, dmg, knockback: 15,
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
    // friendly fire: взрыв не разбирает своих — бьёт всех игроков в радиусе
    for (const q of this.players.values()) {
      if (q.dead || q.mapId !== mapId) continue;
      if (dist2(x, y, q.x, q.y) > (radius + PLAYER_RADIUS) ** 2) continue;
      this.damagePlayer(q, Math.max(1, Math.round(dmg / 2)), { x, y });
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
        // friendly fire: пули игроков ранят и союзников — целься аккуратно
        if (!hit && !pr.guard) {
          for (const q of this.players.values()) {
            if (q.dead || q.mapId !== pr.mapId || q.id === pr.owner) continue;
            if (circlesOverlap(pr.x, pr.y, pr.radius, q.x, q.y, PLAYER_RADIUS)) {
              this.damagePlayer(q, pr.dmg, null);
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
    // щитоносец: гасит удары в фронтальный конус (оглушённый — нет)
    const defS = ENEMIES[e.kind];
    if (defS?.shielded && pr && !pr.isDot && (e.stunT || 0) <= 0) {
      // направление ПРИХОДА атаки: от снаряда/атакующего к врагу
      const from = Math.atan2(-(pr.vy || 0), -(pr.vx || 0)); // куда смотрит источник урона
      let da = from - (e.aim || 0);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.PI / 3) {
        dmg = Math.max(0.2, Math.round(dmg * 0.2 * 10) / 10);
        this.fx({ t: 'block', pid: -1, x: e.x, y: e.y }, e.mapId, e.x, e.y);
      }
    }
    // таланты атакующего: казнь, засада, абсолютный ноль, яды и поджог
    const attacker = pr && !pr.isDot ? this.players.get(pr.owner) : null;
    if (attacker) {
      if (e.hp >= e.maxHp && this.hasTalent(attacker, 'ambush')) dmg *= 1.4;          // Засада
      if (e.hp / (e.maxHp || 1) <= 0.25 && this.hasTalent(attacker, 'execute')) dmg *= 1.5; // Палач
      if ((e.slowT || 0) > 0 && this.hasTalent(attacker, 'deepfreeze')) dmg *= 1.35;  // Абсолютный ноль
      dmg = Math.round(dmg * 10) / 10;
      // Отравленные клинки / Поджог: навешиваем дот
      if (pr.school !== 'magic' && this.hasTalent(attacker, 'venom')) {
        e.dotT = 4; e.dotDmg = 1; e.dotSrc = attacker.id; e.dotKind = 'venom';
      } else if (pr.school === 'magic' && this.hasTalent(attacker, 'ignite')) {
        e.dotT = 3; e.dotDmg = 1; e.dotSrc = attacker.id; e.dotKind = 'ignite';
      }
    }
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
    // взрывающиеся твари: смерть — это только начало
    if (def.explodeOnDeath)
      this.explodeAt(e.mapId, e.x, e.y, def.explodeOnDeath.dmg, def.explodeOnDeath.radius, null, 0);
    // опыт — всем игрокам рядом (кооп-дружелюбно), иначе убийце
    const nearby = [...this.players.values()].filter(q =>
      !q.dead && q.mapId === e.mapId && dist2(q.x, q.y, e.x, e.y) < 350 ** 2);
    const gainers = nearby.length ? nearby : (killer ? [killer] : []);
    for (const q of gainers) // кровавый контракт: +50% опыта
      this.addXp(q, Math.round(def.xp * (e.xpMult || 1) * (q.contract ? 1.5 : 1)));
    // Кровожадность: лечение за убийство в ближнем бою
    if (killer && pr.school === 'melee' && this.hasTalent(killer, 'bloodlust'))
      killer.hp = Math.min(killer.maxHp, killer.hp + 1);
    // Клинок рассвета: убийство лечит владельца
    if (killer) {
      const kw = this.weapon(killer);
      if (kw?.lifeOnKill && pr.school === kw.school)
        killer.hp = Math.min(killer.maxHp, killer.hp + kw.lifeOnKill);
    }
    // Мана-всплеск: маг восполняет ману убийствами магией
    if (killer && killer.cls === 'mage' && pr.school === 'magic')
      killer.mana = Math.min(killer.manaMax, killer.mana + 3);
    // сюжет: счётчик бандитов для Ярославы — всем участникам боя
    if (['bandit', 'banditHeavy', 'archer'].includes(e.kind))
      for (const q of gainers) if (q.story) q.story.bandits++;
    // бестиарий: участники боя записывают вид твари
    for (const q of gainers) {
      q.bestiary = q.bestiary || {};
      q.bestiary[e.kind] = (q.bestiary[e.kind] || 0) + 1;
    }
    // онбординг: первые победы
    for (const q of gainers) {
      if (q.hintStage === 2 && ++q.hintKills >= 3) {
        q.hintStage = 3;
        this.toast(q, '✅ Три победы! Открой лист персонажа (C)');
      }
    }
    // Тень отшельника повержена: сила достаётся победителям
    if (e.hermitShade) {
      this.spawnDrop('crystal_orb@e', 1, e.mapId, e.x, e.y);
      this.spawnDrop('crystal', 3, e.mapId, e.x + 10, e.y);
      this.toastAll('★ Тень отшельника развеяна — сила ритуала свободна!');
      this.events.push(this.world.day, 'Тень отшельника Радогоста повержена путниками');
    }
    // дроп: удача повышает количество, шанс и редкость добычи
    const luck = killer?.effStats?.lck ?? killer?.stats?.lck ?? 0;
    const dropBonus = killer?.derived?.dropBonus || 0;
    for (const [item, range] of Object.entries(def.drops || {})) {
      if (item === 'weapon') { this.dropRandomWeapon(e.mapId, e.x, e.y, luck, 2); continue; }
      let n = Array.isArray(range) ? randInt(this.rand, range[0], range[1]) : range;
      if (item === 'coin' && killer) n = Math.round(n * (killer.derived?.coinMult || 1));
      if (item === 'coin' && killer?.contract) n = Math.round(n * 1.75); // кровавый контракт
      if (item === 'coin' && e.goldMult) n *= e.goldMult; // элита «Золотой»
      if (n > 0) this.spawnDrop(item, n, e.mapId, e.x + (this.rand() - 0.5) * 14, e.y + (this.rand() - 0.5) * 14);
    }
    // элита: щедрый дроп экипировки
    if (e.elite && this.rand() < 0.45) this.dropRandomGear(e.mapId, e.x, e.y, false, luck + 4);
    // мини-босс данжа: роняет ключ от двери босса
    if (e.dropKey) {
      this.spawnDrop('dungeon_key', 1, e.mapId, e.x, e.y);
      this.toastMap(e.mapId, '🗝 Хранитель ключа пал! Дверь босса ждёт');
    }
    // Война с Тьмой: реликвии
    if (e.kind === 'heartKeeper') {
      this.spawnDrop('shadow_heart', 1, e.mapId, e.x, e.y);
      this.toastAll('🖤 Сердце Тени выпало из Хранителя!');
      this.events.push(this.world.day, 'Хранитель сердца повержен — реликвия у путников');
    }
    if (def.archetype === 'boss' && this.world.war?.stage === 2 && e.kind !== 'darkLord') {
      this.spawnDrop('ancient_shard', 1, e.mapId, e.x + 8, e.y);
      this.toastAll('💠 Древний осколок выпал из босса!');
    }
    if (this.rand() < 0.15 * (1 + dropBonus * 2)) this.spawnDrop('herb', 1, e.mapId, e.x, e.y);
    if (this.rand() < 0.05 * (1 + dropBonus * 3)) this.spawnDrop('heal_potion', 1, e.mapId, e.x, e.y);
    if (e.kind === 'wolf' && this.rand() < 0.5 * (1 + dropBonus)) this.spawnDrop('hide', 1, e.mapId, e.x, e.y);
    if (e.kind === 'banditHeavy' && this.rand() < 0.25 * (1 + dropBonus)) this.dropRandomGear(e.mapId, e.x, e.y, false, luck);
    // удача: шанс дополнительной находки
    if (this.rand() < dropBonus) this.spawnDrop('coin', 2 + Math.floor(this.rand() * 3), e.mapId, e.x + 8, e.y);
    if (e.token) this.abstract.onTokenUnitKilled(e.token, e.x, e.y);
    if (e.kind === 'bossOgre') {
      this.dropRandomGear(e.mapId, e.x + 12, e.y, true, luck);
      this.toastAll(STR.bossDefeated(def.name));
      this.events.push(this.world.day, `Пал грозный ${def.name}!`);
    }
    // квест «убить стаю» проверяется в onTokenUnitKilled через журнал
    if (killer && e.token) {
      const kq = killer.quests?.find(q => q.type === 'kill' && q.token === e.token && !q.done);
      if (kq && !this.abstract.tokens.some(t => t.id === e.token))
        this.completeQuestObjective(killer, kq);
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
          this.addBounty(attacker, 15, `убийство жителя ${s.name}`);
          this.events.push(this.world.day, `${attacker.name} убил жителя ${s.name}`, { x: s.x, y: s.y });
        } else {
          this.events.push(this.world.day, `Житель ${s.name} погиб от чудовищ`, { x: s.x, y: s.y });
        }
      }
      // тёмный путь: разграбление каравана — груз твой, но мир запомнит
      if (n.caravan && attacker) {
        const tok = this.abstract.tokens.find(t => t.id === n.caravan);
        if (tok && !tok.dead) {
          attacker.rep[tok.faction] = Math.max(-100, (attacker.rep[tok.faction] || 0) - 12);
          const othersAlive = (tok.hydrated || []).some(id => id !== n.id && this.entities.has(id));
          if (!othersAlive) {
            tok.dead = true;
            // груз рассыпается по земле
            if (tok.cargo) this.spawnDrop(tok.cargo.res, Math.max(2, Math.round(tok.cargo.amount / 3)), n.mapId, n.x + 8, n.y, 300);
            this.spawnDrop('coin', 15 + Math.floor(this.rand() * 15), n.mapId, n.x - 8, n.y, 300);
            this.addBounty(attacker, 30, 'разбой на дороге');
            attacker.rep[tok.faction] = Math.max(-100, (attacker.rep[tok.faction] || 0) - 13);
            this.toastAll(`🏴 Караван разграблен разбойником ${attacker.name}!`);
            this.events.push(this.world.day, `${attacker.name} разграбил караван ${FACTIONS[tok.faction]?.name || ''}`,
              { x: Math.round(n.x / TILE), y: Math.round(n.y / TILE) });
          }
        }
      }
    }
  }

  // ---------- тёмный путь: розыск и охотники за головой ----------
  addBounty(p, n, reason) {
    p.bounty = (p.bounty || 0) + n;
    this.toast(p, `💀 Розыск +${n} (${reason}). Награда за твою голову: ${p.bounty}`);
    if (p.bounty >= 50 && !p.bountyWarned) {
      p.bountyWarned = true;
      this.toast(p, '💀 За тобой выйдут охотники за головой! Виру платят старейшинам');
    }
  }

  // периодически: охотники приходят за головой преступника
  tickBountyHunters() {
    for (const p of this.players.values()) {
      if ((p.bounty || 0) < 50 || p.dead || p.mapId !== 'over') continue;
      p.hunterT = (p.hunterT ?? 60) - 12; // вызывается раз в цив-тик (12 с)
      if (p.hunterT > 0) continue;
      p.hunterT = 200 + this.rand() * 100;
      const n = p.bounty >= 100 ? 4 : 3;
      const ids = [];
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const kind = i === 0 ? 'banditHeavy' : 'bandit';
        const id = this.spawnEnemy(kind, 'over',
          p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260,
          { faction: 'hunters', huntTarget: p.id, forceElite: p.bounty >= 100 });
        const h = this.entities.get(id);
        if (h) { h.aggro = true; ids.push(id); }
      }
      if (ids.length) {
        this.toast(p, '💀 Охотники за головой вышли на твой след!');
        this.events.push(this.world.day, `Охотники настигли разбойника ${p.name}`);
      }
    }
  }

  damagePlayer(p, dmg, source) {
    if (p.dead || hasIFrames(p)) return;
    // контракт «Стеклянная пушка»: входящий урон удвоен
    if (p.contract?.type === 'glass') dmg *= 2;
    // уворот от ловкости и экипировки: урон полностью игнорируется
    if (this.rand() < (p.derived?.dodge || 0)) {
      this.fx({ t: 'dodge', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      return;
    }
    // барьер хрустальной сферы: поглощает урон до пробития
    if (p.shieldT > 0 && (p.shieldHp || 0) > 0) {
      p.shieldHp -= dmg;
      p.hurtT = PLAYER_HURT_INVULN * 0.6;
      this.fx({ t: 'barrierHit', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      if (p.shieldHp <= 0) { p.shieldHp = 0; p.shieldT = 0; }
      return;
    }
    // блок щитом в левой руке (ПКМ): режет урон, гасит полностью удары спереди
    // (Мастер щита расширяет сектор блока вдвое)
    if (p.blocking) {
      const off = getItem(p.equipment.offhand);
      if (off?.block) {
        let frontal = false;
        if (source && source.x !== undefined) {
          let da = Math.atan2(source.y - p.y, source.x - p.x) - p.aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          frontal = Math.abs(da) <= (this.hasTalent(p, 'blockwide') ? Math.PI / 1.3 : Math.PI / 2.5);
        }
        this.fx({ t: 'block', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        if (frontal) { p.hurtT = 0.3; return; } // лобовой удар полностью погашен
        dmg = Math.max(0.5, Math.round(dmg * 0.5 * 10) / 10);
      }
    }
    // Ледяная кора: четверть урона уходит в ману (3 маны за 1 урона)
    if (this.hasTalent(p, 'manashield') && p.mana >= 3 && dmg >= 1) {
      const abs = Math.min(Math.ceil(dmg * 0.25), Math.floor(p.mana / 3));
      if (abs > 0) {
        p.mana -= abs * 3;
        dmg -= abs;
        this.fx({ t: 'barrierHit', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        if (dmg <= 0) { p.hurtT = PLAYER_HURT_INVULN * 0.5; return; }
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
        // Шипастый доспех (и Живая крепость): возмездие за удар вблизи
        if (this.hasTalent(p, 'thorns') || this.hasTalent(p, 'thorns3'))
          this.damageEnemy(source, this.hasTalent(p, 'thorns3') ? 3 : 1,
            { vx: -Math.cos(a), vy: -Math.sin(a), knockback: 30, owner: p.id, school: 'melee', isDot: true });
      }
    }
    // Последний рубеж: смертельный удар оставляет 1 ХП (раз в 60 с)
    if (p.hp <= 0 && this.hasTalent(p, 'laststand') && (p.lastStandT || 0) <= this.tick) {
      p.hp = 1;
      p.lastStandT = this.tick + 60 * 30;
      p.hurtT = 1.2;
      this.fx({ t: 'dodge', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, '🛡 Последний рубеж: ты устоял на ногах!');
    }
    this.fx({ t: 'phurt', id: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    if (p.hp <= 0) {
      p.dead = true;
      p.downT = 25;
      p.coins = Math.floor(p.coins * 0.8);
      // смерть вытряхивает сумку: всё ненадетое рассыпается вокруг тела
      // (экипировка, оружие в руках и боеприпасы остаются при герое)
      let di = 0;
      for (const [item, n] of Object.entries(p.inventory)) {
        if (n <= 0) continue;
        // оружие-предметы падают поштучно (подбор берёт по одному)
        const stacks = item.startsWith('weapon:') ? Array(n).fill(1) : [n];
        for (const cnt of stacks) {
          const a = (di++ / 8) * Math.PI * 2;
          const r = 14 + (di % 3) * 10;
          this.spawnDrop(item, cnt, p.mapId, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 300);
        }
      }
      p.inventory = {};
      if (di > 0) this.toast(p, '💀 Сумка рассыпалась по земле — вернись за вещами (5 мин)');
      if (p.contract) { p.contract = null; this.toast(p, '⛧✖ Кровавый контракт сгорел вместе с тобой'); }
      this.fx({ t: 'pdown', id: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.events.push(this.world.day, `${p.name} пал в бою`);
    }
  }

  respawn(p) {
    p.dead = false;
    p.hp = p.maxHp;
    p.hunger = Math.max(p.hunger, 40);
    p.mapId = 'over';
    if (p.home) { // возрождение в своей кровати
      p.x = p.home.x * TILE + 8;
      p.y = p.home.y * TILE + 8;
    } else {
      const s = this.world.settlements[0];
      p.x = (s ? s.x : 256) * TILE + 40;
      p.y = (s ? s.y : 256) * TILE + 40;
    }
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
      'fireball', 'stormstaff', 'spear', 'warhammer', 'dagger', 'taxes', 'venomstaff', 'bombs',
      'mace', 'flail', 'morningstar', 'greatsword', 'halberd'];
    const rar = rollRarity(this.rand, luck, boost);
    this.spawnDrop('weapon:' + withRarity(pick(this.rand, pool), rar), 1, mapId, x, y);
  }

  dropRandomGear(mapId, x, y, elite = false, luck = 0) {
    const pool = elite
      ? ['chain_armor', 'plate_armor', 'scale_armor', 'bear_amulet', 'owl_amulet', 'swift_ring',
         'iron_shield', 'tower_shield', 'berserk_armor', 'mage_robe', 'shadow_cloak',
         'crown', 'rune_amulet', 'totem_amulet', 'gladiator_shield',
         'ring_mail', 'elven_armor', 'crystal_robe', 'troll_hide', 'spiked_shield',
         'flame_tome', 'crystal_orb', 'rage_amulet', 'lucky_deck', 'ring_fortune', 'iron_greaves', 'swift_boots']
      : ['leather_armor', 'padded_armor', 'hunter_hood', 'leather_cap', 'iron_helmet',
         'wolf_amulet', 'fox_amulet', 'iron_ring', 'wood_shield', 'swift_ring',
         'sage_helmet', 'war_helm', 'lucky_charm',
         'wizard_hat', 'elven_helm', 'etched_helm', 'shadow_leggings', 'leather_boots',
         'eye_amulet', 'ring_str', 'ring_dex', 'ring_mind', 'throwing_net'];
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
    this.sendMapChange(p, poi.name + (dungeon.cursed ? ' [ПРОКЛЯТО]' : ''));
    if (dungeon.cursed) this.toast(p, '⚠ Проклятое подземелье: все враги — элита, но добыча щедрее');
  }

  // лестница вниз: второй этаж — сложнее, мрачнее, богаче
  descendDungeon(p) {
    const inst = this.dungeons.get(p.mapId);
    if (!inst || inst.dungeon.depth >= 2) return;
    const poi = inst.poi;
    const mapId = 'dg:' + poi.id + ':d2';
    if (!this.dungeons.has(mapId)) {
      const d = generateDungeon(hash2(this.world.seed, poi.x, poi.y) + 7, poi.difficulty + 1, true, 2);
      this.dungeons.set(mapId, { dungeon: d, poi });
      this.chunks.dungeons.set(mapId, d);
    }
    const { dungeon } = this.dungeons.get(mapId);
    p.mapId = mapId;
    p.x = dungeon.entrance.x * TILE + 8;
    p.y = (dungeon.entrance.y - 1) * TILE + 8;
    this.sendMapChange(p, poi.name + ' — нижний этаж' + (dungeon.cursed ? ' [ПРОКЛЯТО]' : ''));
    this.toast(p, '⬇ Ты спускаешься глубже. Здесь темнее и опаснее…');
    if (dungeon.cursed) this.toast(p, '⚠ Проклятый этаж: все враги — элита, но добыча щедрее');
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
            this.spawnEnemy(sp.kind, mapId, sp.x * TILE + 8, sp.y * TILE + 8,
              { room: room.id, dropKey: sp.keyBearer, forceElite: dungeon.cursed }));
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
      for (const q of p.quests)
        if (q.type === 'clear' && q.poi === poi.id && !q.done) this.completeQuestObjective(p, q);
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
    const ROLE_PRIO = {
      elder: 3, merchant: 2, trader: 2, blacksmith: 2, priest: 2, innkeeper: 2, hunter: 2,
      hermit: 4, wanderer: 4, captain: 4, darkheart: 5, // именные и Сердце — важнее всех
    };
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
      if (t === T.CHEST && this.isAtHome(p, tx + dx, ty + dy)) { this.openStash(p, 'home'); return; }
      if (t === T.CHEST && this.tryBarrowChest(p, tx + dx, ty + dy)) return;
      if (t === T.CHEST && this.tryWildChest(p, tx + dx, ty + dy)) return;
      if (t === T.CHEST) { this.openChest(p, tx + dx, ty + dy); return; }
      if (t === T.STATUE && this.tryBarrowStatue(p, tx + dx, ty + dy)) return;
      if (t === T.DUNGEON_EXIT && p.mapId !== 'over') { this.exitDungeon(p); return; }
      if (t === T.LOCKED_DOOR && p.mapId !== 'over') {
        if ((p.inventory.dungeon_key || 0) < 1) {
          this.toast(p, '🔒 Заперто. Ключ носит хранитель — сильнейший страж этих залов');
          return;
        }
        p.inventory.dungeon_key--;
        if (p.inventory.dungeon_key <= 0) delete p.inventory.dungeon_key;
        const inst = this.dungeons.get(p.mapId);
        const room = inst?.dungeon.rooms.find(r => r.lockedTiles);
        for (const lt of room?.lockedTiles || [{ x: tx + dx, y: ty + dy }]) {
          this.chunks.setTile(p.mapId, lt.x, lt.y, T.DUNGEON_FLOOR);
          this.fx({ t: 'tile', mapId: p.mapId, x: lt.x, y: lt.y, tile: T.DUNGEON_FLOOR }, null);
        }
        if (room) room.lockedTiles = null;
        this.fx({ t: 'chest', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toastMap(p.mapId, '🗝 Дверь босса отперта!');
        return;
      }
      if (t === T.STAIRS && p.mapId !== 'over') { this.descendDungeon(p); return; }
      if (t === T.BED) {
        // своя кровать: полный сон и бодрость
        if (this.isAtHome(p, tx + dx, ty + dy)) {
          if (p.hp >= p.maxHp && (p.buffs.speed?.t || 0) > 5) { this.toast(p, 'Ты свеж, как утренняя роса'); return; }
          if (!cdReady('homebed', 120)) return;
          p.hp = p.maxHp;
          p.hunger = Math.min(HUNGER_MAX, p.hunger + 20);
          p.buffs.speed = { mult: 0.1, t: 90 };
          this.recomputeStats(p);
          this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
          this.toast(p, '🏠 Дома и стены лечат: полное здоровье и +10% скорости на 90 с');
          return;
        }
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
      if (t === T.FOUNTAIN) {
        if (p.hp >= p.maxHp && p.hunger > 80) { this.toast(p, 'Воды источника тебе сейчас ни к чему'); return; }
        if (!cdReady('fountain', 120)) return;
        p.hp = Math.min(p.maxHp, p.hp + 4);
        p.hunger = Math.min(HUNGER_MAX, p.hunger + 15);
        this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toast(p, '✨ Целебные воды: +2 сердца и сытость');
        return;
      }
      if (t === T.OBELISK) { this.touchObelisk(p, tx + dx, ty + dy); return; }
      if (t === T.DARK_ALTAR) {
        const circle = this.world.pois.find(o => o.type === 'circle' && Math.abs(o.x - tx) < 3 && Math.abs(o.y - ty) < 3);
        if (circle && !circle.cleared) this.toast(p, '⛧ Идол сочится тьмой. Сначала перебей его стражей!');
        else this.toast(p, 'Идол мёртв и молчит. Отшельник Радогост знал бы, что это значит…');
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
        if ((p.inventory.crystal || 0) < 1 && p.mana < 5) {
          this.toast(p, 'Духи ждут подношения (5 маны)');
          return;
        }
        if (!cdReady('shrine', 60)) return;
        p.mana = Math.max(0, p.mana - 5);
        // совместная молитва: если рядом союзники — благословение сильнее и на всех
        const allies = [...this.players.values()].filter(q =>
          !q.dead && q.mapId === p.mapId && dist2(q.x, q.y, p.x, p.y) < 70 * 70);
        if (allies.length >= 2) {
          for (const q of allies) {
            q.buffs.blessed = { mult: 0.15, t: 180 };
            this.recomputeStats(q);
            this.toast(q, '✦ Совместная молитва: +15% урона всей группе на 3 мин');
          }
        } else {
          p.buffs.blessed = { mult: 0.1, t: 120 };
          this.recomputeStats(p);
          this.toast(p, '✦ Духи довольны: +10% урона на 2 мин');
        }
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

  // ---------- Война с Тьмой: эндгейм-кампания ----------
  // Этапы (общие для всего мира): 1 союз фракций -> 2 сбор реликвий ->
  // 3 великий ритуал и штурм -> 4 выбор у Сердца Тьмы -> 10/11 финалы.
  warStep(p) {
    const w = this.world.war, c = this.world.citadel;
    if (!w || !c || c.dead) return;
    if (w.stage === 0) {
      w.stage = 1;
      this.toast(p, '⚔ Война началась! Заручись доверием Северян, Озёрного союза и Степняков (репутация 25)');
      this.toastAll('⚔ ВОЙНА С ТЬМОЙ: старейшины зовут героев объединить фракции!');
      this.events.push(this.world.day, `${p.name} поднял знамя Войны с Тьмой`);
    } else if (w.stage === 1) {
      const reps = ['severane', 'ozerny', 'stepnyaki'].map(f => p.rep[f] || 0);
      if (reps.some(r => r < 25)) {
        this.toast(p, `⚔ Доверие фракций: Северяне ${reps[0]}, Озёрный союз ${reps[1]}, Степняки ${reps[2]} — нужно 25 у всех`);
        return;
      }
      w.stage = 2;
      this.spawnHeartKeeper();
      this.toastAll('⚔ Союз трёх фракций заключён! Для великого ритуала нужны реликвии:');
      this.toastAll('10 кристаллов · Сердце Тени (Хранитель у Каменного круга) · Древний осколок (боссы данжей)');
      this.events.push(this.world.day, `${p.name} объединил три фракции против Тьмы`);
      const circle = this.world.pois.find(o => o.type === 'circle');
      if (circle) this.fx({ t: 'marker', pid: p.id, x: circle.x, y: circle.y }, null);
    } else if (w.stage === 2) {
      const need = [];
      if ((p.inventory.crystal || 0) < 10) need.push(`кристаллы ${p.inventory.crystal || 0}/10`);
      if ((p.inventory.shadow_heart || 0) < 1) need.push('Сердце Тени');
      if ((p.inventory.ancient_shard || 0) < 1) need.push('Древний осколок');
      if (need.length) { this.toast(p, '⚔ Не хватает: ' + need.join(', ')); return; }
      p.inventory.crystal -= 10;
      p.inventory.shadow_heart -= 1;
      p.inventory.ancient_shard -= 1;
      w.stage = 3;
      c.power = Math.max(3, Math.round(c.power * 0.6));
      c.weakened = true; // гарнизон возрождается ослабленным
      const g = this.abstract.tokens.find(t => t.garrison && !t.dead);
      if (g && !g.hydrated) g.units = ['darkLord', 'darkKnight', 'darkArcher'];
      this.addXp(p, 150);
      this.toastAll('✦ ВЕЛИКИЙ РИТУАЛ СВЕРШЁН! Врата Чернокаменной Цитадели пали — на штурм!');
      this.events.push(this.world.day, 'Великий ритуал трёх фракций ослабил Цитадель — начался штурм');
      for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: c.x, y: c.y }, null);
    } else if (w.stage === 3) {
      this.toast(p, '⚔ Цитадель ждёт: срази Лорда Тьмы и его свиту в самом сердце крепости');
    }
  }

  spawnHeartKeeper() {
    const w = this.world.war;
    const circle = this.world.pois.find(o => o.type === 'circle') || this.world.pois[0];
    w.keeperId = this.spawnEnemy('heartKeeper', 'over',
      circle.x * TILE + 8, circle.y * TILE - 20, { noElite: true });
  }

  // страховка: Хранитель/Сердце не должны потеряться (вызывается из civ-тика)
  warUpkeep() {
    const w = this.world.war, c = this.world.citadel;
    if (!w || !c) return;
    if (w.stage === 2 && !(w.keeperId && this.entities.has(w.keeperId))) {
      const heartExists = [...this.players.values()].some(q => (q.inventory.shadow_heart || 0) > 0)
        || [...this.entities.values()].some(e => e.entType === 'drop' && e.item === 'shadow_heart');
      if (!heartExists) this.spawnHeartKeeper();
    }
    if (w.stage === 4 && !(w.heartId && this.entities.has(w.heartId))) this.spawnDarkHeart();
  }

  spawnDarkHeart() {
    const w = this.world.war, c = this.world.citadel;
    w.heartId = this.spawnNpc('darkheart', null, 'over', c.x * TILE + 8, c.y * TILE + 8, { kind: 'obj_darkheart' });
    const h = this.entities.get(w.heartId);
    h.name = 'Сердце Тьмы';
    h.hp = h.maxHp = 999;
  }

  // Финал: уничтожить источник Тьмы или подчинить его
  warFinale(p, destroy) {
    const w = this.world.war, c = this.world.citadel;
    if (!w || w.stage !== 4) return;
    w.stage = destroy ? 10 : 11;
    c.dead = true;
    c.power = 0;
    if (w.heartId) this.entities.delete(w.heartId);
    // герои штурма: все живые рядом с Цитаделью (или хотя бы выбравший)
    const heroes = [...this.players.values()].filter(q =>
      !q.dead && q.mapId === 'over' && dist2(q.x, q.y, c.x * TILE, c.y * TILE) < 500 ** 2);
    const grp = heroes.length ? heroes : [p];
    const LEG = { warrior: 'sunblade', mage: 'dawnstaff', rogue: 'windbow' };
    for (const q of grp) {
      const lw = (LEG[q.cls] || 'sunblade') + '@l';
      q.inventory['weapon:' + lw] = (q.inventory['weapon:' + lw] || 0) + 1;
      this.addXp(q, 300);
      this.toast(q, `🏆 ЛЕГЕНДАРНАЯ награда: ${getWeapon(lw).name}!`);
    }
    // форты Тьмы освобождаются в любом случае — войска расходятся
    for (const s of this.world.settlements)
      if (s.faction === 'darkness') this.civ.liberateSettlement(s, p);
    if (destroy) {
      for (const q of grp)
        for (const f of ['severane', 'ozerny', 'stepnyaki'])
          q.rep[f] = Math.min(100, (q.rep[f] || 0) + 25);
      this.toastAll('☀ СЕРДЦЕ ТЬМЫ УНИЧТОЖЕНО! Война окончена — свет победил навсегда');
      this.events.push(this.world.day, `${p.name} уничтожил Сердце Тьмы. Цитадель мертва, мир свободен`);
    } else {
      p.inventory['dark_seal@l'] = (p.inventory['dark_seal@l'] || 0) + 1;
      this.toast(p, '🏆 Печать Тьмы [Легендарное] пульсирует у тебя на груди');
      c.owned = true;
      for (const q of grp)
        for (const f of ['severane', 'ozerny', 'stepnyaki'])
          q.rep[f] = Math.max(-100, (q.rep[f] || 0) - 30);
      this.toastAll(`⛧ ${p.name} ПОДЧИНИЛ Сердце Тьмы. Цитадель принадлежит смертному… Люди этого не забудут`);
      this.events.push(this.world.day, `${p.name} подчинил Сердце Тьмы — добрые фракции отвернулись от него`);
    }
  }

  // ---------- Вознесение: путь от смертного к богу (уровень 20) ----------
  // Ритуал у Древнего обелиска: дорогие компоненты + три волны стражей.
  startAscension(p, poiId) {
    if (p.level < MAX_LEVEL || p.ascended || this.ascensions.has(p.id)) return;
    const poi = this.world.pois.find(o => o.id === poiId) || this.world.pois.find(o => o.type === 'obelisk');
    if (!poi) return;
    if ((p.inventory.crystal || 0) < 20) { this.toast(p, `✸ Нужно 20 кристаллов (есть ${p.inventory.crystal || 0})`); return; }
    if ((p.inventory.metal || 0) < 10) { this.toast(p, `✸ Нужно 10 металла (есть ${p.inventory.metal || 0})`); return; }
    if (p.coins < 500) { this.toast(p, `✸ Нужно 500 монет (есть ${p.coins})`); return; }
    p.inventory.crystal -= 20;
    p.inventory.metal -= 10;
    p.coins -= 500;
    this.ascensions.set(p.id, { poi, wave: 0, ids: [] });
    this.fx({ t: 'boom', x: poi.x * TILE, y: poi.y * TILE, r: 40 }, 'over', poi.x * TILE, poi.y * TILE);
    this.toastAll(`✸ ${p.name} начал Ритуал Вознесения — древние стражи пробуждаются!`);
    this.events.push(this.world.day, `${p.name} бросил вызов Вечности у обелиска`);
    this.nextAscWave(p);
  }

  nextAscWave(p) {
    const asc = this.ascensions.get(p.id);
    if (!asc) return;
    asc.wave++;
    const WAVES = [
      ['golem', 'golem', 'ghoul'],
      ['minotaur', 'orcKnight', 'orcKnight'],
      ['rockKing'],
    ];
    const kinds = WAVES[asc.wave - 1];
    if (!kinds) return;
    const ox = asc.poi.x * TILE, oy = asc.poi.y * TILE;
    asc.ids = kinds.map((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2;
      return this.spawnEnemy(k, 'over', ox + Math.cos(a) * 60, oy + Math.sin(a) * 60,
        { forceElite: kinds.length > 1, noElite: kinds.length === 1, ascFor: p.id });
    });
    for (const id of asc.ids) { const e = this.entities.get(id); if (e) e.aggro = true; }
    this.toast(p, `✸ Волна ${asc.wave}/3: ${kinds.length > 1 ? 'стражи идут!' : 'ПОСЛЕДНИЙ СТРАЖ!'}`);
  }

  // вызывается каждый тик: следим за волнами и провалом
  checkAscensions() {
    for (const [pid, asc] of this.ascensions) {
      const p = this.players.get(pid);
      // смерть или уход — ритуал сорван, дары сгорели
      if (!p || p.dead || p.mapId !== 'over' ||
        dist2(p.x, p.y, asc.poi.x * TILE, asc.poi.y * TILE) > 600 ** 2) {
        for (const id of asc.ids) this.entities.delete(id);
        this.ascensions.delete(pid);
        if (p) this.toast(p, '✸ Ритуал сорван. Обелиск умолк, дары обращены в пепел…');
        this.events.push(this.world.day, `Ритуал Вознесения ${p?.name || '…'} провалился`);
        continue;
      }
      if (asc.ids.some(id => this.entities.has(id))) continue; // волна ещё жива
      if (asc.wave < 3) this.nextAscWave(p);
      else {
        this.ascensions.delete(pid);
        this.ascend(p);
      }
    }
  }

  // БОЖЕСТВЕННОСТЬ: +4 ко всем атрибутам, +3 сердца, скорость, реген,
  // способности перезаряжаются на четверть быстрее
  ascend(p) {
    p.ascended = true;
    this.recomputeStats(p);
    p.hp = p.maxHp;
    this.addXp(p, 0);
    this.fx({ t: 'ascend', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    this.toastAll(`✸✸✸ ${p.name} ВОЗНЁССЯ! Смертный стал богом Пограничья ✸✸✸`);
    this.toast(p, '✸ Божественная мощь: +4 ко всем атрибутам, +3 сердца, реген, быстрые способности');
    this.events.push(this.world.day, `${p.name} прошёл Ритуал Вознесения и обрёл божественность`);
  }

  // ---------- сюжетные цепочки именных NPC ----------
  // Радогост (отшельник): кристаллы -> зачистить каменный круг -> ВЫБОР:
  // ритуал света (Тьма слабеет) или потребовать силу себе (бой с тенью).
  storyDialogHermit(p, npc) {
    const st = p.story.rado;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['«Я Радогост. Ушёл от людей, когда увидел, ЧТО растёт на юге.',
        'Тьму можно ранить, но мне нужны кристаллы — пять штук.',
        'Принесёшь — покажу, как бьётся сердце Тьмы».'];
      ch.push({ id: 'story:rado_accept', label: '✦ Помочь отшельнику (принести 5 кристаллов)' });
    } else if (st === 1) {
      if ((p.inventory.crystal || 0) >= 5) {
        lines = ['«Пять кристаллов… чистых, как слеза. Отдашь их мне?»'];
        ch.push({ id: 'story:rado_give', label: '✦ Отдать 5 кристаллов' });
      } else {
        lines = [`«Кристаллы, ${p.name}. Пять. У тебя ${p.inventory.crystal || 0}.`,
          'Их добывают в шахтах, у болот и из светящихся жил в подземельях».'];
      }
    } else if (st === 2) {
      const circle = this.world.pois.find(o => o.type === 'circle' && !o.cleared);
      if (!circle) {
        lines = ['«Круг чист! Идол мёртв. Теперь — последний шаг.',
          'Я готов провести ритуал света и вырвать у Тьмы её мощь.',
          'Но эту силу можно и... взять себе. Решай».'];
        ch.push({ id: 'story:rado_light', label: '✦ Провести ритуал света (Тьма ослабнет, деревни под защитой)' });
        ch.push({ id: 'story:rado_dark', label: '⛧ Потребовать силу себе (Радогост не отдаст её без боя)' });
      } else {
        lines = ['«Демоны свили гнездо в Каменном круге и питают Цитадель.',
          'Перебей их стражу у осквернённого идола — я отметил место на карте».'];
        this.fx({ t: 'marker', pid: p.id, x: circle.x, y: circle.y }, null);
      }
    } else if (st === 10) {
      lines = ['«Свет держится. Деревни дышат спокойнее — и это твоя заслуга»'];
    } else {
      lines = ['Хижина пуста. Только пепел в очаге еще тёплый…'];
    }
    ch.push({ id: 'close', label: STR.bye });
    this.sendDialog(p, npc.id, '🧙 Отшельник Радогост', lines, ch);
  }

  // Ярослава (капитан стражи): истребить бандитов -> зачистить лагерь -> ВЫБОР:
  // казнить главаря (банды редеют) или взять выкуп (бандиты — «друзья»).
  storyDialogCaptain(p, npc) {
    const st = p.story.capt;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['«Ярослава, капитан стражи. Вольница совсем обнаглела —',
        'жгут поля, грабят караваны. Мне нужен острый клинок.',
        'Перебей десяток разбойников — и поговорим о большем».'];
      ch.push({ id: 'story:capt_accept', label: '⚔ Взяться за дело (убить 10 бандитов)' });
    } else if (st === 1) {
      const done = p.story.bandits - p.story.banditsGoal + 10;
      if (done >= 10) {
        lines = ['«Десять?! А говорили — не наёмник… Слушай дальше.',
          'Их логово — лагерь в глуши. Разори его дотла.',
          'Место я отметила на твоей карте».'];
        ch.push({ id: 'story:capt_camp', label: '⚔ Выступить к лагерю' });
      } else {
        lines = [`«Пока ${Math.max(0, done)}/10. Разбойники шастают у дорог и лагерей»`];
      }
    } else if (st === 2) {
      const camp = this.world.pois.find(o => o.id === p.story.captCamp);
      if (camp && camp.cleared) {
        lines = ['«Лагерь пал, а стража взяла главаря живьём.',
          'Он предлагает выкуп — 250 монет за свою шкуру.',
          'Закон говорит одно, кошель — другое. Тебе решать».'];
        ch.push({ id: 'story:capt_execute', label: '⚔ Казнить главаря (банды надолго притихнут)' });
        ch.push({ id: 'story:capt_ransom', label: '🪙 Взять выкуп (250 мон., Вольница это запомнит)' });
      } else {
        lines = ['«Лагерь ещё стоит. Разори его — я отметила место на карте»'];
        if (camp) this.fx({ t: 'marker', pid: p.id, x: camp.x, y: camp.y }, null);
      }
    } else if (st === 10) {
      lines = ['«Дороги стали тише. Такое не забывается, воин»'];
    } else {
      lines = ['«…Говорят, главарь Вольницы гуляет на твои сребреники. Уйди с глаз»'];
    }
    ch.push({ id: 'close', label: STR.bye });
    this.sendDialog(p, npc.id, '🛡 Капитан Ярослава', lines, ch);
  }

  // Мирослава (странница): осколки с обелисков -> отбить стражей -> ВЫБОР:
  // сила — людям (деревни расцветают) или себе (+2 очка характеристик).
  storyDialogWanderer(p, npc) {
    const st = p.story.mira;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['«Я Мирослава. Всю жизнь иду за шёпотом этих камней.',
        'Обелиски — замки́ древней силы. Коснись двух из них,',
        'собери осколки — и мы разбудим то, что спит внизу».'];
      ch.push({ id: 'story:mira_accept', label: '✦ Собрать осколки (коснуться 2 обелисков)' });
    } else if (st === 1) {
      if ((p.story.shards || []).length >= 2) {
        lines = ['«Осколки поют! Кладём их к подножию — и берегись:',
          'древние стражи не спят, когда тревожат замок».'];
        ch.push({ id: 'story:mira_ritual', label: '✦ Начать пробуждение (бой со стражами!)' });
      } else {
        lines = [`«Осколков пока ${(p.story.shards || []).length}/2. Второй обелиск ищи по карте — я отметила»`];
        const other = this.world.pois.find(o => o.type === 'obelisk' && !(p.story.shards || []).includes(o.id));
        if (other) this.fx({ t: 'marker', pid: p.id, x: other.x, y: other.y }, null);
      }
    } else if (st === 2) {
      const alive = (this.world.obeliskGuards || []).some(id => this.entities.has(id));
      if (!alive) {
        lines = ['«Стражи пали, и сила свободна. Слушай, как гудит камень!',
          'Её можно разлить по земле — деревни расцветут.',
          'А можно… впитать. Всю. Одному». Она смотрит тебе в глаза.'];
        ch.push({ id: 'story:mira_people', label: '✦ Отдать силу людям (деревни расцветают)' });
        ch.push({ id: 'story:mira_self', label: '★ Забрать силу себе (+2 очка характеристик)' });
      } else {
        lines = ['«Стражи ещё держат замок! Вернись и добей их»'];
      }
    } else if (st === 10) {
      lines = ['«Чуешь? Земля тёплая. Спасибо тебе от всех, кто не узнает, кого благодарить»'];
    } else {
      lines = ['«Сила в тебе гудит… Надеюсь, ты знаешь, что делаешь». Она уходит не прощаясь.'];
    }
    ch.push({ id: 'close', label: STR.bye });
    this.sendDialog(p, npc.id, '🔮 Странница Мирослава', lines, ch);
  }

  // Развилки сюжета: выборы игрока, меняющие мир
  storyChoice(p, key, dialogId) {
    const S = p.story;
    switch (key) {
      case 'rado_accept':
        if (S.rado === 0) { S.rado = 1; this.toast(p, '✦ Радогост: принеси 5 кристаллов'); }
        break;
      case 'rado_give':
        if (S.rado === 1 && (p.inventory.crystal || 0) >= 5) {
          p.inventory.crystal -= 5;
          S.rado = 2;
          this.addXp(p, 40);
          const circle = this.world.pois.find(o => o.type === 'circle' && !o.cleared);
          if (circle) this.fx({ t: 'marker', pid: p.id, x: circle.x, y: circle.y }, null);
          this.toast(p, '✦ Теперь зачисти Каменный круг (метка на карте)');
        }
        break;
      case 'rado_light': { // ритуал света: мощь Тьмы вдвое, деревни под обережкой
        if (S.rado !== 2) break;
        S.rado = 10;
        const c = this.world.citadel;
        if (c) c.power = Math.max(3, Math.round(c.power / 2));
        for (const s of this.world.settlements) if (!s.ruined) s.wardT = Math.max(s.wardT, 30);
        p.inventory['weapon:firestaff@e'] = (p.inventory['weapon:firestaff@e'] || 0) + 1;
        this.addXp(p, 120);
        this.toast(p, '🏆 Награда: Огненный посох [Эпическое]');
        this.toastAll('✦ Столб света ударил в небо: Тьма отшатнулась, деревни под защитой духов!');
        this.events.push(this.world.day, `${p.name} и отшельник Радогост провели ритуал света — Тьма ослабла вдвое`);
        break;
      }
      case 'rado_dark': { // жадность: Радогост обращается тенью и нападает
        if (S.rado !== 2) break;
        S.rado = 11;
        const npc = this.entities.get(dialogId);
        const x = npc?.x ?? p.x + 20, y = npc?.y ?? p.y;
        if (npc) this.entities.delete(npc.id);
        const eid = this.spawnEnemy('darkMage', p.mapId === 'over' ? 'over' : p.mapId, x, y, { hermitShade: true });
        const e = this.entities.get(eid);
        e.hp = e.maxHp = 60;
        e.aggro = true;
        this.fx({ t: 'boom', x, y, r: 20 }, p.mapId, x, y);
        this.toastAll('⛧ Радогост обратился Тенью! Сила достанется победителю');
        this.events.push(this.world.day, `${p.name} потребовал силу ритуала — Радогост стал Тенью отшельника`);
        break;
      }
      case 'capt_accept':
        if (S.capt === 0) {
          S.capt = 1;
          S.banditsGoal = S.bandits + 10;
          this.toast(p, '⚔ Ярослава: истреби 10 бандитов');
        }
        break;
      case 'capt_camp': {
        if (S.capt !== 1) break;
        S.capt = 2;
        const camp = this.world.pois.find(o => o.type === 'camp' && !o.cleared);
        S.captCamp = camp?.id || null;
        if (camp) this.fx({ t: 'marker', pid: p.id, x: camp.x, y: camp.y }, null);
        else S.captCamp = 'any-cleared'; // лагерей нет — засчитываем сразу
        this.toast(p, camp ? '⚔ Разори лагерь разбойников (метка на карте)' : '⚔ Лагеря уже разорены — вернись к Ярославе');
        break;
      }
      case 'capt_execute': { // казнь: банды Вольницы надолго затихают
        if (S.capt !== 2) break;
        S.capt = 10;
        this.world.banditsWeakT = 1800; // ~30 минут без новых банд
        // действующие банды разбегаются
        for (const t of this.abstract.tokens)
          if (t.faction === 'bandits' && t.type === 'pack') t.dead = true;
        const s0 = this.world.settlements[0];
        if (s0) p.rep[s0.faction] = Math.min(100, (p.rep[s0.faction] || 0) + 15);
        p.rep.bandits = Math.max(-100, (p.rep.bandits || 0) - 20);
        p.inventory['weapon:warhammer@e'] = (p.inventory['weapon:warhammer@e'] || 0) + 1;
        this.addXp(p, 100);
        this.toast(p, '🏆 Награда: Боевой молот [Эпическое]');
        this.toastAll('⚔ Главарь Вольницы казнён — банды разбегаются по норам!');
        this.events.push(this.world.day, `${p.name} казнил главаря Вольницы: дороги очистились`);
        break;
      }
      case 'capt_ransom': { // выкуп: золото сейчас, бандиты наглеют потом
        if (S.capt !== 2) break;
        S.capt = 11;
        p.coins += 250;
        p.rep.bandits = Math.min(100, (p.rep.bandits || 0) + 45);
        const s0 = this.world.settlements[0];
        if (s0) p.rep[s0.faction] = Math.max(-100, (p.rep[s0.faction] || 0) - 15);
        p.inventory['lucky_deck@e'] = (p.inventory['lucky_deck@e'] || 0) + 1;
        // Вольница крепнет: две свежие банды выходят на дороги
        for (let i = 0; i < 2; i++) {
          this.abstract.tokens.push({
            id: 'tok' + this.abstract.nextId++, type: 'pack', name: 'банда разбойников',
            faction: 'bandits', units: ['bandit', 'bandit', 'banditHeavy'],
            x: (this.world.settlements[0]?.x + 40 + i * 30) * TILE, y: (this.world.settlements[0]?.y + 30) * TILE,
            hydrated: null,
          });
        }
        this.addXp(p, 60);
        this.toast(p, '🏆 +250 мон. и Колода фортуны [Эпическое]. Вольница считает тебя своим');
        this.toastAll('🪙 Главарь Вольницы откупился и вышел на свободу…');
        this.events.push(this.world.day, `${p.name} отпустил главаря Вольницы за выкуп — банды множатся`);
        break;
      }
      case 'mira_accept':
        if (S.mira === 0) { S.mira = 1; this.toast(p, '✦ Мирослава: коснись 2 древних обелисков'); }
        break;
      case 'mira_ritual': { // пробуждение: древние стражи выходят из-под земли
        if (S.mira !== 1 || (S.shards || []).length < 2) break;
        S.mira = 2;
        const ob = this.world.pois.find(o => o.type === 'obelisk');
        const ox = (ob?.x ?? Math.round(p.x / TILE)) * TILE, oy = (ob?.y ?? Math.round(p.y / TILE)) * TILE;
        this.world.obeliskGuards = [];
        const kinds = ['golem', 'skeleton', 'skeleton', 'dasher'];
        for (let i = 0; i < kinds.length; i++) {
          const a = i / kinds.length * Math.PI * 2;
          this.world.obeliskGuards.push(this.spawnEnemy(kinds[i], 'over',
            ox + Math.cos(a) * 40, oy + Math.sin(a) * 40, { faction: 'monsters' }));
        }
        for (const id of this.world.obeliskGuards) { const e = this.entities.get(id); if (e) e.aggro = true; }
        this.fx({ t: 'boom', x: ox, y: oy, r: 30 }, 'over', ox, oy);
        this.toastAll('✦ Древние стражи восстали у обелиска!');
        break;
      }
      case 'mira_people': { // сила — людям: мир расцветает
        if (S.mira !== 2) break;
        S.mira = 10;
        for (const s of this.world.settlements) {
          if (s.ruined || s.captured) continue;
          s.prosperity = Math.min(100, s.prosperity + 15);
          s.guards++;
          s.wardT = Math.max(s.wardT, 20);
          this.civ.rehydrate(s);
        }
        p.inventory['rune_amulet@e'] = (p.inventory['rune_amulet@e'] || 0) + 1;
        this.addXp(p, 120);
        this.toast(p, '🏆 Награда: Рунный амулет [Эпическое]');
        this.toastAll('✦ Сила обелиска разлилась по земле: деревни расцветают!');
        this.events.push(this.world.day, `${p.name} отдал силу обелиска людям — сёла окрепли и наняли стражу`);
        break;
      }
      case 'mira_self': { // сила — себе: могущество и разбуженные твари
        if (S.mira !== 2) break;
        S.mira = 11;
        p.statPts += 2;
        p.inventory['ring_fortune@e'] = (p.inventory['ring_fortune@e'] || 0) + 1;
        const ob = this.world.pois.find(o => o.type === 'obelisk');
        if (ob) {
          this.abstract.tokens.push({
            id: 'tok' + this.abstract.nextId++, type: 'pack', name: 'разбуженные твари',
            faction: 'monsters', units: ['demon', 'imp', 'imp', 'dasher'],
            x: ob.x * TILE, y: ob.y * TILE, hydrated: null,
          });
        }
        this.addXp(p, 60);
        this.toast(p, '🏆 +2 очка характеристик (C) и Кольцо фортуны [Эпическое]');
        this.toastAll('⛧ Обелиск угас. Что-то древнее проснулось в глуши…');
        this.events.push(this.world.day, `${p.name} впитал силу обелиска — древние твари разбужены`);
        break;
      }
    }
  }

  // ---------- приключения: курганы-загадки и дикие сундуки ----------
  findBarrow(tx, ty) {
    return this.world.pois.find(o => o.type === 'barrow' && Math.abs(o.x - tx) <= 5 && Math.abs(o.y - ty) <= 5);
  }

  // Статуя кургана: руны надо активировать в правильном порядке
  tryBarrowStatue(p, tx, ty) {
    const b = this.findBarrow(tx, ty);
    if (!b) return false;
    if (b.looted) { this.toast(p, 'Камень давно умолк. Курган разграблен'); return true; }
    const dx = tx - b.x, dy = ty - b.y;
    const idx = dy < -1 ? 0 : dx > 1 ? 1 : dy > 1 ? 2 : 3; // С, В, Ю, З
    const runa = ['I', 'II', 'III', 'IV'][b.order.indexOf(idx)];
    if (b.pressed.includes(idx)) { this.toast(p, `Руна «${runa}» уже горит`); return true; }
    if (b.order[b.pressed.length] === idx) {
      b.pressed.push(idx);
      this.fx({ t: 'pickup', x: tx * TILE + 8, y: ty * TILE + 8 }, p.mapId, tx * TILE, ty * TILE);
      this.toast(p, `✨ Руна «${runa}» вспыхнула (${b.pressed.length}/4)` +
        (b.pressed.length === 4 ? ' — печать снята, сундук открыт!' : ''));
    } else {
      b.pressed = [];
      this.toast(p, `⚠ Руна «${runa}» — порядок нарушен! Стражи кургана восстали (жми I→II→III→IV)`);
      for (let i = 0; i < 3; i++) {
        const a = this.rand() * Math.PI * 2;
        const id = this.spawnEnemy('ghoul', 'over', b.x * TILE + Math.cos(a) * 40, b.y * TILE + Math.sin(a) * 40, { noElite: true });
        const g = this.entities.get(id);
        if (g) g.aggro = true;
      }
    }
    return true;
  }

  // Сундук кургана: открывается только после загадки
  tryBarrowChest(p, tx, ty) {
    const b = this.findBarrow(tx, ty);
    if (!b) return false;
    if (b.looted) { this.toast(p, 'Пусто. Эхо древности — и только'); return true; }
    if (b.pressed.length < 4) {
      this.toast(p, '🔒 Сундук запечатан рунами. Зажги четыре руны статуй в порядке I→II→III→IV');
      return true;
    }
    b.looted = true;
    this.dropRandomGear(p.mapId, tx * TILE + 8, ty * TILE + 24, true, (p.effStats?.lck || 0));
    this.spawnDrop('coin', 30 + Math.floor(this.rand() * 30), p.mapId, tx * TILE - 6, ty * TILE + 20);
    this.spawnDrop('crystal', 2, p.mapId, tx * TILE + 20, ty * TILE + 20);
    this.addXp(p, 60);
    this.fx({ t: 'chest', x: tx * TILE, y: ty * TILE }, p.mapId, tx * TILE, ty * TILE);
    this.toastAll(`⚱ ${p.name} разгадал тайну древнего кургана!`);
    this.events.push(this.world.day, `${p.name} снял печать кургана`, { x: b.x, y: b.y });
    return true;
  }

  // Дикий сундук в глуши: одноразовый тайник
  tryWildChest(p, tx, ty) {
    const wc = this.world.wildChests?.find(c => c.x === tx && c.y === ty);
    if (!wc) return false;
    if (wc.opened) { this.toast(p, 'Тайник пуст — кто-то успел раньше'); return true; }
    wc.opened = true;
    this.dropRandomGear(p.mapId, tx * TILE + 8, ty * TILE + 20, this.rand() < 0.4, (p.effStats?.lck || 0));
    this.spawnDrop('coin', 15 + Math.floor(this.rand() * 25), p.mapId, tx * TILE - 4, ty * TILE + 20);
    this.addXp(p, 25);
    this.fx({ t: 'chest', x: tx * TILE, y: ty * TILE }, p.mapId, tx * TILE, ty * TILE);
    this.toast(p, '📦 Тайник в глуши! Исследование вознаграждается');
    return true;
  }

  // Прикосновение к обелиску: вознесение, осколок для Мирославы или знания
  touchObelisk(p, tx, ty) {
    const poi = this.world.pois.find(o => o.type === 'obelisk' && Math.abs(o.x - tx) < 4 && Math.abs(o.y - ty) < 4);
    // герой 20 уровня слышит зов божественной силы
    if (p.level >= MAX_LEVEL && !p.ascended && poi) {
      if (this.ascensions.has(p.id)) { this.toast(p, '✸ Испытание уже идёт — срази стражей!'); return; }
      this.sendDialog(p, 'ascend:' + poi.id, '✸ Зов Вечности',
        ['Обелиск гудит, узнав тебя. Смертный предел достигнут —',
         'дальше лишь БОЖЕСТВЕННОСТЬ. Ритуал потребует всего:',
         '20 кристаллов, 10 металла, 500 монет — и победы над',
         'тремя волнами древних стражей. Падёшь — дары сгорят.'],
        [{ id: 'ascend_start', label: '✸ Начать Ритуал Вознесения (20 крист., 10 мет., 500 мон.)' },
         { id: 'close', label: 'Я ещё не готов…' }]);
      return;
    }
    if (p.story?.mira === 1 && poi && !(p.story.shards || []).includes(poi.id)) {
      p.story.shards.push(poi.id);
      this.fx({ t: 'pickup', x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, `✨ Осколок древней силы (${p.story.shards.length}/2)` +
        (p.story.shards.length >= 2 ? ' — возвращайся к Мирославе!' : ''));
      return;
    }
    p.useCd = p.useCd || {};
    if ((p.useCd.obelisk || 0) > this.tick) { this.toast(p, 'Обелиск молчит. Он ещё помнит твоё прикосновение'); return; }
    p.useCd.obelisk = this.tick + 300 * 30;
    this.addXp(p, 15);
    this.fx({ t: 'levelup', pid: -1, x: p.x, y: p.y }, p.mapId, p.x, p.y);
    this.toast(p, '✦ Обелиск шепчет о былом: +15 опыта');
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
    if (npc.role === 'hermit') { this.storyDialogHermit(p, npc); return; }
    if (npc.role === 'captain') { this.storyDialogCaptain(p, npc); return; }
    if (npc.role === 'wanderer') { this.storyDialogWanderer(p, npc); return; }
    if (npc.role === 'darkheart') {
      const ch = this.world.war?.stage === 4
        ? [{ id: 'war_destroy', label: '☀ Уничтожить Сердце (Тьма падёт навсегда, слава героям)' },
           { id: 'war_claim', label: '⛧ Подчинить Сердце (Печать Тьмы и Цитадель — твои, но люди не простят)' },
           { id: 'close', label: 'Отойти…' }]
        : [{ id: 'close', label: STR.bye }];
      this.sendDialog(p, npc.id, '🖤 Сердце Тьмы',
        ['Сгусток изначальной Тьмы бьётся в пустом зале, как живое сердце.',
         'Его сила течёт сквозь пальцы — тёплая, жадная, послушная…'], ch);
      return;
    }
    if (npc.role === 'merchant' || npc.role === 'trader') {
      // структурированный прилавок: клиент рисует окно-сетку с иконками
      const mult = priceMultiplier(s ? p.rep[s.faction] : 0);
      const items = SHOP.map((it, i) => {
        const sc = scarcityMult(s, it.item, 'buy');
        let need = null;
        if (it.item.startsWith('ammo_')) {
          const type = it.item.slice(5);
          const hasWeapon = p.weapons.some(w => getWeapon(w)?.ammoType === type)
            || Object.keys(p.inventory).some(k => isWeaponItem(k) && getWeapon(weaponIdOf(k))?.ammoType === type);
          if (!hasWeapon) need = ammoUsers(type);
        }
        return {
          i, item: it.item, count: it.count || 0,
          price: Math.ceil(it.price * mult * sc),
          trend: sc > 1.01 ? 1 : sc < 0.99 ? -1 : 0,
          need,
        };
      });
      this.fx({ t: 'shop', pid: p.id, id: npc.id, name: npc.name, greet: this.npcGreeting(p, npc), items }, null);
    } else if (npc.role === 'elder') {
      if (p.hintStage === 0) p.hintStage = 1; // онбординг: познакомились со старейшиной
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
      const supQ = p.quests.find(q => q.type === 'supply' && !q.done && q.giver === npc.home);
      if (supQ) {
        const have = p.inventory[supQ.item] || 0;
        choices.push({ id: 'supply', label: `Отдать припасы (${Math.min(have, supQ.count)}/${supQ.count})` });
      }
      if (p.quests.some(q => q.done && q.giver === npc.home))
        choices.push({ id: 'turnin', label: STR.questTurnIn });
      if (p.quests.length < 3)
        choices.push({ id: 'quest', label: STR.questAccept });
      else if (p.quests.some(q => !q.done && q.giver === npc.home))
        lines.push('Как продвигается дело?');
      if (s?.project && (p.inventory.wood || 0) >= 5)
        choices.push({ id: 'donate', label: 'Пожертвовать 5 древесины на стройку (+реп)' });
      // вира: откупиться от розыска
      if ((p.bounty || 0) > 0)
        choices.push({ id: 'payoff', label: `💀 Заплатить виру (${p.bounty * 2} мон.) — снять розыск` });
      // свой дом: жильё в деревне для героя с репутацией
      if (s && !p.home) {
        if ((p.rep[s.faction] || 0) >= 20) choices.push({ id: 'buyhouse', label: `🏠 Купить дом в ${s.name} (150 мон.)` });
        else choices.push({ id: 'nohouse', label: '🏠 Спросить о жилье (нужна репутация 20)' });
      }
      // Война с Тьмой: общемировая кампания до самой Цитадели
      const war = this.world.war;
      if (war && this.world.citadel && !this.world.citadel.dead) {
        const warLabel = [
          '⚔ «Тьма растёт с каждым днём. Пора дать отпор» (начать Войну с Тьмой)',
          '⚔ Война: заключить союз фракций (репутация 25 у всех трёх)',
          '⚔ Война: передать реликвии (10 кристаллов, Сердце Тени, Древний осколок)',
          '⚔ Война: врата пали — штурмуй Цитадель и срази гарнизон!',
        ][war.stage];
        if (warLabel) choices.push({ id: 'war', label: warLabel });
      }
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
        choices.push({ id: 'forge', label: `Улучшить оружие в руках (${costM} металла, ${costC} мон.)` });
      }
      choices.push({ id: 'smithup', label: '⚒ Перековать вещь в высшую редкость…' });
      choices.push({ id: 'smithbrk', label: '🔨 Разобрать вещь на материалы…' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Кузнец ${npc.name}`, [this.npcGreeting(p, npc), ...lines.slice(1)], choices);
    } else if (npc.role === 'priest') {
      const choices = [
        { id: 'healme', label: 'Исцеление (12 мон.)' },
        { id: 'bless', label: 'Благословение: +15% урона на 3 мин (30 мон.)' },
      ];
      if (p.contract)
        choices.push({ id: 'close2', label: `⛧ Контракт «${CONTRACTS[p.contract.type]?.name}» активен: ${Math.ceil(p.contract.t / 60)} мин` });
      else choices.push({ id: 'contracts', label: '⛧ Кровавый контракт: риск за щедрую награду…' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Жрец ${npc.name}`, [this.npcGreeting(p, npc), '«Духи иного мира благосклонны к тебе».'], choices);
    } else if (npc.role === 'innkeeper') {
      const hasMerc = p.mercId && this.entities.has(p.mercId);
      const choices = [
        { id: 'rest', label: 'Отдых: полное восстановление (15 мон.)' },
        ...(hasMerc ? [] : [{ id: 'hire', label: '⚔ Нанять бойца-компаньона (60 мон.)' }]),
        { id: 'stash', label: '📦 Общий сундук отряда' },
        { id: 'rumor', label: STR.rumor },
        { id: 'close', label: STR.bye },
      ];
      this.sendDialog(p, npc.id, `Трактирщик ${npc.name}`, [this.npcGreeting(p, npc), '«Присаживайся! Эль свежий, слухи свежее».'], choices);
    } else if (npc.role === 'hunter') {
      const choices = [];
      const hideQ = p.quests.find(q => q.type === 'supply' && q.item === 'hide' && q.giver === npc.home && !q.done);
      if (hideQ)
        choices.push({ id: 'supply', label: `Отдать шкуры (${Math.min(p.inventory.hide || 0, hideQ.count)}/${hideQ.count})` });
      else if (p.quests.length < 3) choices.push({ id: 'huntquest', label: 'Взять заказ: 3 шкуры' });
      choices.push({ id: 'buyarrows', label: 'Купить стрелы x20 (7 мон.)' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Охотник ${npc.name}`, [this.npcGreeting(p, npc), '«Волки нынче жирные. Шкуры нужны — платим честно».'], choices);
    } else {
      const rumors = this.events.rumors(1);
      const line = rumors.length ? `Говорят, ${lc(rumors[0].text)}…` : 'Тихо у нас, и слава богам.';
      this.sendDialog(p, npc.id, `${npc.name}`, [this.npcGreeting(p, npc), line], [{ id: 'close', label: STR.bye }]);
    }
  }

  // ---------- свой дом: жильё, личный сундук, респаун в кровати ----------
  buyHouse(p, dialogId) {
    const npc = this.entities.get(dialogId);
    const s = npc && this.world.settlements.find(x => x.id === npc.home);
    if (!s || p.home) return;
    if ((p.rep[s.faction] || 0) < 20) { this.toast(p, 'Тебе не доверяют настолько'); return; }
    if (p.coins < 150) { this.toast(p, STR.notEnoughCoins); return; }
    const bed = s.anchors?.beds?.[p.id % Math.max(1, s.anchors.beds.length)];
    if (!bed) { this.toast(p, 'В деревне нет свободных домов — пусть отстроятся'); return; }
    p.coins -= 150;
    p.home = { sid: s.id, x: bed.x, y: bed.y };
    p.homeStash = p.homeStash || {};
    // личный сундук у кровати
    this.chunks.setTile('over', bed.x + 1, bed.y, T.CHEST);
    this.fx({ t: 'tile', mapId: 'over', x: bed.x + 1, y: bed.y, tile: T.CHEST }, null);
    this.fx({ t: 'marker', pid: p.id, x: bed.x, y: bed.y }, null);
    this.addXp(p, 30);
    this.toast(p, `🏠 Дом в ${s.name} твой! Кровать — точка возрождения, рядом личный сундук`);
    this.events.push(this.world.day, `${p.name} купил дом в ${s.name}`);
  }

  isAtHome(p, tx, ty) {
    return p.home && Math.abs(tx - p.home.x) <= 3 && Math.abs(ty - p.home.y) <= 3;
  }

  // ---------- кооп: общий сундук отряда и передача вещей ----------
  openStash(p, box = 'team') {
    const items = box === 'home' ? (p.homeStash || {}) : this.world.stash;
    this.fx({ t: 'stash', pid: p.id, box, items: { ...items } }, null);
  }

  stashOp(p, op, item, box = 'team') {
    if (p.dead || !item) return;
    const stash = box === 'home' ? (p.homeStash = p.homeStash || {}) : this.world.stash;
    if (op === 'put') {
      if ((p.inventory[item] | 0) <= 0) return;
      if (!stash[item] && Object.keys(stash).length >= 40) { this.toast(p, 'Сундук полон'); return; }
      p.inventory[item]--;
      if (p.inventory[item] <= 0) delete p.inventory[item];
      stash[item] = (stash[item] || 0) + 1;
    } else {
      if ((stash[item] | 0) <= 0) return;
      stash[item]--;
      if (stash[item] <= 0) delete stash[item];
      p.inventory[item] = (p.inventory[item] || 0) + 1;
    }
    this.openStash(p, box);
  }

  giveItem(p, item) {
    if (p.dead || (p.inventory[item] | 0) <= 0) return;
    let ally = null, bd = 48 * 48;
    for (const q of this.players.values()) {
      if (q === p || q.dead || q.mapId !== p.mapId) continue;
      const d = dist2(p.x, p.y, q.x, q.y);
      if (d < bd) { bd = d; ally = q; }
    }
    if (!ally) { this.toast(p, 'Рядом нет союзника — подойди ближе'); return; }
    p.inventory[item]--;
    if (p.inventory[item] <= 0) delete p.inventory[item];
    ally.inventory[item] = (ally.inventory[item] || 0) + 1;
    const name = this.itemName(item);
    this.toast(p, `🤝 Передано ${ally.name}: ${name}`);
    this.toast(ally, `🤝 ${p.name} передал тебе: ${name}`);
  }

  // ---------- кузнец-эндгейм: перековка редкости и разборка ----------
  // стоимость перековки: c->r и r->e; кольца/аксессуары платят кристаллами
  smithUpCost(it) {
    const jewelry = it.slot === 'acc' || it.slot === 'ring'; // украшения зачаровываются кристаллами
    if (it.rarity === 'c') return jewelry ? { crystal: 3, coins: 50 } : { metal: 4, coins: 50 };
    return jewelry ? { crystal: 7, coins: 150 } : { metal: 10, crystal: 2, coins: 150 };
  }

  openSmithUpgrade(p, npcId) {
    const list = Object.keys(p.inventory).filter(id => {
      if ((p.inventory[id] | 0) <= 0 || id.startsWith('weapon:')) return false;
      const it = getItem(id);
      return it?.slot && (it.rarity === 'c' || it.rarity === 'r');
    }).slice(0, 7);
    const choices = list.map(id => {
      const it = getItem(id);
      const cost = this.smithUpCost(it);
      const next = it.rarity === 'c' ? 'Редкое' : 'Эпическое';
      const costTxt = [cost.metal && `${cost.metal} мет.`, cost.crystal && `${cost.crystal} крист.`, `${cost.coins} мон.`]
        .filter(Boolean).join(', ');
      return { id: 'smithup:' + id, label: `${it.name} → [${next}] (${costTxt})` };
    });
    if (!choices.length) choices.push({ id: 'close', label: 'В сумке нет вещей под перековку (легендарное и эпическое не куются выше)' });
    else choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, npcId, '⚒ Перековка', ['«Хорошую вещь можно сделать великой. Что несёшь?»'], choices);
  }

  openSmithBreak(p, npcId) {
    const list = Object.keys(p.inventory).filter(id => {
      if ((p.inventory[id] | 0) <= 0 || id.startsWith('weapon:')) return false;
      return !!getItem(id)?.slot;
    }).slice(0, 8);
    const choices = list.map(id => {
      const it = getItem(id);
      const y = it.rarity === 'e' ? '6 мет. + 3 крист.' : it.rarity === 'r' ? '3 мет. + 1 крист.' : '1-2 мет.';
      return { id: 'smithbrk:' + id, label: `${it.name} → ${y}` };
    });
    if (!choices.length) choices.push({ id: 'close', label: 'Нечего разбирать' });
    else choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, npcId, '🔨 Разборка', ['«Что в лом? Верну, что смогу».'], choices);
  }

  smithUpgrade(p, itemId, npcId) {
    const it = getItem(itemId);
    if (!it?.slot || (p.inventory[itemId] | 0) <= 0) return;
    if (it.rarity === 'e' || it.rarity === 'l') return;
    const cost = this.smithUpCost(it);
    if ((p.inventory.metal || 0) < (cost.metal || 0)) { this.toast(p, 'Не хватает металла'); return; }
    if ((p.inventory.crystal || 0) < (cost.crystal || 0)) { this.toast(p, 'Не хватает кристаллов'); return; }
    if (p.coins < cost.coins) { this.toast(p, STR.notEnoughCoins); return; }
    p.inventory.metal = (p.inventory.metal || 0) - (cost.metal || 0);
    p.inventory.crystal = (p.inventory.crystal || 0) - (cost.crystal || 0);
    p.coins -= cost.coins;
    p.inventory[itemId]--;
    if (p.inventory[itemId] <= 0) delete p.inventory[itemId];
    const newId = withRarity(it.baseId, it.rarity === 'c' ? 'r' : 'e');
    p.inventory[newId] = (p.inventory[newId] || 0) + 1;
    this.fx({ t: 'chest', x: p.x, y: p.y }, p.mapId, p.x, p.y);
    this.toast(p, `⚒ Выковано: ${getItem(newId).name}`);
    this.openSmithUpgrade(p, npcId); // остаться в меню
  }

  smithBreak(p, itemId, npcId) {
    const it = getItem(itemId);
    if (!it?.slot || (p.inventory[itemId] | 0) <= 0) return;
    p.inventory[itemId]--;
    if (p.inventory[itemId] <= 0) delete p.inventory[itemId];
    const yields = it.rarity === 'e' ? { metal: 6, crystal: 3 }
      : it.rarity === 'r' ? { metal: 3, crystal: 1 }
      : { metal: 1 + Math.round(this.rand()) };
    for (const [m, n] of Object.entries(yields)) p.inventory[m] = (p.inventory[m] || 0) + n;
    this.fx({ t: 'hit', kind: 'wall', x: p.x, y: p.y }, p.mapId, p.x, p.y);
    this.toast(p, `🔨 Разобрано: ${Object.entries(yields).map(([m, n]) => `${n} ${m === 'metal' ? 'металла' : 'кристаллов'}`).join(', ')}`);
    this.openSmithBreak(p, npcId);
  }

  openCrafting(p) {
    const choices = RECIPES.map(r => ({ id: 'craft:' + r.id, label: r.name }));
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, 'campfire', STR.craft, ['Что будем делать?'], choices);
  }

  // Доска заказов гильдии: три задания на выбор
  openBoard(p, s) {
    if (!s) return;
    if (p.quests.length >= 3) {
      this.sendDialog(p, 'board', '📜 Доска заказов',
        ['Журнал полон (3 задания). Сперва заверши начатое (J — журнал).'], [{ id: 'close', label: STR.close }]);
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
    if (choice.startsWith('story:')) { this.storyChoice(p, choice.slice(6), dialogId); return; }
    if (choice === 'war') { this.warStep(p); return; }
    if (choice === 'war_destroy') { this.warFinale(p, true); return; }
    if (choice === 'war_claim') { this.warFinale(p, false); return; }
    if (choice === 'stash') { this.openStash(p); return; }
    if (choice === 'nohouse') { this.toast(p, '«Чужакам домов не продаём. Заслужи доверие деревни (репутация 20)»'); return; }
    if (choice === 'payoff') {
      const cost = (p.bounty || 0) * 2;
      if (cost <= 0) return;
      if (p.coins < cost) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= cost;
      p.bounty = 0;
      p.bountyWarned = false;
      this.toast(p, '💀→✓ Вира уплачена. Охотники отозваны, но люди помнят…');
      this.events.push(this.world.day, `${p.name} заплатил виру за свои злодеяния`);
      return;
    }
    if (choice === 'contracts') {
      const ch = Object.entries(CONTRACTS).map(([id, c]) =>
        ({ id: 'contract:' + id, label: `⛧ «${c.name}» — ${c.desc} (8 мин, лут +75%, опыт +50%)` }));
      ch.push({ id: 'close', label: 'Не сегодня' });
      this.sendDialog(p, dialogId, '⛧ Кровавый контракт',
        ['«Подпиши кровью — и духи испытают тебя.',
         'Выстоишь — награды будут щедрее. Падёшь — контракт сгорит».'], ch);
      return;
    }
    if (choice.startsWith('contract:')) {
      const type = choice.slice(9);
      if (!CONTRACTS[type] || p.contract) return;
      p.contract = { type, t: CONTRACT_TIME };
      this.fx({ t: 'bloodcast', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, `⛧ Контракт «${CONTRACTS[type].name}» подписан кровью: 8 минут испытания!`);
      this.toastAll(`⛧ ${p.name} подписал кровавый контракт «${CONTRACTS[type].name}»`);
      this.events.push(this.world.day, `${p.name} подписал кровавый контракт`);
      return;
    }
    if (choice === 'ascend_start') { this.startAscension(p, String(dialogId).split(':')[1]); return; }
    if (choice === 'buyhouse') { this.buyHouse(p, dialogId); return; }
    if (choice === 'smithup') { this.openSmithUpgrade(p, dialogId); return; }
    if (choice === 'smithbrk') { this.openSmithBreak(p, dialogId); return; }
    if (choice.startsWith('smithup:')) { this.smithUpgrade(p, choice.slice(8), dialogId); return; }
    if (choice.startsWith('smithbrk:')) { this.smithBreak(p, choice.slice(9), dialogId); return; }
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
      if (p.hintStage === 4) { p.hintStage = 5; this.toast(p, '🎓 Азы освоены — Пограничье твоё! (M — карта, P — дипломатия)'); }
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
      const q = s && p.quests.find(x => x.type === 'supply' && x.giver === s.id && !x.done);
      if (!s || !q) return;
      const have = p.inventory[q.item] || 0;
      const give = Math.min(have, q.count - (q.given || 0));
      if (give <= 0) { this.toast(p, 'Нечего отдать — принеси ' + (ITEM_NAMES[q.item] || q.item)); return; }
      p.inventory[q.item] -= give;
      q.given = (q.given || 0) + give;
      if (q.item === 'meat' || q.item === 'bread') s.food = Math.min(140, s.food + give * 6);
      else s.prosperity = Math.min(100, s.prosperity + give * 2);
      if (q.given >= q.count) { q.done = true; this.turnInQuest(p, s.id); }
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
      if (!q) return;
      if (this.addQuest(p, q)) p.pendingBoard = null;
      return;
    }
    if (choice === 'huntquest') {
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!s) return;
      this.addQuest(p, {
        type: 'supply', item: 'hide', count: 3, given: 0, giver: s.id, done: false,
        title: `Принести 3 шкуры охотнику ${s.name}`, tx: s.x, ty: s.y,
        reward: { coins: 25, rep: 8, xp: 30 },
      });
      return;
    }
    if (choice === 'buyarrows') {
      if (p.coins < 7) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= 7;
      p.ammo.arrow = (p.ammo.arrow || 0) + 20;
      this.toast(p, STR.pickup(ITEM_NAMES.ammo_arrow));
      return;
    }
    if (choice === 'quest') { this.giveQuest(p, dialogId); if (p.hintStage === 1) p.hintStage = 2; return; }
    if (choice === 'turnin') { this.turnInQuest(p, this.entities.get(dialogId)?.home || null); return; }
    if (choice === 'rumor') {
      const rumors = this.events.rumors(3);
      const lines = rumors.length ? rumors.map(r => `День ${r.day}: ${r.text}`) : ['Пока всё спокойно.'];
      // маркеры на карту
      for (const r of rumors) if (r.x) this.fx({ t: 'marker', pid: p.id, x: r.x, y: r.y, text: r.text }, null);
      this.sendDialog(p, dialogId, 'Старейшина', lines, [{ id: 'close', label: STR.close }]);
    }
  }

  // журнал заданий: до 3 активных одновременно
  addQuest(p, quest, extraToast = '') {
    if (p.quests.length >= 3) {
      this.toast(p, '📖 Журнал полон (3 задания). Заверши что-нибудь (J — журнал)');
      return false;
    }
    p.quests.push(quest);
    this.toast(p, STR.questNew(quest.title) + extraToast);
    if (p.hintStage === 1) p.hintStage = 2;
    return true;
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
      this.addQuest(p, {
        type: 'supply', item: 'meat', count: 6, given: 0, giver: s.id, done: false,
        title: `Принести 6 сырого мяса в ${s.name}`, tx: s.x, ty: s.y,
        reward: { coins: 30, rep: 15, xp: 35 },
      });
      return;
    }
    // караван этой деревни в пути — предложи сопровождение
    const caravan = this.abstract.tokens.find(t =>
      t.type === 'caravan' && !t.dead && t.from === s.id && t.cargo);
    if (caravan && roll < 0.5) {
      const to = this.world.settlements.find(x => x.id === caravan.target);
      this.addQuest(p, {
        type: 'escort', token: caravan.id, giver: s.id, done: false,
        title: `Сопроводить караван в ${to?.name || '…'}`,
        tx: to?.x, ty: to?.y,
        reward: { coins: 45, rep: 12, xp: 40 },
      }, ' (держись рядом с караваном!)');
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
    this.addQuest(p, quest);
  }

  completeQuestObjective(p, q) {
    const quest = q || p.quests.find(x => !x.done);
    if (!quest || quest.done) return;
    quest.done = true;
    this.toast(p, `${quest.title} — выполнено! Вернись за наградой.`);
  }

  // сдать все выполненные задания (гиверу — только его, без гивера — любые)
  turnInQuest(p, giverSid = null) {
    const done = p.quests.filter(q => q.done && (!giverSid || q.giver === giverSid));
    if (!done.length) return;
    for (const q of done) {
      p.coins += q.reward.coins;
      if (q.reward.xp) this.addXp(p, q.reward.xp);
      const s = this.world.settlements.find(x => x.id === q.giver);
      if (s) {
        p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + q.reward.rep);
        this.toast(p, STR.repUp(FACTIONS[s.faction]?.name || s.faction));
        this.events.push(this.world.day, `${p.name} помог ${s.name}: ${lc(q.title)}`);
      }
      this.toast(p, STR.questDone(q.title) + ` (+${q.reward.coins} мон.)`);
    }
    p.quests = p.quests.filter(q => !done.includes(q));
  }

  // доставка: пришёл к старейшине цели
  checkDeliver(p, npc) {
    for (const q of p.quests)
      if (q.type === 'deliver' && !q.done && npc.home === q.to) this.completeQuestObjective(p, q);
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
      // Чародейская кровь: зелья на 50% сильнее
      const alch = this.hasTalent(p, 'alchemy') ? 1.5 : 1;
      if (u.heal) p.hp = Math.min(p.maxHp, p.hp + Math.round(u.heal * alch));
      if (u.mana) p.mana = Math.min(p.manaMax, p.mana + Math.round(u.mana * alch));
      if (u.buff) {
        p.buffs[u.buff] = { mult: u.mult * alch, t: Math.round(u.time * alch) };
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
