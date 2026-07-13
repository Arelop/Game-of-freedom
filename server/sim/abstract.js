// Холодная симуляция мира: токены (стаи монстров, караваны, рейды)
// живут как записи и двигаются по карте раз в ABSTRACT_DT секунд.
// Возле игроков токен «гидратируется» в реальных сущностей.
import { TILE, WORLD_TILES, seasonOf } from '../../shared/constants.js';
import { T } from '../../shared/constants.js';
import { baseTile } from '../world/worldgen.js';
import { randInt, pick } from '../../shared/rng.js';
import { RELATIONS } from './factions.js';

const RES_NAMES = { food: 'пшеницы', wood: 'древесины', metal: 'металла', crystal: 'кристаллов' };

export const ABSTRACT_DT = 5;
const HYDRATE_R = 340;        // px
const DEHYDRATE_R = 520;

// Стаи мира. biome — тайл, где стая может завестись (нет — где угодно);
// night — только ночью; winter — только зимой. Так работает бестиарий.
const PACK_KINDS = [
  { name: 'крысиное гнездо', units: ['rat', 'rat', 'rat', 'rat'], faction: 'monsters' },
  { name: 'стая волков', units: ['wolf', 'wolf', 'wolf'], faction: 'monsters', biome: T.FOREST_FLOOR },
  { name: 'слизни', units: ['slime', 'slime', 'slime', 'slime'], faction: 'monsters' },
  { name: 'банда разбойников', units: ['bandit', 'gnollRaider', 'banditHeavy'], faction: 'bandits' },
  { name: 'лесные стрелки', units: ['archer', 'archer', 'gnollRaider'], faction: 'bandits', biome: T.FOREST_FLOOR },
  { name: 'нежить', units: ['skeleton', 'ghoul', 'ghoul'], faction: 'monsters', night: true },
  { name: 'гоблинья ватага', units: ['goblin', 'goblin', 'goblin', 'hobgoblin'], faction: 'monsters' },
  { name: 'орочий отряд', units: ['orcWarrior', 'orcWarrior', 'orcKnight'], faction: 'monsters' },
  { name: 'упыриная стая', units: ['ghoul', 'ghoul', 'ghoul'], faction: 'monsters', night: true },
  { name: 'огр с прихвостнями', units: ['ogre', 'goblin', 'goblin'], faction: 'monsters' },
  // биомная живность
  { name: 'кабанье стадо', units: ['boar', 'boar', 'boar'], faction: 'monsters', biome: T.FOREST_FLOOR },
  { name: 'пауки', units: ['spider', 'spider', 'spider'], faction: 'monsters', biome: T.FOREST_FLOOR },
  { name: 'скорпионы', units: ['scorpion', 'scorpion', 'rat'], faction: 'monsters', biome: T.SAND },
  { name: 'наги топей', units: ['nagaWarrior', 'slime', 'slime'], faction: 'monsters', biome: T.SWAMP },
  { name: 'медведь-шатун', units: ['bear'], faction: 'monsters', biome: T.FOREST_FLOOR },
  { name: 'тролль с прихвостнями', units: ['ironTroll', 'goblin', 'goblin'], faction: 'monsters', biome: T.ROCK },
  { name: 'нетопыри', units: ['giantBat', 'giantBat', 'giantBat', 'giantBat'], faction: 'monsters', night: true },
  { name: 'некромант со свитой', units: ['necromancer', 'skeleton', 'ghoul'], faction: 'monsters', night: true },
  { name: 'ледяной великан', units: ['frostGiant'], faction: 'monsters', winter: true },
  // тактические стаи: лекарь и щитоносцы требуют думать, спор — не трогать вплотную
  { name: 'орочья дружина', units: ['orcShieldbearer', 'orcWarrior', 'orcPriest'], faction: 'monsters' },
  { name: 'блуждающие споры', units: ['gasSpore', 'gasSpore', 'gasSpore'], faction: 'monsters' },
];

// подобрать стаю под место и время
function pickPack(rand, game, tx, ty) {
  const base = baseTile(game.world.seed, tx, ty);
  const winter = seasonOf(game.world.day) === 3;
  const night = game.isNight();
  const fits = PACK_KINDS.filter(k =>
    (!k.biome || k.biome === base) && (!k.night || night) && (!k.winter || winter));
  return pick(rand, fits.length ? fits : PACK_KINDS);
}

export class AbstractSim {
  constructor(game) {
    this.game = game;
    this.tokens = [];       // { id, type:'pack'|'caravan', x, y (px), units, name, target }
    this.nextId = 1;
    this.timer = 0;
  }

  // Насколько сильно порча зиккуратов давит на оборону деревни (для осадной математики)
  taintNear(s) {
    const c = this.game.world.citadel;
    if (!c?.ziggurats?.length) return 0;
    let t = 0;
    for (const z of c.ziggurats)
      if ((s.x - z.x) ** 2 + (s.y - z.y) ** 2 < (z.taintR + 6) ** 2) t += 4;
    return t;
  }

  // Демоны из тёмных/провальных ритуалов: сильная стая у точки (в тайлах)
  spawnDemonPack(tx, ty) {
    this.tokens.push({
      id: 'tok' + this.nextId++, type: 'pack', name: 'демоны из иного мира',
      faction: 'monsters', units: ['demon', 'imp', 'imp'],
      x: tx * TILE, y: ty * TILE, hydrated: null,
    });
  }

  seedTokens() {
    const { world, rand } = this.game;
    for (let i = 0; i < 10; i++) {
      const x = randInt(rand, 40, WORLD_TILES - 40), y = randInt(rand, 40, WORLD_TILES - 40);
      if (baseTile(world.seed, x, y) <= T.WATER) continue;
      const kind = pickPack(rand, this.game, x, y);
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
      if (tok.besieging) continue; // осадное войско стоит лагерем — им правит stepSieges
      // блуждание / движение к цели
      if (tok.type === 'caravan' && tok.target) {
        const s = world.settlements.find(x => x.id === tok.target);
        // поселенцы идут именно в руины — возрождать
        if (tok.settlers && s) {
          const dx = s.x * TILE - tok.x, dy = s.y * TILE - tok.y;
          const d = Math.hypot(dx, dy);
          if (d < 60) {
            tok.dead = true;
            if (s.ruined) {
              s.ruined = false; s.captured = false;
              s.faction = tok.faction; s.homeFaction = tok.faction;
              s.population = 3; s.guards = 1; s.food = 50; s.wood = 10;
              s.prosperity = 30;
              events.push(world.day, `Поселенцы возродили ${s.name}! Теперь это земля ${tok.faction === 'severane' ? 'Северян' : tok.faction === 'ozerny' ? 'Озёрного союза' : 'Степняков'}`, { x: s.x, y: s.y });
              this.game.toastAll(`★ ${s.name} возрождена поселенцами!`);
            }
          } else { tok.x += dx / d * 40; tok.y += dy / d * 40; }
          continue;
        }
        if (s && !s.ruined) {
          const dx = s.x * TILE - tok.x, dy = s.y * TILE - tok.y;
          const d = Math.hypot(dx, dy);
          if (d < 60) { // прибыл: передаёт груз, крепнут связи
            s.prosperity = Math.min(100, s.prosperity + 4);
            // эскорт-квесты выполнены
            for (const p of this.game.players.values()) {
              for (const q of p.quests || [])
                if (q.type === 'escort' && q.token === tok.id && !q.done) this.game.completeQuestObjective(p, q);
            }
            if (tok.cargo) {
              s[tok.cargo.res] = Math.min(140, (s[tok.cargo.res] || 0) + tok.cargo.amount);
              const from = world.settlements.find(x => x.id === tok.from);
              if (from && from.faction !== s.faction) {
                RELATIONS[from.faction][s.faction] = Math.min(100, (RELATIONS[from.faction][s.faction] || 0) + 3);
                RELATIONS[s.faction][from.faction] = RELATIONS[from.faction][s.faction];
              }
              events.push(world.day, `Караван привёз ${tok.cargo.amount} ${RES_NAMES[tok.cargo.res]} в ${s.name}`, { x: s.x, y: s.y });
            } else {
              events.push(world.day, `Караван прибыл в ${s.name}`);
            }
            tok.dead = true;
          } else {
            tok.x += dx / d * 40; tok.y += dy / d * 40;
            // стая рядом — грабёж; сопровождающий игрок отпугивает
            const escorted = [...this.game.players.values()].some(p =>
              !p.dead && p.mapId === 'over' &&
              (p.x - tok.x) ** 2 + (p.y - tok.y) ** 2 < 220 ** 2);
            const raider = this.tokens.find(t => t.type === 'pack' && !t.dead &&
              (t.x - tok.x) ** 2 + (t.y - tok.y) ** 2 < (TILE * 5) ** 2);
            if (raider && !escorted && rand() < 0.6) {
              tok.dead = true;
              if (raider.units.length < 6) raider.units.push(raider.units[0]);
              events.push(world.day,
                `${cap(raider.name)} разграбили караван с ${tok.cargo ? RES_NAMES[tok.cargo.res] : 'товаром'}!`,
                { x: Math.round(tok.x / TILE), y: Math.round(tok.y / TILE) });
              for (const p of this.game.players.values()) {
                const fq = (p.quests || []).find(q => q.type === 'escort' && q.token === tok.id);
                if (fq) {
                  p.quests = p.quests.filter(q => q !== fq);
                  this.game.toast(p, '✖ Караван разграблен — задание провалено');
                }
              }
            }
          }
        } else tok.dead = true;
      } else if (tok.home) {
        // гарнизон: не покидает крепость
        tok.x = tok.home.x; tok.y = tok.home.y;
      } else if (tok.march) {
        // войско Тьмы: марш прямиком к цели
        const s = world.settlements.find(x => x.id === tok.march);
        if (!s || s.ruined || s.faction === tok.faction) tok.march = null;
        else {
          const dx = s.x * TILE - tok.x, dy = s.y * TILE - tok.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d > 80) { tok.x += dx / d * 55; tok.y += dy / d * 55; }
        }
      } else {
        tok.x += (rand() - 0.5) * 90;
        tok.y += (rand() - 0.5) * 90;
        tok.x = Math.max(TILE * 20, Math.min(TILE * (WORLD_TILES - 20), tok.x));
        tok.y = Math.max(TILE * 20, Math.min(TILE * (WORLD_TILES - 20), tok.y));
      }

      // стаи множатся в глуши (особенно ночью); войска Тьмы не плодятся —
      // их численность задаёт Цитадель, а праздные отряды тают (уходят домой)
      if (tok.faction === 'darkness') {
        if (!tok.march && !tok.garrison && rand() < 0.05) {
          tok.units.pop();
          if (!tok.units.length) tok.dead = true;
        }
      } else if (tok.type === 'pack' && tok.units.length < 6) {
        const nightBonus = this.game.isNight() ? 0.06 : 0.02;
        if (rand() < nightBonus) tok.units.push(tok.units[0]);
      }

      // стая близко к поселению — осада против рейтинга обороны
      const winter = seasonOf(world.day) === 3;
      const dark = tok.faction === 'darkness';
      if (tok.type === 'pack' && !tok.garrison && rand() < (dark ? 0.12 : winter ? 0.11 : 0.07)) {
        const s = world.settlements.find(s => !s.ruined && !s.captured &&
          (s.x * TILE - tok.x) ** 2 + (s.y * TILE - tok.y) ** 2 < (TILE * 30) ** 2);
        if (s) {
          // если рядом есть игрок и это войско Тьмы/бандитов — не решаем числом,
          // а начинаем ЖИВУЮ ОСАДУ волнами (герои могут отбить)
          if ((dark || tok.faction === 'bandits') && !s.siege && this.game.trySiege(s, tok)) continue;
          // порча вокруг зиккуратов ослабляет оборону
          const taintNear = this.taintNear(s);
          const defense = Math.max(1, s.guards * 2 + s.towers * 3 + (s.wardT > 0 ? 6 : 0) + (s.spiritT > 0 ? 5 : 0) - taintNear);
          // элита Тьмы и громилы бьют сильнее рядовых
          const elite = tok.units.filter(u => u === 'banditHeavy' || u === 'darkKnight' || u === 'darkMage').length;
          const strength = tok.units.length * 2 + elite * 2;
          if (strength > defense + (rand() < 0.5 ? 2 : 0)) {
            s.prosperity = Math.max(5, s.prosperity - 12);
            s.population = Math.max(0, s.population - 1);
            s.food = Math.max(0, s.food - 20);
            if (s.guards > 0 && rand() < 0.6) s.guards--;
            tok.units.length > 2 && rand() < 0.4 && tok.units.pop();
            // добитая деревня: бандиты захватывают, Тьма ставит форт, твари оставляют руины
            if (s.population <= 2 && s.guards === 0) {
              if (tok.faction === 'bandits') this.game.civ.captureSettlement(s);
              else if (dark) { this.game.civ.captureByDarkness(s); tok.dead = true; } // войско становится гарнизоном
              else this.game.civ.ruinSettlement(s, 'разорена чудовищами');
            } else {
              events.push(world.day, `${cap(tok.name)} разорили окраины ${s.name} — есть жертвы`, { x: s.x, y: s.y });
            }
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

    // казнь главаря (сюжет Ярославы): Вольница временно не собирает банды
    if (world.banditsWeakT > 0) world.banditsWeakT -= ABSTRACT_DT;

    // редкие мировые события: стая заводится в подходящем биоме
    if (rand() < 0.10 && this.tokens.length < 14) {
      const x = randInt(rand, 30, WORLD_TILES - 30), y = randInt(rand, 30, WORLD_TILES - 30);
      let kind = pickPack(rand, this.game, x, y);
      if (kind.faction === 'bandits' && world.banditsWeakT > 0) kind = PACK_KINDS[0]; // банды притихли
      this.tokens.push({
        id: 'tok' + this.nextId++, type: 'pack', name: kind.name,
        faction: kind.faction, units: [...kind.units], x: x * TILE, y: y * TILE, hydrated: null,
      });
    }
    // торговля: избыток едет туда, где дефицит
    if (rand() < 0.25 && world.settlements.length >= 2) {
      const THRESH = { food: [80, 30], wood: [45, 12], metal: [15, 4], crystal: [8, 1] };
      const alive = world.settlements.filter(s => !s.ruined && !s.captured);
      outer: for (const res of ['metal', 'food', 'wood', 'crystal']) {
        const [hi, lo] = THRESH[res];
        for (const from of alive) {
          if ((from[res] || 0) < hi) continue;
          for (const to of alive) {
            if (to === from || (to[res] || 0) > lo) continue;
            const amount = res === 'crystal' ? 3 : res === 'metal' ? 8 : 20;
            from[res] -= amount;
            from.prosperity = Math.min(100, from.prosperity + 3);
            this.tokens.push({
              id: 'tok' + this.nextId++, type: 'caravan', name: 'караван',
              faction: from.faction, units: ['npc', 'guard'],
              x: from.x * TILE, y: from.y * TILE, target: to.id, from: from.id,
              cargo: { res, amount }, hydrated: null,
            });
            events.push(world.day, `Караван с ${RES_NAMES[res]} вышел из ${from.name} в ${to.name}`);
            break outer;
          }
        }
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
    // контракт «Орда»: стаи возле контрактника в полтора раза больше
    let units = tok.units;
    if (tok.type === 'pack') {
      const horde = [...this.game.players.values()].some(q =>
        q.contract?.type === 'horde' && !q.dead && q.mapId === 'over' &&
        (q.x - tok.x) ** 2 + (q.y - tok.y) ** 2 < 500 ** 2);
      if (horde) units = [...tok.units, ...tok.units.slice(0, Math.ceil(tok.units.length / 2))];
    }
    for (const unit of units) {
      if (tok.army) { // ВОЙНА НАРОДОВ: юниты — солдаты фракции (militia/archer/veteran)
        const id = this.game.spawnSoldier(tok, unit, tok.x + (Math.random() - 0.5) * 70, tok.y + (Math.random() - 0.5) * 70);
        if (id) ids.push(id);
      } else if (unit === 'npc' || unit === 'guard' || unit === 'trader') {
        const id = this.game.spawnCaravanNpc(tok, unit);
        if (id) ids.push(id);
      } else {
        const id = this.game.spawnEnemy(unit, 'over', tok.x + (Math.random() - 0.5) * 60, tok.y + (Math.random() - 0.5) * 60,
          { token: tok.id, faction: tok.faction, forceElite: !!tok.hunt });
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

  // стая уничтожена в бою (x, y — место последнего убийства для трофеев)
  onTokenUnitKilled(tokId, x, y) {
    const tok = this.tokens.find(t => t.id === tokId);
    if (!tok || !tok.hydrated) return;
    const anyAlive = tok.hydrated.some(id => this.game.entities.has(id));
    if (!anyAlive) {
      tok.dead = true;
      // именной зверь: трофеи храбрецам
      if (tok.hunt) {
        const hx = x ?? tok.x, hy = y ?? tok.y;
        this.game.dropRandomGear('over', hx, hy, true, 6);
        this.game.dropRandomWeapon('over', hx + 12, hy, 6, 2);
        this.game.spawnDrop('coin', 40 + Math.floor(this.game.rand() * 40), 'over', hx - 10, hy, 300);
        this.game.toastAll(`🏆 «${tok.hunt}» повержен! Трофеи ждут на месте охоты`, true);
        this.game.events.push(this.game.world.day, `Путники добыли зверя по кличке ${tok.hunt}`);
      }
      if (tok.garrison && this.game.world.citadel) {
        // штурм Цитадели удался: мощь Тьмы подрублена вдвое
        const c = this.game.world.citadel;
        c.power = Math.max(3, Math.round(c.power / 2));
        this.game.events.push(this.game.world.day, `★ Гарнизон Чернокаменной Цитадели повержен — Тьма отступает!`, { x: Math.round(tok.x / TILE), y: Math.round(tok.y / TILE) });
        this.game.toastAll('★ Гарнизон Цитадели повержен! Тьма ослаблена', true);
        // Война с Тьмой: победа в штурме обнажает Сердце Тьмы
        const w = this.game.world.war;
        if (w && w.stage === 3) {
          w.stage = 4;
          this.game.spawnDarkHeart();
          this.game.toastAll('🖤 В пустом зале Цитадели обнажилось СЕРДЦЕ ТЬМЫ. Реши его судьбу (E)', true);
          this.game.events.push(this.game.world.day, 'Штурм Цитадели удался — Сердце Тьмы беззащитно');
        }
      } else {
        this.game.events.push(this.game.world.day, `Путники истребили: ${tok.name}`, { x: Math.round(tok.x / TILE), y: Math.round(tok.y / TILE) });
      }
      this.tokens = this.tokens.filter(t => !t.dead);
    }
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
