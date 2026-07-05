// Холодная симуляция мира: токены (стаи монстров, караваны, рейды)
// живут как записи и двигаются по карте раз в ABSTRACT_DT секунд.
// Возле игроков токен «гидратируется» в реальных сущностей.
import { TILE, WORLD_TILES } from '../../shared/constants.js';
import { T } from '../../shared/constants.js';
import { baseTile } from '../world/worldgen.js';
import { randInt, pick } from '../../shared/rng.js';

export const ABSTRACT_DT = 5;
const HYDRATE_R = 340;        // px
const DEHYDRATE_R = 520;

const PACK_KINDS = [
  { name: 'стая волков', units: ['wolf', 'wolf', 'wolf'], faction: 'monsters' },
  { name: 'слизни', units: ['slime', 'slime', 'slime', 'slime'], faction: 'monsters' },
  { name: 'банда разбойников', units: ['bandit', 'bandit', 'banditHeavy'], faction: 'bandits' },
  { name: 'нежить', units: ['skeleton', 'skeleton', 'bat'], faction: 'monsters' },
];

export class AbstractSim {
  constructor(game) {
    this.game = game;
    this.tokens = [];       // { id, type:'pack'|'caravan', x, y (px), units, name, target }
    this.nextId = 1;
    this.timer = 0;
  }

  seedTokens() {
    const { world, rand } = this.game;
    for (let i = 0; i < 10; i++) {
      const x = randInt(rand, 40, WORLD_TILES - 40), y = randInt(rand, 40, WORLD_TILES - 40);
      if (baseTile(world.seed, x, y) <= T.WATER) continue;
      const kind = pick(rand, PACK_KINDS);
      this.tokens.push({
        id: 'tok' + this.nextId++, type: 'pack', name: kind.name,
        faction: kind.faction, units: [...kind.units],
        x: x * TILE, y: y * TILE, hydrated: null,
      });
    }
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) { this.checkHydration(); return; }
    this.timer = ABSTRACT_DT;
    const { world, rand, events } = this.game;

    for (const tok of this.tokens) {
      if (tok.hydrated) continue;
      // блуждание / движение к цели
      if (tok.type === 'caravan' && tok.target) {
        const s = world.settlements.find(x => x.id === tok.target);
        if (s) {
          const dx = s.x * TILE - tok.x, dy = s.y * TILE - tok.y;
          const d = Math.hypot(dx, dy);
          if (d < 60) { // прибыл
            s.prosperity = Math.min(100, s.prosperity + 5);
            s.food = Math.min(100, s.food + 15);
            events.push(world.day, `Караван прибыл в ${s.name}`);
            tok.dead = true;
          } else {
            tok.x += dx / d * 40; tok.y += dy / d * 40;
          }
        }
      } else {
        tok.x += (rand() - 0.5) * 90;
        tok.y += (rand() - 0.5) * 90;
        tok.x = Math.max(TILE * 20, Math.min(TILE * (WORLD_TILES - 20), tok.x));
        tok.y = Math.max(TILE * 20, Math.min(TILE * (WORLD_TILES - 20), tok.y));
      }

      // стаи множатся в глуши (особенно ночью)
      if (tok.type === 'pack' && tok.units.length < 6) {
        const nightBonus = this.game.isNight() ? 0.06 : 0.02;
        if (rand() < nightBonus) tok.units.push(tok.units[0]);
      }

      // стая близко к поселению — осада против рейтинга обороны
      if (tok.type === 'pack' && rand() < 0.07) {
        const s = world.settlements.find(s =>
          (s.x * TILE - tok.x) ** 2 + (s.y * TILE - tok.y) ** 2 < (TILE * 30) ** 2);
        if (s) {
          const defense = s.guards * 2 + s.towers * 3;
          const strength = tok.units.length * 2 + tok.units.filter(u => u === 'banditHeavy').length * 2;
          if (strength > defense + (rand() < 0.5 ? 2 : 0)) {
            s.prosperity = Math.max(5, s.prosperity - 12);
            s.population = Math.max(2, s.population - 1);
            s.food = Math.max(0, s.food - 20);
            if (s.guards > 0 && rand() < 0.6) s.guards--;
            tok.units.length > 2 && rand() < 0.4 && tok.units.pop();
            events.push(world.day, `${cap(tok.name)} разорили окраины ${s.name} — есть жертвы`, { x: s.x, y: s.y });
          } else {
            tok.units.pop();
            if (rand() < 0.25 && s.guards > 1) s.guards--;
            if (!tok.units.length) tok.dead = true;
            events.push(world.day, `Стража ${s.name} отбила нападение (${tok.name})`, { x: s.x, y: s.y });
          }
        }
      }
    }
    this.tokens = this.tokens.filter(t => !t.dead);

    // редкие мировые события
    if (rand() < 0.10 && this.tokens.length < 14) {
      const kind = pick(rand, PACK_KINDS);
      const x = randInt(rand, 30, WORLD_TILES - 30), y = randInt(rand, 30, WORLD_TILES - 30);
      this.tokens.push({
        id: 'tok' + this.nextId++, type: 'pack', name: kind.name,
        faction: kind.faction, units: [...kind.units], x: x * TILE, y: y * TILE, hydrated: null,
      });
    }
    if (rand() < 0.08 && world.settlements.length >= 2) {
      const from = pick(rand, world.settlements);
      let to = pick(rand, world.settlements);
      if (to !== from) {
        this.tokens.push({
          id: 'tok' + this.nextId++, type: 'caravan', name: 'караван',
          faction: from.faction, units: ['npc', 'guard'],
          x: from.x * TILE, y: from.y * TILE, target: to.id, hydrated: null,
        });
        events.push(world.day, `Караван вышел из ${from.name} в ${to.name}`);
      }
    }

    this.checkHydration();
  }

  checkHydration() {
    const { players } = this.game;
    for (const tok of this.tokens) {
      let nearest = Infinity;
      for (const p of players.values()) {
        if (p.mapId !== 'over' || p.dead) continue;
        const d = Math.hypot(p.x - tok.x, p.y - tok.y);
        nearest = Math.min(nearest, d);
      }
      if (!tok.hydrated && nearest < HYDRATE_R) this.hydrate(tok);
      else if (tok.hydrated && nearest > DEHYDRATE_R) this.dehydrate(tok);
    }
  }

  hydrate(tok) {
    const ids = [];
    for (const unit of tok.units) {
      if (unit === 'npc' || unit === 'guard') {
        const id = this.game.spawnCaravanNpc(tok, unit);
        if (id) ids.push(id);
      } else {
        const id = this.game.spawnEnemy(unit, 'over', tok.x + (Math.random() - 0.5) * 60, tok.y + (Math.random() - 0.5) * 60, { token: tok.id, faction: tok.faction });
        if (id) ids.push(id);
      }
    }
    tok.hydrated = ids;
  }

  dehydrate(tok) {
    if (!tok.hydrated) return;
    const alive = [];
    let cx = 0, cy = 0, n = 0;
    for (const id of tok.hydrated) {
      const e = this.game.entities.get(id);
      if (e) { alive.push(e.kind); cx += e.x; cy += e.y; n++; this.game.entities.delete(id); }
    }
    if (!alive.length) { tok.dead = true; return; }
    tok.units = alive.filter(k => k !== 'npc' && k !== 'guard').length ? alive : tok.units;
    if (n) { tok.x = cx / n; tok.y = cy / n; }
    tok.hydrated = null;
  }

  // стая уничтожена в бою
  onTokenUnitKilled(tokId) {
    const tok = this.tokens.find(t => t.id === tokId);
    if (!tok || !tok.hydrated) return;
    const anyAlive = tok.hydrated.some(id => this.game.entities.has(id));
    if (!anyAlive) {
      tok.dead = true;
      this.game.events.push(this.game.world.day, `Путники истребили: ${tok.name}`, { x: Math.round(tok.x / TILE), y: Math.round(tok.y / TILE) });
      this.tokens = this.tokens.filter(t => !t.dead);
    }
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
