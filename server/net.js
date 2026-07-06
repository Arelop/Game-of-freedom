// Сетевой слой: подключения, роутинг сообщений, снапшоты 15 Гц с AOI.
import { WebSocketServer } from 'ws';
import { MSG, rleEncode } from '../shared/protocol.js';
import { AOI_RADIUS, CHUNK, MAX_PLAYERS, SNAPSHOT_EVERY, TICK_RATE } from '../shared/constants.js';
import { ENEMIES } from '../shared/enemies.js';
import { dist2 } from '../shared/simCore.js';
import { xpNeed } from '../shared/classes.js';
import { buildBiomeMap } from './world/worldgen.js';
import { RELATIONS } from './sim/factions.js';

export class Net {
  constructor(game, httpServer) {
    this.game = game;
    this.nextPlayerId = 1;
    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on('connection', ws => this.onConnection(ws));
  }

  onConnection(ws) {
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      this.onMessage(ws, msg);
    });
    ws.on('close', () => {
      if (ws.playerId) {
        const p = this.game.players.get(ws.playerId);
        if (p) console.log(`[net] ${p.name} отключился`);
        this.game.removePlayer(ws.playerId);
      }
    });
    ws.on('error', () => {});
  }

  onMessage(ws, m) {
    const game = this.game;
    if (m.t === MSG.JOIN) {
      if (ws.playerId) return;
      if (game.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return; }
      const id = this.nextPlayerId++;
      const name = String(m.name || 'Игрок').slice(0, 16) || 'Игрок';
      const cls = ['warrior', 'mage', 'rogue'].includes(m.cls) ? m.cls : 'warrior';
      const p = game.addPlayer(id, name, ws, cls);
      ws.playerId = id;
      console.log(`[net] ${name} (${cls}) вошёл (id=${id})`);
      ws.send(JSON.stringify({
        t: MSG.WELCOME, id, seed: game.world.seed, tick: game.tick,
        tickRate: TICK_RATE, sprite: p.sprite, cls: p.cls,
        mapInfo: {
          settlements: game.world.settlements.map(s => ({ x: s.x, y: s.y, name: s.name, faction: s.faction })),
          pois: game.world.pois.map(o => ({ x: o.x, y: o.y, name: o.name, type: o.type, cleared: o.cleared })),
          biomes: rleEncode(Array.from(this.biomeMap ??= buildBiomeMap(game.world))),
          roads: game.world.roads,
          citadel: game.world.citadel
            ? { x: game.world.citadel.x, y: game.world.citadel.y, name: game.world.citadel.name }
            : null,
        },
      }));
      return;
    }
    const p = ws.playerId && game.players.get(ws.playerId);
    if (!p) return;
    switch (m.t) {
      case MSG.INPUT: {
        // защита от мусора
        const dt = Math.min(0.05, Math.max(0.001, +m.dt || 0.016));
        p.inputs.push({
          seq: m.seq | 0, dt,
          mx: clamp(+m.mx || 0), my: clamp(+m.my || 0),
          aim: +m.aim || 0, fire: !!m.fire, roll: !!m.roll, blk: !!m.blk,
        });
        if (p.inputs.length > 30) p.inputs.splice(0, p.inputs.length - 30);
        break;
      }
      case MSG.CHUNK_REQ: this.sendChunk(ws, p, m.cx | 0, m.cy | 0); break;
      case MSG.PING:
        ws.send(JSON.stringify({
          t: MSG.PONG, t0: m.t0, tick: game.tick, time: game.world.time, day: game.world.day,
          pops: game.world.settlements.map(s => s.population),
          sts: game.world.settlements.map(s => s.ruined ? 2 : s.captured ? s.faction === 'darkness' ? 3 : 1 : 0),
          rel: RELATIONS,
          dark: game.world.citadel ? { pw: Math.round(game.world.citadel.power), f: game.world.citadel.forts.length } : null,
          wt: game.world.weather,
        }));
        break;
      case MSG.SWITCH_WEAPON: {
        const idx = m.slot | 0;
        if (idx >= 0 && idx < p.weapons.length) { p.weaponIdx = idx; p.reloadT = 0; p.reloadPending = false; }
        break;
      }
      case MSG.RELOAD: game.startReload(p); break;
      case MSG.INTERACT: game.interact(p); break;
      case MSG.DIALOG_CHOICE: game.dialogChoice(p, String(m.id || ''), String(m.choice || '')); break;
      case MSG.USE_ITEM: game.useItem(p, String(m.item || '')); break;
      case MSG.EQUIP: game.equipItem(p, String(m.item || '')); break;
      case MSG.UNEQUIP: game.unequipItem(p, String(m.slot || '')); break;
      case MSG.SPEND_STAT: game.spendStat(p, String(m.stat || '')); break;
      case MSG.LEARN_TALENT: game.learnTalent(p, String(m.id || '')); break;
      case MSG.SELL_ITEM: game.sellItem(p, String(m.item || '')); break;
      case MSG.ABILITY: game.useAbility(p, Math.max(0, Math.min(2, m.slot | 0))); break;
      case MSG.OFFHAND: game.useOffhand(p); break;
      case MSG.STASH: game.stashOp(p, m.op === 'take' ? 'take' : 'put', String(m.item || ''), m.box === 'home' ? 'home' : 'team'); break;
      case MSG.GIVE: game.giveItem(p, String(m.item || '')); break;
    }
  }

  sendChunk(ws, p, cx, cy) {
    const tiles = this.game.chunks.getChunk(p.mapId, cx, cy);
    if (!tiles) return;
    ws.send(JSON.stringify({ t: MSG.CHUNK, mapId: p.mapId, cx, cy, rle: rleEncode(Array.from(tiles)) }));
  }

  // Рассылка после каждого тика: события всегда, снапшоты каждые SNAPSHOT_EVERY тиков
  broadcast() {
    const game = this.game;
    const sendSnap = game.tick % SNAPSHOT_EVERY === 0;

    for (const p of game.players.values()) {
      if (!p.ws || p.ws.readyState !== 1) continue;
      const msgs = [];

      for (const { ev, mapId, x, y } of game.pendingFx) {
        if (ev.pid !== undefined && (ev.t === 'dialog' || ev.t === 'toast' || ev.t === 'marker' || ev.t === 'mapChange')) {
          if (ev.pid !== p.id && ev.t !== 'mapChange') continue;
          if (ev.t === 'mapChange' && ev.pid !== p.id) { /* другим — как обычное событие */ }
          else { msgs.push(ev); continue; }
        }
        if (ev.t === 'toast' && ev.pid === undefined) {
          if (!ev.mapId || ev.mapId === p.mapId) msgs.push(ev);
          continue;
        }
        if (mapId && mapId !== p.mapId) continue;
        if (x !== undefined && dist2(x, y, p.x, p.y) > (AOI_RADIUS * 1.6) ** 2) continue;
        msgs.push(ev);
      }

      if (sendSnap) msgs.push(this.buildSnapshot(p));
      if (msgs.length) p.ws.send(JSON.stringify({ t: 'batch', tick: game.tick, msgs }));
    }
  }

  buildSnapshot(p) {
    const game = this.game;
    const ents = [];
    for (const q of game.players.values()) {
      if (q.id === p.id || q.mapId !== p.mapId) continue;
      if (dist2(q.x, q.y, p.x, p.y) > AOI_RADIUS ** 2) continue;
      ents.push({
        i: 'p' + q.id, tp: 'p', k: q.sprite, x: r1(q.x), y: r1(q.y),
        a: r2(q.aim), h: q.hp, hm: q.maxHp, nm: q.name, dn: q.dead ? 1 : 0,
        rl: q.rollT > 0 ? 1 : 0, w: game.weapon(q).id, lv: q.level,
        bk: q.blocking ? 1 : 0, iv: q.invisT > 0 ? 1 : 0,
      });
    }
    for (const e of game.entities.values()) {
      if (e.mapId !== p.mapId) continue;
      if (dist2(e.x, e.y, p.x, p.y) > AOI_RADIUS ** 2) continue;
      if (e.entType === 'drop') {
        ents.push({ i: e.id, tp: 'd', k: e.item, x: r1(e.x), y: r1(e.y), c: e.count });
      } else if (e.entType === 'enemy') {
        const def = ENEMIES[e.kind];
        ents.push({
          i: e.id, tp: 'e', k: def.sprite, x: r1(e.x), y: r1(e.y), a: r2(e.aim || 0),
          h: e.hp, hm: e.maxHp || def.hp, st: e.state === 'windup' || e.state === 'dash' ? e.state : undefined,
          el: e.elite || undefined,
        });
      } else {
        ents.push({
          i: e.id, tp: 'n', k: e.kind, x: r1(e.x), y: r1(e.y), a: r2(e.aim || 0),
          h: e.hp, hm: e.maxHp, rо: undefined, ro: e.role,
        });
      }
    }
    const w = game.weapon(p);
    return {
      t: MSG.SNAPSHOT, tick: game.tick, lastSeq: p.lastSeq,
      time: r2(game.world.time), day: game.world.day,
      you: {
        x: r1(p.x), y: r1(p.y), hp: p.hp, hm: p.maxHp,
        hunger: Math.round(p.hunger), coins: p.coins,
        w: w.id, wi: p.weaponIdx, ws: p.weapons,
        mag: p.mags[w.id] || 0, magMax: w.magSize,
        ammo: p.ammo, inv: p.inventory,
        rt: r2(p.reloadT), dead: p.dead ? 1 : 0, dt: r1(p.downT),
        rc: r2(p.rollCd), map: p.mapId,
        eq: p.equipment, sm: r2(p.speedMult || 1), rcm: r2(p.rollCdMult || 1),
        bf: Object.fromEntries(Object.entries(p.buffs || {}).map(([k, b]) => [k, Math.ceil(b.t)])),
        cls: p.cls, lvl: p.level, xp: p.xp, xpn: xpNeed(p.level),
        sp: p.statPts, tp2: p.talentPts, st: p.stats, tl: p.talents,
        q: p.quest ? { title: p.quest.title, done: p.quest.done, tx: p.quest.tx, ty: p.quest.ty } : null,
        rep: p.rep,
        ab: (p.abCd || []).map(v => r1(v)), blk: p.blocking ? 1 : 0, inv2: r1(p.invisT || 0),
        oc: r1(p.offCd || 0), sh: p.shieldHp || 0, cb: p.canBlock ? 1 : 0,
        hnt: p.hintStage < 5 ? p.hintStage : undefined,
      },
      ents,
    };
  }
}

function clamp(v) { return Math.max(-1, Math.min(1, v)); }
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
