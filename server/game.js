// Авторитетная симуляция: игроки, враги, NPC, пули, данжи, квесты, голод.
import {
  TICK_DT, TILE, SOLID, BULLET_SOLID, T, PLAYER_MAX_HP, PLAYER_HURT_INVULN,
  HUNGER_MAX, HUNGER_RATE, DAY_LENGTH, PLAYER_RADIUS,
} from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { ENEMIES } from '../shared/enemies.js';
import { PATTERNS, emitDirections } from '../shared/patterns.js';
import {
  makePlayerState, stepPlayer, stepProjectile, hasIFrames, circlesOverlap, dist2,
} from '../shared/simCore.js';
import { mulberry32, hash2, randInt, pick } from '../shared/rng.js';
import { makeWorld } from './world/worldgen.js';
import { ChunkStore } from './world/chunks.js';
import { generateDungeon, roomAt } from './world/dungeon.js';
import { updateEnemy } from './sim/ai.js';
import { updateNpc } from './sim/npc.js';
import { AbstractSim } from './sim/abstract.js';
import { EventLog } from './sim/events.js';
import { makeReputation, FACTIONS, priceMultiplier } from './sim/factions.js';
import { STR, ITEM_NAMES } from '../shared/strings.js';

const HOT_RADIUS = 600;            // px: враги думают только рядом с игроками
const SETTLEMENT_HYDRATE_R = 400;  // px
const REVIVE_DIST = 26;
const FOOD_VALUE = { meat: 15, cooked_meat: 40, bread: 30 };

const RECIPES = [
  { id: 'bandage', name: 'Бинт (2 травы)', needs: { herb: 2 }, gives: { bandage: 1 } },
  { id: 'cooked_meat', name: 'Жареное мясо (сырое мясо)', needs: { meat: 1 }, gives: { cooked_meat: 1 } },
  { id: 'ammo_light', name: 'Лёгкие патроны x12 (1 древесина)', needs: { wood: 1 }, gives: { ammo_light: 12 } },
  { id: 'ammo_shell', name: 'Дробь x6 (1 древесина, 1 шкура)', needs: { wood: 1, hide: 1 }, gives: { ammo_shell: 6 } },
];

const SHOP = [
  { item: 'bread', price: 8 }, { item: 'bandage', price: 15 },
  { item: 'ammo_light', price: 12, count: 20 }, { item: 'ammo_shell', price: 15, count: 8 },
  { item: 'ammo_heavy', price: 18, count: 8 }, { item: 'ammo_cell', price: 18, count: 12 },
];

export class Game {
  constructor(seed) {
    this.world = makeWorld(seed);
    this.chunks = new ChunkStore(this.world);
    this.events = new EventLog();
    this.abstract = new AbstractSim(this);
    this.rand = mulberry32(seed ^ 0x5eed);
    this.players = new Map();
    this.entities = new Map();   // враги, NPC, дропы
    this.projectiles = [];
    this.nextId = 1;
    this.tick = 0;
    this.pendingFx = [];         // события за тик для рассылки
    this.dungeons = new Map();   // mapId -> { dungeon, poi }
    this.hydratedSettlements = new Map(); // id -> [entIds]
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

  // ---------- игроки ----------
  addPlayer(id, name, ws) {
    const s = this.world.settlements[0];
    const px = (s ? s.x : 256) * TILE + 40, py = (s ? s.y : 256) * TILE + 40;
    const p = {
      ...makePlayerState(px, py),
      id, name, ws, mapId: 'over',
      skin: (id - 1) % 4,
      hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
      weapons: ['pistol'], weaponIdx: 0,
      mags: { pistol: WEAPONS.pistol.magSize },
      ammo: { light: 30, shell: 6, heavy: 0, cell: 0 },
      inventory: { bread: 2, bandage: 1 },
      coins: 20, hunger: HUNGER_MAX,
      rep: makeReputation(), aggroFactions: new Set(),
      dead: false, downT: 0,
      quest: null,
      lastSeq: 0, inputs: [],
      fireHeld: false, fireLatch: false,
      hungerTickT: 0,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }

  weapon(p) { return WEAPONS[p.weapons[p.weaponIdx]]; }

  // ---------- главный тик ----------
  step() {
    this.tick++;
    const dt = TICK_DT;
    this.pendingFx.length = 0;

    // время суток
    const wasNight = this.isNight();
    this.world.time += dt / DAY_LENGTH;
    if (this.world.time >= 1) { this.world.time -= 1; this.world.day++; }
    if (this.isNight() !== wasNight)
      this.toastAll(this.isNight() ? STR.night : STR.morning);

    for (const p of this.players.values()) this.stepPlayerTick(p, dt);

    this.hydrateSettlements();
    this.stepEntities(dt);
    this.stepProjectiles(dt);
    this.abstract.update(dt);
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

    // автоперезарядка пустого магазина
    if (p.mags[w.id] <= 0 && p.reloadT <= 0) this.startReload(p);
    if (p.reloadT === 0 && p.reloadPending) {
      p.mags[w.id] = this.finishReload(p, w);
      p.reloadPending = false;
    }
  }

  startReload(p) {
    const w = this.weapon(p);
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
    if (p.fireCd > 0 || p.rollT > 0 || p.reloadT > 0 || p.dead) return;
    if ((p.mags[w.id] || 0) <= 0) { this.startReload(p); return; }
    p.fireCd = 1 / w.fireRate;
    p.mags[w.id]--;
    const seed = hash2(this.world.seed, this.tick, p.id);
    this.spawnPlayerBullets(p, w, aim, seed);
    // событие остальным клиентам (стрелявший рисует свои пули сам)
    this.fx({ t: 'shot', pid: p.id, weapon: w.id, x: p.x, y: p.y, aim, seed, tick: this.tick }, p.mapId, p.x, p.y);
  }

  spawnPlayerBullets(p, w, aim, seed) {
    const rand = mulberry32(seed);
    for (let i = 0; i < w.projectilesPerShot; i++) {
      const spread = (rand() - 0.5) * w.spreadDeg * Math.PI / 180;
      const a = aim + spread;
      this.projectiles.push({
        x: p.x, y: p.y - 4, vx: Math.cos(a) * w.projectileSpeed, vy: Math.sin(a) * w.projectileSpeed,
        life: w.projLife, radius: w.projRadius, dmg: w.damage, knockback: w.knockback,
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
    this.fx({ t: 'shot', pid: npc.id, weapon: 'pistol', x: npc.x, y: npc.y, aim: ang, seed: 1, tick: this.tick }, npc.mapId, npc.x, npc.y);
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
    this.entities.set(id, {
      id, entType: 'npc', role, home, mapId, x, y, aim: 0,
      hp: role === 'guard' ? 12 : 6, maxHp: role === 'guard' ? 12 : 6,
      kind: extra.kind || (role === 'guard' ? 'npc_guard' : role === 'merchant' ? 'npc_merchant'
        : role === 'elder' ? 'npc_elder' : role === 'wizard' ? 'npc_wizard'
        : this.rand() < 0.5 ? 'npc_villager' : 'npc_villager2'),
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
      if (near && !hyd) {
        const ids = [];
        const a = s.anchors;
        ids.push(this.spawnNpc('elder', s.id, 'over', sx + 20, sy - 10));
        ids.push(this.spawnNpc('merchant', s.id, 'over', (a.stalls[0]?.x ?? s.x) * TILE + 8, (a.stalls[0]?.y ?? s.y) * TILE + 8));
        ids.push(this.spawnNpc('guard', s.id, 'over', sx - 30, sy));
        ids.push(this.spawnNpc('guard', s.id, 'over', sx + 30, sy));
        const villagers = Math.max(2, s.population - 4);
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
        const shots = updateEnemy(e, dt, map, [...this.players.values()], this.rand);
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

  stepProjectiles(dt) {
    const alive = [];
    for (const pr of this.projectiles) {
      if (pr.delay > 0) { pr.delay -= dt; alive.push(pr); continue; }
      const map = this.mapFor(pr.mapId);
      if (!stepProjectile(pr, dt, map)) {
        this.fx({ t: 'hit', kind: 'wall', x: pr.x, y: pr.y }, pr.mapId, pr.x, pr.y);
        continue;
      }
      let hit = false;
      if (pr.friendly) {
        // по врагам
        for (const e of this.entities.values()) {
          if (e.entType !== 'enemy' || e.mapId !== pr.mapId) continue;
          const def = ENEMIES[e.kind];
          if (circlesOverlap(pr.x, pr.y, pr.radius, e.x, e.y, def.radius)) {
            this.damageEnemy(e, pr.dmg, pr);
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
    this.fx({ t: 'hurt', id: e.id, x: e.x, y: e.y }, e.mapId, e.x, e.y);
    if (e.hp <= 0) this.killEnemy(e, pr);
  }

  killEnemy(e, pr) {
    const def = ENEMIES[e.kind];
    this.entities.delete(e.id);
    this.fx({ t: 'die', id: e.id, kind: def.sprite, x: e.x, y: e.y }, e.mapId, e.x, e.y);
    // дроп
    for (const [item, range] of Object.entries(def.drops || {})) {
      if (item === 'weapon') { this.dropRandomWeapon(e.mapId, e.x, e.y); continue; }
      const n = Array.isArray(range) ? randInt(this.rand, range[0], range[1]) : range;
      if (n > 0) this.spawnDrop(item, n, e.mapId, e.x + (this.rand() - 0.5) * 14, e.y + (this.rand() - 0.5) * 14);
    }
    if (this.rand() < 0.15) this.spawnDrop('herb', 1, e.mapId, e.x, e.y);
    if (e.kind === 'wolf' && this.rand() < 0.5) this.spawnDrop('hide', 1, e.mapId, e.x, e.y);
    if (e.token) this.abstract.onTokenUnitKilled(e.token);
    if (e.kind === 'bossOgre') {
      this.toastAll(STR.bossDefeated(def.name));
      this.events.push(this.world.day, `Пал грозный ${def.name}!`);
    }
    // квест «убить стаю» проверяется в onTokenUnitKilled через журнал
    const killer = pr && this.players.get(pr.owner);
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
    p.hp -= dmg;
    p.hurtT = PLAYER_HURT_INVULN;
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
        const wid = drop.item.split(':')[1];
        if (!p.weapons.includes(wid)) {
          p.weapons.push(wid);
          p.mags[wid] = WEAPONS[wid].magSize;
          this.toast(p, STR.pickupWeapon(WEAPONS[wid].name));
        } else { p.coins += 10; }
      } else if (drop.item.startsWith('ammo_')) {
        const type = drop.item.slice(5);
        p.ammo[type] = (p.ammo[type] || 0) + drop.count * 6;
        this.toast(p, STR.pickup(ITEM_NAMES[drop.item] || drop.item));
      } else {
        p.inventory[drop.item] = (p.inventory[drop.item] || 0) + drop.count;
        this.toast(p, STR.pickup(ITEM_NAMES[drop.item] || drop.item));
      }
      this.entities.delete(drop.id);
      this.fx({ t: 'pickup', x: drop.x, y: drop.y }, drop.mapId, drop.x, drop.y);
      return;
    }
  }

  dropRandomWeapon(mapId, x, y) {
    const pool = ['smg', 'shotgun', 'rifle', 'crossbow', 'laser'];
    this.spawnDrop('weapon:' + pick(this.rand, pool), 1, mapId, x, y);
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
    // NPC рядом
    let npc = null, best = 30 * 30;
    for (const e of this.entities.values()) {
      if (e.entType !== 'npc' || e.mapId !== p.mapId) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < best) { best = d; npc = e; }
    }
    if (npc) { this.openDialog(p, npc); return; }

    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    // тайлы вокруг
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = this.chunks.tileAt(p.mapId, tx + dx, ty + dy);
      if (t === T.CAMPFIRE) { this.openCrafting(p); return; }
      if (t === T.CHEST) { this.openChest(p, tx + dx, ty + dy); return; }
      if (t === T.DUNGEON_EXIT && p.mapId !== 'over') { this.exitDungeon(p); return; }
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
    this.dropRandomWeapon(p.mapId, tx * TILE + 8, ty * TILE + 20);
    this.spawnDrop('coin', randInt(this.rand, 10, 25), p.mapId, tx * TILE - 4, ty * TILE + 20);
    this.fx({ t: 'chest', x: tx * TILE, y: ty * TILE }, p.mapId, tx * TILE, ty * TILE);
  }

  // ---------- диалоги / магазин / квесты / слухи ----------
  openDialog(p, npc) {
    const s = this.world.settlements.find(x => x.id === npc.home);
    const fname = s ? (FACTIONS[s.faction]?.name || '') : '';
    if (npc.role === 'merchant' || npc.role === 'trader') {
      const mult = priceMultiplier(s ? p.rep[s.faction] : 0);
      const choices = SHOP.map((it, i) => ({
        id: 'buy:' + i,
        label: `${ITEM_NAMES[it.item]}${it.count ? ' x' + it.count : ''} — ${Math.ceil(it.price * mult)} мон.`,
      }));
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, 'Торговец', [`Добро пожаловать! (у тебя ${p.coins} мон.)`], choices);
    } else if (npc.role === 'elder') {
      this.checkDeliver(p, npc);
      const lines = [`Старейшина ${s ? s.name : ''} (${fname})`];
      const choices = [];
      if (p.quest && !p.quest.done && p.quest.giver === npc.home) {
        lines.push('Как продвигается дело?');
      } else if (p.quest && p.quest.done && p.quest.giver === npc.home) {
        choices.push({ id: 'turnin', label: STR.questTurnIn });
      } else if (!p.quest) {
        choices.push({ id: 'quest', label: STR.questAccept });
      }
      choices.push({ id: 'rumor', label: STR.rumor });
      choices.push({ id: 'close', label: STR.bye });
      this.sendDialog(p, npc.id, 'Старейшина', lines, choices);
    } else {
      const rumors = this.events.rumors(1);
      const line = rumors.length ? `Говорят, ${lc(rumors[0].text)}…` : 'Тихо у нас, и слава богам.';
      this.sendDialog(p, npc.id, 'Житель', [line], [{ id: 'close', label: STR.bye }]);
    }
  }

  openCrafting(p) {
    const choices = RECIPES.map(r => ({ id: 'craft:' + r.id, label: r.name }));
    choices.push({ id: 'close', label: STR.close });
    this.sendDialog(p, 'campfire', STR.craft, ['Что будем делать?'], choices);
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
      const price = Math.ceil(it.price * priceMultiplier(s ? p.rep[s.faction] : 0));
      if (p.coins < price) { this.toast(p, STR.notEnoughCoins); return; }
      p.coins -= price;
      if (it.item.startsWith('ammo_')) p.ammo[it.item.slice(5)] = (p.ammo[it.item.slice(5)] || 0) + (it.count || 1);
      else p.inventory[it.item] = (p.inventory[it.item] || 0) + 1;
      this.toast(p, STR.pickup(ITEM_NAMES[it.item]));
      if (s) { p.rep[s.faction] = Math.min(100, (p.rep[s.faction] || 0) + 1); }
      return;
    }
    if (choice.startsWith('craft:')) {
      const r = RECIPES.find(x => x.id === choice.split(':')[1]);
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
    if (roll < 0.45) {
      const poi = this.world.pois
        .filter(x => !x.cleared)
        .sort((a, b) => dist2(a.x * TILE, a.y * TILE, sx, sy) - dist2(b.x * TILE, b.y * TILE, sx, sy))[0];
      if (poi) quest = {
        type: 'clear', poi: poi.id, giver: s.id, done: false,
        title: `Зачистить: ${poi.name}`, tx: poi.x, ty: poi.y,
        reward: { coins: 40 + poi.difficulty * 25, rep: 15 },
      };
    } else if (roll < 0.75) {
      const tok = this.abstract.tokens
        .filter(t => t.type === 'pack')
        .sort((a, b) => dist2(a.x, a.y, sx, sy) - dist2(b.x, b.y, sx, sy))[0];
      if (tok) quest = {
        type: 'kill', token: tok.id, giver: s.id, done: false,
        title: `Истребить: ${tok.name}`, tx: Math.round(tok.x / TILE), ty: Math.round(tok.y / TILE),
        reward: { coins: 35, rep: 12 },
      };
    }
    if (!quest) {
      const to = pick(this.rand, this.world.settlements.filter(x => x.id !== s.id));
      if (to) quest = {
        type: 'deliver', to: to.id, giver: s.id, done: false,
        title: `Доставить письмо в ${to.name}`, tx: to.x, ty: to.y,
        reward: { coins: 25, rep: 10 },
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
    if ((p.inventory[item] || 0) <= 0) return;
    if (FOOD_VALUE[item]) {
      p.inventory[item]--;
      p.hunger = Math.min(HUNGER_MAX, p.hunger + FOOD_VALUE[item]);
      if (item === 'cooked_meat') p.hp = Math.min(p.maxHp, p.hp + 1);
      this.fx({ t: 'eat', pid: p.id }, p.mapId, p.x, p.y);
    } else if (item === 'bandage') {
      if (p.hp >= p.maxHp) return;
      p.inventory[item]--;
      p.hp = Math.min(p.maxHp, p.hp + 2);
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
