// Чанки: ленивое построение тайлов из базового рельефа + правок мира.
// mapId: 'over' — открытый мир, 'dg:<poiId>' — инстанс данжа.
import { CHUNK, WORLD_CHUNKS, T } from '../../shared/constants.js';
import { baseTile, decorTile } from './worldgen.js';

export class ChunkStore {
  constructor(world) {
    this.world = world;
    this.cache = new Map();     // "mapId:cx,cy" -> Uint8Array
    this.dungeons = new Map();  // dungeonMapId -> dungeon
  }

  key(mapId, cx, cy) { return mapId + ':' + cx + ',' + cy; }

  invalidate(mapId, tx, ty) {
    this.cache.delete(this.key(mapId, Math.floor(tx / CHUNK), Math.floor(ty / CHUNK)));
  }

  getChunk(mapId, cx, cy) {
    const k = this.key(mapId, cx, cy);
    let c = this.cache.get(k);
    if (c) return c;
    c = mapId === 'over' ? this.buildOverworld(cx, cy) : this.buildDungeonChunk(mapId, cx, cy);
    if (c) this.cache.set(k, c);
    return c;
  }

  buildOverworld(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= WORLD_CHUNKS || cy >= WORLD_CHUNKS) return null;
    const tiles = new Uint8Array(CHUNK * CHUNK);
    const { seed, edits } = this.world;
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const tx = cx * CHUNK + x, ty = cy * CHUNK + y;
        const edit = edits.get(tx + ',' + ty);
        if (edit !== undefined) { tiles[y * CHUNK + x] = edit; continue; }
        const base = baseTile(seed, tx, ty);
        const decor = decorTile(seed, tx, ty, base);
        tiles[y * CHUNK + x] = decor !== null ? decor : base;
      }
    }
    return tiles;
  }

  buildDungeonChunk(mapId, cx, cy) {
    const d = this.dungeons.get(mapId);
    if (!d) return null;
    const chunksPerSide = Math.ceil(d.size / CHUNK);
    if (cx < 0 || cy < 0 || cx >= chunksPerSide || cy >= chunksPerSide) return null;
    const tiles = new Uint8Array(CHUNK * CHUNK).fill(T.DUNGEON_WALL);
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const tx = cx * CHUNK + x, ty = cy * CHUNK + y;
        if (tx < d.size && ty < d.size) tiles[y * CHUNK + x] = d.grid[ty * d.size + tx];
      }
    }
    return tiles;
  }

  // Тайл по мировым координатам (для коллизий)
  tileAt(mapId, tx, ty) {
    if (mapId === 'over') {
      if (tx < 0 || ty < 0 || tx >= WORLD_CHUNKS * CHUNK || ty >= WORLD_CHUNKS * CHUNK) return T.DEEP_WATER;
      const chunk = this.getChunk('over', Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
      if (!chunk) return T.DEEP_WATER;
      return chunk[(ty % CHUNK) * CHUNK + (tx % CHUNK)];
    }
    const d = this.dungeons.get(mapId);
    if (!d || tx < 0 || ty < 0 || tx >= d.size || ty >= d.size) return T.DUNGEON_WALL;
    return d.grid[ty * d.size + tx];
  }

  // Установить тайл (двери данжа, открытый сундук) + сброс кэша чанка
  setTile(mapId, tx, ty, t) {
    if (mapId === 'over') {
      this.world.edits.set(tx + ',' + ty, t);
    } else {
      const d = this.dungeons.get(mapId);
      if (d) d.grid[ty * d.size + tx] = t;
    }
    this.invalidate(mapId, tx, ty);
  }
}
