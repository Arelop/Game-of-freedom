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
};

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
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const t = tiles[y * CHUNK + x];
        let spec = TILE_SPRITES[t] || ['tile_grass'];
        // вариативность травы по хэшу
        if (t === T.GRASS) {
          const h = hash2(11, cx * CHUNK + x, cy * CHUNK + y) % 100;
          spec = [h < 2 ? 'tile_grass_flowers' : h < 25 ? 'tile_grass2' : 'tile_grass'];
        }
        this.atlas.blit(ctx, spec[0], x * TILE, y * TILE);
        if (spec[1]) this.atlas.blit(ctx, spec[1], x * TILE, y * TILE);
        if (t === T.CAMPFIRE || t === T.DUNGEON_EXIT)
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
        if (!entry) continue;
        const s = cam.toScreen(cx * px, cy * px);
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
      }
    }
  }
}
