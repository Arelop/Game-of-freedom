// Авторитетная симуляция: игроки, враги, NPC, пули, данжи, квесты, голод.
import {
  TICK_DT, TILE, SOLID, BULLET_SOLID, T, PLAYER_MAX_HP, PLAYER_HURT_INVULN,
  HUNGER_MAX, HUNGER_RATE, DAY_LENGTH, PLAYER_RADIUS, DESTRUCTIBLE, PROP_TILES, seasonOf,
  WORLD_TILES,
} from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { ENEMIES, tierTouchBonus, tierProjDmg, enemiesOfTier, ASH_KINDS } from '../shared/enemies.js';
import { PATTERNS, emitDirections } from '../shared/patterns.js';
import {
  makePlayerState, stepPlayer, stepProjectile, hasIFrames, circlesOverlap, dist2,
  moveWithCollision,
} from '../shared/simCore.js';
import { mulberry32, hash2, randInt, pick } from '../shared/rng.js';
import { makeWorld, baseTile } from './world/worldgen.js';
import { findBuildSite } from './world/structures.js';
import { ChunkStore } from './world/chunks.js';
import { generateDungeon, roomAt, generateArena } from './world/dungeon.js';
import { generateAshlands } from './world/ashlands.js';
import { SETS, SET_PIECES } from '../shared/sets.js';
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
import { TALENTS, findTalent, canLearn, ultOf } from '../shared/talents.js';
import { getWeapon, getItem, splitId, rollRarity, withRarity, sellPriceR } from '../shared/rarity.js';
import { abilitiesOf, abilityById, defaultLoadout } from '../shared/abilities.js';

const NPC_NAMES = [
  'Радомир', 'Всеслав', 'Милана', 'Ярина', 'Добрыня', 'Горазд', 'Любава',
  'Светозар', 'Мстислав', 'Забава', 'Тихомир', 'Велеслава', 'Богдан',
  'Дарёна', 'Огнеслав', 'Рогнеда', 'Путята', 'Умила', 'Ратибор', 'Злата',
];

// лица народов: у каждой фракции свои спрайты жителей, стражи и торговцев
const FACTION_KINDS = {
  severane: { villager: 'npc_villager_sev', guard: 'npc_guard_sev', merchant: 'npc_merchant_sev' },
  ozerny: { villager: 'npc_villager_oz', guard: 'npc_guard_oz', merchant: 'npc_merchant_oz' },
  stepnyaki: { villager: 'npc_villager_step', guard: 'npc_guard_step', merchant: 'npc_merchant_step' },
};

// звери степной охоты: за них Степняки уважают (каждый четвёртый — +1 реп)
const BEAST_KINDS = new Set(['wolf', 'bear', 'boar', 'spider', 'warg', 'slime']);

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

// Ядро прилавка — есть у всех народов; остальное зависит от фракции.
const SHOP = [
  { item: 'bread', price: 8 }, { item: 'bandage', price: 15 }, { item: 'wood', price: 6 },
  { item: 'heal_potion', price: 30 }, { item: 'mana_potion', price: 28 },
  { item: 'ammo_arrow', price: 10, count: 20 }, { item: 'ammo_bolt', price: 15, count: 8 },
  { item: 'ammo_knife', price: 14, count: 8 }, { item: 'ammo_bomb', price: 20, count: 3 },
  { item: 'padded_armor', price: 25 }, { item: 'leather_boots', price: 30 },
  { item: 'metal', price: 14 },
];
// Товары народов: у Северян — сталь и мех, у Озёрных — травы и чары,
// у Степняков — луки и кожа. Цены на «своё» ниже базарных.
const FACTION_GOODS = {
  severane: [
    { item: 'meat', price: 9 }, { item: 'hide', price: 12 },
    { item: 'weapon:axe', price: 80 }, { item: 'weapon:warhammer', price: 125 },
    { item: 'weapon:greatsword', price: 140 }, { item: 'weapon:mace', price: 70 },
    { item: 'iron_helmet', price: 58 }, { item: 'iron_greaves', price: 64 },
    { item: 'iron_ring', price: 45 }, { item: 'ring_str', price: 65 },
  ],
  ozerny: [
    { item: 'herb', price: 5 }, { item: 'swift_potion', price: 33 },
    { item: 'weapon:froststaff', price: 105 }, { item: 'weapon:firestaff', price: 100 },
    { item: 'wizard_hat', price: 82 }, { item: 'crystal_orb', price: 115 },
    { item: 'flame_tome', price: 135 }, { item: 'lucky_deck', price: 110 },
    { item: 'wood_shield', price: 25 },
  ],
  stepnyaki: [
    { item: 'meat', price: 8 }, { item: 'ammo_arrow', price: 8, count: 20 },
    { item: 'weapon:huntbow', price: 75 }, { item: 'weapon:spear', price: 48 },
    { item: 'weapon:bombs', price: 130 }, { item: 'weapon:halberd', price: 115 },
    { item: 'leather_armor', price: 34 }, { item: 'wolf_amulet', price: 50 },
    { item: 'fire_arrows', price: 22 }, { item: 'throwing_net', price: 85 },
  ],
};
// Верность народу (репутация 40+) открывает эксклюзивное оружие
const FACTION_EXCLUSIVE = {
  severane: { item: 'weapon:sever_axe', price: 240 },
  ozerny: { item: 'weapon:mist_staff', price: 240 },
  stepnyaki: { item: 'weapon:steppe_bow', price: 240 },
};

const MAX_WEAPON_SLOTS = 4;
const SCHOOL_NAMES = { melee: 'ближний бой', ranged: 'дальний бой', magic: 'магия' };

// какое оружие использует данный тип боеприпасов (для подсказок в магазине)
function ammoUsers(type) {
  return Object.values(WEAPONS).filter(w => w.ammoType === type).map(w => w.name).join('/');
}

// Плавающие цены: дефицит в деревне делает товар дороже, избыток — дешевле.
// зачарователь куёт реликвии по слоту исходника
const RELIC_BY_SLOT = {
  chest: ['thorn_armor'], legs: ['wind_legs'],
  ring: ['rime_ring', 'blood_ring'], acc: ['storm_amulet', 'phoenix_amulet'],
};

// прилавок огнеходцев: снаряжение для жизни среди лавы (цены суровые — доставка!)
const ASH_SHOP = [
  { item: 'heal_potion', price: 40 }, { item: 'mana_potion', price: 36 },
  { item: 'bread', price: 14 }, { item: 'bandage', price: 22 },
  { item: 'ash_helm', price: 140 }, { item: 'ash_legs', price: 130 },
  { item: 'weapon:obsidianblade', price: 220 }, { item: 'weapon:ashstaff', price: 210 },
  { item: 'ammo_arrow', price: 16, count: 20 }, { item: 'ammo_bolt', price: 22, count: 8 },
];

// прилавок гоблина-барыги в подземельях: втридорога, зато под рукой
const DG_SHOP = [
  { item: 'heal_potion', price: 55 }, { item: 'mana_potion', price: 50 },
  { item: 'bread', price: 16 }, { item: 'bandage', price: 30 },
  { item: 'swift_potion', price: 60 },
  { item: 'ammo_arrow', price: 18, count: 20 }, { item: 'ammo_bolt', price: 26, count: 8 },
  { item: 'ammo_knife', price: 24, count: 8 },
];

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
    this.tempTiles = [];         // временные тайлы (ледяные стены): тают сами
    this.zones = [];             // живые зоны: дым, огненный смерч
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
    // огненная бочка: взрыв жжёт всех вокруг и детонирует соседние бочки
    if (tile === T.BARREL_FIRE)
      this.explodeAt(mapId, tx * TILE + 8, ty * TILE + 8, 3, 40, attacker?.id, 6);
    // треснувшая стена рухнула — тайник открыт
    if (tile === T.CRACKED_WALL) {
      const inst = this.dungeons.get(mapId);
      if (inst?.dungeon.secret) this.toastMap(mapId, '✨ Стена рухнула — за ней тайник!');
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
      rage: 0,                    // ЯРОСТЬ воина: растёт в бою, сжигается способностями
      combo: 0, comboT: 0,        // КОМБО вора: серия попаданий усиливает приёмы
      grace: 0,                   // БЛАГОДАТЬ жреца: лечение заряжает кару
      abCd: [0, 0, 0, 0], invisT: 0, offCd: 0, shieldHp: 0, shieldT: 0, // [3] — ульта (F)
      abilities: defaultLoadout(cls), // раскладка Q/X/R — настраивается в Книге способностей (K)
      coins: 20, hunger: HUNGER_MAX,
      rep: makeReputation(), aggroFactions: new Set(),
      dead: false, downT: 0,
      quests: [], // журнал: до 3 активных заданий
      // сюжетные цепочки именных NPC: стадии, счётчики, осколки
      story: {
        rado: 0, capt: 0, mira: 0, bandits: 0, banditsGoal: 0, shards: [], captCamp: null,
        smith: 0, widow: 0, well: 0, // цепочки: Творимир, Милица, Голос из колодца
        plague: 0, car: 0, bog: 0,   // цепочки дальних деревень: Хворь, Караванщик, Голос болот
        mq: 0, mqS: 0,               // кампания «Тень над Пограничьем»: глава и подэтап
      },
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

  // БЛАГОДАТЬ жреца: каждое настоящее лечение союзника заряжает кару
  gainGrace(p) {
    if (p.cls !== 'priest') return;
    if ((p.grace || 0) >= 3) return;
    p.grace = (p.grace || 0) + 1;
  }

  // сидит ли герой у огня (3×3 тайла вокруг) — тепло ускоряет медитацию
  nearCampfire(p) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (this.chunks.tileAt(p.mapId, tx + dx, ty + dy) === T.CAMPFIRE) return true;
    return false;
  }

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
    // дар запечатанного колодца: +1 ИНТ и +1 УДЧ навсегда
    if (p.story?.wellBlessed) { eff.int = (eff.int || 0) + 1; eff.lck = (eff.lck || 0) + 1; }
    // кровавый пакт с Голосом болот: сила за плоть (обсчёт ниже — сердца и урон)
    p.effStats = eff;
    const sb = statBonuses(eff);
    const d = {
      dmgMelee: 1 + sb.dmgMelee, dmgRanged: 1 + sb.dmgRanged, dmgMagic: 1 + sb.dmgMagic,
      critChance: 0.03, critMult: 2, coinMult: 1 + sb.coinMult,
      atkSpeed: 1 + sb.atkSpeed, dodge: sb.dodge, manaRegen: sb.manaRegen,
      dropBonus: sb.dropBonus,
      arcBonus: 0, magicProj: 0, knifeProj: 0,
    };
    let maxHp = PLAYER_MAX_HP + (C.maxHpBonus || 0) + sb.maxHp + (p.ascended ? 6 : 0);
    let speed = 1 + (C.speedBonus || 0) + (p.ascended ? 0.08 : 0);
    let gearDmg = 1;
    let rollCd = 1;

    let manaBonus = 0;
    p.setCounts = {}; p.setFlags = {}; p.procs = {};
    for (const slot of GEAR_SLOTS) {
      const it = getItem(p.equipment[slot]);
      if (!it) continue;
      if (it.set) p.setCounts[it.set] = (p.setCounts[it.set] || 0) + 1;
      if (it.proc) p.procs[it.proc.type] = it.proc;
      if (!it.stats) continue;
      maxHp += it.stats.maxHp || 0;
      speed += it.stats.speed || 0;
      gearDmg += it.stats.damage || 0;
      rollCd -= it.stats.rollCd || 0;
      d.dodge += it.stats.dodge || 0;
      d.manaRegen += it.stats.manaRegen || 0;
      d.coinMult += it.stats.coinMult || 0;
    }
    // сетовые бонусы: 2 и 4 части комплекта
    for (const [sid, n] of Object.entries(p.setCounts)) {
      for (const [need, b] of Object.entries(SETS[sid]?.bonuses || {})) {
        if (n < +need) continue;
        if (b.flag) p.setFlags[b.flag] = true;
        if (!b.stats) continue;
        maxHp += b.stats.maxHp || 0;
        speed += b.stats.speed || 0;
        manaBonus += b.stats.mana || 0;
        d.dodge += b.stats.dodge || 0;
        d.manaRegen += b.stats.manaRegen || 0;
      }
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

    // кровавый пакт с Голосом болот: −1 сердце навсегда, +10% всего урона
    if (p.story?.bogPact) { maxHp = Math.max(4, maxHp - 2); gearDmg *= 1.1; }
    if (p.story?.mqDark) gearDmg *= 1.05; // сила Угля Первой Тьмы — навсегда

    // амулеты с общим уроном (медвежий) усиливают все школы
    d.dmgMelee *= gearDmg; d.dmgRanged *= gearDmg; d.dmgMagic *= gearDmg;

    p.derived = d;
    p.maxHp = maxHp;
    p.hp = Math.min(p.hp, maxHp);
    p.speedMult = Math.max(0.4, speed);
    p.rollCdMult = Math.max(0.2, rollCd);
    // запас маны: база класса + 4 за очко интеллекта (+20 богу, + сетовые бонусы)
    p.manaMax = (C.manaBase || 20) + (eff.int || 0) * 4 + (p.ascended ? 20 : 0) + manaBonus;
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
    if ((p.stepBonusT || 0) > 0) { mult *= 1.5; p.stepBonusT = 0; } // Шаг сквозь тень
    if ((p.rageUltT || 0) > 0 && w.school === 'melee') mult *= 1.4; // «Кровавая жатва»
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
    this.fx({ t: 'loot', pid: p.id, x: p.x, y: p.y, text: `надето: ${it.name}` }, p.mapId, p.x, p.y);
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
      this.rollDaily();
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
    this.hydratePois();
    this.stepEntities(dt);
    this.separateEntities();
    this.stepProjectiles(dt);
    this.abstract.update(dt);
    this.civ.update(dt);
    this.checkDungeonRooms();
    this.stepMplus();
    this.stepStructures(dt);
    this.checkAscensions();
    // метеоры мага: телеграф догорел — удар с неба
    if (this.meteors?.length) {
      for (const m of this.meteors) {
        m.t -= dt;
        if (m.t <= 0) {
          this.explodeAt(m.mapId, m.x, m.y, m.dmg, 44, m.owner, 2);
          this.fx({ t: 'boom', x: m.x, y: m.y, r: 44 }, m.mapId, m.x, m.y);
        }
      }
      this.meteors = this.meteors.filter(m => m.t > 0);
    }
    this.checkArena();
    this.stepAsh();
  }

  isNight() { return this.world.time < 0.22 || this.world.time > 0.85; }

  // ---------- мировые события ----------
  rollWorldEvent(force) {
    if (!force && (!this.players.size || this.world.event)) return; // пустой сервер / событие уже идёт
    const pool = ['bloodMoon', 'rift', 'meteor', 'trader', 'hunt'];
    if (this.world.citadel?.owned) pool.push('cult', 'cult'); // узурпатору мстит культ
    const type = force || pick(this.rand, pool);
    const alive = this.world.settlements.filter(s => !s.ruined && !s.captured);
    switch (type) {
      case 'bloodMoon': {
        this.world.event = { type, t: 100 };
        this.toastAll('🌕 КРОВАВАЯ ЛУНА! Твари свирепеют — элита повсюду (100 с)', true);
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
        this.toastAll(`⛧ РАЗЛОМ: демоны иного мира идут на ${s.name}!`, true);
        this.events.push(this.world.day, `Разлом открылся у ${s.name} — демоны рвутся в мир`, { x: s.x, y: s.y });
        break;
      }
      case 'meteor': { // метеорит: кристаллы под охраной големов
        const mx = 60 + Math.floor(this.rand() * (WORLD_TILES - 120)), my = 60 + Math.floor(this.rand() * (WORLD_TILES - 120));
        for (let i = 0; i < 6; i++)
          this.spawnDrop('crystal', 1, 'over', mx * TILE + (this.rand() - 0.5) * 50, my * TILE + (this.rand() - 0.5) * 50, 600);
        for (let i = 0; i < 2; i++)
          this.spawnEnemy('golem', 'over', mx * TILE + (this.rand() - 0.5) * 60, my * TILE + (this.rand() - 0.5) * 60, { forceElite: true });
        for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: mx, y: my }, null);
        this.toastAll('☄ Метеорит упал в глуши! Кристаллы ждут смельчаков (метка на карте)', true);
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
        this.toastAll(`🧳 Странствующий торговец заглянул в ${s.name} (на ~3 мин)`); // мирная весть — только летопись
        break;
      }
      case 'hunt': { // странствующий именной зверь — трофей для смельчаков
        const NAMES_H = ['Кровавый Клык', 'Старый Хрыч', 'Гроза Дорог', 'Косматый Ужас', 'Одноглазый'];
        const KINDS_H = ['bear', 'orcWarlord', 'ogre', 'ironTroll', 'minotaur']; // боссы в логовах — охота на элитных зверей
        const i = Math.floor(this.rand() * NAMES_H.length);
        const hx = 60 + Math.floor(this.rand() * (WORLD_TILES - 120)), hy = 60 + Math.floor(this.rand() * (WORLD_TILES - 120));
        this.abstract.tokens.push({
          id: 'tok' + this.abstract.nextId++, type: 'pack', name: NAMES_H[i],
          faction: 'monsters', units: [KINDS_H[i]], hunt: NAMES_H[i],
          x: hx * TILE, y: hy * TILE, hydrated: null,
        });
        for (const q of this.players.values()) this.fx({ t: 'marker', pid: q.id, x: hx, y: hy }, null);
        this.toastAll(`🎯 ОХОТА: в глуши замечен «${NAMES_H[i]}» — награда тому, кто добудет трофей!`, true);
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
        this.toastAll(`⛧ Культ Тьмы восстал против узурпатора — идут на ${s.name}!`, true);
        this.events.push(this.world.day, `Культ Тьмы объявился у ${s.name}`, { x: s.x, y: s.y });
        break;
      }
    }
  }

  // ---------- задание дня: одна цель на всех, награда каждому раз в день ----------
  rollDaily() {
    const HUNTS = [
      ['goblin', 'гоблинов'], ['wolf', 'волков'], ['bandit', 'бандитов'],
      ['skeleton', 'скелетов'], ['slime', 'слизней'], ['ghoul', 'упырей'],
    ];
    const GATHERS = [['wood', 'древесины'], ['herb', 'трав'], ['meat', 'сырого мяса'], ['metal', 'металла']];
    if (this.rand() < 0.5) {
      const [kind, name] = pick(this.rand, HUNTS);
      this.world.daily = { day: this.world.day, type: 'hunt', kind, count: 8, name: `истребить 8 ${name}`, reward: { coins: 45, xp: 60, rep: 8 } };
    } else {
      const [res, name] = pick(this.rand, GATHERS);
      this.world.daily = { day: this.world.day, type: 'gather', res, count: 6, name: `принести 6 ${name}`, reward: { coins: 35, xp: 45, rep: 8 } };
    }
    if (this.players.size) this.toastAll(`📋 Задание дня: ${this.world.daily.name} (сдать старейшине)`);
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

    // с первой минуты игрока ведёт кампания (после восстановления сейва)
    if (!p.mqWelcomed) {
      p.mqWelcomed = true;
      if (p.story.mq === 0) {
        const s0 = this.world.settlements[0];
        if (s0) this.fx({ t: 'marker', pid: p.id, x: s0.x, y: s0.y, text: 'Ярослава' }, null);
        this.toast(p, '📜 Капитан Ярослава ищет тебя — с южных дорог тревожные вести (E — говорить)');
      }
    }

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

    // Реген маны: в бою — тонкая струйка; на отдыхе (5 с без каста) «медитация»
    // разгоняет реген постепенно до ×4 за ~11 секунд; у костра — ещё в полтора раза щедрее
    p.combatT += dt;
    let regen = 0.07 + 0.04 * (p.derived?.manaRegen || 0);
    if (p.combatT > 5) regen *= 1 + Math.min(3, (p.combatT - 5) / 2);
    if (this.nearCampfire(p)) regen *= 1.5;
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
    if (p.abCd) for (let i = 0; i < 4; i++) p.abCd[i] = Math.max(0, (p.abCd[i] || 0) - dt);
    p.offCd = Math.max(0, (p.offCd || 0) - dt);
    // ---- реликвии-проки ----
    p.blT = Math.max(0, (p.blT || 0) - dt); // заряды «Жажды крови» тают
    p.stepBonusT = Math.max(0, (p.stepBonusT || 0) - dt); // бонус Шага сквозь тень
    p.frostArmorT = Math.max(0, (p.frostArmorT || 0) - dt); // ледяная броня мага
    p.poisonBladeT = Math.max(0, (p.poisonBladeT || 0) - dt); // яд на клинках вора
    p.rageUltT = Math.max(0, (p.rageUltT || 0) - dt); // «Кровавая жатва»
    p.goldUltT = Math.max(0, (p.goldUltT || 0) - dt); // «Дым и золото»
    // «Сияние» жреца: святой свет жжёт врагов рядом раз в секунду
    if ((p.radianceT || 0) > 0) {
      p.radianceT -= dt;
      p.radAcc = (p.radAcc || 0) + dt;
      if (p.radAcc >= 1) {
        p.radAcc -= 1;
        for (const e of [...this.entities.values()]) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 60 * 60) continue;
          this.damageEnemy(e, 1, { owner: p.id, school: 'magic', isDot: true, vx: 0, vy: 0, knockback: 0 });
        }
        this.fx({ t: 'barrier', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      }
    }
    // классовые ресурсы: ярость остывает вне боя, комбо рвётся от простоя
    if (p.cls === 'warrior' && p.combatT > 3 && p.rage > 0)
      p.rage = Math.max(0, p.rage - 5 * dt);
    if (p.cls === 'rogue' && p.combo > 0) {
      p.comboT -= dt;
      if (p.comboT <= 0) p.combo = 0;
    }
    // «Гнев небес»: в бою молния сама находит ближайшего врага
    if (p.procs?.smite && p.combatT < 5) {
      p.smiteT = (p.smiteT ?? 0) - dt;
      if (p.smiteT <= 0) {
        let best = null, bd = 130 * 130;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          const d2 = dist2(p.x, p.y, e.x, e.y);
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (best) {
          p.smiteT = p.procs.smite.cd;
          this.damageEnemy(best, p.procs.smite.dmg, { vx: 0, vy: 0, knockback: 20, owner: p.id, school: 'magic' });
          this.fx({ t: 'chain', pts: [[p.x, p.y - 12], [best.x, best.y]] }, p.mapId, p.x, p.y);
        }
      }
    }
    // кампания гл.3: улика у отравленного родника
    if (this.tick % 15 === 0 && p.mapId === 'over' && p.story.mq === 3 && p.story.mqS === 1 && this.world.mq.taint) {
      const t = this.world.mq.taint;
      if (dist2(p.x, p.y, t.x * TILE, t.y * TILE) < 45 * 45) {
        p.story.mqS = 2;
        this.toast(p, '📜 У воды — мешочек гнили. На шнурке выцарапан ЗНАК ЖРЕЦА деревни…');
        const s4 = this.world.settlements[4];
        if (s4) this.fx({ t: 'marker', pid: p.id, x: s4.x, y: s4.y }, null);
      }
    }
    // «Пропавший караванщик»: сюжет ведёт по следам
    if (this.tick % 15 === 0 && p.mapId === 'over' && (p.story.car === 1 || p.story.car === 2)) {
      const sites = this.carSites();
      if (sites) {
        const near = pt => {
          const dx = p.x / TILE - pt.x, dy = p.y / TILE - pt.y;
          return dx * dx + dy * dy < 25;
        };
        if (p.story.car === 1 && near(sites.crash)) {
          p.story.car = 2;
          this.fx({ t: 'marker', pid: p.id, x: sites.trail.x, y: sites.trail.y }, null);
          this.toast(p, '🐎 Разбитые повозки, стрелы в бортах… Следы волочения уходят дальше — метка на карте');
        } else if (p.story.car === 2 && near(sites.trail) && !this.carResolved) {
          this.carResolved = true;
          const tx = sites.trail.x * TILE, ty = sites.trail.y * TILE;
          if (sites.alive) { // Милош жив — в плену у бандитов
            const mid = this.spawnNpc('lostman', null, 'over', tx, ty, { kind: 'npc_villager' });
            const man = this.entities.get(mid);
            if (man) { man.name = 'Милош'; man.hp = man.maxHp = 12; }
            for (let i = 0; i < 3; i++)
              this.spawnEnemy('bandit', 'over', tx + Math.cos(i * 2.1) * 40, ty + Math.sin(i * 2.1) * 40, { noElite: true });
            this.toast(p, '⛓ В овраге — связанный человек под охраной! Это Милош!');
          } else { // погиб: осталось лишь кольцо
            this.spawnDrop('wedding_ring', 1, 'over', tx, ty, 600);
            this.toast(p, '🕯 Тело истерзано зверями. На пальце блестит обручальное кольцо…');
          }
        }
      }
    }
    // «Пропавший караванщик»: довёл Милоша до дома
    if (p.story.car === 4 && this.tick % 15 === 0) {
      const man = [...this.entities.values()].find(e => e.role === 'lostman' && e.owner === p.id);
      const s3 = this.world.settlements[3];
      if (!man) { // погиб в пути — след придётся взять заново
        p.story.car = 2;
        this.carResolved = false;
        this.toast(p, '🕯 Милош погиб в дороге… Весняна не должна узнать об этом ТАК. Вернись к оврагу');
      } else if (dist2(man.x, man.y, p.x, p.y) > 250 * 250) {
        man.x = p.x + 12; man.y = p.y + 6; // сильно отстал — догоняет бегом
      } else if (s3 && dist2(man.x, man.y, s3.x * TILE, s3.y * TILE) < 90 * 90) {
        this.entities.delete(man.id);
        this.fx({ t: 'heal', pid: p.id, x: man.x, y: man.y }, 'over', man.x, man.y);
        p.story.car = 10;
        p.coins += 120;
        p.inventory['rune_amulet@e'] = (p.inventory['rune_amulet@e'] || 0) + 1;
        this.addXp(p, 90);
        p.rep[s3.faction] = Math.min(100, (p.rep[s3.faction] || 0) + 15);
        this.toast(p, '🐎 Милош дома! Весняна: «Рунный амулет деда — теперь твой» (+120 мон., +15 репутации)');
        this.toastAll(`🐎 ${p.name} вернул Весняне пропавшего мужа!`);
        this.events.push(this.world.day, `${p.name} спас караванщика Милоша из плена`);
      }
    }
    // паломничество: дошёл до святыни — поклонился
    if (this.tick % 30 === 0 && p.mapId === 'over') {
      for (const q of p.quests) {
        if (q.type !== 'visit' || q.done) continue;
        const dx = p.x / TILE - q.tx, dy = p.y / TILE - q.ty;
        if (dx * dx + dy * dy < 16) this.completeQuestObjective(p, q);
      }
    }
    // Аура света: жрец лечит союзников одним присутствием
    if (this.hasTalent(p, 'aura')) {
      p.auraT = (p.auraT ?? 6) - dt;
      if (p.auraT <= 0) {
        p.auraT = 6;
        for (const q of this.players.values()) {
          if (q === p || q.dead || q.mapId !== p.mapId || q.hp >= q.maxHp) continue;
          if (dist2(p.x, p.y, q.x, q.y) < 70 * 70) {
            q.hp = Math.min(q.maxHp, q.hp + 1);
            this.fx({ t: 'heal', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
            this.gainGrace(p);
          }
        }
      }
    }
    // перекат-реликвии: срабатывают в момент кувырка
    if (p.rollT > 0 && !p.rolledProc) {
      p.rolledProc = true;
      if (p.procs?.frostroll) { // «Кольцо инея»: нова стужи
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) < 50 * 50) { e.slowT = 1.6; e.slowMult = 0.5; e.chillT = Math.max(e.chillT || 0, 1.6); }
        }
        this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
      }
      if (p.procs?.windrush) { // «Сапоги ветра»: рывок скорости
        p.buffs.speed = { mult: 0.35, t: 2 };
        this.recomputeStats(p);
      }
    } else if (p.rollT <= 0) p.rolledProc = false;
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
      const tHere = this.chunks.tileAt(p.mapId, ttx, tty);
      // лава Выжженных земель: жжёт стоящего, перекат проносит невредимым
      if (tHere === T.LAVA && (p.lavaT || 0) <= this.tick) {
        p.lavaT = this.tick + 24; // ожог раз в 0.8 с
        this.damagePlayer(p, p.setFlags?.set_ashwalk ? 1 : 2, null);
        this.fx({ t: 'hit', kind: 'wall', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        if (!p.lavaHinted) { p.lavaHinted = true; this.toast(p, '🔥 ЛАВА! Перекатом можно проскочить реку огня'); }
      }
      if (tHere === T.TRAP) {
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
    // стихийный заряд («Раскалённый клинок», «Освящение клинка»): тратится ударом
    let imbue = null;
    if (p.imbue?.n > 0) {
      imbue = p.imbue;
      if (--p.imbue.n <= 0) { delete p.imbue; this.toast(p, 'Заряд оружия иссяк'); }
      atk.dmg += imbue.dmg;
      if (imbue.kind === 'holy' && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      }
    }
    const hitFake = { vx: Math.cos(aim), vy: Math.sin(aim), knockback: w.knockback, owner: p.id, school: 'melee', crit: atk.crit,
      chill: w.chill, fire: w.fire || imbue?.kind === 'fire', poison: w.poison, slow: w.slow, // стихии клинка
      ignite: imbue?.kind === 'fire' ? { time: 2, dmg: 1 } : undefined };
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
    // удар по постройкам: дерево рубится, стены крошатся (по structDmg оружия);
    // реквизит данжей (бочки, ящики) бьётся любым оружием
    for (const dd of [12, 22]) {
      const tx = Math.floor((p.x + Math.cos(aim) * dd) / TILE);
      const ty = Math.floor((p.y + Math.sin(aim) * dd) / TILE);
      const tile = this.chunks.tileAt(p.mapId, tx, ty);
      if (!DESTRUCTIBLE[tile]) continue;
      const structDmg = PROP_TILES.has(tile)
        ? Math.max(w.structDmg || 0, Math.round(atk.dmg))
        : Math.round((w.structDmg || 0) * (p.derived?.dmgMelee || 1));
      if (structDmg > 0) this.damageTile(p.mapId, tx, ty, structDmg, p);
      break;
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
    // стихийный заряд («Раскалённый клинок»/«Освящение клинка»): тратится выстрелом
    let imbue = null;
    if (p.imbue?.n > 0) {
      imbue = p.imbue;
      if (--p.imbue.n <= 0) { delete p.imbue; this.toast(p, 'Заряд оружия иссяк'); }
      dmg += imbue.dmg;
      if (imbue.kind === 'holy' && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
    }
    for (let i = 0; i < count; i++) {
      const extraSpread = count > (w.projectilesPerShot || 1) ? Math.max(w.spreadDeg, 10) : w.spreadDeg;
      const spread = (rand() - 0.5) * extraSpread * Math.PI / 180;
      const a = aim + spread;
      this.projectiles.push({
        x: p.x, y: p.y - 4, vx: Math.cos(a) * w.projectileSpeed, vy: Math.sin(a) * w.projectileSpeed,
        life: w.projLife, radius: w.projRadius, dmg, crit: atk.crit,
        knockback: w.knockback, slow, school: w.school,
        explode: w.explode, chain: w.chain, structDmg, fiery,
        holy: (w.holy ? w.holy + (this.hasTalent(p, 'lightheal') ? 1 : 0) : 0) + (imbue?.kind === 'holy' ? 1 : 0),
        chill: w.chill, fire: w.fire || imbue?.kind === 'fire', poison: w.poison, // стихии для реакций
        ignite: imbue?.kind === 'fire' ? { time: 2, dmg: 1 } : undefined,
        owner: p.id, friendly: true, mapId: p.mapId,
      });
    }
  }

  npcShoot(npc, ang, opts = {}) {
    this.projectiles.push({
      x: npc.x, y: npc.y - 4, vx: Math.cos(ang) * (opts.speed || 280), vy: Math.sin(ang) * (opts.speed || 280),
      life: 1.2, radius: 2, dmg: opts.dmg || 2, knockback: 20,
      chill: opts.chill, slow: opts.slow, holy: opts.holy, school: opts.school,
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
    // испытание данжей: обитатели усилены ключом и модификаторами
    if (this.mplus && mapId === this.mplus.mapId) this.applyMplusMods(e);
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
        guard: 'npc_guard', merchant: 'npc_merchant', elder: 'npc_elder2',
        wizard: 'npc_wizard', priest: 'npc_priest2', blacksmith: 'npc_smith',
        innkeeper: 'npc_innkeeper', hunter: 'npc_hunter2',
        captain: 'npc_captain', arenamaster: 'npc_arena', widow: 'npc_widow',
      }[role] || (this.rand() < 0.5 ? 'npc_villager_plain' : 'npc_villager2')),
      ...extra,
    });
    return id;
  }

  spawnCaravanNpc(tok, unit) {
    const fk = FACTION_KINDS[tok.faction] || {};
    return this.spawnNpc(unit === 'guard' ? 'guard' : 'trader', tok.faction, 'over',
      tok.x + (Math.random() - 0.5) * 40, tok.y + (Math.random() - 0.5) * 40,
      { caravan: tok.id, kind: unit === 'guard' ? (fk.guard || 'npc_guard') : (fk.merchant || 'npc_merchant') });
  }

  spawnDrop(item, count, mapId, x, y, ttl = 120) {
    const id = 'd' + this.nextId++;
    this.entities.set(id, { id, entType: 'drop', item, count, mapId, x, y, hp: 1, ttl });
  }

  // гидратация поселений: NPC существуют только рядом с игроками.
  // Гистерезис: появляются в 400px, исчезают лишь дальше 560px —
  // на границе радиуса жители не мерцают и не «телепортируются»
  hydrateSettlements() {
    for (const s of this.world.settlements) {
      const sx = s.x * TILE, sy = s.y * TILE;
      const wasHyd = this.hydratedSettlements.has(s.id);
      const R = wasHyd ? SETTLEMENT_HYDRATE_R * 1.4 : SETTLEMENT_HYDRATE_R;
      let near = false;
      for (const p of this.players.values()) {
        if (p.mapId === 'over' && dist2(p.x, p.y, sx, sy) < R ** 2) { near = true; break; }
      }
      const hyd = this.hydratedSettlements.get(s.id);
      if (s.ruined) { // руины пусты
        if (hyd) { for (const id of hyd) this.entities.delete(id); this.hydratedSettlements.delete(s.id); }
        continue;
      }
      if (s.captured) { // в захваченной деревне хозяйничают бандиты или гарнизон Тьмы
        if (!hyd) {
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
        }
        continue;
      }
      if (!hyd) { // жители живут ПОСТОЯННО — никаких исчезновений за спиной
        const ids = [];
        const a = s.anchors;
        ids.push(this.spawnNpc('elder', s.id, 'over', sx + 20, sy - 10));
        // именной NPC: капитан стражи Ярослава живёт в первой деревне
        if (s === this.world.settlements[0]) {
          const cid = this.spawnNpc('captain', s.id, 'over', sx + 42, sy + 12);
          const cpt = this.entities.get(cid);
          cpt.name = 'Ярослава';
          cpt.hp = cpt.maxHp = 24;
          ids.push(cid);
          // распорядитель арены зазывает бойцов
          const aid = this.spawnNpc('arenamaster', s.id, 'over', sx - 44, sy - 20);
          const am = this.entities.get(aid);
          am.name = 'Боривой';
          am.hp = am.maxHp = 30;
          ids.push(aid);
          // вдова Милица ждёт вестей у таверны
          const wx = (a.tavern?.x ?? s.x) * TILE, wy = (a.tavern?.y ?? s.y) * TILE;
          const wid = this.spawnNpc('widow', s.id, 'over', wx - 14, wy + 12);
          const wd = this.entities.get(wid);
          wd.name = 'Милица';
          ids.push(wid);
        }
        // именной NPC: кузнец-мастер Творимир во второй деревне
        if (s === this.world.settlements[1]) {
          const mid = this.spawnNpc('mastersmith', s.id, 'over', sx - 30, sy + 18, { kind: 'npc_smith' });
          const ms = this.entities.get(mid);
          ms.name = 'Творимир';
          ms.hp = ms.maxHp = 20;
          ids.push(mid);
        }
        // знахарь Богумил в третьей деревне (цепочка «Хворь») — пока не разоблачён
        if (s === this.world.settlements[2] && !this.world.plagueExposed) {
          const bid = this.spawnNpc('plaguedoc', s.id, 'over', sx + 36, sy - 16, { kind: 'npc_wizard' });
          const bd = this.entities.get(bid);
          bd.name = 'Богумил';
          bd.hp = bd.maxHp = 16;
          ids.push(bid);
        }
        // торговка Весняна в четвёртой деревне (цепочка «Пропавший караванщик»)
        if (s === this.world.settlements[3]) {
          const vid = this.spawnNpc('caravanwife', s.id, 'over', sx - 36, sy - 12, { kind: 'npc_villager2' });
          const vs = this.entities.get(vid);
          vs.name = 'Весняна';
          vs.hp = vs.maxHp = 14;
          ids.push(vid);
        }
        // рыбак Тихон в пятой деревне (цепочка «Голос болот»)
        if (s === this.world.settlements[4]) {
          const tid = this.spawnNpc('fisherman', s.id, 'over', sx + 28, sy + 26, { kind: 'npc_villager' });
          const th = this.entities.get(tid);
          th.name = 'Тихон';
          th.hp = th.maxHp = 14;
          ids.push(tid);
          // жрец Лютобор (кампания гл.3) — пока не разоблачён
          if (this.world.mq?.priest !== 'exposed') {
            const lid = this.spawnNpc('priest', s.id, 'over', sx - 18, sy - 26, { mqPriest: true });
            const lb = this.entities.get(lid);
            lb.name = 'Лютобор';
            lb.hp = lb.maxHp = 14;
            ids.push(lid);
          }
        }
        // лица народа: жители, стража и торговцы каждой фракции — свои
        const fk = FACTION_KINDS[s.faction] || {};
        ids.push(this.spawnNpc('merchant', s.id, 'over', (a.stalls[0]?.x ?? s.x) * TILE + 8, (a.stalls[0]?.y ?? s.y) * TILE + 8,
          fk.merchant ? { kind: fk.merchant } : {}));
        // ремесленники и служители — если деревня их «выучила»
        if (a.smithy) ids.push(this.spawnNpc('blacksmith', s.id, 'over', a.smithy.x * TILE + 8, a.smithy.y * TILE + 8));
        if (a.tavern) ids.push(this.spawnNpc('innkeeper', s.id, 'over', a.tavern.x * TILE + 8, a.tavern.y * TILE + 8));
        // (в пятой деревне жрец именной — Лютобор, генерик не нужен)
        if (s.shrines > 0 && s !== this.world.settlements[4])
          ids.push(this.spawnNpc('priest', s.id, 'over', sx - 20, sy - 24));
        if (s.forestRich >= 2) ids.push(this.spawnNpc('hunter', s.id, 'over', sx - 40, sy + 30));
        for (let gi = 0; gi < (s.guards || 2); gi++) {
          const ga = gi / Math.max(1, s.guards) * Math.PI * 2;
          ids.push(this.spawnNpc('guard', s.id, 'over', sx + Math.cos(ga) * 34, sy + Math.sin(ga) * 34,
            fk.guard ? { kind: fk.guard } : {}));
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
          const npc = this.spawnNpc('villager', s.id, 'over', sx + (this.rand() - 0.5) * 120, sy + (this.rand() - 0.5) * 120,
            fk.villager && this.rand() < 0.65 ? { kind: fk.villager } : {});
          const ent = this.entities.get(npc);
          ent.bed = bed ? { x: bed.x, y: bed.y } : { x: s.x, y: s.y };
          ent.work = pick(this.rand, a.works);
          ids.push(npc);
        }
        this.hydratedSettlements.set(s.id, ids);
      } else if (this.tick % 300 === 0) {
        // деревня растёт/скудеет — мягкий досев без пересоздания живых
        this.syncSettlementNpcs(s, near);
      }
    }

    return;
  }

  // Мягкая синхронизация населения: досеваем новичков, лишних не трогаем
  // (удаляем только вдали от глаз — жители «уезжают», а не испаряются)
  syncSettlementNpcs(s, near) {
    const ids = this.hydratedSettlements.get(s.id);
    if (!ids || s.captured || s.ruined) return;
    const sx = s.x * TILE, sy = s.y * TILE;
    const alive = ids.filter(id => this.entities.has(id));
    const fk = FACTION_KINDS[s.faction] || {};
    // стража: до целевого числа (найм в civ)
    const guards = alive.filter(id => this.entities.get(id).role === 'guard'
      && this.entities.get(id).kind !== 'npc_spirit');
    for (let i = guards.length; i < (s.guards || 0); i++) {
      const id = this.spawnNpc('guard', s.id, 'over', sx + 20, sy + 20, fk.guard ? { kind: fk.guard } : {});
      ids.push(id);
    }
    // дух-хранитель: появляется с ритуалом, уходит по сроку
    const spirit = alive.map(id => this.entities.get(id)).find(e => e.kind === 'npc_spirit');
    if (s.spiritT > 0 && !spirit) {
      const id = this.spawnNpc('guard', s.id, 'over', sx + 12, sy - 20, { kind: 'npc_spirit' });
      const sp = this.entities.get(id);
      sp.hp = sp.maxHp = 24;
      ids.push(id);
    } else if (s.spiritT <= 0 && spirit) {
      this.fx({ t: 'poof', x: spirit.x, y: spirit.y }, 'over', spirit.x, spirit.y);
      this.entities.delete(spirit.id);
    }
    // жители: рост — новичок приходит к таверне; убыль — уходят лишь незаметно
    const villagers = alive.filter(id => this.entities.get(id).role === 'villager');
    const target = Math.min(9, Math.max(2, s.population - 4));
    const a = s.anchors;
    for (let i = villagers.length; i < target; i++) {
      const bed = a.beds[i % Math.max(1, a.beds.length)];
      const id = this.spawnNpc('villager', s.id, 'over', sx + (this.rand() - 0.5) * 60, sy + 30,
        fk.villager && this.rand() < 0.65 ? { kind: fk.villager } : {});
      const ent = this.entities.get(id);
      ent.bed = bed ? { x: bed.x, y: bed.y } : { x: s.x, y: s.y };
      ent.work = pick(this.rand, a.works);
      ids.push(id);
    }
    if (!near && villagers.length > target + 1) {
      const gone = this.entities.get(villagers[0]);
      if (gone) this.entities.delete(gone.id);
    }
  }

  hydratePois() {
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
      // наводчик кампании ждёт суда у павшего логова (переживает рестарты)
      const scout = poi.id === this.world.mq?.lair && this.world.mq.lairDone && !this.world.mq.prisoner;
      if (!poi.special && !scout) continue;
      const role = scout ? 'darkscout'
        : poi.type === 'hermit' ? 'hermit'
        : poi.type === 'obelisk' && this.world.pois.find(o => o.type === 'obelisk') === poi ? 'wanderer' : null;
      if (!role) continue;
      const cx = poi.x * TILE, cy = poi.y * TILE;
      const alive = poi.npcId && this.entities.has(poi.npcId);
      if (!alive) { // именные живут в мире постоянно
        poi.npcId = this.spawnNpc(role, poi.id, 'over', cx + 8, cy + 28, {
          kind: role === 'hermit' ? 'npc_hermit' : role === 'darkscout' ? 'npc_darkscout' : 'npc_wanderer',
        });
        const n = this.entities.get(poi.npcId);
        n.name = role === 'hermit' ? 'Радогост' : role === 'darkscout' ? 'Наводчик Тьмы' : 'Мирослава';
        n.hp = n.maxHp = role === 'darkscout' ? 10 : 20;
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
      // LOD: враги думают только рядом с игроками; ЖИТЕЛИ живут всегда —
      // вдали просто реже (крупный шаг раз в полсекунды): распорядок дня
      // идёт своим чередом, и никто не телепортируется за спиной
      let near = false;
      for (const p of this.players.values()) {
        if (p.mapId !== e.mapId || p.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) < HOT_RADIUS ** 2) { near = true; break; }
      }
      if (!near) {
        if (e.entType === 'npc' && this.tick % 15 === 0) {
          if (e.dieAtTick && this.tick >= e.dieAtTick) { this.entities.delete(e.id); continue; }
          updateNpc(e, dt * 15, this.mapFor(e.mapId), this);
        }
        continue;
      }

      const map = this.mapFor(e.mapId);
      if (e.entType === 'enemy') {
        if ((e.chillT || 0) > 0) e.chillT -= dt; // метка льда тает
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
        // «Живая бомба» мага: таймер догорел — взрыв на носителе
        if ((e.bombT || 0) > 0) {
          e.bombT -= dt;
          if (e.bombT <= 0) {
            this.explodeAt(e.mapId, e.x, e.y, e.bombDmg || 5, 40, e.bombOwner, 0);
            this.fx({ t: 'boom', x: e.x, y: e.y, r: 40 }, e.mapId, e.x, e.y);
            e.bombT = 0;
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
        // рывок босса: замах с телеграф-линией, затем несётся по прямой
        if ((e.chargeT || 0) > 0) {
          e.chargeT -= dt;
          if (e.chargeT <= 0) e.chargingT = 0.55; // помчался
          continue;
        }
        if ((e.chargingT || 0) > 0) {
          e.chargingT -= dt;
          const cdef = ENEMIES[e.kind];
          moveWithCollision(e, e.chargeVx * dt, e.chargeVy * dt, cdef.radius, map);
          for (const p of this.players.values()) {
            if (p.dead || p.mapId !== e.mapId || e.chargeHit.has(p.id)) continue;
            if (circlesOverlap(e.x, e.y, cdef.radius + 4, p.x, p.y, PLAYER_RADIUS)) {
              e.chargeHit.add(p.id);
              this.damagePlayer(p, e.chargeSpec.dmg, { x: e.x - e.chargeVx, y: e.y - e.chargeVy });
            }
          }
          if (e.chargingT <= 0) this.fx({ t: 'hit', kind: 'wall', x: e.x, y: e.y }, e.mapId, e.x, e.y);
          continue; // рывок не прерывается на стрельбу
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
          if (s.charge) { // телеграфированный рывок: линия предупреждает о траектории
            e.chargeT = s.charge.windup;
            e.chargeSpec = s.charge;
            e.chargeVx = Math.cos(s.aim) * s.charge.speed;
            e.chargeVy = Math.sin(s.aim) * s.charge.speed;
            e.chargeHit = new Set();
            this.fx({ t: 'telegraphLine', x: e.x, y: e.y, a: s.aim, len: s.charge.speed * 0.55, w: s.charge.windup }, e.mapId, e.x, e.y);
            continue;
          }
          if (s.phase) { // смена фазы: свита и ярость
            const ph = s.phase;
            if (ph.adds) {
              for (let i = 0; i < ph.adds.n; i++) {
                const a = (i / ph.adds.n) * Math.PI * 2;
                this.spawnEnemy(ph.adds.kind, e.mapId, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, { noElite: true });
              }
              this.fx({ t: 'summon', x: e.x, y: e.y }, e.mapId, e.x, e.y);
            }
            if (ph.enrage && !e.enraged) {
              e.enraged = true;
              e.hasteF = Math.max(e.hasteF || 1, 1.3);
              this.fx({ t: 'enrage', x: e.x, y: e.y }, e.mapId, e.x, e.y);
              this.toastMap(e.mapId, `⚠ ${ENEMIES[e.kind].name} В ЯРОСТИ!`);
            }
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
          // призывы игрока — законная добыча: враг кусает элементаля и наёмника
          for (const n of this.entities.values()) {
            if (n.entType !== 'npc' || n.mapId !== e.mapId) continue;
            if (n.role !== 'elemental' && n.role !== 'mercenary') continue;
            if (!circlesOverlap(e.x, e.y, def.radius + 2, n.x, n.y, 5)) continue;
            n.hurtCd = (n.hurtCd || 0) - dt;
            if (n.hurtCd <= 0) {
              n.hurtCd = 0.8;
              this.damageNpc(n, touch, null);
            }
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
        p.offCd = 60;
        this.summonAlly(p, 'npc_elemental', 'Элементаль', {});
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

  // ═══ УЛЬТА (F): венец взятой ветки талантов ═══
  useUltimate(p) {
    const ult = ultOf(p.cls, p.talents);
    if (!ult) { this.toast(p, '📖 Ульта откроется с капстоуном ветки талантов (9 очков в ветке)'); return; }
    if ((p.abCd[3] || 0) > 0) return;
    if (ult.mana > 0 && !this.payMana(p, ult.mana)) { this.toast(p, 'Не хватает маны'); return; }
    p.combatT = 0;
    p.abCd[3] = ult.cd * (p.ascended ? 0.75 : 1);
    const d = p.derived || {};
    const aim = p.aim || 0;
    const foesIn = (r, fn) => {
      for (const e of [...this.entities.values()]) {
        if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
        if (dist2(p.x, p.y, e.x, e.y) > r * r) continue;
        fn(e);
      }
    };
    const allies = (r, fn) => {
      for (const q of this.players.values()) {
        if (q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > r * r) continue;
        fn(q);
      }
    };
    switch (ult.id) {
      case 'rage_ult': { // берсерк: кровавая жатва
        p.rageUltT = 8;
        p.buffs.speed = { mult: 0.3, t: 8 };
        this.recomputeStats(p);
        break;
      }
      case 'citadel_ult': { // страж: железный бастион
        allies(90, q => { if (!q.dead) { q.buffs.guarded = { mult: 0.6, t: 6 }; this.fx({ t: 'barrier', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y); } });
        foesIn(110, e => { e.tauntT = 4; e.tauntBy = p.id; e.aggro = true; });
        break;
      }
      case 'warlord_ult': { // полководец: знамя войны
        allies(120, q => {
          if (q.dead) return;
          q.buffs.blessed = { mult: 0.25, t: 10 };
          q.shieldHp = Math.max(q.shieldHp || 0, 2);
          q.shieldT = Math.max(q.shieldT || 0, 10);
          this.recomputeStats(q);
          this.toast(q, '🚩 Знамя войны: +25% урона (10 с)');
        });
        break;
      }
      case 'storm_ult': { // пиромант: испепеление — три метеора
        const tx = p.x + Math.cos(aim) * 120, ty = p.y + Math.sin(aim) * 120;
        this.meteors = this.meteors || [];
        for (let i = 0; i < 3; i++) {
          const ox = i === 0 ? 0 : (i === 1 ? -38 : 38), oy = i === 2 ? 30 : i === 1 ? 30 : 0;
          this.meteors.push({ mapId: p.mapId, x: tx + ox, y: ty + oy, t: 0.7 + i * 0.35, dmg: Math.round(5 * (d.dmgMagic || 1) * 10) / 10, owner: p.id });
          this.fx({ t: 'telegraph', x: tx + ox, y: ty + oy, r: 40, w: 0.7 + i * 0.35 }, p.mapId, tx, ty);
        }
        break;
      }
      case 'freeze_ult': { // криомант: абсолютный лёд
        foesIn(160, e => {
          e.stunT = Math.max(e.stunT || 0, 1.5);
          e.chillT = Math.max(e.chillT || 0, 4);
          e.slowT = Math.max(e.slowT || 0, 4); e.slowMult = 0.35;
          this.damageEnemy(e, Math.round(2 * (d.dmgMagic || 1) * 10) / 10,
            { vx: 0, vy: 0, knockback: 0, owner: p.id, school: 'magic' });
        });
        this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'archon_ult': { // арканист: шквал + возврат маны
        for (let i = 0; i < 12; i++) {
          const a = aim + (i / 12) * Math.PI * 2;
          this.projectiles.push({
            x: p.x, y: p.y - 4, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
            life: 0.9, radius: 3, dmg: Math.round(3 * (d.dmgMagic || 1) * 10) / 10,
            knockback: 40, school: 'magic', owner: p.id, friendly: true, mapId: p.mapId,
          });
        }
        p.mana = Math.min(p.manaMax, p.mana + 15);
        break;
      }
      case 'exec_ult': { // убийца: танец смерти
        let last = null;
        const wDmg = this.weapon(p).melee ? this.weapon(p).damage : 4;
        foesIn(110, e => {
          this.fx({ t: 'poof', x: e.x, y: e.y }, p.mapId, e.x, e.y);
          this.damageEnemy(e, Math.round(wDmg * (d.dmgMelee || 1) * 3 * 10) / 10,
            { vx: 0, vy: 0, knockback: 40, owner: p.id, school: 'melee' });
          if (this.entities.has(e.id)) last = e;
        });
        if (last) { p.x = last.x + 12; p.y = last.y; p.hurtT = Math.max(p.hurtT, 0.5); }
        break;
      }
      case 'barrage_ult': { // стрелок: три волны клинков
        const atk = this.rollAttack(p, getWeapon('knives'));
        for (let w = 0; w < 3; w++)
          for (let i = 0; i < 12; i++) {
            const a = aim + (i / 12) * Math.PI * 2 + w * 0.17;
            this.projectiles.push({
              x: p.x, y: p.y - 4, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
              life: 0.7, delay: w * 0.3, radius: 2, dmg: Math.round(3 * (d.dmgRanged || 1) * 10) / 10,
              crit: atk.crit, knockback: 40, school: 'ranged', owner: p.id, friendly: true, mapId: p.mapId,
            });
          }
        break;
      }
      case 'gambler_ult': { // плут: дым и золото
        p.invisT = 5;
        p.abCd[0] = p.abCd[1] = p.abCd[2] = 0;
        p.goldUltT = 10;
        this.toast(p, '🎲 Кулдауны сброшены, ты невидим, монеты ×2 (10 с)');
        break;
      }
      case 'rez_ult': { // свет: чудо
        allies(120, q => {
          if (q.dead) { q.dead = false; q.downT = 0; q.hp = Math.ceil(q.maxHp / 2); q.hurtT = 2; this.toastMap(p.mapId, `✨ ЧУДО: ${q.name} восстал!`); }
          else q.hp = q.maxHp;
          this.fx({ t: 'ascend', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
        });
        break;
      }
      case 'wrath_ult': { // кара: гнев Господень
        foesIn(130, e => {
          this.fx({ t: 'chain', pts: [[e.x, e.y - 60], [e.x, e.y]] }, p.mapId, e.x, e.y);
          e.stunT = Math.max(e.stunT || 0, 1);
          this.damageEnemy(e, Math.round(4 * (d.dmgMagic || 1) * 2.5 * 10) / 10,
            { vx: 0, vy: 0, knockback: 30, owner: p.id, school: 'magic' });
        });
        break;
      }
      case 'martyr_ult': { // оплот: небесный оплот
        allies(100, q => {
          if (q.dead) return;
          q.shieldHp = Math.max(q.shieldHp || 0, 6);
          q.shieldT = Math.max(q.shieldT || 0, 8);
          q.buffs.guarded = { mult: 0.4, t: 8 };
          this.fx({ t: 'barrier', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
        });
        break;
      }
    }
    this.fx({ t: 'react', name: ult.name.toUpperCase() + '!', x: p.x, y: p.y - 14 }, p.mapId, p.x, p.y);
    this.gainArcane(p);
  }

  // ---------- активные способности (Q/E/R) ----------
  // назначить способность на слот Q/X/R (Книга способностей)
  setAbility(p, slot, id) {
    if (slot < 0 || slot > 2) return;
    const ab = abilityById(p.cls, id);
    if (!ab || p.level < ab.lvl) { this.toast(p, ab ? `«${ab.name}» откроется на уровне ${ab.lvl}` : 'Нет такой способности'); return; }
    p.abilities = p.abilities || defaultLoadout(p.cls);
    const other = p.abilities.indexOf(id);
    if (other >= 0 && other !== slot) p.abilities[other] = p.abilities[slot]; // обмен слотами
    p.abilities[slot] = id;
    p.abCd[slot] = Math.max(p.abCd[slot] || 0, 1); // маленькая пауза после перестановки
    this.toast(p, `📖 «${ab.name}» — на клавише ${['Q', 'X', 'R'][slot]}`);
  }

  // призыв союзника-элементаля: один на игрока, живёт 25 с
  summonAlly(p, kind, name, extra = {}) {
    for (const e of [...this.entities.values()])
      if (e.entType === 'npc' && e.role === 'elemental' && e.owner === p.id) this.entities.delete(e.id);
    const id = this.spawnNpc('elemental', null, p.mapId, p.x + 14, p.y - 6, { kind, ...extra });
    const el = this.entities.get(id);
    el.owner = p.id;
    el.name = name;
    el.hp = el.maxHp = 10;
    el.dieAtTick = this.tick + 25 * 30;
    this.fx({ t: 'summon', x: el.x, y: el.y }, p.mapId, el.x, el.y);
    return el;
  }

  useAbility(p, slot) {
    if (p.dead || p.rollT > 0) return;
    if (slot === 3) { this.useUltimate(p); return; } // F — ульта капстоуна
    p.abilities = p.abilities || defaultLoadout(p.cls);
    const ab = abilityById(p.cls, p.abilities[slot]) || abilitiesOf(p.cls)[slot];
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
    // классовые ресурсы: способность сжигает запас и бьёт сильнее
    let resMult = 1;
    if (p.cls === 'warrior' && (p.rage || 0) >= 30
      && ['power_strike', 'whirlwind', 'heroic_charge'].includes(ab.id)) {
      resMult = 1 + p.rage / 150; // до +66% на полной ярости
      this.fx({ t: 'react', name: 'ЯРОСТЬ!', x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
      p.rage = 0;
    }
    if (p.cls === 'rogue' && (p.combo || 0) > 0) {
      resMult = 1 + p.combo * 0.12; // +12% за очко комбо
      if (p.combo >= 3) this.fx({ t: 'react', name: `КОМБО ×${p.combo}`, x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
      p.combo = 0;
    }
    if (p.cls === 'priest' && (p.grace || 0) > 0
      && ['judgement', 'consecration'].includes(ab.id)) {
      resMult = 1 + p.grace * 0.2; // +20% за заряд благодати
      this.fx({ t: 'react', name: 'БЛАГОДАТЬ!', x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
      p.grace = 0;
    }
    const d = {
      ...(p.derived || {}),
      dmgMagic: (p.derived?.dmgMagic || 1) * arcMult * resMult,
      dmgMelee: (p.derived?.dmgMelee || 1) * resMult,
      dmgRanged: (p.derived?.dmgRanged || 1) * resMult,
    };
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
          school: p.cls === 'mage' || p.cls === 'priest' ? 'magic' : 'melee',
        });
      }
    };
    switch (ab.id) {
      // ═══ новые механики: стихийные заряды, структуры, зоны, призывы ═══
      case 'ember_blade': { // воин: 6 атак несут огонь (вход в реакции)
        p.imbue = { kind: 'fire', n: 6, dmg: 2 };
        this.fx({ t: 'react', name: 'ОГОНЬ В КЛИНКЕ', x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
        this.toast(p, '🔥 Клинок раскалён: 6 атак жгут (+2 урона и поджог)');
        break;
      }
      case 'holy_weapon': { // жрец: 6 атак несут свет и лечат владельца
        p.imbue = { kind: 'holy', n: 6, dmg: 1 };
        this.fx({ t: 'react', name: 'СВЕТ В КЛИНКЕ', x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
        this.toast(p, '✦ Оружие освящено: 6 атак несут свет и лечат тебя');
        break;
      }
      case 'ice_wall': { // маг: стена льда поперёк прицела (тает через 6 с)
        const cx = p.x + Math.cos(aim) * 42, cy = p.y + Math.sin(aim) * 42;
        const px = -Math.sin(aim), py = Math.cos(aim); // перпендикуляр
        let placed = 0;
        for (let k = -2; k <= 2; k++) {
          const tx = Math.floor((cx + px * k * TILE) / TILE);
          const ty = Math.floor((cy + py * k * TILE) / TILE);
          if (this.setTempTile(p.mapId, tx, ty, T.ICE_WALL, 6)) placed++;
        }
        if (!placed) { p.abCd[slot] = 1; this.toast(p, 'Здесь стене не встать'); break; }
        this.fx({ t: 'frostnova', x: cx, y: cy, r: 40 }, p.mapId, cx, cy);
        break;
      }
      case 'firestorm': { // маг: огненный смерч ползёт к прицелу
        this.zones.push({
          mapId: p.mapId, x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
          vx: Math.cos(aim) * 28, vy: Math.sin(aim) * 28,
          r: 26, t: 5, kind: 'firestorm', owner: p.id,
          dmg: Math.round(2 * (d.dmgMagic || 1) * 10) / 10,
        });
        this.fx({ t: 'zone', kind: 'firestorm', x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20,
          vx: Math.cos(aim) * 28, vy: Math.sin(aim) * 28, r: 26, dur: 5 }, p.mapId, p.x, p.y);
        break;
      }
      case 'smoke_cloud': { // вор: облако дыма у прицела — укрытие для группы
        const dist = Math.min(90, 90);
        const zx = p.x + Math.cos(aim) * dist * 0.6, zy = p.y + Math.sin(aim) * dist * 0.6;
        this.zones.push({ mapId: p.mapId, x: zx, y: zy, vx: 0, vy: 0, r: 42, t: 6, kind: 'smoke', owner: p.id });
        this.fx({ t: 'zone', kind: 'smoke', x: zx, y: zy, vx: 0, vy: 0, r: 42, dur: 6 }, p.mapId, zx, zy);
        break;
      }
      case 'summon_frost': { // маг: ледяной элементаль (снаряды студят)
        this.summonAlly(p, 'npc_ice_elemental', 'Ледяной элементаль', { frost: true });
        this.toast(p, '❄ Ледяной элементаль служит тебе (25 с)');
        break;
      }
      case 'summon_spirit': { // жрец: светлый дух (лучи лечат союзников, жгут врагов)
        this.summonAlly(p, 'npc_spirit', 'Дух-заступник', { holySpirit: true });
        this.toast(p, '✦ Дух-заступник осеняет отряд (25 с)');
        break;
      }
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
          e.chillT = Math.max(e.chillT || 0, 2.5); // метка льда для реакций
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
      case 'holy_wave': { // жрец Q: волна света — лечит своих, опаляет чужих
        const heal = this.hasTalent(p, 'ab_wavebig') ? 3 : 2;
        const r = 85;
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > r * r) continue;
          const amount = q === p ? Math.ceil(heal / 2) : heal;
          if (q.hp < q.maxHp) {
            q.hp = Math.min(q.maxHp, q.hp + amount);
            this.fx({ t: 'heal', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
            if (q !== p) this.gainGrace(p);
          }
        }
        // капстоун Света: волна поднимает павшего союзника (раз в 60 с)
        if (this.hasTalent(p, 'ab_waverez') && (p.rezCd || 0) <= this.tick) {
          for (const q of this.players.values()) {
            if (!q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > r * r) continue;
            q.dead = false; q.hp = 3; q.hurtT = 2; q.downT = 0;
            p.rezCd = this.tick + 60 * 30;
            this.fx({ t: 'ascend', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
            this.toastMap(p.mapId, `✨ Свет вернул ${q.name} в строй!`);
            break;
          }
        }
        hitAround(p.x, p.y, r * 0.7, Math.round(2 * (d.dmgMagic || 1) * 10) / 10, 40);
        break;
      }
      case 'judgement': { // жрец X: столб света у прицела — урон и стан
        const r = this.hasTalent(p, 'ab_judgewide') ? 44 : 32;
        const tx = p.x + Math.cos(aim) * Math.min(120, 120), ty = p.y + Math.sin(aim) * 120;
        hitAround(tx, ty, r, Math.round(4 * (d.dmgMagic || 1) * 2.5 * 10) / 10, 60);
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(tx, ty, e.x, e.y) < r * r) { e.stunT = Math.max(e.stunT || 0, 1); e.aggro = true; }
        }
        this.fx({ t: 'chain', pts: [[tx, ty - 60], [tx, ty]] }, p.mapId, tx, ty);
        this.fx({ t: 'boom', x: tx, y: ty, r }, p.mapId, tx, ty);
        break;
      }
      case 'faith_shield': { // жрец R: барьер всему отряду рядом
        const hpS = this.hasTalent(p, 'ab_shieldbig') ? 6 : 4;
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 95 * 95) continue;
          q.shieldHp = Math.max(q.shieldHp || 0, hpS);
          q.shieldT = Math.max(q.shieldT || 0, 6);
          this.fx({ t: 'barrier', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
        }
        break;
      }
      case 'heroic_charge': { // воин: бросок к прицелу, стан и урон на пути
        for (let i = 0; i < 10; i++) {
          moveWithCollision(p, Math.cos(aim) * 130 / 10, Math.sin(aim) * 130 / 10, PLAYER_RADIUS, map);
          for (const e of this.entities.values()) {
            if (e.entType !== 'enemy' || e.mapId !== p.mapId || e.chargeHitBy === p.id) continue;
            if (dist2(p.x, p.y, e.x, e.y) < 26 * 26) {
              e.chargeHitBy = p.id;
              e.stunT = Math.max(e.stunT || 0, 0.8);
              const wDmg = this.weapon(p).melee ? this.weapon(p).damage : 4;
              this.damageEnemy(e, Math.round(wDmg * (d.dmgMelee || 1) * 2 * 10) / 10,
                { vx: Math.cos(aim), vy: Math.sin(aim), knockback: 120, owner: p.id, school: 'melee' });
            }
          }
        }
        for (const e of this.entities.values()) if (e.chargeHitBy === p.id) delete e.chargeHitBy;
        p.hurtT = Math.max(p.hurtT, 0.4);
        break;
      }
      case 'unbreakable': { // воин: каменная кожа
        p.shieldHp = Math.max(p.shieldHp || 0, 6);
        p.shieldT = Math.max(p.shieldT || 0, 6);
        this.fx({ t: 'barrier', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'meteor': { // маг: телеграф у прицела, через миг — удар с неба
        const tx = p.x + Math.cos(aim) * 130, ty = p.y + Math.sin(aim) * 130;
        this.meteors = this.meteors || [];
        this.meteors.push({ mapId: p.mapId, x: tx, y: ty, t: 0.8, dmg: Math.round(6 * (d.dmgMagic || 1) * 10) / 10, owner: p.id });
        this.fx({ t: 'telegraph', x: tx, y: ty, r: 44, w: 0.8 }, p.mapId, tx, ty);
        break;
      }
      case 'living_bomb': { // маг: бомба на враге у прицела
        const tx = p.x + Math.cos(aim) * 110, ty = p.y + Math.sin(aim) * 110;
        let best = null, bd = 90 * 90;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          const d2 = dist2(tx, ty, e.x, e.y);
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (!best) { p.abCd[slot] = 1; this.toast(p, 'Некому вешать бомбу'); break; }
        best.bombT = 2;
        best.bombDmg = Math.round(5 * (d.dmgMagic || 1) * 10) / 10;
        best.bombOwner = p.id;
        best.aggro = true;
        this.fx({ t: 'telegraph', x: best.x, y: best.y, r: 20, w: 2 }, p.mapId, best.x, best.y);
        break;
      }
      case 'shadowstep': { // вор: за спину врага у прицела
        const tx = p.x + Math.cos(aim) * 140, ty = p.y + Math.sin(aim) * 140;
        let best = null, bd = 110 * 110;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          const d2 = dist2(tx, ty, e.x, e.y);
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (!best) { p.abCd[slot] = 1; this.toast(p, 'Тени не нашли жертву'); break; }
        const back = e => Math.atan2(e.y - p.y, e.x - p.x); // встать за спиной по линии подхода
        const a = back(best);
        p.x = best.x + Math.cos(a) * 14;
        p.y = best.y + Math.sin(a) * 14;
        p.aim = Math.atan2(best.y - p.y, best.x - p.x);
        p.stepBonusT = 1.5; // следующая атака ×1.5
        p.hurtT = Math.max(p.hurtT, 0.3);
        this.fx({ t: 'poof', x: best.x, y: best.y }, p.mapId, best.x, best.y);
        break;
      }
      case 'caltrops': { // вор: ковёр шипов вокруг
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 70 * 70) continue;
          e.slowT = Math.max(e.slowT || 0, 3); e.slowMult = 0.5;
          e.dotT = 2; e.dotDmg = 1; e.dotSrc = p.id; e.dotKind = 'venom';
          e.aggro = true;
        }
        this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'consecration': { // жрец: святой огонь у ног
        hitAround(p.x, p.y, 75, Math.round(2 * (d.dmgMagic || 1) * 2 * 10) / 10, 30);
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 75 * 75) continue;
          e.dotT = 3; e.dotDmg = 1; e.dotSrc = p.id; e.dotKind = 'ignite';
        }
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 75 * 75) continue;
          if (q.hp < q.maxHp) {
            q.hp = Math.min(q.maxHp, q.hp + 1);
            this.fx({ t: 'heal', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
            if (q !== p) this.gainGrace(p);
          }
        }
        this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'guardian': { // жрец: дух-хранитель бережёт отряд
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 95 * 95) continue;
          q.buffs.guarded = { mult: 0.3, t: 8 };
          this.fx({ t: 'barrier', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
          this.toast(q, '👁 Дух-хранитель осеняет тебя: −30% урона (8 с)');
        }
        break;
      }
      case 'shield_bash': { // воин: тычок со станом в упор («Тяжёлый щит» — злее)
        const heavy = this.hasTalent(p, 'ab_bash');
        const wDmg = this.weapon(p).melee ? this.weapon(p).damage : 4;
        hitAround(p.x, p.y, 34, Math.round(wDmg * (d.dmgMelee || 1) * (heavy ? 2 : 1.5) * 10) / 10, 140, e => {
          let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          return Math.abs(da) <= Math.PI / 3;
        });
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 34 * 34) continue;
          let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) <= Math.PI / 3) { e.stunT = Math.max(e.stunT || 0, this.hasTalent(p, 'ab_bash') ? 2 : 1); e.aggro = true; }
        }
        break;
      }
      case 'rally': { // воин: второе дыхание
        p.hp = Math.min(p.maxHp, p.hp + 2);
        delete p.buffs.slowed;
        this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'taunt': { // воин: враги переключаются на танка («Громовой вызов» дольше + барьер)
        const thunder = this.hasTalent(p, 'ab_taunt');
        let n = 0;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 110 * 110) continue;
          e.tauntT = thunder ? 5 : 3; e.tauntBy = p.id; e.aggro = true; n++;
        }
        if (thunder && n) { p.shieldHp = Math.max(p.shieldHp || 0, 2); p.shieldT = Math.max(p.shieldT || 0, 5); }
        if (n) this.fx({ t: 'react', name: 'ВЫЗОВ!', x: p.x, y: p.y - 10 }, p.mapId, p.x, p.y);
        break;
      }
      case 'ice_lance': { // маг: пронзающее копьё льда («Пронзающий холод» — злее)
        const pierce = this.hasTalent(p, 'ab_lance');
        this.projectiles.push({
          x: p.x, y: p.y - 4, vx: Math.cos(aim) * 420, vy: Math.sin(aim) * 420,
          life: 0.8, radius: 3, dmg: Math.round(4 * (d.dmgMagic || 1) * 2.5 * (pierce ? 1.6 : 1) * 10) / 10,
          knockback: 40, school: 'magic',
          slow: { mult: 0.5, time: pierce ? 2.6 : 1.6 }, chill: true,
          owner: p.id, friendly: true, mapId: p.mapId,
        });
        break;
      }
      case 'frost_armor': { // маг: ледяная броня — обидчики замерзают
        p.frostArmorT = 60;
        this.fx({ t: 'barrier', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toast(p, '❄ Ледяная броня: 60 с враги, ударившие вблизи, замерзают');
        break;
      }
      case 'combust': { // маг: детонация дотов — сердце реакций
        const tx = p.x + Math.cos(aim) * 110, ty = p.y + Math.sin(aim) * 110;
        let best = null, bd = 100 * 100;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId || (e.dotT || 0) <= 0) continue;
          const d2 = dist2(tx, ty, e.x, e.y);
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (!best) { p.abCd[slot] = 1; this.toast(p, 'Рядом нет горящих или отравленных врагов'); break; }
        const burst = Math.round((best.dotDmg || 1) * best.dotT * 3 * 10) / 10;
        // «Цепная детонация»: дот перекидывается на соседей перед взрывом
        if (this.hasTalent(p, 'ab_combust')) {
          for (const o of this.entities.values()) {
            if (o === best || o.entType !== 'enemy' || o.mapId !== p.mapId) continue;
            if (dist2(best.x, best.y, o.x, o.y) > 60 * 60) continue;
            o.dotT = best.dotT; o.dotDmg = best.dotDmg; o.dotSrc = p.id; o.dotKind = best.dotKind;
          }
        }
        best.dotT = 0;
        this.damageEnemy(best, burst, { vx: 0, vy: 0, knockback: 30, owner: p.id, school: 'magic', fire: true });
        this.fx({ t: 'boom', x: best.x, y: best.y, r: 26 }, p.mapId, best.x, best.y);
        break;
      }
      case 'flash_powder': { // вор: порошок в глаза
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          if (dist2(p.x, p.y, e.x, e.y) > 70 * 70) continue;
          let da = Math.atan2(e.y - p.y, e.x - p.x) - aim;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) <= Math.PI / 2.5) { e.stunT = Math.max(e.stunT || 0, 1.2); e.aggro = true; }
        }
        this.fx({ t: 'poof', x: p.x + Math.cos(aim) * 30, y: p.y + Math.sin(aim) * 30 }, p.mapId, p.x, p.y);
        break;
      }
      case 'poison_blade': { // вор: клинки в яде — вход в ТОКСИН
        p.poisonBladeT = 20;
        this.toast(p, '☠ Клинки отравлены (20 с): атаки вешают яд');
        break;
      }
      case 'evasion': { // вор: пять секунд неуловимости («Скользкий тип» — ещё и скорость)
        p.buffs.evasion = { mult: 0.4, t: 5 };
        if (this.hasTalent(p, 'ab_evasion')) { p.buffs.speed = { mult: 0.3, t: 5 }; this.recomputeStats(p); }
        this.fx({ t: 'dodge', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'mend': { // жрец: свет прикосновения («Тёплые ладони» — сильнее и с барьером)
        const warm = this.hasTalent(p, 'ab_mend');
        let worst = null;
        for (const q of this.players.values()) {
          if (q === p || q.dead || q.mapId !== p.mapId || dist2(p.x, p.y, q.x, q.y) > 60 * 60) continue;
          if (q.hp < q.maxHp && (!worst || q.hp / q.maxHp < worst.hp / worst.maxHp)) worst = q;
        }
        if (worst) {
          worst.hp = Math.min(worst.maxHp, worst.hp + (warm ? 3 : 2));
          if (warm) { worst.shieldHp = Math.max(worst.shieldHp || 0, 1); worst.shieldT = Math.max(worst.shieldT || 0, 5); }
          this.fx({ t: 'heal', pid: worst.id, x: worst.x, y: worst.y }, worst.mapId, worst.x, worst.y);
          this.gainGrace(p);
        } else if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        } else { p.abCd[slot] = 1; this.toast(p, 'Некого лечить'); }
        break;
      }
      case 'radiance': { // жрец: сияние жжёт врагов рядом
        p.radianceT = 6;
        this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
        break;
      }
      case 'penance': { // жрец: луч — кара врагу или лечение союзнику
        const tx = p.x + Math.cos(aim) * 110, ty = p.y + Math.sin(aim) * 110;
        let bestE = null, bde = 80 * 80, bestQ = null, bdq = 80 * 80;
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== p.mapId) continue;
          const d2 = dist2(tx, ty, e.x, e.y);
          if (d2 < bde) { bde = d2; bestE = e; }
        }
        for (const q of this.players.values()) {
          if (q === p || q.dead || q.mapId !== p.mapId || q.hp >= q.maxHp) continue;
          const d2 = dist2(tx, ty, q.x, q.y);
          if (d2 < bdq) { bdq = d2; bestQ = q; }
        }
        if (bestQ && bdq <= bde) { // раненый союзник ближе к прицелу — лечим
          bestQ.hp = Math.min(bestQ.maxHp, bestQ.hp + 2);
          this.fx({ t: 'chain', pts: [[p.x, p.y - 6], [bestQ.x, bestQ.y]] }, p.mapId, p.x, p.y);
          this.fx({ t: 'heal', pid: bestQ.id, x: bestQ.x, y: bestQ.y }, bestQ.mapId, bestQ.x, bestQ.y);
          this.gainGrace(p);
        } else if (bestE) {
          const hot = this.hasTalent(p, 'ab_penance'); // «Раскалённый луч»
          this.fx({ t: 'chain', pts: [[p.x, p.y - 6], [bestE.x, bestE.y]] }, p.mapId, p.x, p.y);
          this.damageEnemy(bestE, Math.round(4 * (d.dmgMagic || 1) * 2 * (hot ? 1.5 : 1) * 10) / 10,
            { vx: 0, vy: 0, knockback: 30, owner: p.id, school: 'magic' });
          if (hot && this.entities.has(bestE.id)) {
            bestE.dotT = 3; bestE.dotDmg = 1; bestE.dotSrc = p.id; bestE.dotKind = 'ignite';
          }
        } else { p.abCd[slot] = 1; this.toast(p, 'Луч не нашёл цели'); }
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
        } else if (pr.life > 0) {
          // пуля упёрлась в стену: бьём тайл по направлению полёта
          // (реквизит данжей пробивается любым снарядом, стены — только structDmg)
          const tx = Math.floor((pr.x + Math.sign(pr.vx) * 6) / TILE);
          const ty = Math.floor((pr.y + Math.sign(pr.vy) * 6) / TILE);
          const tile = this.chunks.tileAt(pr.mapId, tx, ty);
          const structDmg = PROP_TILES.has(tile)
            ? Math.max(pr.structDmg || 0, Math.ceil(pr.dmg)) : (pr.structDmg || 0);
          if (!(structDmg > 0) || !this.damageTile(pr.mapId, tx, ty, structDmg, this.players.get(pr.owner)))
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
        // friendly fire: пули игроков ранят и союзников — целься аккуратно.
        // Исключение — снаряды СВЕТА: попадание в союзника ЛЕЧИТ его
        if (!hit && !pr.guard) {
          for (const q of this.players.values()) {
            if (q.dead || q.mapId !== pr.mapId || q.id === pr.owner) continue;
            if (circlesOverlap(pr.x, pr.y, pr.radius, q.x, q.y, PLAYER_RADIUS)) {
              if (pr.holy) {
                if (q.hp < q.maxHp) {
                  q.hp = Math.min(q.maxHp, q.hp + pr.holy);
                  this.fx({ t: 'heal', pid: q.id, x: q.x, y: q.y }, q.mapId, q.x, q.y);
                  this.gainGrace(this.players.get(pr.owner)); // свет вернулся благодатью
                }
              } else this.damagePlayer(q, pr.dmg, null);
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
        // вражеские снаряды сбивают и призывов игрока
        if (!hit) for (const n of this.entities.values()) {
          if (n.entType !== 'npc' || n.mapId !== pr.mapId) continue;
          if (n.role !== 'elemental' && n.role !== 'mercenary') continue;
          if (circlesOverlap(pr.x, pr.y, pr.radius, n.x, n.y, 5)) {
            this.damageNpc(n, pr.dmg, null);
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
    // Владыка Пепла: существо огня — лёд жжёт его, пламя почти бессильно
    if (defS?.iceWeak && pr) {
      if (pr.fire || pr.fiery) dmg *= 0.4;
      if (pr.chill || pr.slow) dmg *= 1.4;
    }
    // таланты атакующего: казнь, засада, абсолютный ноль, яды и поджог
    const attacker = pr && !pr.isDot ? this.players.get(pr.owner) : null;
    if (attacker) {
      // классовые ресурсы растут от попаданий
      if (attacker.cls === 'warrior' && pr.school === 'melee')
        attacker.rage = Math.min(100, (attacker.rage || 0) + 8);
      // «Кровавая жатва»: удары мили лечат жнеца
      if ((attacker.rageUltT || 0) > 0 && pr.school === 'melee')
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 1);
      if (attacker.cls === 'rogue') {
        attacker.combo = Math.min(5, (attacker.combo || 0) + 1);
        attacker.comboT = 4;
      }
      if (e.hp >= e.maxHp && this.hasTalent(attacker, 'ambush')) dmg *= 1.4;          // Засада
      if (e.hp / (e.maxHp || 1) <= 0.25 && this.hasTalent(attacker, 'execute')) dmg *= 1.5; // Палач
      // ═══ РЕАКЦИИ СТИХИЙ ═══
      // РАСКОЛ: удар ближнего боя по ЗАМОРОЖЕННОМУ — лёд крошится вместе с врагом
      if ((e.chillT || 0) > 0 && pr.school === 'melee') {
        dmg *= this.hasTalent(attacker, 'deepfreeze') ? 1.6 : 1.35;
        e.chillT = 0;
        this.fx({ t: 'react', name: 'РАСКОЛ!', x: e.x, y: e.y - 8 }, e.mapId, e.x, e.y);
      }
      // ПАР: огонь по ЗАМОРОЖЕННОМУ — паровой взрыв по области
      if ((e.chillT || 0) > 0 && (pr.fire || pr.fiery)) {
        e.chillT = 0; e.slowT = 0;
        this.explodeAt(e.mapId, e.x, e.y, Math.round(dmg * 1.5 * 10) / 10, 40, pr.owner, 0);
        this.fx({ t: 'react', name: 'ПАР!', x: e.x, y: e.y - 8 }, e.mapId, e.x, e.y);
        this.fx({ t: 'boom', x: e.x, y: e.y, r: 40 }, e.mapId, e.x, e.y);
      }
      // ТОКСИН: огонь по ОТРАВЛЕННОМУ — токсичная вспышка, яд летит на соседей
      if ((pr.fire || pr.fiery) && e.dotKind === 'venom' && (e.dotT || 0) > 0) {
        dmg += (e.dotDmg || 1) * 4;
        for (const o of this.entities.values()) {
          if (o === e || o.entType !== 'enemy' || o.mapId !== e.mapId) continue;
          if (dist2(e.x, e.y, o.x, o.y) > 50 * 50) continue;
          o.dotT = 3; o.dotDmg = e.dotDmg || 1; o.dotSrc = pr.owner; o.dotKind = 'venom';
        }
        e.dotT = 0;
        this.fx({ t: 'react', name: 'ТОКСИН!', x: e.x, y: e.y - 8 }, e.mapId, e.x, e.y);
      }
      // «Абсолютный ноль» без реакции: просто по замедленному
      if ((e.slowT || 0) > 0 && (e.chillT || 0) <= 0 && this.hasTalent(attacker, 'deepfreeze')) dmg *= 1.35;
      // сет «Ночная тень» (4): удар в спину — враг смотрит прочь от атакующего
      if (attacker.setFlags?.set_backstab) {
        let da = Math.atan2(e.y - attacker.y, e.x - attacker.x) - (e.aim || 0);
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < Math.PI / 3) dmg *= 1.4;
      }
      // «Жажда крови»: заряды недавних убийств
      if (attacker.blT > 0 && attacker.blStacks) dmg *= 1 + 0.04 * attacker.blStacks;
      dmg = Math.round(dmg * 10) / 10;
      // сет «Ледяной чертог» (4): магия студит врагов
      if (pr.school === 'magic' && attacker.setFlags?.set_chill && (e.slowT || 0) <= 0) {
        e.slowT = 1.4; e.slowMult = 0.65;
        e.chillT = Math.max(e.chillT || 0, 1.4);
      }
      // обсидиановое оружие: раны горят
      const aw = this.weapon(attacker);
      if (aw?.burn && pr.school === aw.school) {
        e.dotT = aw.burn.time; e.dotDmg = aw.burn.dmg; e.dotSrc = attacker.id; e.dotKind = 'ignite';
      }
      // стихийный заряд «Раскалённый клинок»: атака поджигает
      if (pr.ignite) {
        e.dotT = Math.max(e.dotT || 0, pr.ignite.time);
        e.dotDmg = Math.max(e.dotDmg || 0, pr.ignite.dmg);
        e.dotSrc = attacker.id; e.dotKind = 'ignite';
      }
      // сет «Волчья стая» (4): ближний бой пускает кровь
      if (pr.school === 'melee' && attacker.setFlags?.set_bleed && (e.dotT || 0) <= 0) {
        e.dotT = 3; e.dotDmg = 1; e.dotSrc = attacker.id; e.dotKind = 'venom';
      }
      // «Ядовитый клинок» вора: атаки травят («Гнилая кровь» — вдвое злее)
      if ((attacker.poisonBladeT || 0) > 0 && (e.dotT || 0) <= 0) {
        e.dotT = 3; e.dotDmg = this.hasTalent(attacker, 'ab_poisonblade') ? 2 : 1;
        e.dotSrc = attacker.id; e.dotKind = 'venom';
      }
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
    // зов подмоги: первый удар — и сородичи поблизости вступают в бой
    if (!e.criedHelp && pr && !pr.isDot) {
      e.criedHelp = true;
      const myFac = ENEMIES[e.kind]?.faction || 'monsters';
      for (const o of this.entities.values()) {
        if (o === e || o.entType !== 'enemy' || o.mapId !== e.mapId || o.aggro) continue;
        if ((ENEMIES[o.kind]?.faction || 'monsters') !== myFac) continue;
        if (dist2(e.x, e.y, o.x, o.y) < 150 * 150) o.aggro = true;
      }
    }
    // замедление льдом (+ метка ЛЬДА для реакций стихий)
    if (pr && pr.slow) { e.slowT = Math.max(e.slowT || 0, pr.slow.time); e.slowMult = pr.slow.mult; }
    if (pr && pr.chill) e.chillT = Math.max(e.chillT || 0, 1.6);
    // яд посоха: вязкий дот (если враг ещё не отравлен/не горит)
    if (pr && pr.poison && (e.dotT || 0) <= 0) {
      e.dotT = pr.poison.time; e.dotDmg = pr.poison.dmg; e.dotSrc = pr.owner; e.dotKind = 'venom';
    }
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
    // характеры народов: Северяне чтят доблесть, Степняки — охоту
    // (тихо, без уведомлений — растущую репутацию видно в P)
    for (const q of gainers) {
      if (e.elite || (def.tier || 1) >= 5) {
        q.valorN = (q.valorN || 0) + 1;
        if (q.valorN % 3 === 0) q.rep.severane = Math.min(100, (q.rep.severane || 0) + 1);
      }
      if (BEAST_KINDS.has(e.kind)) {
        q.huntN = (q.huntN || 0) + 1;
        if (q.huntN % 4 === 0) q.rep.stepnyaki = Math.min(100, (q.rep.stepnyaki || 0) + 1);
      }
    }
    // задание дня: счёт добычи участникам
    const D = this.world.daily;
    if (D?.type === 'hunt' && e.kind === D.kind) {
      for (const q of gainers) {
        if (q.daily?.day !== D.day) q.daily = { day: D.day, n: 0, done: false };
        if (!q.daily.done && ++q.daily.n === D.count)
          this.toast(q, `📋 Задание дня выполнено (${D.count}/${D.count}) — сдай старейшине!`);
      }
    }
    // онбординг: первые победы
    for (const q of gainers) {
      if (q.hintStage === 2 && ++q.hintKills >= 3) q.hintStage = 3; // тихо: игрока ведёт кампания
    }
    // испытание данжей: «Взрывные» рвутся при смерти, владыка — победа
    if (e.volatileM) this.explodeAt(e.mapId, e.x, e.y, 3, 34, null, 0);
    if (this.mplus && e.mapId === this.mplus.mapId && def.archetype === 'boss')
      this.finishMplus(true);
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
      if (item === 'coin') n = Math.ceil(n * 0.6); // мир прижимист: монет поменьше
      else if (this.rand() > 0.6 + dropBonus) continue; // припасы падают не с каждого
      if (item === 'coin' && killer) n = Math.round(n * (killer.derived?.coinMult || 1));
      if (item === 'coin' && killer?.contract) n = Math.round(n * 1.75); // кровавый контракт
      if (item === 'coin' && (killer?.goldUltT || 0) > 0) n *= 2; // «Дым и золото»
      if (item === 'coin' && e.goldMult) n *= e.goldMult; // элита «Золотой»
      if (n > 0) this.spawnDrop(item, n, e.mapId, e.x + (this.rand() - 0.5) * 14, e.y + (this.rand() - 0.5) * 14);
    }
    // элита: дроп экипировки (пореже — вещь должна оставаться событием)
    if (e.elite && this.rand() < 0.28) this.dropRandomGear(e.mapId, e.x, e.y, false, luck + 4);
    // именной зверь из заказа старейшины
    if (e.slayFor) {
      const owner = this.players.get(e.slayFor);
      const sq = owner?.quests.find(q => q.type === 'slay' && q.eid === e.id && !q.done);
      if (sq) this.completeQuestObjective(owner, sq);
    }
    // «Жажда крови»: убийства копят заряды ярости
    if (killer?.procs?.bloodlust) {
      killer.blStacks = Math.min(5, (killer.blT > 0 ? killer.blStacks || 0 : 0) + 1);
      killer.blT = 6;
    }
    // сеты: боссы и чемпионы арены носят части комплектов
    if (def.archetype === 'boss') {
      this.dropSetPiece(e.mapId, e.x + 6, e.y + 6, luck);
      if (this.rand() < 0.25) this.dropRelic(e.mapId, e.x - 8, e.y + 6);
    }
    if (e.arenaChamp) this.dropSetPiece(e.mapId, e.x, e.y, luck);
    // Выжженные земли: элита щеголяет «Пепельным орденом», всякая тварь — оружием огня
    if (e.mapId === 'ash') {
      if (e.elite && this.rand() < 0.25) this.dropSetPiece('ash', e.x, e.y, luck, 'ashorder');
      if (this.rand() < 0.02) this.dropRandomWeapon('ash', e.x, e.y, luck, 1, ['obsidianblade', 'ashstaff']);
      for (const q of gainers) {
        if (q.story?.ash === 1 && e.kind === 'salamander') {
          q.story.ashN = (q.story.ashN || 0) + 1;
          if (q.story.ashN >= 6) { q.story.ash = 2; this.toast(q, '🔥 Саламандры усмирены (6/6) — Огневзор ждёт'); }
        }
      }
    }
    // «Хворь»: Отравитель Богумил повержен
    if (e.plagueBoss) {
      const s2 = this.world.settlements[2];
      if (s2) s2.prosperity = Math.min(100, (s2.prosperity || 0) + 10);
      this.spawnDrop('owl_amulet@e', 1, e.mapId, e.x, e.y, 300);
      this.spawnDrop('coin', 80, e.mapId, e.x + 10, e.y, 300);
      for (const q of gainers) {
        if (q.story?.plague === 3) {
          q.story.plague = 10;
          if (s2) q.rep[s2.faction] = Math.min(100, (q.rep[s2.faction] || 0) + 20);
          this.toast(q, `⚔ Отравитель мёртв. ${s2?.name} снова дышит свободно (+20 репутации)`);
        }
      }
      this.toastAll(`⚔ Отравитель Богумил повержен — хворь в ${s2?.name} отступает!`, true);
      this.events.push(this.world.day, `Отравитель ${s2?.name} казнён путниками`);
    }
    // «Голос болот»: аватар развеян
    if (e.bogAvatar) {
      const s4 = this.world.settlements[4];
      this.dropRelic(e.mapId, e.x, e.y);
      this.spawnDrop('coin', 100, e.mapId, e.x + 10, e.y, 300);
      for (const q of this.players.values()) {
        if (q.story?.bog === 2) {
          q.story.bog = 10;
          if (s4) q.rep[s4.faction] = Math.min(100, (q.rep[s4.faction] || 0) + 20);
          this.toast(q, '✦ Голос болот умолк. Туман рассеивается (+20 репутации)');
        }
      }
      const spot = this.world.bogAltar;
      if (spot) this.chunks.setTile('over', spot.x, spot.y, T.SWAMP); // идол рассыпался
      this.toastAll('✦ Голос болот развеян — топи очистились!', true);
      this.events.push(this.world.day, 'Болотный дух повержен, рыбаки празднуют');
    }
    // ВЛАДЫКА ПЕПЛА повержен: легендарка, сет, вечная слава
    if (e.kind === 'ashLord') {
      this.world.ashLordDead = true;
      this.spawnDrop('weapon:volcanoheart@l', 1, e.mapId, e.x, e.y, 600);
      this.dropSetPiece(e.mapId, e.x + 14, e.y, luck + 4, 'ashorder');
      this.dropRelic(e.mapId, e.x - 14, e.y);
      if (!this.world.ashLordFirst) {
        this.world.ashLordFirst = killer?.name || gainers[0]?.name || '—';
        this.toastAll(`♨♨♨ ${this.world.ashLordFirst} СРАЗИЛ ВЛАДЫКУ ПЕПЛА — первым в истории мира! ♨♨♨`, true);
      } else {
        this.toastAll('♨ Владыка Пепла повержен!', true);
      }
      this.events.push(this.world.day, `Владыка Пепла развеян. Трон пуст — теперь по-настоящему`);
      for (const q of gainers) this.addXp(q, 60); // сверх обычного xp дефа
    }
    // Старший голем повержен — испытание огнеходцев пройдено
    if (e.ashElder) {
      this.ashElderDead = true;
      for (const q of this.players.values())
        if (q.story?.ash === 3) { q.story.ash = 4; this.toast(q, '🗿 Старший голем пал! Огневзор ждёт с наградой'); }
      this.toastAll('🗿 Старший голем Выжженных земель повержен!');
      this.events.push(this.world.day, 'Пал Старший голем Выжженных земель');
    }
    // кампания гл.5: из груди голема выпадает Уголь Первой Тьмы
    if ((e.ashElder || e.mqEmber) && !this.world.mq?.emberDone
      && [...this.players.values()].some(q => q.story?.mq === 5 && q.story.mqS === 1)) {
      this.spawnDrop('first_ember', 1, e.mapId, e.x - 12, e.y, 600);
      this.toastMap(e.mapId, '🔥 Средь обсидиановых осколков тлеет УГОЛЬ ПЕРВОЙ ТЬМЫ');
    }
    // сюжет Творимира: Сердце горы из груди Каменного короля
    if (e.kind === 'rockKing' && gainers.some(q => q.story?.smith === 2)) {
      this.spawnDrop('mountain_heart', 1, e.mapId, e.x, e.y, 300);
      this.toastAll('⛰ Сердце горы выпало из груди Каменного короля!');
    }
    // сюжет Милицы: конвой перебит — Ждан свободен
    if (e.widowFight && this.world.widowFight) {
      const wf = this.world.widowFight;
      if (!wf.ids.some(id => this.entities.has(id))) {
        const savior = this.players.get(wf.pid);
        this.world.widowFight = null;
        if (savior && savior.story?.widow === 3) this.finishWidowGood(savior);
      }
    }
    // узник колодца повержен: трофеи древнего демона
    if (e.wellDemon) {
      this.dropRandomGear(e.mapId, e.x, e.y, true, 5);
      this.spawnDrop('crystal', 4, e.mapId, e.x + 10, e.y, 300);
      this.spawnDrop('coin', 60, e.mapId, e.x - 10, e.y, 300);
      this.toastAll('★ Древний демон колодца развеян — трофеи победителю!');
      this.events.push(this.world.day, 'Узник колодца повержен путниками');
    }
    // мини-босс данжа: роняет ключ от двери босса
    if (e.dropKey) {
      this.spawnDrop('dungeon_key', 1, e.mapId, e.x, e.y);
      this.toastMap(e.mapId, '🗝 Хранитель ключа пал! Дверь босса ждёт');
      // кампания гл.1: в целевом данже хранитель носил Чёрный медальон
      if (this.dungeons.get(e.mapId)?.poi?.id === this.world.mq?.dungeon) {
        this.spawnDrop('black_medallion', 1, e.mapId, e.x + 12, e.y, 600);
        for (const q of this.players.values())
          if (q.mapId === e.mapId && q.story.mq === 1 && q.story.mqS === 0) {
            q.story.mqS = 1;
            this.toast(q, '📜 С хранителя пал ЧЁРНЫЙ МЕДАЛЬОН с чужой печатью. Покажи старейшине');
          }
      }
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
            // заказ «перехватить караван»: заказчик доволен, народы ссорятся
            const rq = attacker.quests?.find(q => q.type === 'raidq' && q.target === tok.faction && !q.done);
            if (rq) {
              this.completeQuestObjective(attacker, rq);
              if (rq.gf && RELATIONS[rq.gf]) {
                RELATIONS[rq.gf][tok.faction] = Math.max(-100, (RELATIONS[rq.gf][tok.faction] || 0) - 8);
                RELATIONS[tok.faction][rq.gf] = RELATIONS[rq.gf][tok.faction];
                this.events.push(this.world.day, `Между ${FACTIONS[rq.gf]?.name} и ${FACTIONS[tok.faction]?.name} растёт вражда`);
              }
            }
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

  // ---------- ранги репутации: пороги 50 и 80 дают награды ----------
  checkRepRanks() {
    const GIFT80 = { severane: 'war_helm@e', ozerny: 'crystal_robe@e', stepnyaki: 'elven_armor@e' };
    for (const p of this.players.values()) {
      p.repRanks = p.repRanks || {};
      for (const f of ['severane', 'ozerny', 'stepnyaki']) {
        const rep = p.rep[f] || 0;
        const rank = rep >= 80 ? 2 : rep >= 50 ? 1 : 0;
        const had = p.repRanks[f] || 0;
        if (rank <= had) continue;
        if (had < 1 && rank >= 1) {
          p.coins += 100;
          this.toast(p, `🎖 «${FACTIONS[f].name}»: ты теперь ЗАЩИТНИК! Дар благодарности: +100 мон.`);
        }
        if (rank >= 2) {
          p.inventory[GIFT80[f]] = (p.inventory[GIFT80[f]] || 0) + 1;
          this.toast(p, `🎖 «${FACTIONS[f].name}»: звание ГЕРОЙ! Дар: ${getItem(GIFT80[f]).name}`);
          this.toastAll(`🎖 ${p.name} — Герой фракции «${FACTIONS[f].name}»!`);
          this.events.push(this.world.day, `${p.name} стал Героем ${FACTIONS[f].name}`);
        }
        p.repRanks[f] = rank;
      }
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
    // Дух-хранитель жреца бережёт от боли
    if (p.buffs.guarded) dmg *= 1 - p.buffs.guarded.mult;
    // Благословение Совета трёх огней: свет хранит на штурме Цитадели
    if (p.story?.mqBlessed && this.world.war?.stage === 3) dmg *= 0.85;
    // уворот от ловкости и экипировки: урон полностью игнорируется
    // («Уклонение» вора добавляет свои 40% на время баффа)
    if (this.rand() < (p.derived?.dodge || 0) + (p.buffs.evasion?.mult || 0)) {
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
    // боль кормит ярость воина
    if (p.cls === 'warrior') p.rage = Math.min(100, (p.rage || 0) + 5);
    // урон вблизи: обоих отбрасывает друг от друга — не залипаем в тушке
    if (source && source.x !== undefined && dist2(p.x, p.y, source.x, source.y) < 40 * 40) {
      const a = Math.atan2(p.y - source.y, p.x - source.x);
      const map = this.mapFor(p.mapId);
      moveWithCollision(p, Math.cos(a) * 22, Math.sin(a) * 22, PLAYER_RADIUS, map);
      if (source.entType === 'enemy') {
        const def = ENEMIES[source.kind];
        moveWithCollision(source, -Math.cos(a) * 10, -Math.sin(a) * 10, def?.radius || 5, map);
        // Шипастый доспех (талант/реликвия): возмездие за удар вблизи
        // «Ледяная броня» мага: обидчик замерзает
        if ((p.frostArmorT || 0) > 0) {
          source.chillT = Math.max(source.chillT || 0, 1.6);
          source.slowT = Math.max(source.slowT || 0, 1.6);
          source.slowMult = 0.6;
        }
        const thorn = (this.hasTalent(p, 'thorns3') ? 3 : this.hasTalent(p, 'thorns') ? 1 : 0)
          + (p.procs?.thorns?.dmg || 0);
        if (thorn > 0)
          this.damageEnemy(source, thorn,
            { vx: -Math.cos(a), vy: -Math.sin(a), knockback: 30, owner: p.id, school: 'melee', isDot: true });
      }
    }
    // сет «Пепельный орден» (4): боль отвечает огненной новой
    if (p.setFlags?.set_flamenova && this.rand() < 0.2) {
      this.explodeAt(p.mapId, p.x, p.y, 3, 42, p.id, 0);
      this.fx({ t: 'nova', x: p.x, y: p.y }, p.mapId, p.x, p.y);
    }
    // Последний рубеж: смертельный удар оставляет 1 ХП (раз в 60 с)
    if (p.hp <= 0 && this.hasTalent(p, 'laststand') && (p.lastStandT || 0) <= this.tick) {
      p.hp = 1;
      p.lastStandT = this.tick + 60 * 30;
      p.hurtT = 1.2;
      this.fx({ t: 'dodge', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, '🛡 Последний рубеж: ты устоял на ногах!');
    }
    // «Перо феникса»: раз в 4 минуты вырывает из лап смерти
    if (p.hp <= 0 && p.procs?.phoenix && (p.phoenixT || 0) <= this.tick) {
      p.hp = 3;
      p.phoenixT = this.tick + (p.procs.phoenix.cd || 240) * 30;
      p.hurtT = 1.5;
      this.fx({ t: 'ascend', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, '🪶 Перо феникса вспыхнуло — ты восстал из пепла!');
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
        this.fx({ t: 'loot', pid: p.id, x: p.x, y: p.y, text: ITEM_NAMES[drop.item] || drop.item }, p.mapId, p.x, p.y);
      } else {
        p.inventory[drop.item] = (p.inventory[drop.item] || 0) + drop.count;
        // подбор — летящий текст у героя, а не тост: меньше мельтешения
        this.fx({ t: 'loot', pid: p.id, x: p.x, y: p.y, text: this.itemName(drop.item) + (drop.count > 1 ? ` ×${drop.count}` : '') }, p.mapId, p.x, p.y);
        // сюжет: кольцо погибшего караванщика
        if (drop.item === 'wedding_ring' && p.story.car === 2) {
          p.story.car = 3;
          this.toast(p, '🕯 Кольцо Милоша… Весняна ждёт вестей. Каких — решать тебе');
        }
        // кампания гл.5: Уголь Первой Тьмы подобран
        if (drop.item === 'first_ember' && p.story.mq === 5 && p.story.mqS === 1) {
          p.story.mqS = 2;
          this.world.mq.emberDone = true;
          this.toast(p, '🔥 Уголь обжигает ладонь даже сквозь тряпицу. Неси его Радогосту');
        }
      }
      this.entities.delete(drop.id);
      this.fx({ t: 'pickup', x: drop.x, y: drop.y }, drop.mapId, drop.x, drop.y);
      return;
    }
  }

  // Дроп оружия: редкость зависит от удачи убийцы и источника (boost)
  dropRandomWeapon(mapId, x, y, luck = 0, boost = 0, customPool = null) {
    const pool = customPool || ['axe', 'huntbow', 'crossbow', 'knives', 'firestaff', 'froststaff',
      'fireball', 'stormstaff', 'spear', 'warhammer', 'dagger', 'taxes', 'venomstaff', 'bombs',
      'mace', 'flail', 'morningstar', 'greatsword', 'halberd'];
    const rar = rollRarity(this.rand, luck, boost);
    this.spawnDrop('weapon:' + withRarity(pick(this.rand, pool), rar), 1, mapId, x, y);
  }

  // Часть сета (минимум редкая): с боссов, чемпионов и элиты Выжженных земель
  dropSetPiece(mapId, x, y, luck = 0, setId = null) {
    const sid = setId || pick(this.rand, Object.keys(SET_PIECES));
    const piece = pick(this.rand, SET_PIECES[sid]);
    this.spawnDrop(withRarity(piece, rollRarity(this.rand, luck, 2)), 1, mapId, x, y, 300);
  }

  // Реликвия с уникальным свойством — всегда эпик
  dropRelic(mapId, x, y) {
    const RELICS = ['storm_amulet', 'phoenix_amulet', 'rime_ring', 'blood_ring', 'thorn_armor', 'wind_legs'];
    this.spawnDrop(pick(this.rand, RELICS) + '@e', 1, mapId, x, y, 300);
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
      const d = generateDungeon(hash2(this.world.seed, poi.x, poi.y), poi.difficulty, poi.boss, 1, poi.name);
      this.dungeons.set(mapId, { dungeon: d, poi });
      this.chunks.dungeons.set(mapId, d);
      this.populateDungeon(mapId, d);
    }
    const { dungeon } = this.dungeons.get(mapId);
    p.mapId = mapId;
    p.x = dungeon.entrance.x * TILE + 8;
    p.y = (dungeon.entrance.y - 1) * TILE + 8;
    this.sendMapChange(p, poi.name + (dungeon.cursed ? ' [ПРОКЛЯТО]' : ''));
    if (dungeon.cursed) this.toast(p, '⚠ Проклятое подземелье: все враги — элита, но добыча щедрее');
  }

  // обитатели свежего этажа: пленники, гоблин-барыга, дозор в коридорах
  populateDungeon(mapId, d) {
    for (const room of d.rooms) {
      if (room.prisoner) { // пленники в тюремных клетках ждут спасителя
        const id = this.spawnNpc('prisoner', null, mapId, room.prisoner.x * TILE + 8, room.prisoner.y * TILE + 8);
        const n = this.entities.get(id);
        if (n) { n.name = pick(this.rand, NPC_NAMES); n.hp = n.maxHp = 8; }
      }
      if (room.goblin) { // трусливый барыга: торгует втридорога там, куда лавки не доедут
        const id = this.spawnNpc('dgtrader', null, mapId, room.goblin.x * TILE + 8, room.goblin.y * TILE + 8, { kind: 'npc_goblin' });
        const n = this.entities.get(id);
        if (n) { n.name = 'Сквиз'; n.hp = n.maxHp = 10; }
      }
    }
    if (d.patrol) { // дозор ходит меж комнат — засада или встречный бой
      const [w0, w1] = d.patrol.route;
      const dx = Math.sign(w1.x - w0.x), dy = Math.sign(w1.y - w0.y);
      for (let i = 0; i < d.patrol.kinds.length; i++) {
        // растягиваем группу вдоль маршрута; в стену не ставим
        let ex = w0.x * TILE + 8 + dx * i * 12, ey = w0.y * TILE + 8 + dy * i * 12;
        if (SOLID.has(this.chunks.tileAt(mapId, Math.floor(ex / TILE), Math.floor(ey / TILE)))) {
          ex = w0.x * TILE + 8; ey = w0.y * TILE + 8;
        }
        this.spawnEnemy(d.patrol.kinds[i], mapId, ex, ey,
          { patrol: d.patrol.route, patrolI: 1, forceElite: d.cursed });
      }
    }
  }

  // лестница вниз: второй этаж — сложнее, мрачнее, богаче
  descendDungeon(p) {
    const inst = this.dungeons.get(p.mapId);
    if (!inst || inst.dungeon.depth >= 2) return;
    const poi = inst.poi;
    const mapId = 'dg:' + poi.id + ':d2';
    if (!this.dungeons.has(mapId)) {
      const d = generateDungeon(hash2(this.world.seed, poi.x, poi.y) + 7, poi.difficulty + 1, true, 2, poi.name);
      this.dungeons.set(mapId, { dungeon: d, poi });
      this.chunks.dungeons.set(mapId, d);
      this.populateDungeon(mapId, d);
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
    const style = this.dungeons.get(p.mapId)?.dungeon.style || null;
    this.fx({ t: 'mapChange', pid: p.id, mapId: p.mapId, x: p.x, y: p.y, title, style }, null);
  }

  checkDungeonRooms() {
    for (const [mapId, inst] of this.dungeons) {
      const { dungeon, poi } = inst;
      const playersHere = [...this.players.values()].filter(p => p.mapId === mapId && !p.dead);
      if (!playersHere.length) continue;
      for (const room of dungeon.rooms) {
        // испытание древних: волна на время, успех — щедрая плата
        if (room.trialIds) {
          const alive = room.trialIds.filter(id => this.entities.has(id));
          if (!alive.length) {
            room.trialIds = null; room.trial.done = true; room.sealedByTrial = false;
            for (const dd of room.doors) this.setDungeonDoor(mapId, dd, false);
            const cx = room.trial.x * TILE + 8, cy = room.trial.y * TILE + 8;
            this.dropRandomGear(mapId, cx + 12, cy + 12, true, 3);
            this.spawnDrop('coin', randInt(this.rand, 18, 35), mapId, cx - 8, cy + 12);
            for (const q of playersHere) this.addXp(q, 30);
            this.fx({ t: 'chest', x: cx, y: cy }, mapId, cx, cy);
            this.toastMap(mapId, '🏆 Испытание пройдено! Древние платят щедро');
            this.events.push(this.world.day, `Испытание древних в ${poi.name} пройдено`);
          } else if (this.tick >= room.trialEnd) {
            room.trialIds = null; room.trial.done = true; room.sealedByTrial = false;
            for (const dd of room.doors) this.setDungeonDoor(mapId, dd, false);
            this.toastMap(mapId, '⌛ Время вышло — плита остыла. Недобитки разбрелись по залам…');
          }
        }
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
          // казарма: с оружейной стойки падает трофей
          if (room.lootWeapon && this.rand() < 0.5) {
            this.dropRandomWeapon(mapId, room.x * TILE + 8, room.y * TILE + 8, 2, 1);
            this.toastMap(mapId, '⚔ На оружейной стойке казармы что-то блеснуло');
          }
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
    // кампания гл.1: гнездо зачищено — медальон находится и без хранителя
    // (страховка для данжей, где хранитель ключа не завёлся)
    if (poi.id === this.world.mq?.dungeon) {
      for (const q of this.players.values())
        if (q.story.mq === 1 && q.story.mqS === 0) {
          q.story.mqS = 1;
          this.toast(q, '📜 Средь трофеев гнезда — ЧЁРНЫЙ МЕДАЛЬОН с чужой печатью. Покажи старейшине');
        }
    }
    // кампания гл.2: логово пало — средь тел связанный Наводчик Тьмы
    const MQ = this.world.mq;
    if (MQ && poi.id === MQ.lair && !MQ.lairDone && !MQ.prisoner) {
      MQ.lairDone = true;
      const id = this.spawnNpc('darkscout', null, 'over', poi.x * TILE + 22, poi.y * TILE + 10, { kind: 'npc_darkscout' });
      const n = this.entities.get(id);
      if (n) { n.name = 'Наводчик Тьмы'; n.hp = n.maxHp = 10; }
      for (const q of this.players.values())
        if (q.story.mq === 2 && q.story.mqS === 1) {
          q.story.mqS = 2;
          this.toast(q, '📜 Средь тел — связанный человек с клеймом Тьмы. Реши его судьбу (E)');
        }
    }
    for (const p of this.players.values()) {
      for (const q of p.quests)
        if (q.type === 'clear' && q.poi === poi.id && !q.done) this.completeQuestObjective(p, q);
      // сюжет Милицы: в разорённом лагере — записка Ждана
      if (poi.type === 'camp' && p.story?.widow === 1) {
        p.story.widow = 2;
        this.toast(p, '🕯 Записка среди хлама: «Ждан. Долговая яма. 150 монет». Он ЖИВ — расскажи Милице!');
      }
    }
  }

  // ---------- живые структуры: временные стены и зоны ----------
  // временный тайл (ледяная стена): запоминает прежний и тает через dur
  setTempTile(mapId, tx, ty, tile, dur) {
    const prev = this.chunks.tileAt(mapId, tx, ty);
    if (SOLID.has(prev) || prev === T.CHEST || prev === T.DUNGEON_EXIT || prev === T.LAVA) return false;
    this.chunks.setTile(mapId, tx, ty, tile);
    this.fx({ t: 'tile', mapId, x: tx, y: ty, tile }, null);
    this.tempTiles.push({ mapId, x: tx, y: ty, prev, until: this.tick + dur * 30 });
    return true;
  }

  stepStructures(dt) {
    // тающие стены
    for (let i = this.tempTiles.length - 1; i >= 0; i--) {
      const t = this.tempTiles[i];
      if (this.tick < t.until) continue;
      if (this.chunks.tileAt(t.mapId, t.x, t.y) === T.ICE_WALL) {
        this.chunks.setTile(t.mapId, t.x, t.y, t.prev);
        this.fx({ t: 'tile', mapId: t.mapId, x: t.x, y: t.y, tile: t.prev }, null);
        this.fx({ t: 'poof', x: t.x * TILE + 8, y: t.y * TILE + 8 }, t.mapId, t.x * TILE, t.y * TILE);
      }
      this.tempTiles.splice(i, 1);
    }
    // зоны: огненный смерч ползёт и жжёт, дым прячет и слепит
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t -= dt;
      if (z.t <= 0) { this.zones.splice(i, 1); continue; }
      if (z.vx || z.vy) {
        const map = this.mapFor(z.mapId);
        const nx = z.x + z.vx * dt, ny = z.y + z.vy * dt;
        if (!map.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) { z.x = nx; z.y = ny; }
        else { z.vx = 0; z.vy = 0; } // упёрся в стену — догорает на месте
      }
      z.tickT = (z.tickT || 0) - dt;
      if (z.tickT > 0) continue;
      z.tickT = z.kind === 'firestorm' ? 0.45 : 0.5;
      if (z.kind === 'firestorm') {
        for (const e of [...this.entities.values()]) {
          if (e.entType !== 'enemy' || e.mapId !== z.mapId) continue;
          if (dist2(z.x, z.y, e.x, e.y) > (z.r + (ENEMIES[e.kind]?.radius || 6)) ** 2) continue;
          this.damageEnemy(e, z.dmg, { vx: 0, vy: 0, knockback: 30, owner: z.owner, school: 'magic' });
          if (this.entities.has(e.id)) { // поджог — вход в реакции
            e.dotT = Math.max(e.dotT || 0, 2); e.dotDmg = Math.max(e.dotDmg || 0, 1);
            e.dotSrc = z.owner; e.dotKind = 'ignite';
          }
        }
        // friendly fire: смерч не разбирает своих (кастера щадит)
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== z.mapId || q.id === z.owner) continue;
          if (dist2(z.x, z.y, q.x, q.y) < (z.r + PLAYER_RADIUS) ** 2) this.damagePlayer(q, 1, { x: z.x, y: z.y });
        }
      } else if (z.kind === 'smoke') {
        for (const q of this.players.values()) {
          if (q.dead || q.mapId !== z.mapId) continue;
          if (dist2(z.x, z.y, q.x, q.y) < z.r * z.r) q.invisT = Math.max(q.invisT || 0, 0.7);
        }
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== z.mapId) continue;
          if (dist2(z.x, z.y, e.x, e.y) < (z.r + 10) ** 2) {
            e.aggro = false; // дым ест глаза
            e.blindT = Math.max(e.blindT || 0, 0.7); // и не даёт снова прицелиться
          }
        }
      }
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
      hermit: 4, wanderer: 4, captain: 4, mastersmith: 4, widow: 4, arenamaster: 4, darkheart: 5,
      dgtrader: 3, prisoner: 3, darkscout: 4,
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
      if (t === T.CHEST && p.mapId === 'ash') { this.openAshChest(p, tx + dx, ty + dy); return; }
      if (t === T.CHEST) { this.openChest(p, tx + dx, ty + dy); return; }
      if (t === T.PORTAL) { this.usePortal(p); return; }
      if (t === T.TOWN_PORTAL) { this.openTownPortal(p, tx + dx, ty + dy); return; }
      // трон Владыки Пепла: статуи у трона в логове големов
      if ((t === T.STATUE || t === T.PILLAR) && p.mapId === 'ash') { this.tryWakeAshLord(p, tx + dx, ty + dy); return; }
      // события подземелий: плита испытания, табличка, проклятая статуя, павший искатель
      if (t === T.PLATE && this.dungeons.has(p.mapId)) { this.startTrial(p, tx + dx, ty + dy); return; }
      if (t === T.PLAQUE && this.dungeons.has(p.mapId)) { this.readPlaque(p, tx + dx, ty + dy); return; }
      if (t === T.STATUE && this.dungeons.has(p.mapId) && this.tryCursedStatue(p, tx + dx, ty + dy)) return;
      if (t === T.BONES && this.dungeons.has(p.mapId) && this.trySeekerLoot(p, tx + dx, ty + dy)) return;
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
        // заброшенный колодец в глуши: из глубины шепчет голос
        const ow = this.world.pois.find(o => o.type === 'oldwell'
          && Math.abs(o.x - (tx + dx)) <= 2 && Math.abs(o.y - (ty + dy)) <= 2);
        if (ow) { this.openWellDialog(p, ow); return; }
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
        // кровавый алтарь святилища в данже: жертва ради силы или добычи
        if (p.mapId !== 'over') {
          const inst = this.dungeons.get(p.mapId);
          if (inst?.dungeon.altarUsed) { this.toast(p, '⛧ Алтарь насытился и молчит'); return; }
          this.sendDialog(p, 'altar', '⛧ Кровавый алтарь',
            ['Камень тёплый на ощупь. Желоба алтаря ждут крови.',
             'Отдай 1 сердце — и тьма заплатит за него…'],
            [{ id: 'altar_power', label: '🗡 Кровь за силу (+20% урона, 90 с)' },
             { id: 'altar_gift', label: '💰 Кровь за добычу (вещь из тайника)' },
             { id: 'close', label: 'Не сегодня' }]);
          return;
        }
        // «Голос болот»: чёрный идол в топи
        const bog = this.world.bogAltar;
        if (bog && Math.abs(bog.x - (tx + dx)) < 2 && Math.abs(bog.y - (ty + dy)) < 2) {
          if (p.story.bog === 1) {
            if ((p.inventory.meat || 0) < 5) { this.toast(p, '🕯 Идол ждёт подношения: 5 сырого мяса'); return; }
            p.inventory.meat -= 5;
            p.story.bog = 2;
            const ax = bog.x * TILE, ay = bog.y * TILE;
            const aid = this.spawnEnemy('necromancer', 'over', ax + 20, ay, { forceElite: true });
            const av = this.entities.get(aid);
            if (av) { av.name = 'Голос болот'; av.bogAvatar = true; av.aggro = true; }
            for (let i = 0; i < 2; i++) this.spawnEnemy('nagaWarrior', 'over', ax - 20 + i * 40, ay + 20, { noElite: true });
            this.fx({ t: 'bloodcast', pid: p.id, x: ax, y: ay }, 'over', ax, ay);
            this.toastMap('over', '⛧ ТОПЬ ВСКИПЕЛА: Голос болот принял облик! Срази его — или коснись идола вновь и прими сделку');
            return;
          }
          if (p.story.bog === 2) { // кровавый пакт: сила навсегда, сердце навсегда
            p.story.bog = 11;
            p.story.bogPact = true;
            for (const e of [...this.entities.values()])
              if (e.bogAvatar || (e.kind === 'nagaWarrior' && dist2(e.x, e.y, bog.x * TILE, bog.y * TILE) < 300 * 300)) {
                this.fx({ t: 'poof', x: e.x, y: e.y }, 'over', e.x, e.y);
                this.entities.delete(e.id);
              }
            this.recomputeStats(p);
            this.fx({ t: 'bloodcast', pid: p.id, x: p.x, y: p.y }, 'over', p.x, p.y);
            this.toast(p, '⛧ ПАКТ ЗАКЛЮЧЁН: −1 сердце навсегда, +10% всего урона навсегда. Болото помнит твоё имя');
            this.events.push(this.world.day, `${p.name} заключил пакт с Голосом болот…`);
            return;
          }
          this.toast(p, 'Идол молчит. Пока.');
          return;
        }
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
    // тайник за треснувшей стеной: каменщики прятали лучшее
    const secret = this.dungeons.get(p.mapId)?.dungeon.secret;
    if (secret && secret.x === tx && secret.y === ty && !secret.opened) {
      secret.opened = true;
      this.dropRandomGear(p.mapId, tx * TILE + 8, ty * TILE + 24, true, luck + 3);
      this.spawnDrop('crystal', 2, p.mapId, tx * TILE + 20, ty * TILE + 8);
      this.addXp(p, 30);
      this.toastMap(p.mapId, `✨ ${p.name} нашёл тайник каменщиков!`);
      this.events.push(this.world.day, `${p.name} отыскал тайник за треснувшей стеной`);
    }
    this.fx({ t: 'chest', x: tx * TILE, y: ty * TILE }, p.mapId, tx * TILE, ty * TILE);
  }

  // ---------- события подземелий ----------
  // Испытание древних: наступил на плиту — двери на замок, волна на время
  startTrial(p, tx, ty) {
    const inst = this.dungeons.get(p.mapId);
    const room = inst?.dungeon.rooms.find(r => r.trial && r.trial.x === tx && r.trial.y === ty);
    if (!room) return;
    if (room.trial.done || room.trialIds) { this.toast(p, 'Плита остыла и молчит'); return; }
    const d = inst.dungeon;
    const kinds = enemiesOfTier(1, Math.min(4, d.difficulty + 1));
    const n = 4 + d.difficulty;
    const ids = [];
    for (let i = 0; i < n; i++) {
      // случайная свободная клетка комнаты
      let ex = room.x, ey = room.y;
      for (let tries = 0; tries < 12; tries++) {
        const cx = room.x + randInt(this.rand, -room.w + 1, room.w - 1);
        const cy = room.y + randInt(this.rand, -room.h + 1, room.h - 1);
        if (!SOLID.has(this.chunks.tileAt(p.mapId, cx, cy))) { ex = cx; ey = cy; break; }
      }
      ids.push(this.spawnEnemy(pick(this.rand, kinds), p.mapId, ex * TILE + 8, ey * TILE + 8,
        { aggro: true, forceElite: d.cursed || i === 0 }));
    }
    room.trialIds = ids.filter(Boolean);
    room.trialEnd = this.tick + 35 * 30;
    room.sealedByTrial = true;
    for (const dd of room.doors) this.setDungeonDoor(p.mapId, dd, true);
    this.fx({ t: 'bloodcast', pid: p.id, x: tx * TILE + 8, y: ty * TILE + 8 }, p.mapId, tx * TILE, ty * TILE);
    this.toastMap(p.mapId, '⚔ ИСПЫТАНИЕ ДРЕВНИХ: перебей волну за 35 секунд — и плита заплатит!');
    this.events.push(this.world.day, `${p.name} принял испытание древних`);
  }

  // Каменная табличка: обрывок летописи подземелья
  readPlaque(p, tx, ty) {
    const inst = this.dungeons.get(p.mapId);
    const pl = inst?.dungeon.plaques?.find(q => q.x === tx && q.y === ty);
    if (!pl) return;
    this.sendDialog(p, 'plaque', '📜 Каменная табличка', pl.lines,
      [{ id: 'close', label: 'Отойти' }]);
  }

  // Проклятая статуя: молитва — благословение или гнев, 50/50
  tryCursedStatue(p, tx, ty) {
    const inst = this.dungeons.get(p.mapId);
    const room = inst?.dungeon.rooms.find(r => r.eventStatue && r.eventStatue.x === tx && r.eventStatue.y === ty);
    if (!room) return false;
    if (room.eventStatue.used) { this.toast(p, '🗿 Статуя молчит. Взгляд её потух'); return true; }
    this.sendDialog(p, 'dstatue:' + tx + ',' + ty, '🗿 Проклятая статуя',
      ['Каменные глаза будто следят за тобой. На постаменте выбито:',
       '«Попроси — и получишь. Но не жалуйся на ответ»'],
      [{ id: 'statue_pray', label: '🙏 Помолиться (как повезёт…)' },
       { id: 'close', label: 'Отойти от греха' }]);
    return true;
  }

  // Павший искатель: кости, записка и добыча предшественника
  trySeekerLoot(p, tx, ty) {
    const inst = this.dungeons.get(p.mapId);
    const room = inst?.dungeon.rooms.find(r => r.seeker && r.seeker.x === tx && r.seeker.y === ty);
    if (!room) return false;
    if (room.seeker.looted) { this.toast(p, 'Прах упокоен. Пусть спит'); return true; }
    room.seeker.looted = true;
    const luck = p.effStats?.lck ?? 0;
    this.spawnDrop('coin', randInt(this.rand, 8, 18), p.mapId, tx * TILE + 8, ty * TILE + 20);
    this.dropRandomGear(p.mapId, tx * TILE + 20, ty * TILE + 8, false, luck + 1);
    if (this.rand() < 0.3) this.dropRandomWeapon(p.mapId, tx * TILE - 4, ty * TILE + 8, luck, 1);
    this.addXp(p, 20);
    const notes = [
      '«Шёл за сокровищем. Нашёл. Не унёс…»',
      '«Если найдёшь меня — передай Милице из деревни, что я пытался»',
      '«Они ходят дозором. Я сосчитал шаги. Ошибся на один»',
      '«Треснувшая стена. За ней. Я слышал звон, но сил уже нет»',
    ];
    this.sendDialog(p, 'seeker', '🕯 Павший искатель',
      ['Среди костей — истлевшая сумка и записка:', pick(this.rand, notes)],
      [{ id: 'close', label: 'Забрать его ношу и идти дальше' }]);
    this.events.push(this.world.day, `${p.name} нашёл останки искателя в подземелье`);
    return true;
  }

  // ---------- Война с Тьмой: эндгейм-кампания ----------
  // Этапы (общие для всего мира): 1 союз фракций -> 2 сбор реликвий ->
  // 3 великий ритуал и штурм -> 4 выбор у Сердца Тьмы -> 10/11 финалы.
  warStep(p) {
    const w = this.world.war, c = this.world.citadel;
    if (!w || !c || c.dead) return;
    // пороги доверия: горькая правда кампании (жрец разоблачён) сплотила
    // Озёрный союз — им хватит 15 вместо 25
    const NEED = {
      severane: 25,
      ozerny: this.world.mq?.priest === 'exposed' ? 15 : 25,
      stepnyaki: 25,
    };
    if (w.stage === 0) {
      w.stage = 1;
      this.toast(p, `⚔ Война началась! Заручись доверием Северян (${NEED.severane}), Озёрного союза (${NEED.ozerny}) и Степняков (${NEED.stepnyaki})`);
      this.toastAll('⚔ ВОЙНА С ТЬМОЙ: старейшины зовут героев объединить фракции!', true);
      this.events.push(this.world.day, `${p.name} поднял знамя Войны с Тьмой`);
    } else if (w.stage === 1) {
      const F = ['severane', 'ozerny', 'stepnyaki'];
      const reps = F.map(f => p.rep[f] || 0);
      if (F.some(f => (p.rep[f] || 0) < NEED[f])) {
        this.toast(p, `⚔ Доверие фракций: Северяне ${reps[0]}/${NEED.severane}, Озёрный союз ${reps[1]}/${NEED.ozerny}, Степняки ${reps[2]}/${NEED.stepnyaki}`);
        return;
      }
      w.stage = 2;
      this.spawnHeartKeeper();
      this.toastAll('⚔ Союз трёх фракций заключён! Для великого ритуала нужны реликвии:', true);
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
      this.toastAll('✦ ВЕЛИКИЙ РИТУАЛ СВЕРШЁН! Врата Чернокаменной Цитадели пали — на штурм!', true);
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
    const LEG = { warrior: 'sunblade', mage: 'dawnstaff', rogue: 'windbow', priest: 'dawnstaff' };
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
      this.toastAll('☀ СЕРДЦЕ ТЬМЫ УНИЧТОЖЕНО! Война окончена — свет победил навсегда', true);
      this.events.push(this.world.day, `${p.name} уничтожил Сердце Тьмы. Цитадель мертва, мир свободен`);
    } else {
      p.inventory['dark_seal@l'] = (p.inventory['dark_seal@l'] || 0) + 1;
      this.toast(p, '🏆 Печать Тьмы [Легендарное] пульсирует у тебя на груди');
      c.owned = true;
      for (const q of grp)
        for (const f of ['severane', 'ozerny', 'stepnyaki'])
          q.rep[f] = Math.max(-100, (q.rep[f] || 0) - 30);
      this.toastAll(`⛧ ${p.name} ПОДЧИНИЛ Сердце Тьмы. Цитадель принадлежит смертному… Люди этого не забудут`, true);
      this.events.push(this.world.day, `${p.name} подчинил Сердце Тьмы — добрые фракции отвернулись от него`);
    }
  }

  // ---------- Арена-колизей: волны, ставки, рекорд сервера ----------
  ensureArena() {
    if (this.dungeons.has('arena')) return;
    const s0 = this.world.settlements[0];
    const d = generateArena();
    this.dungeons.set('arena', { dungeon: d, poi: { entrance: { x: s0.x + 3, y: s0.y + 3 }, name: 'Арена' } });
    this.chunks.dungeons.set('arena', d);
  }

  enterArena(p) {
    if (p.coins < 25) { this.toast(p, STR.notEnoughCoins); return; }
    p.coins -= 25;
    this.ensureArena();
    const d = this.dungeons.get('arena').dungeon;
    p.mapId = 'arena';
    p.x = d.entrance.x * TILE + 8;
    p.y = (d.entrance.y - 2) * TILE + 8;
    this.sendMapChange(p, '⚔ АРЕНА');
    this.toast(p, '⚔ Волны начнутся через мгновение. Выход — через портал');
  }

  // ---------- портальная сеть деревень ----------
  // E у портального камня: выбор деревни, чей камень уже построен
  openTownPortal(p, tx, ty) {
    const here = this.world.settlements.find(s =>
      s.portal && Math.abs(s.portal.x - tx) <= 1 && Math.abs(s.portal.y - ty) <= 1);
    const targets = this.world.settlements.filter(s =>
      s.portal && s !== here && !s.ruined && !s.captured);
    if (!targets.length) {
      this.sendDialog(p, 'tportal', '⌘ Портальный камень',
        ['Камень гудит, но отвечать ему некому:', 'во всех прочих деревнях порталов ещё нет.',
         'Одари их старейшин — и сеть оживёт.'],
        [{ id: 'close', label: 'Отойти' }]);
      return;
    }
    this.sendDialog(p, 'tportal', '⌘ Портальный камень',
      ['Камень гудит, готовый свернуть пространство.', 'Куда перенести тебя?'],
      [...targets.map(s => ({ id: 'tport:' + s.id, label: `⌘ ${s.name} (${FACTIONS[s.faction]?.name || ''})` })),
       { id: 'close', label: 'Остаться' }]);
  }

  // ---------- Испытания данжей (M+): ключ, таймер, модификаторы, рекорд ----------
  // Ключ игрока p.mkey растёт за победу и слабеет за провал. Боривой заводит
  // испытание для всей группы рядом; 8 минут на владыку подземелья.
  startMplus(p) {
    if (this.mplus) { this.toast(p, '⏳ Испытание уже идёт — дождись, пока храбрецы вернутся'); return; }
    const lvl = p.mkey = p.mkey || 1;
    const n = this.mplusN = (this.mplusN || 0) + 1;
    const mapId = 'mp:' + n;
    const name = pick(this.rand, ['Старая шахта', 'Проклятый склеп', 'Тёмная пещера', 'Забытый форт']);
    const d = generateDungeon(hash2(this.world.seed, 7777 + n * 13, lvl),
      Math.min(4, 1 + Math.ceil(lvl / 2)), true, 1, name);
    // модификаторы по уровню ключа: +2 — один, +4 — два, +7 — три
    const MODS = ['frenzy', 'volatile', 'elite', 'horde'];
    const nMods = lvl >= 7 ? 3 : lvl >= 4 ? 2 : lvl >= 2 ? 1 : 0;
    const mods = [];
    for (let i = 0; i < nMods; i++) mods.push(MODS[(lvl + n + i) % MODS.length]);
    if (mods.includes('elite')) d.cursed = true; // все враги — элита (и лут щедрее)
    if (mods.includes('horde')) { // орда: население комнат в полтора раза гуще
      for (const room of d.rooms) {
        const extra = Math.ceil(room.spawns.length / 2);
        for (let i = 0; i < extra; i++) room.spawns.push({ ...room.spawns[i % room.spawns.length] });
      }
    }
    // точка возврата — где стоит группа (у Боривоя)
    this.dungeons.set(mapId, {
      dungeon: d,
      poi: { entrance: { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }, name: `Испытание +${lvl}` },
    });
    this.chunks.dungeons.set(mapId, d);
    this.mplus = { mapId, lvl, mods, party: [], startTick: this.tick, endTick: this.tick + 8 * 60 * 30 };
    this.populateDungeon(mapId, d);
    const MOD_NAMES = { frenzy: 'Бешенство', volatile: 'Взрывные', elite: 'Элита', horde: 'Орда' };
    const modLine = mods.length ? mods.map(m => MOD_NAMES[m]).join(' · ') : 'без модификаторов';
    const fromMap = p.mapId, fx = p.x, fy = p.y; // точка сбора ДО телепортов
    for (const q of [...this.players.values()]) {
      if (q.dead || q.mapId !== fromMap || dist2(q.x, q.y, fx, fy) > 160 * 160) continue;
      this.mplus.party.push(q.id);
      q.mapId = mapId;
      q.x = d.entrance.x * TILE + 8;
      q.y = (d.entrance.y - 1) * TILE + 8;
      this.sendMapChange(q, `⏳ ${name} +${lvl}`);
      this.toast(q, `⏳ 8 минут на владыку подземелья! Модификаторы: ${modLine}`);
    }
    this.events.push(this.world.day, `${p.name} и спутники приняли испытание данжей (+${lvl})`);
  }

  // усиление обитателей испытания: здоровье и урон растут с ключом
  applyMplusMods(e) {
    const { lvl, mods } = this.mplus;
    e.hp = e.maxHp = Math.round(e.maxHp * (1 + 0.12 * (lvl - 1)));
    e.dmgBonus = (e.dmgBonus || 0) + Math.floor(lvl / 3);
    if (mods.includes('frenzy')) e.hasteF = Math.max(e.hasteF || 1, 1.25);
    if (mods.includes('volatile') && ENEMIES[e.kind].archetype !== 'boss') e.volatileM = true;
  }

  finishMplus(win) {
    const M = this.mplus;
    if (!M) return;
    this.mplus = null;
    if (win) {
      const secLeft = Math.max(0, Math.round((M.endTick - this.tick) / 30));
      const inMap = [...this.players.values()].filter(q => q.mapId === M.mapId);
      for (const q of inMap) {
        q.mkey = Math.max(q.mkey || 1, M.lvl + 1);
        q.coins += 50 + M.lvl * 20;
        this.addXp(q, 60 + M.lvl * 25);
        this.dropRandomGear(M.mapId, q.x + 12, q.y + 8, true, (q.effStats?.lck || 0) + M.lvl);
        this.toast(q, `🏆 ИСПЫТАНИЕ +${M.lvl} ПРОЙДЕНО (${Math.floor(secLeft / 60)}:${String(secLeft % 60).padStart(2, '0')} в запасе)! Ключ вырос: +${q.mkey}`);
      }
      if (inMap[0]) this.spawnDrop('crystal', 1 + Math.ceil(M.lvl / 2), M.mapId, inMap[0].x - 10, inMap[0].y + 8, 300);
      const rec = this.world.mplusRecord;
      if (!rec || M.lvl > rec.lvl) {
        this.world.mplusRecord = { lvl: M.lvl, name: inMap.map(q => q.name).join(' + ') || '…', day: this.world.day };
        this.events.push(this.world.day, `Рекорд испытаний данжей: +${M.lvl} — ${this.world.mplusRecord.name}`);
      }
    } else {
      for (const id of M.party) {
        const q = this.players.get(id);
        if (!q) continue;
        q.mkey = Math.max(1, (q.mkey || 1) - 1);
        this.toast(q, `⌛ Испытание провалено. Ключ ослаб: +${q.mkey}`);
        if (q.mapId === M.mapId) this.exitDungeon(q);
      }
      this.events.push(this.world.day, 'Испытание данжей провалено — подземелье поглотило дерзость');
    }
  }

  stepMplus() {
    const M = this.mplus;
    if (!M) return;
    if (this.tick >= M.endTick) { this.finishMplus(false); return; }
    // все покинули испытание (смерть/выход) — засчитываем провал
    if (this.tick > M.startTick + 90 && ![...this.players.values()].some(q => q.mapId === M.mapId && !q.dead))
      this.finishMplus(false);
  }

  // ---------- Выжженные земли: регион за обсидиановым порталом ----------
  ensureAsh() {
    if (this.dungeons.has('ash')) return;
    const d = generateAshlands(this.world.seed);
    this.dungeons.set('ash', { dungeon: d, poi: { entrance: this.world.ashPortal || { x: 60, y: 60 }, name: 'Выжженные земли' } });
    this.chunks.dungeons.set('ash', d);
  }

  usePortal(p) {
    this.ensureAsh();
    const d = this.dungeons.get('ash').dungeon;
    if (p.mapId === 'ash') { // домой
      const back = this.world.ashPortal || { x: 60, y: 60 };
      p.mapId = 'over';
      p.x = back.x * TILE + 8; p.y = (back.y + 2) * TILE + 8;
      this.sendMapChange(p, null);
      return;
    }
    // печать огня: первая настройка стоит 10 кристаллов
    if (!p.story.ashAttuned) {
      if ((p.inventory.crystal || 0) < 10) {
        this.toast(p, '🔥 Портал спит. Печать огня требует 10 кристаллов (единожды)');
        return;
      }
      p.inventory.crystal -= 10;
      p.story.ashAttuned = true;
      this.toast(p, '🔥 Печать настроена! Портал отныне признаёт тебя');
      this.events.push(this.world.day, `${p.name} пробудил обсидиановый портал`);
    }
    p.mapId = 'ash';
    p.x = d.entrance.x * TILE + 8; p.y = (d.entrance.y - 2) * TILE + 8;
    this.sendMapChange(p, '🔥 ВЫЖЖЕННЫЕ ЗЕМЛИ');
    if (!p.story.ashSeen) {
      p.story.ashSeen = true;
      this.toast(p, 'Пепел скрипит под ногами. Лагерь огнеходцев — рядом, дальше — только огонь');
    }
  }

  // ═══ ВЛАДЫКА ПЕПЛА: ритуал пробуждения у пустого трона ═══
  tryWakeAshLord(p, tx, ty) {
    const d = this.dungeons.get('ash')?.dungeon;
    if (!d) return;
    // трон — статуи в логове; нужно стоять в его кольце
    if ((tx - d.lair.x) ** 2 + (ty - d.lair.y) ** 2 > 10 * 10) {
      this.toast(p, 'Обугленный камень. Молчит.');
      return;
    }
    if (this.world.ashLordDead) { this.toast(p, '♨ Трон остыл. Владыка Пепла развеян — навсегда'); return; }
    if (this.ashLordSpawned) { this.toast(p, '♨ Владыка уже восстал — он ЗДЕСЬ'); return; }
    if (!this.ashElderDead) { this.toast(p, '🗿 Трон охраняет Старший голем. Сначала — он'); return; }
    if ((p.inventory.crystal || 0) < 15) {
      this.toast(p, '♨ Трон дремлет. Ритуал пробуждения: 15 кристаллов в тлеющие желоба');
      return;
    }
    p.inventory.crystal -= 15;
    this.ashLordSpawned = true;
    const id = this.spawnEnemy('ashLord', 'ash', d.lair.x * TILE, (d.lair.y - 2) * TILE, { noElite: true });
    const lord = this.entities.get(id);
    if (lord) lord.aggro = true;
    this.fx({ t: 'boom', x: d.lair.x * TILE, y: d.lair.y * TILE, r: 60 }, 'ash', d.lair.x * TILE, d.lair.y * TILE);
    this.toastMap('ash', '♨ ТРОН ВСПЫХНУЛ: ВЛАДЫКА ПЕПЛА ВОССТАЛ! Лёд — его погибель, огонь ему смешон');
    this.toastAll(`♨ ${p.name} пробудил Владыку Пепла — Выжженные земли дрожат!`, true);
    this.events.push(this.world.day, `${p.name} провёл ритуал у трона Владыки Пепла`);
  }

  // сундук ордена в логове големов: реликвия — раз на мир
  openAshChest(p, tx, ty) {
    if (this.world.ashLooted) { this.toast(p, 'Сундук ордена пуст — реликвию уже забрали'); return; }
    this.world.ashLooted = true;
    this.dropRelic('ash', tx * TILE + 8, ty * TILE + 20);
    this.spawnDrop('coin', randInt(this.rand, 30, 50), 'ash', tx * TILE - 4, ty * TILE + 20);
    this.toastAll(`🗿 ${p.name} вскрыл сундук Пепельного ордена!`);
    this.events.push(this.world.day, `${p.name} добыл реликвию из логова големов`);
  }

  // живность региона: держим пустоши населёнными, пока внутри есть герои
  stepAsh() {
    const fighters = [...this.players.values()].filter(q => q.mapId === 'ash' && !q.dead);
    if (!fighters.length) return;
    this.ensureAsh();
    const d = this.dungeons.get('ash').dungeon;
    this.hydrateAshCamp(d);
    if (this.tick % 75 !== 0) return; // примерка раз в 2.5 с
    const cap = 12 + 4 * fighters.length;
    let n = 0;
    for (const e of this.entities.values())
      if (e.entType === 'enemy' && e.mapId === 'ash') n++;
    if (n >= cap) return;
    // спавн подальше от глаз, не у лагеря
    const q = pick(this.rand, fighters);
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rand() * Math.PI * 2;
      const r = 220 + this.rand() * 160;
      const tx = Math.floor((q.x + Math.cos(a) * r) / TILE);
      const ty = Math.floor((q.y + Math.sin(a) * r) / TILE);
      if (tx < 3 || ty < 3 || tx > d.size - 3 || ty > d.size - 3) continue;
      if ((tx - d.camp.x) ** 2 + (ty - d.camp.y) ** 2 < 24 * 24) continue;
      if (this.chunks.tileAt('ash', tx, ty) !== T.ASH) continue;
      // взвешенный выбор твари
      const total = ASH_KINDS.reduce((s, [, w]) => s + w, 0);
      let roll = this.rand() * total, kind = ASH_KINDS[0][0];
      for (const [k, w] of ASH_KINDS) { roll -= w; if (roll <= 0) { kind = k; break; } }
      this.spawnEnemy(kind, 'ash', tx * TILE + 8, ty * TILE + 8, { forceElite: this.rand() < 0.07 });
      break;
    }
  }

  // лагерь огнеходцев: люди появляются, когда рядом герой
  hydrateAshCamp(d) {
    if (this.ashCampIds?.some(id => this.entities.has(id))) return;
    const near = [...this.players.values()].some(q =>
      q.mapId === 'ash' && dist2(q.x, q.y, d.camp.x * TILE, d.camp.y * TILE) < 500 * 500);
    if (!near) return;
    const cx = d.camp.x * TILE, cy = d.camp.y * TILE;
    this.ashCampIds = [
      this.spawnNpc('ashtrader', null, 'ash', cx - 4 * TILE, cy - 1 * TILE, { kind: 'npc_merchant' }),
      this.spawnNpc('enchanter', null, 'ash', cx + 4 * TILE, cy - 1 * TILE, { kind: 'npc_priest' }),
      this.spawnNpc('firewalker', null, 'ash', cx, cy - 3 * TILE, { kind: 'npc_guard' }),
    ];
    const names = ['Жарох', 'Искра', 'Огневзор'];
    this.ashCampIds.forEach((id, i) => { const n = this.entities.get(id); if (n) { n.name = names[i]; n.hp = n.maxHp = 40; } });
    // логово: Старший голем ждёт бросивших вызов (возрождается с перезапуском мира)
    if (!this.ashElderDead && !this.ashElderSpawned) {
      this.ashElderSpawned = true;
      const gid = this.spawnEnemy('magmaGolem', 'ash', d.lair.x * TILE, d.lair.y * TILE, { forceElite: true });
      const g = this.entities.get(gid);
      if (g) { g.ashElder = true; g.name = 'Старший голем'; g.hp = g.maxHp = Math.round(g.maxHp * 1.6); }
      for (let i = 0; i < 2; i++)
        this.spawnEnemy('magmaGolem', 'ash', (d.lair.x - 4 + i * 8) * TILE, (d.lair.y + 3) * TILE, { noElite: true });
    } else if (this.ashElderDead && !this.world.mq?.emberDone && !this.mqEmberSpawned
      && [...this.players.values()].some(q => q.story?.mq === 5 && q.story.mqS === 1)) {
      // кампания гл.5: голем уже пал — Уголь стережёт Хранитель
      this.mqEmberSpawned = true;
      const gid = this.spawnEnemy('magmaGolem', 'ash', d.lair.x * TILE, d.lair.y * TILE, { forceElite: true });
      const g = this.entities.get(gid);
      if (g) { g.mqEmber = true; g.name = 'Хранитель Угля'; g.hp = g.maxHp = Math.round(g.maxHp * 1.4); }
    }
  }

  checkArena() {
    const fighters = [...this.players.values()].filter(q => q.mapId === 'arena' && !q.dead);
    if (!fighters.length) {
      // арена опустела: фиксируем рекорд и сбрасываем
      const A = this.world.arena;
      if (A?.wave > 0) {
        const rec = this.world.arenaRecord || { wave: 0, name: '—' };
        if (A.cleared > rec.wave) {
          this.world.arenaRecord = { wave: A.cleared, name: A.lastName || '—' };
          this.toastAll(`🏛 НОВЫЙ РЕКОРД АРЕНЫ: волна ${A.cleared} (${A.lastName || '—'})!`);
          this.events.push(this.world.day, `Рекорд арены: ${A.lastName} выстоял ${A.cleared} волн`);
        }
        for (const id of A.ids) this.entities.delete(id);
        this.world.arena = null;
      }
      return;
    }
    const A = this.world.arena = this.world.arena || { wave: 0, cleared: 0, ids: [], spawnT: 0 };
    A.lastName = fighters[0].name;
    A.ids = A.ids.filter(id => this.entities.has(id));
    if (A.ids.length) return; // волна ещё жива
    // волна зачищена: награда сразу, следующая — после передышки
    if (A.wave > 0 && A.cleared < A.wave) {
      A.cleared = A.wave;
      const prize = 8 + A.wave * 4;
      for (const q of fighters) { q.coins += prize; this.toast(q, `🏛 Волна ${A.wave} выстояна: +${prize} мон.`); }
    }
    A.spawnT -= TICK_DT;
    if (A.spawnT > 0) return;
    A.wave++;
    A.spawnT = 3;
    // состав волны: тир и число растут; каждая 5-я — чемпион
    const d = this.dungeons.get('arena').dungeon;
    const cx = d.size / 2 * TILE, cy = d.size / 2 * TILE;
    const champWave = A.wave % 5 === 0;
    const maxTier = Math.min(4, 1 + Math.floor(A.wave / 3));
    const kinds = enemiesOfTier(Math.max(1, maxTier - 1), maxTier);
    const n = champWave ? 1 : Math.min(9, 2 + Math.ceil(A.wave * 0.8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const kind = champWave ? (A.wave >= 15 ? 'rockKing' : A.wave >= 10 ? 'minotaur' : 'orcWarlord') : pick(this.rand, kinds);
      const id = this.spawnEnemy(kind, 'arena',
        cx + Math.cos(a) * 90, cy + Math.sin(a) * 90,
        { forceElite: champWave || this.rand() < A.wave * 0.02, noElite: false });
      const e = this.entities.get(id);
      if (e) { e.aggro = true; if (champWave) e.arenaChamp = true; A.ids.push(id); }
    }
    this.toastMap('arena', champWave ? `⚔ ВОЛНА ${A.wave}: ЧЕМПИОН АРЕНЫ!` : `⚔ Волна ${A.wave} (${n} врагов)`);
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
    this.toastAll(`✸✸✸ ${p.name} ВОЗНЁССЯ! Смертный стал богом Пограничья ✸✸✸`, true);
    this.toast(p, '✸ Божественная мощь: +4 ко всем атрибутам, +3 сердца, реген, быстрые способности');
    this.events.push(this.world.day, `${p.name} прошёл Ритуал Вознесения и обрёл божественность`);
  }

  // ---------- сюжетные цепочки именных NPC ----------
  // Радогост (отшельник): кристаллы -> зачистить каменный круг -> ВЫБОР:
  // ритуал света (Тьма слабеет) или потребовать силу себе (бой с тенью).
  // ═══════ КАМПАНИЯ «Тень над Пограничьем» — хелперы ═══════
  // целевой данж гл.1: ближайший к стартовой деревне незачищенный
  // (если успели зачистить до медальона — перевыбор)
  mqPickDungeon() {
    const MQ = this.world.mq;
    const cur = this.world.pois.find(o => o.id === MQ.dungeon);
    if (cur && !cur.cleared) return cur;
    const s0 = this.world.settlements[0];
    // хранитель ключа живёт только в данжах С БОССОМ — их и выбираем
    let pool = this.world.pois.filter(o => o.type === 'dungeon' && !o.cleared && o.boss);
    if (!pool.length) pool = this.world.pois.filter(o => o.type === 'dungeon' && !o.cleared);
    pool.sort((a, b) => dist2(a.x, a.y, s0.x, s0.y) - dist2(b.x, b.y, s0.x, s0.y));
    MQ.dungeon = pool[0]?.id || null;
    return pool[0] || null;
  }

  // цель гл.2: незачищенное логово владыки; фолбэк — данж с боссом
  mqPickLair() {
    const MQ = this.world.mq;
    const cur = this.world.pois.find(o => o.id === MQ.lair);
    if (cur && !cur.cleared) return cur;
    const north = this.world.settlements.find(s => s.id === MQ.northId) || this.world.settlements[0];
    const pool = this.world.pois.filter(o => (o.type === 'lair' || (o.type === 'dungeon' && o.boss)) && !o.cleared && o.id !== MQ.dungeon);
    pool.sort((a, b) => dist2(a.x, a.y, north.x, north.y) - dist2(b.x, b.y, north.x, north.y));
    MQ.lair = pool[0]?.id || null;
    return pool[0] || null;
  }

  // «дальняя северная» деревня гл.2: из settlements[3] и [6] дальняя от стартовой
  mqNorth() {
    const MQ = this.world.mq;
    if (MQ.northId) return this.world.settlements.find(s => s.id === MQ.northId);
    const s0 = this.world.settlements[0];
    const cand = [this.world.settlements[3], this.world.settlements[6]].filter(Boolean);
    cand.sort((a, b) => dist2(b.x, b.y, s0.x, s0.y) - dist2(a.x, a.y, s0.x, s0.y));
    const s = cand[0] || s0;
    MQ.northId = s.id;
    return s;
  }

  // точка улики гл.3: тихое место в стороне от пятой деревни
  mqTaintSpot() {
    const MQ = this.world.mq;
    if (MQ.taint) return MQ.taint;
    const s4 = this.world.settlements[4];
    for (let tries = 0; tries < 40; tries++) {
      const a = hash2(this.world.seed, 313, tries) % 628 / 100;
      const r = 16 + (tries % 8);
      const tx = Math.round(s4.x + Math.cos(a) * r), ty = Math.round(s4.y + Math.sin(a) * r);
      if (tx < 20 || ty < 20 || tx > WORLD_TILES - 20 || ty > WORLD_TILES - 20) continue;
      if (!SOLID.has(this.chunks.tileAt('over', tx, ty))) { MQ.taint = { x: tx, y: ty }; break; }
    }
    if (!MQ.taint) MQ.taint = { x: s4.x + 14, y: s4.y + 14 };
    return MQ.taint;
  }

  // координаты текущей цели кампании (тайлы, карта over) — для маркера
  mqTarget(p) {
    const MQ = this.world.mq || {};
    const S = p.story;
    const at = o => (o ? { x: o.x, y: o.y } : null);
    const hermit = () => at(this.world.pois.find(o => o.type === 'hermit'));
    const stl = i => at(this.world.settlements[i]);
    switch (S.mq) {
      case 0: return stl(0); // Ярослава ждёт в стартовой деревне
      case 1:
        if (S.mqS === 0) return at(this.world.pois.find(o => o.id === MQ.dungeon));
        if (S.mqS === 1) return stl(0);
        return hermit();
      case 2: {
        const north = at(this.world.settlements.find(s => s.id === MQ.northId));
        if (S.mqS === 1 || S.mqS === 2) return at(this.world.pois.find(o => o.id === MQ.lair)) || north;
        return north;
      }
      case 3:
        if (S.mqS === 1 && MQ.taint) return MQ.taint;
        return stl(4);
      case 4: return stl(2);
      case 5:
        if (S.mqS === 1) return at(this.world.ashPortal);
        return hermit();
      case 6: return hermit();
      default: return null;
    }
  }

  // текст текущей цели кампании (HUD-строка)
  mqObjective(p) {
    const MQ = this.world.mq || {};
    const S = p.story;
    const sName = id => this.world.settlements.find(x => x.id === id)?.name || 'деревня';
    switch (S.mq) {
      case 0: return 'Пролог · Найди капитана Ярославу в деревне (E)';
      case 1: {
        const d = this.world.pois.find(o => o.id === MQ.dungeon);
        if (S.mqS === 0) return `Гл.1 · Найди гнездо: ${d?.name || 'данж у дорог'}`;
        if (S.mqS === 1) return 'Гл.1 · Покажи медальон старейшине стартовой деревни';
        return 'Гл.1 · Отнеси медальон отшельнику Радогосту';
      }
      case 2: {
        const north = this.world.settlements.find(s => s.id === MQ.northId);
        if (north?.captured) return `Гл.2 · Освободи ${north.name} — Совету нужен её голос`;
        if (S.mqS === 0) return `Гл.2 · Слово Севера: старейшина ${sName(MQ.northId)}`;
        if (S.mqS === 1) return `Гл.2 · Зачисти: ${this.world.pois.find(o => o.id === MQ.lair)?.name || 'логово'}`;
        if (S.mqS === 2) return 'Гл.2 · Реши судьбу Наводчика Тьмы (у логова)';
        return `Гл.2 · Вернись к старейшине ${sName(MQ.northId)}`;
      }
      case 3: {
        const s4 = this.world.settlements[4];
        if (s4?.captured) return `Гл.3 · Освободи ${s4.name}`;
        if (S.mqS === 0) return `Гл.3 · Спроси Тихона о порче (${s4?.name})`;
        if (S.mqS === 1) return 'Гл.3 · Осмотри отравленный родник (метка на карте)';
        return 'Гл.3 · Поговори со жрецом Лютобором';
      }
      case 4: {
        const s2 = this.world.settlements[2];
        if (s2?.captured) return `Гл.4 · Освободи ${s2.name}`;
        return `Гл.4 · Рассуди спор степи: старейшина ${s2?.name}`;
      }
      case 5:
        if (S.mqS === 0) return 'Гл.5 · Спроси Радогоста о силе Тьмы';
        if (S.mqS === 1) return p.story.ashAttuned
          ? 'Гл.5 · Добудь Уголь Первой Тьмы (Старший голем, север Пепла)'
          : 'Гл.5 · Пепел: настрой печать огня (10 кристаллов у портала)';
        return 'Гл.5 · Принеси Уголь Радогосту — и сделай выбор';
      case 6: return 'Гл.6 · Созови Совет трёх огней у Радогоста';
      default: return '';
    }
  }

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
    // ─── кампания: Радогост — сердце «Тени над Пограничьем» ───
    const mq = p.story.mq;
    if (mq >= 1 && st >= 11) lines = ['Радогост хмур — меж вами легла тень. Но долг выше старых обид.'];
    if (mq === 1 && p.story.mqS === 2) {
      lines.push('', 'Взгляд отшельника цепляется за медальон на твоей ладони…');
      ch.unshift({ id: 'story:mq1_rado', label: '📜 Показать чёрный медальон' });
    } else if (mq === 5 && p.story.mqS === 0) {
      ch.unshift({ id: 'story:mq5_go', label: '📜 (Кампания) «Чем ранить Тьму, Радогост?»' });
    } else if (mq === 5 && p.story.mqS === 2 && (p.inventory.first_ember || 0) >= 1) {
      lines.push('', '«Уголь Первой Тьмы… Я чувствую его жар отсюда.',
        'Отдай его мне — и Совет благословит ваш поход.',
        'Но знай: его силу можно вобрать и самому. Тьмой платят за тьму».');
      ch.unshift({ id: 'story:mq5_absorb', label: '⛧ Вобрать силу Угля (+урон навсегда; Радогост отвернётся)' });
      ch.unshift({ id: 'story:mq5_give', label: '📜 Отдать Уголь (Благословение Совета на штурм)' });
    } else if (mq === 6) {
      ch.unshift({ id: 'story:mq6_finish', label: '📜 Созвать Совет трёх огней' });
    }
    if (p.story.mqDark && mq >= 6) lines.push('', 'Радогост смотрит сквозь тебя. От тебя пахнет гарью.');
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
    // ─── кампания гл.1: «Тревожные вести» (ведёт игрока с первой минуты) ───
    if (p.story.mq === 0) {
      lines.push('', '«И ещё одно. С южных застав третий день ни одного гонца.',
        'Разведка нашла гнездо у дорог — но это не Вольница. Глянешь?»');
      ch.unshift({ id: 'story:mq1_accept', label: '📜 (Кампания) Взяться за тревожные вести' });
    } else if (p.story.mq === 1) {
      const d = this.world.pois.find(o => o.id === this.world.mq.dungeon);
      if (p.story.mqS === 0 && d?.cleared) {
        // гнездо уже разорено (в т.ч. до фикса) — Ярослава зачитывает трофеи
        p.story.mqS = 1;
        lines.push('', '«Гнездо уже разорено? Хвалю. Стража перебрала трофеи —',
          'и нашла ЧЁРНЫЙ МЕДАЛЬОН с чужой печатью. Покажи его старейшине»');
      } else if (p.story.mqS === 0 && d) {
        lines.push('', `«Гнездо — ${d.name}. Отметила на карте. Хранитель там носит что-то на шее…»`);
        this.fx({ t: 'marker', pid: p.id, x: d.x, y: d.y }, null);
      } else if (p.story.mqS >= 1) {
        lines.push('', '«Чужая печать?.. Покажи её старейшине — он читал старые книги»');
      }
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

  // Творимир (кузнец-мастер): материалы -> сердце Каменного короля -> ВЫБОР:
  // легендарная ковка себе или дар деревне (ковка дешевле всем навсегда).
  storyDialogSmith(p, npc) {
    const st = p.story.smith;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['«Творимир я. Всю жизнь куюсь к одному — к Молоту гор.',
        'Наковальня готова, руки помнят. Нужны материалы:',
        '8 металла и 2 кристалла. Принесёшь — начнём великое».'];
      ch.push({ id: 'story:smith_accept', label: '⚒ Помочь мастеру (принести 8 металла и 2 кристалла)' });
    } else if (st === 1) {
      if ((p.inventory.metal || 0) >= 8 && (p.inventory.crystal || 0) >= 2) {
        lines = ['«Металл звенит верно, кристаллы чисты. Отдашь?»'];
        ch.push({ id: 'story:smith_give', label: '⚒ Отдать материалы (8 металла, 2 кристалла)' });
      } else {
        lines = [`«Металла ${p.inventory.metal || 0}/8, кристаллов ${p.inventory.crystal || 0}/2.`,
          'Металл — в шахтах и скалах, кристаллы — у болот и в жилах данжей».'];
      }
    } else if (st === 2) {
      if ((p.inventory.mountain_heart || 0) >= 1) {
        lines = ['«Сердце горы! Оно ещё тёплое… Теперь решай:',
          'выкую Молот гор ТЕБЕ — или перестрою кузню деревни,',
          'и всякая ковка в Пограничье станет вдвое дешевле».'];
        ch.push({ id: 'story:smith_hammer', label: '⚒ Молот гор — мне (эпический молот высшей ковки)' });
        ch.push({ id: 'story:smith_boon', label: '🏘 Дар деревне (ковка и перековка вдвое дешевле для всех)' });
      } else {
        lines = ['«Сердцевина. Сердце горы бьётся в груди Каменного короля.',
          'Его трон — в скалах. Убей его, пока сердце горячо».'];
        const lair = this.world.pois.find(o => o.name === 'Трон каменного короля');
        if (lair) this.fx({ t: 'marker', pid: p.id, x: lair.x, y: lair.y }, null);
      }
    } else if (st === 10) {
      lines = ['«Молот гор поёт в твоих руках. Слышишь? Гора помнит»'];
    } else {
      lines = ['«Кузня дышит жаром — весь край куёт дешевле. Спасибо, друг»'];
    }
    ch.push({ id: 'close', label: STR.bye });
    this.sendDialog(p, npc.id, '⚒ Кузнец-мастер Творимир', lines, ch);
  }

  // Милица (вдова караванщика): найти следы -> ВЫБОР: выкуп / отбить / солгать.
  storyDialogWidow(p, npc) {
    const st = p.story.widow;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['«Милица я… Муж мой Ждан с обозом ушёл на юг — и сгинул.',
        'Стража руками разводит. Разбойники что-то знают, чую.',
        'Разори их лагерь — вдруг найдёшь хоть весточку».'];
      ch.push({ id: 'story:widow_accept', label: '🕯 Найти Ждана (разорить лагерь разбойников)' });
    } else if (st === 1) {
      lines = ['«Нашёл что-нибудь? Лагеря их — в глуши, у дорог…»'];
      const camp = this.world.pois.find(o => o.type === 'camp' && !o.cleared);
      if (camp) this.fx({ t: 'marker', pid: p.id, x: camp.x, y: camp.y }, null);
    } else if (st === 2) {
      lines = ['«Записка?! Жив! У бандитов в долговой яме — 150 монет долга…',
        'Выкупить нечем, у меня и медяка не осталось. Что же делать?»'];
      ch.push({ id: 'story:widow_pay', label: '🕯 Выкупить Ждана (150 мон.)' });
      ch.push({ id: 'story:widow_fight', label: '⚔ Отбить силой (бандиты приведут его — и клинки)' });
      ch.push({ id: 'story:widow_lie', label: '🏴 Солгать: «он мёртв» (забрать наследство 120 мон., розыск)' });
    } else if (st === 3) {
      lines = ['«Бандиты уже здесь?! Спаси его — перебей конвой!»'];
    } else if (st === 10) {
      lines = ['«Ждан дома! Отныне в нашей таверне тебе всегда постелено —',
        'отдых для тебя бесплатный. Вечно буду молиться за тебя»'];
    } else {
      lines = ['Она смотрит сквозь тебя пустыми глазами. «Мёртв… значит, мёртв».'];
    }
    ch.push({ id: 'close', label: STR.bye });
    this.sendDialog(p, npc.id, '🕯 Вдова Милица', lines, ch);
  }

  // Голос из колодца: подношения -> ВЫБОР: освободить (бой) или запечатать (дар).
  openWellDialog(p, poi) {
    const st = p.story.well;
    const ch = [];
    let lines;
    if (st === 0) {
      lines = ['Из чёрной глубины поднимается шёпот:',
        '«Голоден… столетия голоден… брось хлеба, путник…»'];
      if ((p.inventory.bread || 0) >= 2) ch.push({ id: 'story:well_feed', label: '🍞 Бросить 2 хлеба в колодец' });
      else lines.push('(нужно 2 хлеба)');
    } else if (st === 1) {
      lines = ['Голос окреп: «Тепло… я вспоминаю себя…',
        'Меня сковали кристаллами. Принеси три — и я покажу, кто я…»'];
      if ((p.inventory.crystal || 0) >= 3) ch.push({ id: 'story:well_crystals', label: '💎 Опустить 3 кристалла' });
      else lines.push('(нужно 3 кристалла)');
    } else if (st === 2) {
      lines = ['Вода кипит. Голос гремит: «ПОСЛЕДНЯЯ ЦЕПЬ! Разбей её — и я свободен!',
        'Или залей металлом горло колодца — и я останусь тут навеки…',
        'Но тогда прими мой дар, тюремщик».'];
      ch.push({ id: 'story:well_free', label: '⛧ Освободить узника (бой с древним демоном, богатый трофей)' });
      if ((p.inventory.metal || 0) >= 5) ch.push({ id: 'story:well_seal', label: '🔒 Запечатать навеки (5 металла; постоянный дар: +1 ИНТ, +1 УДЧ)' });
      else ch.push({ id: 'close2', label: '🔒 Запечатать (нужно 5 металла)' });
    } else if (st === 10) {
      lines = ['Колодец молчит. На дне блестит выжженный круг.'];
    } else {
      lines = ['Металл запечатал глубину. Тёплое благословение гладит тебя по плечу.'];
    }
    ch.push({ id: 'close', label: 'Отойти от колодца' });
    this.sendDialog(p, 'well:' + poi.id, '🕳 Голос из колодца', lines, ch);
  }

  // Добрый финал Милицы: Ждан дома, отдых в таверне навсегда бесплатный
  finishWidowGood(p) {
    p.story.widow = 10;
    p.story.innFree = true;
    const s0 = this.world.settlements[0];
    if (s0) p.rep[s0.faction] = Math.min(100, (p.rep[s0.faction] || 0) + 15);
    this.addXp(p, 80);
    this.toast(p, '🕯✓ Ждан вернулся домой! Отдых в таверне для тебя теперь бесплатный');
    this.toastAll(`🕯 ${p.name} вернул вдове Милице её мужа!`);
  }

  // Развилки сюжета: выборы игрока, меняющие мир
  storyChoice(p, key, dialogId) {
    const S = p.story;
    const MQ = this.world.mq || {};
    switch (key) {
      // ═══ КАМПАНИЯ «Тень над Пограничьем» ═══
      case 'mq1_accept': {
        if (S.mq !== 0) break;
        S.mq = 1; S.mqS = 0;
        const d = this.mqPickDungeon();
        if (d) this.fx({ t: 'marker', pid: p.id, x: d.x, y: d.y, text: d.name }, null);
        this.toast(p, `📜 Глава 1: найди гнездо (${d?.name || 'метка на карте'}) и его хранителя ключа`);
        this.events.push(this.world.day, `${p.name} взялся за тревожные вести Ярославы`);
        break;
      }
      case 'mq1_elder':
        if (S.mq !== 1 || S.mqS !== 1) break;
        S.mqS = 2;
        this.addXp(p, 25);
        {
          const h = this.world.pois.find(o => o.type === 'hermit');
          if (h) this.fx({ t: 'marker', pid: p.id, x: h.x, y: h.y, text: 'Радогост' }, null);
        }
        this.toast(p, '📜 Старейшина бледнеет: «Такое я видел лишь в старых книгах. Неси Радогосту — он ЖИЛ в те годы»');
        break;
      case 'mq1_rado': {
        if (S.mq !== 1 || S.mqS !== 2) break;
        if (p.inventory.black_medallion) {
          p.inventory.black_medallion--;
          if (!p.inventory.black_medallion) delete p.inventory.black_medallion;
        }
        S.mq = 2; S.mqS = 0;
        this.addXp(p, 50);
        const north = this.mqNorth();
        if (north) this.fx({ t: 'marker', pid: p.id, x: north.x, y: north.y, text: north.name }, null);
        this.toast(p, '📜 Радогост: «Печать слуг Первой Тьмы… Она шевелится раньше срока. Собери Совет трёх огней — начни с Севера»');
        this.events.push(this.world.day, 'Радогост опознал печать Тьмы — нужен Совет трёх огней');
        break;
      }
      case 'mq2_task': {
        if (S.mq !== 2 || S.mqS !== 0) break;
        const lair = this.mqPickLair();
        if (lair) {
          S.mqS = 1;
          this.fx({ t: 'marker', pid: p.id, x: lair.x, y: lair.y, text: lair.name }, null);
          this.toast(p, `📜 «Слова — ветер. Зачисти ${lair.name} — и Север скажет своё слово»`);
        } else { // в мире не осталось целей — Север верит на слово
          S.mqS = 3;
          this.toast(p, '📜 «Говоришь, все логова в округе уже пусты?.. Дело говоришь. Север с вами»');
        }
        break;
      }
      case 'mq2_execute': {
        if (MQ.prisoner) { this.toast(p, 'Судьба наводчика уже решена'); break; }
        const scout = this.entities.get(dialogId);
        if (!scout || scout.role !== 'darkscout') break;
        MQ.prisoner = 'dead';
        this.entities.delete(scout.id);
        this.fx({ t: 'poof', x: scout.x, y: scout.y }, 'over', scout.x, scout.y);
        p.rep.severane = Math.min(100, (p.rep.severane || 0) + 8);
        for (const q of this.players.values())
          if (q.story.mq === 2 && q.story.mqS >= 1 && q.story.mqS < 3) q.story.mqS = 3;
        this.toast(p, '📜 Клинок упал. Север таких решений не забывает (+8 репутации Северян)');
        this.events.push(this.world.day, `${p.name} казнил Наводчика Тьмы — Север одобряет`);
        break;
      }
      case 'mq2_free': {
        if (MQ.prisoner) { this.toast(p, 'Судьба наводчика уже решена'); break; }
        const scout = this.entities.get(dialogId);
        if (!scout || scout.role !== 'darkscout') break;
        MQ.prisoner = 'freed';
        // тайник наводчика: дикий сундук неподалёку от логова
        const lair = this.world.pois.find(o => o.id === MQ.lair);
        if (lair) {
          for (let tries = 0; tries < 30 && !MQ.cache; tries++) {
            const a = hash2(this.world.seed, 717, tries) % 628 / 100;
            const tx = Math.round(lair.x + Math.cos(a) * (8 + tries % 5));
            const ty = Math.round(lair.y + Math.sin(a) * (8 + tries % 5));
            if (!SOLID.has(this.chunks.tileAt('over', tx, ty))) {
              MQ.cache = { x: tx, y: ty };
              this.world.wildChests = this.world.wildChests || [];
              this.world.wildChests.push({ x: tx, y: ty, opened: false });
              this.chunks.setTile('over', tx, ty, T.CHEST);
              this.fx({ t: 'tile', mapId: 'over', x: tx, y: ty, tile: T.CHEST }, null);
              this.fx({ t: 'marker', pid: p.id, x: tx, y: ty, text: 'Тайник' }, null);
            }
          }
        }
        this.entities.delete(scout.id);
        this.fx({ t: 'poof', x: scout.x, y: scout.y }, 'over', scout.x, scout.y);
        p.rep.severane = Math.max(-100, (p.rep.severane || 0) - 5);
        for (const q of this.players.values())
          if (q.story.mq === 2 && q.story.mqS >= 1 && q.story.mqS < 3) q.story.mqS = 3;
        this.toast(p, '📜 Наводчик растворился в кустах, шепнув про тайник (метка). Север хмурится (−5)');
        this.events.push(this.world.day, `${p.name} отпустил Наводчика Тьмы за сведения`);
        break;
      }
      case 'mq2_done': {
        if (S.mq !== 2 || (S.mqS !== 3 && !MQ.prisoner)) break;
        S.mq = 3; S.mqS = 0;
        this.addXp(p, 60);
        const s4 = this.world.settlements[4];
        if (s4) this.fx({ t: 'marker', pid: p.id, x: s4.x, y: s4.y, text: s4.name }, null);
        this.toast(p, `📜 «Север помнит дела». Глава 3: озёрные жалуются на порчу — ищи Тихона в ${s4?.name}`);
        break;
      }
      case 'mq3_accept': {
        if (S.mq !== 3 || S.mqS !== 0) break;
        S.mqS = 1;
        const t = this.mqTaintSpot();
        this.fx({ t: 'marker', pid: p.id, x: t.x, y: t.y, text: 'Родник' }, null);
        this.toast(p, '📜 Тихон: «Горчить началось от дальнего родника. Глянь там — я отметил»');
        break;
      }
      case 'mq3_expose': {
        if (MQ.priest) { this.toast(p, 'Судьба жреца уже решена'); break; }
        if (S.mq !== 3 || S.mqS !== 2) break;
        MQ.priest = 'exposed';
        const lb = [...this.entities.values()].find(e => e.mqPriest);
        if (lb) { this.fx({ t: 'poof', x: lb.x, y: lb.y }, 'over', lb.x, lb.y); this.entities.delete(lb.id); }
        p.rep.ozerny = Math.max(-100, (p.rep.ozerny || 0) - 10);
        for (const q of this.players.values()) if (q.story.mq === 3) { q.story.mq = 4; q.story.mqS = 0; }
        const s2c = this.world.settlements[2];
        if (s2c) this.fx({ t: 'marker', pid: p.id, x: s2c.x, y: s2c.y, text: s2c.name }, null);
        this.toastAll('📜 Жрец Лютобор изгнан с позором — он травил воду для Тьмы!', true);
        this.events.push(this.world.day, `${p.name} разоблачил одержимого жреца — озёрные скорбят, но правда дороже`);
        break;
      }
      case 'mq3_cleanse': {
        if (MQ.priest) { this.toast(p, 'Судьба жреца уже решена'); break; }
        if (S.mq !== 3 || S.mqS !== 2) break;
        MQ.priest = 'cleansed';
        const relic = pick(this.rand, ['storm_amulet', 'phoenix_amulet']) + '@e';
        p.inventory[relic] = (p.inventory[relic] || 0) + 1;
        for (const q of this.players.values()) if (q.story.mq === 3) { q.story.mq = 4; q.story.mqS = 0; }
        const s2d = this.world.settlements[2];
        if (s2d) this.fx({ t: 'marker', pid: p.id, x: s2d.x, y: s2d.y, text: s2d.name }, null);
        this.toast(p, `📜 Шёпот изгнан тайно. Лютобор суёт тебе свёрток: ${getItem(relic)?.name}. Но зерно лжи посеяно…`);
        this.events.push(this.world.day, 'Порча в топях утихла. Отчего — молчат');
        break;
      }
      case 'mq4_steppe': case 'mq4_north': case 'mq4_peace': {
        if (MQ.dispute) { this.toast(p, 'Спор уже рассужен'); break; }
        if (S.mq !== 4) break;
        if (key === 'mq4_peace') {
          if (p.coins < 100) { this.toast(p, STR.notEnoughCoins); break; }
          p.coins -= 100;
          MQ.dispute = 'peace';
          RELATIONS.stepnyaki.severane = Math.min(100, (RELATIONS.stepnyaki.severane || 0) + 10);
          RELATIONS.severane.stepnyaki = RELATIONS.stepnyaki.severane;
          p.rep.stepnyaki = Math.min(100, (p.rep.stepnyaki || 0) + 5);
          p.rep.severane = Math.min(100, (p.rep.severane || 0) + 5);
          this.toast(p, '📜 Дары приняты с обеих сторон. Мир в степи — Совет будет полным');
        } else {
          const win = key === 'mq4_steppe' ? 'stepnyaki' : 'severane';
          const lose = win === 'stepnyaki' ? 'severane' : 'stepnyaki';
          MQ.dispute = win === 'stepnyaki' ? 'steppe' : 'north';
          RELATIONS[win][lose] = Math.max(-100, (RELATIONS[win][lose] || 0) - 15);
          RELATIONS[lose][win] = RELATIONS[win][lose];
          p.rep[win] = Math.min(100, (p.rep[win] || 0) + 8);
          p.rep[lose] = Math.max(-100, (p.rep[lose] || 0) - 5);
          this.toast(p, `📜 Ты встал за ${FACTIONS[win].name} (+8). ${FACTIONS[lose].name} запомнят (−5)`);
        }
        S.mq = 5; S.mqS = 0;
        this.addXp(p, 60);
        this.events.push(this.world.day, `${p.name} рассудил спор степи и севера`);
        {
          const h = this.world.pois.find(o => o.type === 'hermit');
          if (h) this.fx({ t: 'marker', pid: p.id, x: h.x, y: h.y, text: 'Радогост' }, null);
        }
        break;
      }
      case 'mq4_after':
        if (S.mq !== 4 || !MQ.dispute) break;
        S.mq = 5; S.mqS = 0;
        this.toast(p, '📜 Степь уже в Совете. Радогост ждёт вестей');
        break;
      case 'mq5_go': {
        if (S.mq !== 5 || S.mqS !== 0) break;
        S.mqS = 1;
        const ap = this.world.ashPortal;
        if (ap) this.fx({ t: 'marker', pid: p.id, x: ap.x, y: ap.y, text: 'Портал' }, null);
        this.toast(p, '📜 «Пепел помнит Первую войну. Принеси Уголь Первой Тьмы — его стережёт Старший голем»');
        break;
      }
      case 'mq5_give':
        if (S.mq !== 5 || S.mqS !== 2 || (p.inventory.first_ember || 0) < 1) break;
        p.inventory.first_ember--;
        if (!p.inventory.first_ember) delete p.inventory.first_ember;
        S.mqBlessed = true;
        S.mq = 6; S.mqS = 0;
        this.addXp(p, 80);
        this.toast(p, '✦ «Совет благословит ваш поход» — на штурме Цитадели тебя укроет свет (−15% урона)');
        this.events.push(this.world.day, `${p.name} отдал Уголь Первой Тьмы Совету`);
        break;
      case 'mq5_absorb':
        if (S.mq !== 5 || S.mqS !== 2 || (p.inventory.first_ember || 0) < 1) break;
        p.inventory.first_ember--;
        if (!p.inventory.first_ember) delete p.inventory.first_ember;
        S.mqDark = true;
        S.mq = 6; S.mqS = 0;
        this.recomputeStats(p);
        this.fx({ t: 'bloodcast', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toast(p, '⛧ Жар растекается по жилам: +5% урона НАВСЕГДА. Радогост молча отворачивается');
        this.events.push(this.world.day, `${p.name} вобрал силу Угля Первой Тьмы…`);
        break;
      case 'mq6_finish': {
        if (S.mq !== 6) break;
        S.mq = 10;
        p.talentPts++;
        p.inventory['council_seal@e'] = (p.inventory['council_seal@e'] || 0) + 1;
        this.addXp(p, 250);
        if (MQ.dispute === 'peace') {
          for (const q of this.players.values())
            for (const f of ['severane', 'ozerny', 'stepnyaki'])
              q.rep[f] = Math.min(100, (q.rep[f] || 0) + 5);
        }
        this.toastAll(`📜 СОВЕТ ТРЁХ ОГНЕЙ СОЗВАН! ${p.name} завершил «Тень над Пограничьем»`, true);
        this.toast(p, '🏆 Награда Совета: +1 очко таланта, Печать Совета и 250 опыта. Впереди — Война');
        this.events.push(this.world.day, `${p.name} собрал Совет трёх огней — Пограничье готово к Войне`);
        if (this.world.war?.stage === 0) this.warStep(p);
        break;
      }
      // испытания огнеходцев (Выжженные земли)
      case 'ash_accept':
        if (!S.ash) { S.ash = 1; S.ashN = 0; this.toast(p, '🔥 Первое испытание: усмири 6 саламандр'); }
        break;
      case 'ash_give':
        if (S.ash === 2 && (p.inventory.crystal || 0) >= 8) {
          p.inventory.crystal -= 8;
          S.ash = 3;
          this.addXp(p, 60);
          this.toast(p, '🔥 Второе испытание пройдено. Осталось последнее: Старший голем на севере');
        }
        break;
      case 'ash_done':
        if ((S.ash === 4) || (S.ash === 3 && this.ashElderDead)) {
          S.ash = 10;
          p.coins += 150;
          this.addXp(p, 120);
          const piece = pick(this.rand, SET_PIECES.ashorder) + '@r';
          p.inventory[piece] = (p.inventory[piece] || 0) + 1;
          this.toast(p, `🔥 Ты — огнеходец! Дар ордена: ${getItem(piece).name} и 150 монет`);
          this.toastAll(`🔥 ${p.name} прошёл испытания огня и принят в огнеходцы!`);
          this.events.push(this.world.day, `${p.name} стал огнеходцем Выжженных земель`);
        }
        break;
      // ═══ ХВОРЬ ═══
      case 'plague_accept':
        if (!S.plague) { S.plague = 1; this.toast(p, '🌿 Принеси Богумилу 8 трав (кусты, поля, аптекари)'); }
        break;
      case 'plague_herbs':
        if (S.plague === 1 && (p.inventory.herb || 0) >= 8) {
          p.inventory.herb -= 8;
          S.plague = 2;
          this.addXp(p, 40);
          this.toast(p, '🌿 Лекарство сварено… Но ночью ты видел: Богумил сыпал что-то В КОЛОДЕЦ');
        }
        break;
      case 'plague_expose': {
        if (S.plague !== 2) break;
        S.plague = 3;
        const s2 = this.world.settlements[2];
        this.world.plagueExposed = true; // знахарь больше не появится в деревне
        const doc = [...this.entities.values()].find(e => e.role === 'plaguedoc');
        if (doc) { this.entities.delete(doc.id); this.fx({ t: 'poof', x: doc.x, y: doc.y }, 'over', doc.x, doc.y); }
        const bx = (s2.x + 8) * TILE, by = (s2.y - 8) * TILE;
        const bossId = this.spawnEnemy('necromancer', 'over', bx, by, { forceElite: true });
        const boss = this.entities.get(bossId);
        if (boss) { boss.name = 'Отравитель Богумил'; boss.plagueBoss = true; boss.aggro = true; }
        for (let i = 0; i < 2; i++) this.spawnEnemy('ghoul', 'over', bx + 20 - i * 40, by + 14, { noElite: true });
        this.toastAll(`⚔ ${p.name} разоблачил отравителя в ${s2.name} — знахарь сбросил личину!`);
        this.events.push(this.world.day, `Знахарь ${s2.name} оказался отравителем`, { x: s2.x, y: s2.y });
        break;
      }
      case 'plague_cover': {
        if (S.plague !== 2) break;
        S.plague = 11;
        p.coins += 150;
        this.addBounty(p, 20, 'сговор с отравителем');
        const s2 = this.world.settlements[2];
        if (s2) s2.population = Math.max(1, s2.population - 1);
        this.toast(p, '🪙 +150 мон. Хворь продолжает косить деревню… но это не твоя забота. Так ведь?');
        this.events.push(this.world.day, `Хворь в ${s2?.name} не отступает — знахарь бессилен…`);
        break;
      }
      // ═══ ПРОПАВШИЙ КАРАВАНЩИК ═══
      case 'car_accept': {
        if (S.car) break;
        S.car = 1;
        const sites = this.carSites();
        if (sites) this.fx({ t: 'marker', pid: p.id, x: sites.crash.x, y: sites.crash.y }, null);
        this.toast(p, '🐎 След начинается у разбитого каравана — метка на карте (M)');
        break;
      }
      case 'car_follow': {
        if (S.car !== 2) break;
        const man = [...this.entities.values()].find(e => e.role === 'lostman');
        if (!man) break;
        man.owner = p.id;
        S.car = 4; // ведём домой
        this.toast(p, '🐎 Милош идёт за тобой. Доведи его до деревни Весняны!');
        break;
      }
      case 'car_truth': {
        if (S.car !== 3 || (p.inventory.wedding_ring || 0) < 1) break;
        delete p.inventory.wedding_ring;
        S.car = 11;
        p.coins += 40;
        this.addXp(p, 60);
        const s3 = this.world.settlements[3];
        if (s3) p.rep[s3.faction] = Math.min(100, (p.rep[s3.faction] || 0) + 15);
        this.toast(p, '🕯 Горькая правда дороже золота: +40 мон., +15 репутации');
        this.events.push(this.world.day, `${p.name} принёс Весняне последнюю весть о муже`);
        break;
      }
      case 'car_lie': {
        if (S.car !== 3 || (p.inventory.wedding_ring || 0) < 1) break;
        delete p.inventory.wedding_ring;
        S.car = 12;
        p.coins += 200;
        this.addBounty(p, 25, 'ложь вдове караванщика');
        this.toast(p, '🪙 +200 мон. на «поиски беглеца». Кольцо ты оставил себе… зачем?');
        this.events.push(this.world.day, 'Весняна нанимает людей искать сбежавшего мужа. Зря.');
        break;
      }
      // ═══ ГОЛОС БОЛОТ ═══
      case 'bog_accept': {
        if (S.bog) break;
        S.bog = 1;
        const spot = this.bogAltarSpot();
        if (spot) {
          this.chunks.setTile('over', spot.x, spot.y, T.DARK_ALTAR);
          this.fx({ t: 'marker', pid: p.id, x: spot.x, y: spot.y }, null);
        }
        this.toast(p, '🕯 Чёрный идол в топи — метка на карте. Возьми 5 сырого мяса');
        break;
      }
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
      // ═══ Творимир ═══
      case 'smith_accept':
        if (S.smith === 0) { S.smith = 1; this.toast(p, '⚒ Творимир: принеси 8 металла и 2 кристалла'); }
        break;
      case 'smith_give':
        if (S.smith === 1 && (p.inventory.metal || 0) >= 8 && (p.inventory.crystal || 0) >= 2) {
          p.inventory.metal -= 8;
          p.inventory.crystal -= 2;
          S.smith = 2;
          this.addXp(p, 50);
          this.toast(p, '⚒ Теперь — Сердце горы: срази Каменного короля (метка на карте)');
          const lair = this.world.pois.find(o => o.name === 'Трон каменного короля');
          if (lair) this.fx({ t: 'marker', pid: p.id, x: lair.x, y: lair.y }, null);
        }
        break;
      case 'smith_hammer': { // Молот гор себе: эпик высшей ковки
        if (S.smith !== 2 || (p.inventory.mountain_heart || 0) < 1) break;
        p.inventory.mountain_heart--;
        S.smith = 10;
        p.inventory['weapon:warhammer@e'] = (p.inventory['weapon:warhammer@e'] || 0) + 1;
        p.weaponUp = p.weaponUp || {};
        p.weaponUp['warhammer@e'] = 3; // выкован сразу до предела
        this.addXp(p, 120);
        this.toast(p, '🏆 МОЛОТ ГОР: эпический молот высшей ковки (+30% урона) — твой');
        this.events.push(this.world.day, `Творимир выковал Молот гор для ${p.name}`);
        break;
      }
      case 'smith_boon': { // дар деревне: ковка дешевле всем и навсегда
        if (S.smith !== 2 || (p.inventory.mountain_heart || 0) < 1) break;
        p.inventory.mountain_heart--;
        S.smith = 11;
        this.world.smithBoon = true;
        const s1 = this.world.settlements[1];
        if (s1) p.rep[s1.faction] = Math.min(100, (p.rep[s1.faction] || 0) + 25);
        this.addXp(p, 150);
        this.toast(p, '🏘 Кузня перестроена! Вся ковка и перековка Пограничья — вдвое дешевле');
        this.toastAll('⚒ Сердце горы бьётся в кузне: ковка вдвое дешевле для всех!');
        this.events.push(this.world.day, `${p.name} отдал Сердце горы кузне — ремесло расцвело`);
        break;
      }
      // ═══ Милица ═══
      case 'widow_accept':
        if (S.widow === 0) { S.widow = 1; this.toast(p, '🕯 Разори лагерь разбойников и ищи следы Ждана'); }
        break;
      case 'widow_pay': { // выкуп
        if (S.widow !== 2) break;
        if (p.coins < 150) { this.toast(p, STR.notEnoughCoins); return; }
        p.coins -= 150;
        this.finishWidowGood(p);
        this.events.push(this.world.day, `${p.name} выкупил Ждана из долговой ямы`);
        break;
      }
      case 'widow_fight': { // отбить силой: конвой приводит Ждана
        if (S.widow !== 2) break;
        S.widow = 3;
        const s0 = this.world.settlements[0];
        this.world.widowFight = { pid: p.id, ids: [] };
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2;
          const id = this.spawnEnemy(i === 0 ? 'banditHeavy' : 'bandit', 'over',
            (s0.x + 20) * TILE + Math.cos(a) * 50, (s0.y + 14) * TILE + Math.sin(a) * 50,
            { faction: 'bandits', forceElite: true, widowFight: true });
          const b = this.entities.get(id);
          if (b) { b.aggro = true; this.world.widowFight.ids.push(id); }
        }
        this.toast(p, '⚔ Конвой с Жданом у восточной окраины — перебей бандитов!');
        this.fx({ t: 'marker', pid: p.id, x: s0.x + 20, y: s0.y + 14 }, null);
        break;
      }
      case 'widow_lie': { // тёмный путь: наследство и грязная совесть
        if (S.widow !== 2) break;
        S.widow = 11;
        p.coins += 120;
        const s0 = this.world.settlements[0];
        if (s0) p.rep[s0.faction] = Math.max(-100, (p.rep[s0.faction] || 0) - 10);
        this.addBounty(p, 20, 'обман вдовы');
        this.toast(p, '🏴 +120 монет «наследства». Ждан сгниёт в яме. Ты уверен, что оно того стоило?');
        this.events.push(this.world.day, `${p.name} сказал вдове, что Ждан мёртв…`);
        break;
      }
      // ═══ Голос из колодца ═══
      case 'well_feed':
        if (S.well === 0 && (p.inventory.bread || 0) >= 2) {
          p.inventory.bread -= 2;
          S.well = 1;
          this.toast(p, '🕳 Хлеб канул во тьму. Голос стал крепче…');
        }
        break;
      case 'well_crystals':
        if (S.well === 1 && (p.inventory.crystal || 0) >= 3) {
          p.inventory.crystal -= 3;
          S.well = 2;
          this.toast(p, '🕳 Вода вскипела. Древняя сила рвётся наружу!');
        }
        break;
      case 'well_free': { // освободить: древний демон вырывается — бой!
        if (S.well !== 2) break;
        S.well = 10;
        const poi = this.world.pois.find(o => o.type === 'oldwell');
        const wx = (poi?.x ?? Math.round(p.x / TILE)) * TILE, wy = (poi?.y ?? Math.round(p.y / TILE)) * TILE;
        const id = this.spawnEnemy('demon', 'over', wx, wy - 20, { forceElite: true, wellDemon: true, noElite: false });
        const d = this.entities.get(id);
        if (d) { d.hp = d.maxHp = 80; d.aggro = true; }
        this.fx({ t: 'boom', x: wx, y: wy, r: 30 }, 'over', wx, wy);
        this.toastAll('⛧ Из заброшенного колодца вырвался древний демон!');
        this.events.push(this.world.day, `${p.name} освободил узника колодца`);
        break;
      }
      case 'well_seal': { // запечатать: постоянный дар духа
        if (S.well !== 2 || (p.inventory.metal || 0) < 5) break;
        p.inventory.metal -= 5;
        S.well = 11;
        S.wellBlessed = true;
        this.recomputeStats(p);
        this.addXp(p, 100);
        this.toast(p, '🔒✨ Колодец запечатан. Дар узника: +1 ИНТ и +1 УДЧ навсегда');
        this.events.push(this.world.day, `${p.name} навеки запечатал Голос из колодца`);
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
          this.syncSettlementNpcs(s, false); // стража прибывает без телепорта жителей
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

  // ═══ цепочка «ХВОРЬ»: знахарь Богумил (деревня 3) ═══
  storyDialogPlague(p, npc) {
    const st = p.story.plague || 0;
    const lines = [];
    const choices = [];
    if (st === 0) {
      lines.push('«Путник! Деревню косит хворь — люди сохнут на глазах.',
        'Я знахарь, но без трав бессилен. Принеси 8 болотных трав —',
        'сварю лекарство, и деревня тебя не забудет»');
      choices.push({ id: 'story:plague_accept', label: '🌿 Помочь знахарю' });
    } else if (st === 1) {
      if ((p.inventory.herb || 0) >= 8) choices.push({ id: 'story:plague_herbs', label: '🌿 Отдать 8 трав' });
      else lines.push(`«Травы, путник, травы! (${p.inventory.herb || 0}/8)»`);
    } else if (st === 2) {
      lines.push('«Лекарство почти готово… Что смотришь так? СЛУХИ? Байки!',
        'Ну… хорошо. Твоя правда: хворь — моих рук дело. Порошок в колодце.',
        'Но и лекарство — моё! Деревня платит, я лечу. Все живы. Почти.',
        'Молчи — и получишь долю. Или что, побежишь звонить в колокол?»');
      choices.push({ id: 'story:plague_expose', label: '⚔ Разоблачить отравителя' });
      choices.push({ id: 'story:plague_cover', label: '🪙 Взять долю и молчать (+150 мон.)' });
    } else if (st === 10) {
      lines.push('…'); // разоблачён и мёртв — сюда не попасть
    } else {
      lines.push('«Тс-с. Мы друг друга поняли». Богумил отсыпает «лекарство» страждущим.');
    }
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, npc.id, '🌿 Знахарь Богумил', lines.length ? lines : ['«Хворь отступает… не так ли?»'], choices);
  }

  // ═══ цепочка «ПРОПАВШИЙ КАРАВАНЩИК»: Весняна (деревня 4) ═══
  // судьба мужа решена сидом мира: жив в плену или погиб в глуши
  carSites() {
    const s = this.world.settlements[3];
    if (!s) return null;
    if (!this.world.carSites) {
      const a1 = (hash2(this.world.seed, 401, 1) % 628) / 100;
      const a2 = a1 + 1.2 + (hash2(this.world.seed, 401, 2) % 100) / 100;
      const spot = (ang, d) => {
        for (let r = d; r > 10; r -= 4) {
          const tx = Math.round(s.x + Math.cos(ang) * r), ty = Math.round(s.y + Math.sin(ang) * r);
          if (tx > 20 && ty > 20 && tx < WORLD_TILES - 20 && ty < WORLD_TILES - 20
            && !SOLID.has(this.chunks.tileAt('over', tx, ty))) return { x: tx, y: ty };
        }
        return { x: s.x + 20, y: s.y + 20 };
      };
      this.world.carSites = {
        crash: spot(a1, 34), trail: spot(a2, 55),
        alive: hash2(this.world.seed, 777, 3) % 2 === 0,
      };
    }
    return this.world.carSites;
  }

  storyDialogCaravan(p, npc) {
    const st = p.story.car || 0;
    const lines = [];
    const choices = [];
    if (st === 0) {
      lines.push('«Мой Милош повёл караван на юг три недели назад…',
        'Ни весточки. Стража руками разводит. Найди его, путник.',
        'Живым или… — она сжимает платок — просто найди»');
      choices.push({ id: 'story:car_accept', label: '🐎 Взяться за поиски' });
    } else if (st === 1) lines.push('«След начинается у южной дороги — метка на твоей карте»');
    else if (st === 2) lines.push('«Следы волочения?.. Иди по ним. Прошу, быстрее!»');
    else if (st === 3) {
      lines.push('Ты кладёшь кольцо на стол. Весняна долго молчит.',
        '«Это его. Скажи мне правду. Какой бы она ни была»');
      choices.push({ id: 'story:car_truth', label: '🕯 Сказать правду: Милош погиб' });
      choices.push({ id: 'story:car_lie', label: '🪙 Солгать: «он сбежал с золотом» (+200 мон.)' });
    } else if (st === 10) lines.push('«Дом снова полон. Ты вернул мне жизнь, путник»');
    else if (st === 11) lines.push('Весняна смотрит сквозь тебя. «Спасибо за правду». В доме тихо.');
    else if (st === 12) lines.push('«Сбежал?! С золотом?! Найму людей — из-под земли достанут…»');
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, npc.id, '🐎 Весняна, жена караванщика', lines, choices);
  }

  storyDialogLostman(p, npc) {
    const foes = [...this.entities.values()].some(e =>
      e.entType === 'enemy' && e.mapId === npc.mapId && dist2(e.x, e.y, npc.x, npc.y) < 200 * 200);
    if (foes) {
      this.sendDialog(p, npc.id, '⛓ Милош, караванщик',
        ['«Тише! Они рядом. Перебей этих псов — и я твой должник»'],
        [{ id: 'close', label: STR.close }]);
      return;
    }
    if (npc.owner) {
      this.sendDialog(p, npc.id, '⛓ Милош', ['«Веди. Я за тобой — только не быстро, ноги затекли»'],
        [{ id: 'close', label: STR.close }]);
      return;
    }
    this.sendDialog(p, npc.id, '⛓ Милош, караванщик',
      ['«Свободен… Хвала небесам! Весняна, поди, извелась.',
       'Проводи меня до дома — одному через глушь не дойти»'],
      [{ id: 'story:car_follow', label: '🐎 «Держись за мной» (проводить домой)' }, { id: 'close', label: STR.close }]);
  }

  // ═══ цепочка «ГОЛОС БОЛОТ»: рыбак Тихон (деревня 5) ═══
  bogAltarSpot() {
    const s = this.world.settlements[4];
    if (!s) return null;
    if (!this.world.bogAltar) {
      let best = { x: s.x + 26, y: s.y + 26 };
      for (let r = 14; r < 60; r += 3) {
        let found = null;
        for (let a = 0; a < 12; a++) {
          const tx = s.x + Math.round(Math.cos(a / 12 * 6.28) * r);
          const ty = s.y + Math.round(Math.sin(a / 12 * 6.28) * r);
          if (baseTile(this.world.seed, tx, ty) === T.SWAMP) { found = { x: tx, y: ty }; break; }
        }
        if (found) { best = found; break; }
      }
      this.world.bogAltar = best;
    }
    return this.world.bogAltar;
  }

  storyDialogBog(p, npc) {
    const st = p.story.bog || 0;
    const lines = [];
    const choices = [];
    if (st === 0) {
      lines.push('«Из топи по ночам ГОЛОС зовёт. Рыба ушла. Сети рвёт…',
        'Старики говорят — болотный дух гневается. Отнеси ему',
        'подношение: 5 сырого мяса к чёрному идолу. Может, уймётся»');
      choices.push({ id: 'story:bog_accept', label: '🕯 Отнести подношение' });
    } else if (st === 1) lines.push(`«Идол в топи — метка на карте. Мяса-то хватает? (${p.inventory.meat || 0}/5)»`);
    else if (st === 2) lines.push('«Ты РАЗБУДИЛ его?! Беги, бей или клянись — но реши это!»');
    else if (st === 10) lines.push('«Туман ушёл! Рыба вернулась! Век тебя помнить будем»');
    else if (st === 11) lines.push('Тихон отшатывается: «Глаза… у тебя болотные глаза. Уходи».');
    // ─── кампания гл.3: «Гниль в топях» ───
    if (p.story.mq === 3 && p.story.mqS === 0) {
      lines.push('', 'Тихон трёт красные глаза: «А вода-то ГОРЧИТ, путник.',
        'Дети хворают. Это не дух — духи так не пахнут…»');
      choices.unshift({ id: 'story:mq3_accept', label: '📜 (Кампания) Спросить о порче в воде' });
    }
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, npc.id, '🎣 Рыбак Тихон', lines, choices);
  }

  // ---------- диалоги / магазин / квесты / слухи ----------
  // NPC помнят знакомых: первая встреча — представление, дальше — приветствие
  // прилавок торговца: ядро + товары народа + эксклюзив за верность (реп 40+)
  shopFor(faction, p) {
    const list = [...SHOP, ...(FACTION_GOODS[faction] || [])];
    if (faction && FACTION_EXCLUSIVE[faction] && (p.rep[faction] || 0) >= 40)
      list.push(FACTION_EXCLUSIVE[faction]);
    return list;
  }

  npcGreeting(p, npc) {
    p.met = p.met || new Set();
    const key = npc.home + ':' + npc.role + ':' + npc.name;
    const faction = this.world.settlements.find(x => x.id === npc.home)?.faction
      || (FACTIONS[npc.home] ? npc.home : null);
    // говор народов: север краток, озёрные обходительны, степняки с прибауткой
    const G = {
      severane: {
        first: `«${npc.name}. Слова — ветер, дела — сталь».`,
        warm: `«${p.name}! Крепка твоя рука — садись к огню».`,
        cold: `«Снова ты. Говори быстро — дел много».`,
      },
      ozerny: {
        first: `«Добро пожаловать, путник. Я — ${npc.name}, к вашим услугам».`,
        warm: `«${p.name}, дорогой гость! Вода нынче тихая — к удаче».`,
        cold: `«А, это вы… Чем можем — поможем».`,
      },
      stepnyaki: {
        first: `«Э-ге-гей! ${npc.name} меня кличут. Конь есть? Нет? Беда!»`,
        warm: `«${p.name}, брат степи! Ветер донёс — ты снова в сёдлах!»`,
        cold: `«Опять пеший ходишь, ${p.name}? Ну, говори».`,
      },
    }[faction];
    if (p.met.has(key)) {
      const warm = (p.rep[faction] || 0) > 30;
      if (G) return warm ? G.warm : G.cold;
      return warm ? `«Рад видеть тебя снова, ${p.name}!»` : `«А, это снова ты, ${p.name}».`;
    }
    p.met.add(key);
    return G ? G.first : `«Будем знакомы — ${npc.name}».`;
  }

  openDialog(p, npc) {
    const s = this.world.settlements.find(x => x.id === npc.home);
    const fname = s ? (FACTIONS[s.faction]?.name || '') : '';
    if (npc.role === 'ashtrader') {
      const items = ASH_SHOP.map((it, i) => ({ i, item: it.item, count: it.count || 0, price: it.price, trend: 0, need: null }));
      this.fx({ t: 'shop', pid: p.id, id: npc.id, name: `${npc.name}, торговец огнеходцев`, greet: '«Огонь всё дорожает, путник. Но и товар — жаркий»', items }, null);
      return;
    }
    if (npc.role === 'dgtrader') {
      const items = DG_SHOP.map((it, i) => ({ i, item: it.item, count: it.count || 0, price: it.price, trend: 1, need: null }));
      this.fx({ t: 'shop', pid: p.id, id: npc.id, name: `${npc.name}, гоблин-барыга`,
        greet: '«Хи-хи! Наверху дешевле, да до верха дожить надо. Плати!»', items }, null);
      return;
    }
    if (npc.role === 'enchanter') {
      const lines = ['Искра, зачарователь огнеходцев',
        '«Неси ЭПИЧЕСКУЮ вещь из сумки, 6 кристаллов и 120 монет —',
        'перекую её в реликвию с истинным даром»'];
      const choices = [];
      for (const [id, n] of Object.entries(p.inventory)) {
        if (n <= 0 || !isGear(id)) continue;
        const it = getItem(id);
        if (it?.rarity !== 'e' || it.proc || it.set) continue;
        if (!RELIC_BY_SLOT[it.slot]) continue;
        choices.push({ id: 'ench:' + id, label: `⚗ ${it.name} → реликвия` });
        if (choices.length >= 6) break;
      }
      if (!choices.length) lines.push('(подойдёт эпический доспех, поножи, кольцо или амулет — не надетые)');
      choices.push({ id: 'close', label: STR.close });
      this.sendDialog(p, npc.id, '⚗ ' + npc.name, lines, choices);
      return;
    }
    if (npc.role === 'firewalker') {
      const st = p.story.ash || 0;
      const lines = ['Огневзор, старший огнеходец'];
      const choices = [];
      if (st === 0) {
        lines.push('«Пустоши испытывают всякого пришельца. Хочешь стать',
          'своим у огня — пройди три испытания. Начнём с малого»');
        choices.push({ id: 'story:ash_accept', label: '🔥 Принять испытания огня' });
      } else if (st === 1) {
        lines.push(`«Усмири саламандр — шесть хвостов (${p.story.ashN || 0}/6).`, 'Они гнездятся в пепле за лагерем»');
      } else if (st === 2) {
        if ((p.inventory.crystal || 0) >= 8) choices.push({ id: 'story:ash_give', label: '💎 Отдать 8 кристаллов' });
        else lines.push(`«Второе: разбей тлеющие жилы и принеси 8 кристаллов (${p.inventory.crystal || 0}/8)»`);
      } else if (st === 3) {
        lines.push('«Последнее: Старший голем. Север, кольцо обсидиана.', 'Бей с фланга — корку спереди не проломить»');
        if (this.ashElderDead) choices.push({ id: 'story:ash_done', label: '🗿 Голем повержен' });
      } else if (st === 4) {
        choices.push({ id: 'story:ash_done', label: '🗿 Испытание пройдено — за наградой' });
      } else {
        lines.push('«Ты — огнеходец, брат огня. Пустоши признали тебя».',
          'Говорят, на севере пустует трон. Кто-то ещё придёт занять его…');
      }
      choices.push({ id: 'close', label: STR.close });
      this.sendDialog(p, npc.id, '🔥 ' + npc.name, lines, choices);
      return;
    }
    if (npc.role === 'darkscout') {
      // кампания гл.2: пленный наводчик ждёт суда
      if (this.world.mq?.prisoner) {
        this.sendDialog(p, npc.id, '🕶 Наводчик Тьмы', ['Суд уже свершён.'], [{ id: 'close', label: 'Уйти' }]);
        return;
      }
      this.sendDialog(p, npc.id, '🕶 Наводчик Тьмы',
        ['Связанный человек с клеймом на шее скалится без страха:',
         '«Я лишь метил дворы да караваны — Тьма платит кристаллами.',
         'Отпусти — покажу их тайник. Слово вора!»'],
        [{ id: 'story:mq2_execute', label: '⚔ Казнить наводчика (Север оценит суровость)' },
         { id: 'story:mq2_free', label: '🪙 Отпустить за тайник (Север нахмурится)' },
         { id: 'close', label: 'Решить позже' }]);
      return;
    }
    if (npc.role === 'prisoner') {
      this.sendDialog(p, npc.id, `⛓ ${npc.name}, пленник`,
        ['«Хвала небесам, живая душа! Меня схватили и бросили в клетку.',
         'Вытащи меня отсюда — родня отблагодарит, клянусь!»'],
        [{ id: 'free_prisoner', label: '⛓ Освободить пленника' }, { id: 'close', label: STR.close }]);
      return;
    }
    if (npc.role === 'plaguedoc') { this.storyDialogPlague(p, npc); return; }
    if (npc.role === 'caravanwife') { this.storyDialogCaravan(p, npc); return; }
    if (npc.role === 'fisherman') { this.storyDialogBog(p, npc); return; }
    if (npc.role === 'lostman') { this.storyDialogLostman(p, npc); return; }
    if (npc.role === 'hermit') { this.storyDialogHermit(p, npc); return; }
    if (npc.role === 'captain') { this.storyDialogCaptain(p, npc); return; }
    if (npc.role === 'wanderer') { this.storyDialogWanderer(p, npc); return; }
    if (npc.role === 'mastersmith') { this.storyDialogSmith(p, npc); return; }
    if (npc.role === 'widow') { this.storyDialogWidow(p, npc); return; }
    if (npc.role === 'arenamaster') {
      const rec = this.world.arenaRecord;
      const mrec = this.world.mplusRecord;
      const mk = p.mkey || 1;
      this.sendDialog(p, npc.id, '🏛 Распорядитель Боривой',
        ['«Арена ждёт храбрецов! А для бывалых — ИСПЫТАНИЯ ДАНЖЕЙ:',
         'подземелье злее обычного, 8 минут на его владыку.',
         'Одолел — ключ растёт, провалил — слабеет. Зови друзей!»',
         rec ? `Рекорд арены: волна ${rec.wave} — ${rec.name}` : 'Рекорд арены не установлен.',
         mrec ? `Рекорд испытаний: ключ +${mrec.lvl} — ${mrec.name}` : 'Испытания ещё никто не прошёл. Стань первым!'],
        [{ id: 'arena_enter', label: '⚔ Выйти на арену (взнос 25 мон.)' },
         { id: 'mplus_start', label: `⏳ Испытание данжей: ключ +${mk} (группа рядом идёт с тобой)` },
         { id: 'close', label: STR.bye }]);
      return;
    }
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
      // структурированный прилавок: ядро + товары народа + эксклюзив за верность
      const faction = s?.faction || (FACTIONS[npc.home] ? npc.home : null);
      const mult = priceMultiplier(s ? p.rep[s.faction] : 0);
      const items = this.shopFor(faction, p).map((it, i) => {
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
      let greet = this.npcGreeting(p, npc);
      if (faction && FACTION_EXCLUSIVE[faction] && (p.rep[faction] || 0) < 40)
        greet += ' «Есть у нас и особый товар — но только для своих (репутация 40)».';
      this.fx({ t: 'shop', pid: p.id, id: npc.id, name: npc.name, greet, items }, null);
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
      // ─── кампания: этапы у старейшин ───
      const MQ = this.world.mq;
      if (s && p.story.mq === 1 && p.story.mqS === 1 && s === this.world.settlements[0])
        choices.push({ id: 'story:mq1_elder', label: '📜 Показать чёрный медальон' });
      if (s && p.story.mq === 2 && s.id === MQ?.northId) {
        if (p.story.mqS === 0)
          choices.push({ id: 'story:mq2_task', label: '📜 (Кампания) Слово для Совета трёх огней' });
        else if (p.story.mqS === 3 || MQ.prisoner)
          choices.push({ id: 'story:mq2_done', label: '📜 Дело сделано — Север идёт в Совет?' });
        else lines.push('«Сначала дело — потом разговоры. Логово ждёт»');
      }
      if (s && p.story.mq === 4 && s === this.world.settlements[2]) {
        if (!MQ?.dispute) {
          lines.push('«Совет? Мы бы рады… Но Север который год травит наши пастбища.',
            'Рассуди по чести — или мирись за нас, коли богат»');
          choices.push({ id: 'story:mq4_steppe', label: '📜 Встать за степь (Север озлобится)' });
          choices.push({ id: 'story:mq4_north', label: '📜 Встать за Север (степь запомнит)' });
          choices.push({ id: 'story:mq4_peace', label: '📜 Примирить дарами (100 мон.)' });
        } else {
          choices.push({ id: 'story:mq4_after', label: '📜 Спор решён — степь идёт в Совет' });
        }
      }
      // портальная сеть: дар героя — и жители возведут портальный камень
      if (s && !s.portal && s.project?.type !== 'portal' && (p.rep[s.faction] || 0) >= 25)
        choices.push({ id: 'portal_fund', label: '⌘ Дар на портальный камень (6 крист., 10 мет., 100 мон.)' });
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
      // задание дня: приём у старейшины
      const D = this.world.daily;
      if (D && p.daily?.day === D.day && p.daily.done) {
        // уже сдано сегодня
      } else if (D) {
        if (D.type === 'hunt') {
          const n = p.daily?.day === D.day ? p.daily.n : 0;
          if (n >= D.count) choices.push({ id: 'daily', label: `📋 Сдать задание дня (${D.name}) — +${D.reward.coins} мон.` });
          else lines.push(`📋 Задание дня: ${D.name} (${n}/${D.count})`);
        } else {
          if ((p.inventory[D.res] || 0) >= D.count) choices.push({ id: 'daily', label: `📋 Сдать задание дня (${D.name}) — +${D.reward.coins} мон.` });
          else lines.push(`📋 Задание дня: ${D.name} (${p.inventory[D.res] || 0}/${D.count})`);
        }
      }
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
          `⚔ Война: заключить союз фракций (репутация ${this.world.mq?.priest === 'exposed' ? '25/15/25' : '25 у всех трёх'})`,
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
        const boon = this.world.smithBoon ? 0.5 : 1;
        const costM = Math.max(1, Math.ceil(3 * (lvl + 1) * boon)), costC = Math.ceil(30 * (lvl + 1) * boon);
        lines.push(`${w.name}${lvl ? ' +' + lvl : ''} → +${(lvl + 1) * 10}% урона`);
        choices.push({ id: 'forge', label: `Улучшить оружие в руках (${costM} металла, ${costC} мон.)` });
      }
      choices.push({ id: 'smithup', label: '⚒ Перековать вещь в высшую редкость…' });
      choices.push({ id: 'smithbrk', label: '🔨 Разобрать вещь на материалы…' });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, `Кузнец ${npc.name}`, [this.npcGreeting(p, npc), ...lines.slice(1)], choices);
    } else if (npc.role === 'priest') {
      // кампания гл.3: жрец Лютобор под подозрением
      if (npc.mqPriest && p.story.mq === 3 && p.story.mqS === 2 && !this.world.mq?.priest) {
        this.sendDialog(p, npc.id, `Жрец ${npc.name}`,
          ['Лютобор встречает тебя слишком широкой улыбкой.',
           '«Порча? Экая беда… Духи гневаются, не иначе». Его пальцы',
           'теребят шнурок на поясе — ТОЧНО ТАКОЙ, как на мешочке с гнилью.'],
          [{ id: 'story:mq3_expose', label: '📜 Разоблачить при всех (изгнание; горькая правда для Совета)' },
           { id: 'story:mq3_cleanse', label: '✦ Очистить тайно у идола (жрец жив; он отблагодарит)' },
           { id: 'close', label: 'Отступить и подумать' }]);
        return;
      }
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
    let cost;
    if (it.rarity === 'c') cost = jewelry ? { crystal: 3, coins: 50 } : { metal: 4, coins: 50 };
    else cost = jewelry ? { crystal: 7, coins: 150 } : { metal: 10, crystal: 2, coins: 150 };
    // дар Творимира: Сердце горы в кузне — всё вдвое дешевле
    if (this.world.smithBoon)
      cost = Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.max(1, Math.ceil(v / 2))]));
    return cost;
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
    if (choice === 'arena_enter') { this.enterArena(p); return; }
    if (choice === 'mplus_start') { this.startMplus(p); return; }
    if (choice === 'portal_fund') {
      // дар на портальный камень: жители строят сами (цив-проект)
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!s || s.portal || s.project?.type === 'portal') return;
      if ((p.rep[s.faction] || 0) < 25) { this.toast(p, 'Тебе не доверяют настолько'); return; }
      if ((p.inventory.crystal || 0) < 6 || (p.inventory.metal || 0) < 10 || p.coins < 100) {
        this.toast(p, 'Нужно: 6 кристаллов, 10 металла и 100 монет'); return;
      }
      const site = findBuildSite(this.world, s, 1, 1, this.rand);
      if (!site) { this.toast(p, '«Негде ставить камень — всё застроено»'); return; }
      p.inventory.crystal -= 6;
      p.inventory.metal -= 10;
      p.coins -= 100;
      s.project = { type: 'portal', progress: 0, ticks: 4, site }; // мастера бросают всё
      this.addXp(p, 40);
      p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + 10);
      this.toast(p, '⌘ Дар принят! Мастера взялись за портальный камень — загляни чуть позже');
      this.events.push(this.world.day, `${p.name} одарил ${s.name} — там возводят портальный камень`);
      return;
    }
    if (choice.startsWith('tport:')) {
      const to = this.world.settlements.find(x => x.id === choice.slice(6));
      if (!to?.portal || to.ruined || to.captured) { this.toast(p, 'Портал на той стороне молчит'); return; }
      p.x = to.portal.x * TILE + 8;
      p.y = (to.portal.y + 1) * TILE + 8;
      this.fx({ t: 'poof', x: p.x, y: p.y }, 'over', p.x, p.y);
      this.toast(p, `⌘ Портал перенёс тебя в ${to.name}`);
      return;
    }
    if (choice === 'free_prisoner') {
      const npc = this.entities.get(dialogId);
      if (!npc || npc.role !== 'prisoner' || npc.mapId !== p.mapId) return;
      this.entities.delete(npc.id);
      this.fx({ t: 'poof', x: npc.x, y: npc.y }, p.mapId, npc.x, npc.y);
      const coins = 25 + Math.floor(this.rand() * 25);
      p.coins += coins;
      this.addXp(p, 35);
      for (const f of ['severane', 'ozerny', 'stepnyaki'])
        p.rep[f] = Math.min(100, (p.rep[f] || 0) + 3);
      if (this.rand() < 0.3) this.dropRandomGear(p.mapId, npc.x, npc.y, false, p.effStats?.lck || 0);
      this.toast(p, `⛓ ${npc.name} свободен! Благодарность родни: +${coins} мон., +3 репутации всех фракций`);
      this.events.push(this.world.day, `${p.name} вызволил пленника ${npc.name} из подземелья`);
      return;
    }
    if (choice === 'statue_pray') {
      // проклятая статуя: дар или гнев — как повезёт
      const m = /^dstatue:(-?\d+),(-?\d+)$/.exec(dialogId);
      const inst = this.dungeons.get(p.mapId);
      if (!m || !inst) return;
      const sx = +m[1], sy = +m[2];
      const room = inst.dungeon.rooms.find(r => r.eventStatue && r.eventStatue.x === sx && r.eventStatue.y === sy);
      if (!room || room.eventStatue.used) return;
      room.eventStatue.used = true;
      if (this.rand() < 0.5) {
        p.buffs.blessed = { mult: 0.25, t: 240 };
        p.hp = Math.min(p.maxHp, p.hp + 2);
        this.recomputeStats(p);
        this.fx({ t: 'levelup', pid: -1, x: p.x, y: p.y }, p.mapId, p.x, p.y);
        this.toast(p, '🗿 Статуя благоволит: +25% урона на 4 мин и +1 сердце');
      } else {
        this.damagePlayer(p, 1, { x: sx * TILE + 8, y: sy * TILE + 8 });
        for (let i = 0; i < 2; i++)
          this.spawnEnemy(inst.dungeon.difficulty >= 3 ? 'ghoul' : 'skeleton', p.mapId,
            sx * TILE + 8 + (i * 2 - 1) * 20, sy * TILE + 20, { aggro: true });
        this.fx({ t: 'bloodcast', pid: p.id, x: sx * TILE + 8, y: sy * TILE + 8 }, p.mapId, p.x, p.y);
        this.toast(p, '🗿 Статуя скалится: из-под плит встают её слуги!');
      }
      this.events.push(this.world.day, `${p.name} помолился проклятой статуе`);
      return;
    }
    if (choice === 'altar_power' || choice === 'altar_gift') {
      const inst = this.dungeons.get(p.mapId);
      if (!inst || inst.dungeon.altarUsed) return;
      if (p.hp <= 2) { this.toast(p, 'Алтарь требует крови, но твоя почти иссякла'); return; }
      inst.dungeon.altarUsed = true;
      p.hp -= 2;
      this.fx({ t: 'bloodcast', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      if (choice === 'altar_power') {
        p.buffs.blessed = { mult: 0.2, t: 90 };
        this.recomputeStats(p);
        this.toast(p, '⛧ Кровь принята: +20% урона на 90 с');
      } else {
        this.dropRandomGear(p.mapId, p.x + 14, p.y, true, (p.effStats?.lck || 0) + 3);
        this.toast(p, '⛧ Кровь принята: алтарь отдаёт добычу прежних жертв');
      }
      this.events.push(this.world.day, `${p.name} принёс жертву тёмному алтарю`);
      return;
    }
    if (choice.startsWith('ench:')) {
      const id = choice.slice(5);
      const it = getItem(id);
      if (!it || (p.inventory[id] || 0) < 1 || it.rarity !== 'e' || it.proc || it.set) return;
      const pool = RELIC_BY_SLOT[it.slot];
      if (!pool) return;
      if ((p.inventory.crystal || 0) < 6 || p.coins < 120) {
        this.toast(p, 'Нужно 6 кристаллов и 120 монет'); return;
      }
      p.inventory[id]--; if (!p.inventory[id]) delete p.inventory[id];
      p.inventory.crystal -= 6; p.coins -= 120;
      const relic = pick(this.rand, pool) + '@e';
      p.inventory[relic] = (p.inventory[relic] || 0) + 1;
      this.fx({ t: 'levelup', pid: -1, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, `⚗ Перековано: ${getItem(relic).name} — ${getItem(relic).procDesc}`);
      this.events.push(this.world.day, `${p.name} выковал реликвию у зачарователя`);
      return;
    }
    if (choice === 'daily') {
      const D = this.world.daily;
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      if (!D || (p.daily?.day === D.day && p.daily.done)) return;
      if (D.type === 'hunt') {
        if ((p.daily?.day === D.day ? p.daily.n : 0) < D.count) return;
      } else {
        if ((p.inventory[D.res] || 0) < D.count) return;
        p.inventory[D.res] -= D.count;
      }
      p.daily = { day: D.day, n: D.count, done: true };
      p.coins += D.reward.coins;
      this.addXp(p, D.reward.xp);
      if (s) p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + D.reward.rep);
      this.toast(p, `📋✓ Задание дня сдано: +${D.reward.coins} мон., +${D.reward.xp} опыта`);
      this.events.push(this.world.day, `${p.name} исполнил задание дня`);
      return;
    }
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
      const npc = this.entities.get(dialogId);
      const s = npc && this.world.settlements.find(x => x.id === npc.home);
      const faction = s?.faction || (npc && FACTIONS[npc.home] ? npc.home : null);
      const stock = npc?.role === 'ashtrader' ? ASH_SHOP : npc?.role === 'dgtrader' ? DG_SHOP
        : this.shopFor(faction, p);
      const it = stock[+choice.split(':')[1]];
      if (!it) return;
      const price = npc?.role === 'ashtrader' || npc?.role === 'dgtrader' ? it.price
        : Math.ceil(it.price * priceMultiplier(s ? p.rep[s.faction] : 0) * scarcityMult(s, it.item, 'buy'));
      if (p.coins < price) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= price;
      if (it.item.startsWith('ammo_')) p.ammo[it.item.slice(5)] = (p.ammo[it.item.slice(5)] || 0) + (it.count || 1);
      else p.inventory[it.item] = (p.inventory[it.item] || 0) + 1;
      this.fx({ t: 'loot', pid: p.id, x: p.x, y: p.y, text: this.itemName(it.item) }, p.mapId, p.x, p.y);
      // Озёрный союз чтит торговлю: сделки с ними греют репутацию вдвое
      if (s) { p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + (s.faction === 'ozerny' ? 2 : 1)); }
      if (p.hintStage === 4) p.hintStage = 5;
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
      const boon = this.world.smithBoon ? 0.5 : 1;
      const costM = Math.max(1, Math.ceil(3 * (lvl + 1) * boon)), costC = Math.ceil(30 * (lvl + 1) * boon);
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
      // благодарность Милицы: отдых бесплатный навсегда
      const cost = p.story?.innFree ? 0 : 15;
      if (p.coins < cost) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= cost;
      p.hp = p.maxHp;
      p.hunger = HUNGER_MAX;
      this.fx({ t: 'heal', pid: p.id, x: p.x, y: p.y }, p.mapId, p.x, p.y);
      this.toast(p, cost === 0 ? '☘ «Для спасителя Ждана — всё бесплатно!» Как новенький' : '☘ Выспался и наелся — как новенький');
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
    // одна цель — одно задание: дубль не берётся
    const key = q => q.type + ':' + (q.poi ?? q.token ?? q.to ?? (q.type === 'supply' ? q.giver + q.item : q.title));
    if (p.quests.some(q => key(q) === key(quest))) {
      this.toast(p, '📖 Это задание уже в твоём журнале (J)');
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
    if (s.food < 35 && !p.quests.some(q => q.type === 'supply' && q.giver === s.id)) {
      this.addQuest(p, {
        type: 'supply', item: 'meat', count: 6, given: 0, giver: s.id, done: false,
        title: `Принести 6 сырого мяса в ${s.name}`, tx: s.x, ty: s.y,
        reward: { coins: 30, rep: 15, xp: 35 },
      });
      return;
    }
    // караван этой деревни в пути — предложи сопровождение
    const caravan = this.abstract.tokens.find(t =>
      t.type === 'caravan' && !t.dead && t.from === s.id && t.cargo
      && !p.quests.some(q => q.token === t.id));
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
    // межфракционная политика: самая холодная к нам фракция
    const coldest = ['severane', 'ozerny', 'stepnyaki'].filter(f => f !== s.faction)
      .sort((a, b) => (RELATIONS[s.faction][a] || 0) - (RELATIONS[s.faction][b] || 0))[0];
    const rel = RELATIONS[s.faction][coldest] || 0;
    // дары примирения: отвези добро — отношения народов теплеют
    if (rel < 25 && roll >= 0.5 && roll < 0.62 && !p.quests.some(q => q.gift)) {
      const to = this.world.settlements.find(x => x.faction === coldest && !x.ruined && !x.captured);
      if (to) {
        this.addQuest(p, {
          type: 'deliver', to: to.id, gift: coldest, giver: s.id, done: false,
          title: `☮ Отвезти дары примирения в ${to.name}`, tx: to.x, ty: to.y,
          desc: `«Со ${FACTIONS[coldest].name} у нас нелады. Отвези дары их старейшине — пусть знают: мы худого не держим»`,
          reward: { coins: 30, rep: 12, xp: 40 },
        });
        return;
      }
    }
    // тёмное дело: перехват чужого каравана (только при холодных отношениях)
    if (rel < 10 && roll >= 0.62 && roll < 0.72 && !p.quests.some(q => q.type === 'raidq')
      && (p.rep[s.faction] || 0) >= 20) {
      this.addQuest(p, {
        type: 'raidq', target: coldest, gf: s.faction, giver: s.id, done: false,
        title: `🏴 Перехватить караван: ${FACTIONS[coldest].name}`,
        desc: `«Дело тёмное, но платим щедро. Их обозы жиреют на наших дорогах. Перебей охрану — груз твой. ${FACTIONS[coldest].name} этого не простят»`,
        reward: { coins: 80, rep: 15, xp: 60 },
      });
      return;
    }
    if (roll < 0.4) {
      // ближайший незачищенный данж, на который ЕЩЁ нет задания в журнале
      const poi = this.world.pois
        .filter(x => !x.cleared && !p.quests.some(q => q.poi === x.id))
        .sort((a, b) => dist2(a.x * TILE, a.y * TILE, sx, sy) - dist2(b.x * TILE, b.y * TILE, sx, sy))[0];
      if (poi) quest = {
        type: 'clear', poi: poi.id, giver: s.id, done: false,
        title: `Зачистить: ${poi.name}`, tx: poi.x, ty: poi.y,
        desc: pick(this.rand, [
          '«Оттуда всё чаще слышен вой — караванщики стали объезжать дорогу»',
          '«Дети видели там огни. Никто не решается сходить и проверить»',
          '«Пропали двое наших. Следы вели туда…»',
        ]),
        reward: { coins: 40 + poi.difficulty * 25, rep: 15, xp: 40 + poi.difficulty * 20 },
      };
    } else if (roll < 0.58) {
      const tok = this.abstract.tokens
        .filter(t => t.type === 'pack' && !p.quests.some(q => q.token === t.id))
        .sort((a, b) => dist2(a.x, a.y, sx, sy) - dist2(b.x, b.y, sx, sy))[0];
      if (tok) quest = {
        type: 'kill', token: tok.id, giver: s.id, done: false,
        title: `Истребить: ${tok.name}`, tx: Math.round(tok.x / TILE), ty: Math.round(tok.y / TILE),
        desc: pick(this.rand, [
          '«Эта стая режет скот по ночам. Пастухи боятся выйти за ворота»',
          '«Кочуют всё ближе к полям. Ударь первым, пока не поздно»',
        ]),
        reward: { coins: 35, rep: 12, xp: 45 },
      };
    } else if (roll < 0.72) {
      // именной зверь: элитная тварь появляется в глуши лично для героя
      const SLAY = [
        ['bear', 'Гроза Пастухов'], ['ogre', 'Костолом'], ['ironTroll', 'Ржавый'],
        ['orcWarlord', 'Хмурый Клык'], ['minotaur', 'Старая Беда'],
      ];
      const [kind, name] = pick(this.rand, SLAY);
      let spot = null;
      for (let tries = 0; tries < 20 && !spot; tries++) {
        const a = this.rand() * Math.PI * 2, r = 50 + this.rand() * 60;
        const tx = Math.round(s.x + Math.cos(a) * r), ty = Math.round(s.y + Math.sin(a) * r);
        if (tx < 20 || ty < 20 || tx > WORLD_TILES - 20 || ty > WORLD_TILES - 20) continue;
        if (!SOLID.has(this.chunks.tileAt('over', tx, ty))) spot = { tx, ty };
      }
      if (spot) {
        const eid = this.spawnEnemy(kind, 'over', spot.tx * TILE + 8, spot.ty * TILE + 8, { forceElite: true });
        const e = this.entities.get(eid);
        if (e) { e.name = name; e.slayFor = p.id; }
        quest = {
          type: 'slay', eid, giver: s.id, done: false,
          title: `Убить зверя: «${name}»`, tx: spot.tx, ty: spot.ty,
          desc: pick(this.rand, [
            `«${name} задрал лучшую корову старосты. Принеси нам покой»`,
            `«Охотники видели след — огромный. Народ шепчется про ${name}»`,
          ]),
          reward: { coins: 55, rep: 14, xp: 60 },
        };
      }
    } else if (roll < 0.85) {
      // паломничество: дойти до святого места и поклониться
      const spots = this.world.pois.filter(o =>
        ['spring', 'obelisk', 'barrow', 'circle'].includes(o.type)
        && !p.quests.some(q => q.type === 'visit' && q.poi === o.id));
      const spot = spots.length ? pick(this.rand, spots) : null;
      if (spot) quest = {
        type: 'visit', poi: spot.id, giver: s.id, done: false,
        title: `Паломничество: ${spot.name}`, tx: spot.x, ty: spot.y,
        desc: pick(this.rand, [
          '«Старики говорят, место силы держит округу. Сходи, поклонись — и расскажи, что видел»',
          '«Дурной сон приснился старейшине. Проверь, всё ли спокойно у святыни»',
        ]),
        reward: { coins: 20, rep: 8, xp: 30 },
      };
    }
    if (!quest) {
      const to = pick(this.rand, this.world.settlements.filter(x =>
        x.id !== s.id && !p.quests.some(q => q.type === 'deliver' && q.to === x.id)));
      if (to) quest = {
        type: 'deliver', to: to.id, giver: s.id, done: false,
        title: `Доставить письмо в ${to.name}`, tx: to.x, ty: to.y,
        desc: pick(this.rand, [
          '«Запечатано воском. Не читай — и не отдавай никому, кроме старейшины»',
          '«Дорога неспокойна, гонцы не возвращаются. Вся надежда на тебя»',
        ]),
        reward: { coins: 25, rep: 10, xp: 30 },
      };
    }
    if (!quest) { this.toast(p, '«Пока новых дел нет — загляни позже»'); return; }
    this.addQuest(p, quest);
  }

  // вычеркнуть задание из журнала (кнопка ✖ в J)
  dropQuest(p, i) {
    const q = p.quests[i];
    if (!q) return;
    // именной зверь остаётся жить в глуши, но больше не твой заказ
    if (q.type === 'slay' && q.eid) {
      const e = this.entities.get(q.eid);
      if (e) e.slayFor = null;
    }
    p.quests.splice(i, 1);
    this.toast(p, `📖✖ Вычеркнуто: ${q.title}`);
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
      if (q.type === 'deliver' && !q.done && npc.home === q.to) {
        this.completeQuestObjective(p, q);
        // дары примирения: народы теплеют друг к другу
        if (q.gift) {
          const gs = this.world.settlements.find(x => x.id === q.giver);
          const gf = gs?.faction;
          if (gf && q.gift !== gf) {
            RELATIONS[gf][q.gift] = Math.min(100, (RELATIONS[gf][q.gift] || 0) + 8);
            RELATIONS[q.gift][gf] = RELATIONS[gf][q.gift];
          }
          p.rep[q.gift] = Math.min(100, (p.rep[q.gift] || 0) + 8);
          this.toast(p, `☮ Дары приняты: ${FACTIONS[q.gift]?.name} теплеют к тебе и к ${FACTIONS[gf]?.name || 'соседям'}`);
          this.events.push(this.world.day, `${p.name} привёз дары примирения — народы сблизились`);
        }
      }
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
  // Мировая весть. w:1 — тихая (только летопись), w:2 — ВАЖНАЯ (всплывает у всех):
  // мировые события, война, падения деревень, вмешательства судьбы.
  toastAll(text, important = false) { this.fx({ t: 'toast', text, w: important ? 2 : 1 }, null); }
  toastMap(mapId, text) { this.fx({ t: 'toast', mapId, text }, null); }
}

function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h >>> 0;
}
