// Типы сообщений клиент<->сервер. JSON, поле t — тип.
export const MSG = {
  // клиент -> сервер
  JOIN: 'join',           // { name }
  INPUT: 'input',         // { seq, mx, my, aim, fire, roll, dt }
  CHUNK_REQ: 'chunkReq',  // { cx, cy }
  PING: 'ping',           // { t0 }
  SWITCH_WEAPON: 'switchWeapon', // { slot }
  RELOAD: 'reload',
  INTERACT: 'interact',   // контекстное действие (E)
  DIALOG_CHOICE: 'dialogChoice', // { id, choice }
  USE_ITEM: 'useItem',    // { item }
  EQUIP: 'equip',         // { item } надеть из инвентаря
  UNEQUIP: 'unequip',     // { slot } снять в инвентарь
  SPEND_STAT: 'spendStat',     // { stat } потратить очко характеристики
  LEARN_TALENT: 'learnTalent', // { id } изучить талант
  SELL_ITEM: 'sellItem',       // { item } продать торговцу рядом
  ABILITY: 'ability',          // { slot: 0..2 } применить способность Q/X/R
  OFFHAND: 'offhand',          // активировать предмет в левой руке (ПКМ)
  STASH: 'stash',              // { op: 'put'|'take', item } общий сундук отряда
  GIVE: 'give',                // { item } передать предмет союзнику рядом

  // сервер -> клиент
  WELCOME: 'welcome',     // { id, worldSeed, worldMeta, tick }
  SNAPSHOT: 'snap',       // { tick, lastSeq, you, ents, removed }
  CHUNK: 'chunk',         // { cx, cy, rle, objects }
  SHOT: 'shot',           // { pid, weapon, x, y, aim, seed, tick }
  ENEMY_SHOT: 'eshot',    // { eid, pattern, x, y, aim, shotIndex, seed, tick }
  HIT: 'hit',             // { kind, id, x, y, dmg, dir } попадание (для эффектов)
  EVENT: 'event',         // { kind, ... } смерть, подбор, взрыв, текст
  PONG: 'pong',           // { t0, serverTime, tick }
  TOAST: 'toast',         // { text } всплывающее сообщение
  DIALOG: 'dialog',       // { id, name, lines, choices }
  QUEST: 'quest',         // { quest } обновление квеста
  MAP_INFO: 'mapInfo',    // { settlements, pois } для миникарты
};

// RLE-кодирование массива тайлов чанка: [тайл, длина, тайл, длина, ...]
export function rleEncode(arr) {
  const out = [];
  let cur = arr[0], run = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === cur && run < 65535) run++;
    else { out.push(cur, run); cur = arr[i]; run = 1; }
  }
  out.push(cur, run);
  return out;
}

export function rleDecode(rle, expectLen) {
  const out = new Uint8Array(expectLen);
  let idx = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const v = rle[i], n = rle[i + 1];
    out.fill(v, idx, idx + n);
    idx += n;
  }
  return out;
}
