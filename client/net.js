// Клиентский неткод: предсказание своего игрока, интерполяция чужих,
// косметические пули из событий, кэш чанков.
import { MSG, rleDecode } from '../shared/protocol.js';
import { CHUNK, TILE, SOLID, BULLET_SOLID, T, SIM_DT } from '../shared/constants.js';
import { makePlayerState, stepPlayer, stepProjectile } from '../shared/simCore.js';
import { WEAPONS } from '../shared/weapons.js';
import { PATTERNS, emitDirections } from '../shared/patterns.js';
import { mulberry32 } from '../shared/rng.js';

const INTERP_DELAY = 0.12; // сек

export class Net {
  constructor() {
    this.ws = null;
    this.myId = 0;
    this.skin = 0;
    this.connected = false;
    this.mapInfo = { settlements: [], pois: [] };
    this.mapId = 'over';

    this.pred = makePlayerState(0, 0);   // предсказанное состояние
    this.gotFirstSnap = false;
    this.pendingInputs = [];
    this.seq = 0;
    this.you = null;                      // последний серверный you
    this.worldTime = 0.3; this.day = 1;

    this.remotes = new Map();             // id -> { buf: [{t,x,y,a,...}], data }
    this.bullets = [];                    // косметические пули
    this.chunks = new Map();              // "mapId:cx,cy" -> Uint8Array
    this.chunkPending = new Map();        // key -> время запроса
    this.ping = 0;
    this.resims = 0;

    this.handlers = {};                   // события для main: onFx, onToast, onDialog, onMapChange, onChunk
  }

  connect(name) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(proto + '//' + location.host);
    this.ws.onopen = () => this.ws.send(JSON.stringify({ t: MSG.JOIN, name }));
    this.ws.onmessage = e => this.onMessage(JSON.parse(e.data));
    this.ws.onclose = () => { this.connected = false; this.handlers.onDisconnect?.(); };
    setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.pingT0 = performance.now();
        this.ws.send(JSON.stringify({ t: MSG.PING, t0: this.pingT0 }));
      }
    }, 2000);
  }

  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  onMessage(m) {
    if (m.t === MSG.WELCOME) {
      this.myId = m.id; this.skin = m.skin;
      this.mapInfo = m.mapInfo;
      this.connected = true;
      this.handlers.onWelcome?.(m);
      return;
    }
    if (m.t === 'full') { this.handlers.onFull?.(); return; }
    if (m.t === MSG.PONG) {
      this.ping = Math.round(performance.now() - m.t0);
      this.worldTime = m.time; this.day = m.day;
      return;
    }
    if (m.t === MSG.CHUNK) {
      const key = m.mapId + ':' + m.cx + ',' + m.cy;
      this.chunks.set(key, rleDecode(m.rle, CHUNK * CHUNK));
      this.chunkPending.delete(key);
      this.handlers.onChunk?.(key);
      return;
    }
    if (m.t === 'batch') {
      for (const msg of m.msgs) this.onBatchMsg(msg);
    }
  }

  onBatchMsg(m) {
    if (m.t === MSG.SNAPSHOT) { this.onSnapshot(m); return; }
    switch (m.t) {
      case 'shot': {
        if (m.pid === this.myId) break; // свои пули уже нарисованы
        const w = WEAPONS[m.weapon];
        if (w) this.spawnWeaponBullets(m.x, m.y, m.aim, w, m.seed);
        this.handlers.onFx?.('shot', m);
        break;
      }
      case 'eshot': {
        const pat = PATTERNS[m.pattern];
        if (pat) {
          const dirs = emitDirections(pat, m.aim, m.shotIndex || 0, m.seed);
          const bursts = pat.burst || 1;
          for (let b = 0; b < bursts; b++)
            for (const a of dirs)
              this.bullets.push({
                x: m.x, y: m.y - 3, vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed,
                life: pat.life, delay: b * (pat.burstInterval || 0),
                sprite: pat.proj || 'proj_orb', hostile: true, ang: a,
              });
        }
        this.handlers.onFx?.('eshot', m);
        break;
      }
      case 'tile': {
        const key = m.mapId + ':' + Math.floor(m.x / CHUNK) + ',' + Math.floor(m.y / CHUNK);
        const tiles = this.chunks.get(key);
        if (tiles) {
          tiles[(m.y % CHUNK) * CHUNK + (m.x % CHUNK)] = m.tile;
          this.handlers.onChunk?.(key);
        }
        break;
      }
      case 'mapChange':
        if (m.pid === this.myId) {
          this.mapId = m.mapId;
          this.pred.x = m.x; this.pred.y = m.y;
          this.remotes.clear();
          this.bullets.length = 0;
          this.pendingInputs.length = 0;
          this.handlers.onMapChange?.(m);
        }
        break;
      default:
        this.handlers.onFx?.(m.t, m);
    }
  }

  onSnapshot(snap) {
    this.you = snap.you;
    this.worldTime = snap.time; this.day = snap.day;
    // статы от экипировки/бафов — в предсказание
    this.pred.speedMult = snap.you.sm || 1;
    this.pred.rollCdMult = snap.you.rcm || 1;
    if (snap.you.map !== this.mapId) {
      this.mapId = snap.you.map;
      this.remotes.clear(); this.bullets.length = 0;
    }

    // реконсиляция своего игрока
    if (!this.gotFirstSnap) {
      this.pred.x = snap.you.x; this.pred.y = snap.you.y;
      this.gotFirstSnap = true;
    } else if (!snap.you.dead) {
      this.pendingInputs = this.pendingInputs.filter(i => i.seq > snap.lastSeq);
      const px = this.pred.x, py = this.pred.y;
      const map = this.mapWrapper();
      // переигрываем неподтверждённые инпуты от серверной позиции
      const tmp = { ...this.pred, x: snap.you.x, y: snap.you.y };
      for (const inp of this.pendingInputs) stepPlayer(tmp, inp, inp.dt, map);
      const rx = tmp.x, ry = tmp.y;
      const err = Math.hypot(px - rx, py - ry);
      if (err > 0.5) this.resims++;
      if (err > TILE * 2) { this.pred.x = rx; this.pred.y = ry; }       // жёсткий снап
      else { this.pred.x = px + (rx - px) * Math.min(1, err > 2 ? 0.5 : 0.15); this.pred.y = py + (ry - py) * Math.min(1, err > 2 ? 0.5 : 0.15); }
    } else {
      this.pred.x = snap.you.x; this.pred.y = snap.you.y;
    }

    // буферы интерполяции чужих сущностей
    const now = performance.now() / 1000;
    const seen = new Set();
    for (const e of snap.ents) {
      seen.add(e.i);
      let r = this.remotes.get(e.i);
      if (!r) { r = { buf: [], data: e }; this.remotes.set(e.i, r); }
      r.data = e;
      r.buf.push({ t: now, x: e.x, y: e.y, a: e.a || 0 });
      if (r.buf.length > 6) r.buf.shift();
    }
    for (const id of [...this.remotes.keys()])
      if (!seen.has(id)) this.remotes.delete(id);
  }

  // интерполированная позиция сущности
  lerpEnt(r) {
    const now = performance.now() / 1000 - INTERP_DELAY;
    const b = r.buf;
    if (b.length === 1) return b[0];
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= now || i === 1) {
        const a = b[i - 1], c = b[i];
        const span = Math.max(0.001, c.t - a.t);
        const k = Math.max(0, Math.min(1.2, (now - a.t) / span));
        let da = c.a - a.a;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, a: a.a + da * k };
      }
    }
    return b[b.length - 1];
  }

  // карта для локального предсказания (неизвестные чанки — проходимы)
  mapWrapper() {
    return {
      isSolid: (tx, ty) => {
        const t = this.tileAt(tx, ty);
        return t !== null && (SOLID.has(t) || t === T.DUNGEON_DOOR);
      },
      isBulletSolid: (tx, ty) => {
        const t = this.tileAt(tx, ty);
        return t !== null && (BULLET_SOLID.has(t) || t === T.DUNGEON_DOOR);
      },
    };
  }

  tileAt(tx, ty) {
    const key = this.mapId + ':' + Math.floor(tx / CHUNK) + ',' + Math.floor(ty / CHUNK);
    const tiles = this.chunks.get(key);
    if (!tiles) return null;
    return tiles[((ty % CHUNK) + CHUNK) % CHUNK * CHUNK + ((tx % CHUNK) + CHUNK) % CHUNK];
  }

  // шаг локальной симуляции: применяем инпут и шлём на сервер
  simStep(input) {
    if (!this.connected || !this.gotFirstSnap || this.you?.dead) return;
    input.seq = ++this.seq;
    input.dt = SIM_DT;
    stepPlayer(this.pred, input, SIM_DT, this.mapWrapper());
    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    this.send({ t: MSG.INPUT, ...input });
  }

  // косметические пули
  spawnWeaponBullets(x, y, aim, w, seed) {
    const rand = mulberry32(seed >>> 0);
    for (let i = 0; i < w.projectilesPerShot; i++) {
      const a = aim + (rand() - 0.5) * w.spreadDeg * Math.PI / 180;
      this.bullets.push({
        x, y: y - 4, vx: Math.cos(a) * w.projectileSpeed, vy: Math.sin(a) * w.projectileSpeed,
        life: w.projLife, sprite: w.projSprite, hostile: false, ang: a,
      });
    }
  }

  stepBullets(dt, onWallHit) {
    const map = this.mapWrapper();
    const alive = [];
    for (const b of this.bullets) {
      if (b.delay > 0) { b.delay -= dt; alive.push(b); continue; }
      if (stepProjectile(b, dt, map)) alive.push(b);
      else if (b.life > 0) onWallHit?.(b);
    }
    this.bullets = alive;
  }

  // запрос недостающих чанков вокруг точки
  requestChunks(wx, wy) {
    const ccx = Math.floor(wx / TILE / CHUNK), ccy = Math.floor(wy / TILE / CHUNK);
    const now = performance.now();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = ccx + dx, cy = ccy + dy;
        const key = this.mapId + ':' + cx + ',' + cy;
        if (this.chunks.has(key)) continue;
        const pend = this.chunkPending.get(key);
        if (pend && now - pend < 3000) continue;
        this.chunkPending.set(key, now);
        this.send({ t: MSG.CHUNK_REQ, cx, cy });
      }
    }
  }
}
