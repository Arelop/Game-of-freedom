// Тайловый рендер: чанк пре-рендерится в оффскрин-канвас один раз.
// Анимированные тайлы (костёр, портал) рисуются поверх каждый кадр.
import { CHUNK, TILE, T } from '../../shared/constants.js';
import { hash2 } from '../../shared/rng.js';

// тайл -> [подложка, объект-спрайт] (объект с прозрачностью поверх подложки)
const TILE_SPRITES = {
  [T.DEEP_WATER]: ['tile_deep_water'],
  [T.WATER]: ['tile_water'],
  [T.SAND]: ['tile_sand'],
  [T.GRASS]: ['tile_grass'],
  [T.FOREST_FLOOR]: ['tile_grass2'],
  [T.DIRT]: ['tile_dirt'],
  [T.ROCK]: ['tile_rock'],
  [T.SWAMP]: ['tile_swamp'],
  [T.FLOOR_WOOD]: ['tile_floor_wood'],
  [T.FLOOR_STONE]: ['tile_dungeon_floor2'],
  [T.WALL]: ['tile_wall'],
  [T.TREE]: ['tile_grass', 'tile_tree'],
  [T.ROCK_SOLID]: ['tile_rock_solid'],
  [T.BUSH]: ['tile_grass', 'tile_bush'],
  [T.ROAD]: ['tile_road'],
  [T.DUNGEON_FLOOR]: ['tile_dungeon_floor'],
  [T.DUNGEON_WALL]: ['tile_dungeon_wall'],
  [T.DOOR]: ['tile_floor_wood', 'tile_door'],
  [T.WATER_EDGE]: ['tile_water_edge'],
  [T.CAMPFIRE]: ['tile_grass'],       // огонь — анимированный оверлей
  [T.STALL]: ['tile_grass', 'obj_stall'],
  [T.BED]: ['tile_floor_wood', 'obj_bed'],
  [T.TABLE]: ['tile_floor_wood', 'obj_table'],
  [T.WELL]: ['tile_grass', 'obj_well'],
  [T.CHEST]: ['tile_dungeon_floor', 'obj_chest'],
  [T.DUNGEON_DOOR]: ['tile_dungeon_floor', 'tile_door'],
  [T.DUNGEON_EXIT]: ['tile_dungeon_floor'], // портал — оверлей
  [T.FIELD]: ['tile_field'],
  [T.TOWER]: ['tile_wall_stone'],
  [T.MINE]: ['tile_rock_solid'],
  [T.SHRINE]: ['tile_grass', 'obj_shrine'],
  [T.RUBBLE]: ['tile_rubble'],
  [T.FENCE]: ['tile_grass', 'tile_fence'],
  [T.ANVIL]: ['tile_floor_wood', 'obj_anvil'],
  [T.BOARD]: ['tile_grass', 'obj_sign'],
  [T.OBELISK]: ['tile_grass', 'obj_obelisk'],
  [T.STATUE]: ['tile_dungeon_floor', 'obj_statue'],
  [T.FOUNTAIN]: ['tile_grass', 'obj_fountain'],
  [T.DARK_ALTAR]: ['tile_grass', 'obj_idol'],
  [T.CRYSTAL_WALL]: ['tile_crystal_wall'],
  [T.PILLAR]: ['tile_dungeon_floor', 'obj_column'],
  [T.BLOOD]: ['tile_blood'],
  [T.TRAP]: ['tile_dungeon_floor', 'obj_trap'],
  [T.LOCKED_DOOR]: ['tile_dungeon_floor', 'obj_door_locked'],
  [T.STAIRS]: ['tile_dungeon_floor', 'obj_stairs'],
  // Выжженные земли
  [T.ASH]: ['tile_ash'],
  [T.LAVA]: ['tile_lava_0'],            // мерцание — анимированный оверлей
  [T.OBSIDIAN]: ['tile_obsidian'],
  [T.BURNT_TREE]: ['tile_ash', 'obj_burnt_tree'],
  [T.EMBER]: ['tile_ash', 'obj_ember'],
  [T.PORTAL]: ['tile_ash'],             // пламя портала — оверлей
  // детализация подземелий
  [T.BARREL]: ['tile_dungeon_floor', 'obj_barrel'],
  [T.CRATE]: ['tile_dungeon_floor', 'obj_crate'],
  [T.SACK]: ['tile_dungeon_floor', 'obj_sack'],
  [T.BARREL_FIRE]: ['tile_dungeon_floor', 'obj_barrel_fire'], // пламя — оверлей
  [T.BONES]: ['tile_dungeon_floor', 'obj_bones'],
  [T.CRACKED_WALL]: ['tile_wall_crack'],
  [T.PLAQUE]: ['tile_dungeon_floor', 'obj_plaque'],
  [T.PLATE]: ['tile_dungeon_floor', 'obj_plate'],
  // фракционная архитектура
  [T.WALL_LOG]: ['tile_wall_log'],
  [T.WALL_STONE2]: ['tile_wall_stone2'],
  [T.WALL_CLAY]: ['tile_wall_clay'],
  [T.YURT]: ['tile_grass', 'obj_yurt'],
  [T.PIER]: ['tile_pier'],
};

// Тайлсеты подземелий: пол/стена по стилю места (шахта, склеп, пещера, форт)
const DUNGEON_STYLES = {
  mine: { floor: ['tile_dfloor_mine', 'tile_dfloor_mine2'], wall: 'tile_dwall_mine' },
  crypt: { floor: ['tile_dfloor_crypt', 'tile_dfloor_crypt2'], wall: 'tile_dwall_crypt' },
  cave: { floor: ['tile_dfloor_cave', 'tile_dfloor_cave2'], wall: 'tile_dwall_cave' },
  fort: { floor: ['tile_dfloor_fort', 'tile_dfloor_fort2'], wall: 'tile_dwall_fort' },
};
// по этим тайлам «стоит» факел на стене (пол под стеной)
const TORCH_FLOORS = new Set([T.DUNGEON_FLOOR, T.BLOOD, T.TRAP, T.BONES, T.RUBBLE, T.PLATE]);

export class TileRenderer {
  constructor(atlas, net) {
    this.atlas = atlas;
    this.net = net;               // источник чанков (net.chunks: Map key->Uint8Array)
    this.canvases = new Map();    // key -> {canvas, animated: [{x,y,tile}]}
  }

  invalidate(key) { this.canvases.delete(key); }
  clear() { this.canvases.clear(); }

  getChunkCanvas(mapId, cx, cy) {
    const key = mapId + ':' + cx + ',' + cy;
    let entry = this.canvases.get(key);
    if (entry) return entry;
    const tiles = this.net.chunks.get(key);
    if (!tiles) return null;
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK * TILE; canvas.height = CHUNK * TILE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const animated = [];
    // тайлсет данжа: пол и стены по стилю места (шахта/склеп/пещера/форт)
    const style = DUNGEON_STYLES[this.net.mapStyle?.get(mapId)];
    const styledFloor = (x, y) => {
      const h = hash2(7, cx * CHUNK + x, cy * CHUNK + y) % 100;
      return style.floor[h < 30 ? 1 : 0];
    };
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const t = tiles[y * CHUNK + x];
        let spec = TILE_SPRITES[t] || ['tile_grass'];
        // решётка в подземелье стоит на каменном полу, не на траве
        if (t === T.FENCE && mapId !== 'over') spec = ['tile_dungeon_floor', 'tile_fence'];
        // вариативность травы по хэшу
        if (t === T.GRASS) {
          const h = hash2(11, cx * CHUNK + x, cy * CHUNK + y) % 100;
          spec = [h < 2 ? 'tile_grass_flowers' : h < 25 ? 'tile_grass2' : 'tile_grass'];
        }
        // дозорная башня: высокий спрайт 16×32 (у старых башен 2×2 —
        // рисуем один спрайт в правом нижнем углу кластера)
        if (t === T.TOWER) {
          this.atlas.blit(ctx, 'tile_grass', x * TILE, y * TILE);
          const eastTower = x < CHUNK - 1 && tiles[y * CHUNK + x + 1] === T.TOWER;
          const southTower = y < CHUNK - 1 && tiles[(y + 1) * CHUNK + x] === T.TOWER;
          if (!eastTower && !southTower) this.atlas.blit(ctx, 'obj_tower', x * TILE, y * TILE - 16);
          continue;
        }
        if (style) {
          if (t === T.DUNGEON_FLOOR) spec = [styledFloor(x, y)];
          else if (t === T.DUNGEON_WALL) spec = [style.wall];
          else if (spec[0] === 'tile_dungeon_floor') spec = [styledFloor(x, y), spec[1]];
          // факелы на стенах: живой огонь там, где стена смотрит в зал
          if (t === T.DUNGEON_WALL && y < CHUNK - 1 && TORCH_FLOORS.has(tiles[(y + 1) * CHUNK + x])
            && hash2(13, cx * CHUNK + x, cy * CHUNK + y) % 100 < 9)
            animated.push({ x: cx * CHUNK + x, y: cy * CHUNK + y, tile: 'torch' });
        }
        this.atlas.blit(ctx, spec[0], x * TILE, y * TILE);
        if (spec[1]) this.atlas.blit(ctx, spec[1], x * TILE, y * TILE);
        if (t === T.CAMPFIRE || t === T.DUNGEON_EXIT || t === T.BOARD
          || t === T.CRYSTAL_WALL || t === T.FOUNTAIN // кристаллы и источники светятся в темноте
          || t === T.LAVA || t === T.PORTAL || t === T.EMBER || t === T.BARREL_FIRE)
          animated.push({ x: cx * CHUNK + x, y: cy * CHUNK + y, tile: t });
      }
    }
    entry = { canvas, animated };
    this.canvases.set(key, entry);
    return entry;
  }

  render(ctx, cam, mapId, timeSec) {
    const px = CHUNK * TILE;
    const x0 = Math.floor((cam.x - 260) / px), x1 = Math.floor((cam.x + 260) / px);
    const y0 = Math.floor((cam.y - 150) / px), y1 = Math.floor((cam.y + 150) / px);
    const anims = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const entry = this.getChunkCanvas(mapId, cx, cy);
        const s = cam.toScreen(cx * px, cy * px);
        if (!entry) {
          // чанк ещё не пришёл — приглушённый тон земли вместо чёрного
          ctx.fillStyle = mapId === 'over' ? '#2e4423' : '#1c1a24';
          ctx.fillRect(s.x, s.y, px, px);
          continue;
        }
        ctx.drawImage(entry.canvas, s.x, s.y);
        anims.push(...entry.animated);
      }
    }
    // анимированные оверлеи
    for (const a of anims) {
      const s = cam.toScreen(a.x * TILE + 8, a.y * TILE + 8);
      if (a.tile === T.CAMPFIRE) {
        const frame = Math.floor(timeSec * 6) % 2;
        this.atlas.draw(ctx, 'obj_campfire_' + frame, s.x, s.y);
      } else if (a.tile === T.DUNGEON_EXIT) {
        const sc = 1 + Math.sin(timeSec * 4) * 0.08;
        this.atlas.draw(ctx, 'obj_exit_portal', s.x, s.y, { scale: sc });
      } else if (a.tile === T.BOARD) {
        // доска заказов гильдии зовёт героев
        const bob = Math.sin(timeSec * 3) * 1.5;
        this.atlas.draw(ctx, 'ui_quest_mark', s.x, s.y - 14 + bob);
      } else if (a.tile === T.LAVA) {
        // лава дышит: мерцающий второй кадр (стабильная фаза по координате)
        if (Math.floor(timeSec * 3 + a.x * 0.7 + a.y * 1.3) % 2)
          this.atlas.draw(ctx, 'tile_lava_1', s.x, s.y);
      } else if (a.tile === T.PORTAL) {
        const sc = 1 + Math.sin(timeSec * 5) * 0.1;
        this.atlas.draw(ctx, 'obj_flame_portal', s.x, s.y, { scale: sc });
      } else if (a.tile === 'torch') {
        // факел на стене данжа: мерцающий живой огонь
        const frame = Math.floor(timeSec * 8 + a.x * 1.7 + a.y) % 4;
        this.atlas.draw(ctx, 'obj_torch_' + frame, s.x, s.y + 3);
      } else if (a.tile === T.BARREL_FIRE) {
        // фитиль огненной бочки тлеет — заметно и тревожно
        const frame = Math.floor(timeSec * 6 + a.x) % 2;
        this.atlas.draw(ctx, 'obj_campfire_' + frame, s.x, s.y - 6, { scale: 0.55 });
      }
    }
  }
}
