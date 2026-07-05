// Процедурные пиксель-спрайты в палитре DB32 — фолбэк и дополнение к пакам Kenney.
// Каждый генератор возвращает { w, h, data: Uint8Array RGBA }.
import { hash2 } from '../shared/rng.js';

// Подмножество DB32
export const C = {
  black: [0, 0, 0], dgray: [69, 69, 69], gray: [117, 113, 97], lgray: [178, 175, 165],
  white: [238, 238, 238], dbrown: [63, 40, 27], brown: [102, 57, 49], lbrown: [143, 86, 59],
  tan: [217, 160, 102], sand: [238, 195, 154], dgreen: [52, 101, 36], green: [106, 190, 48],
  lgreen: [153, 229, 80], dblue: [34, 32, 52], navy: [48, 52, 109], blue: [91, 110, 225],
  lblue: [99, 155, 255], cyan: [95, 205, 228], dred: [110, 30, 30], red: [217, 55, 43],
  orange: [223, 113, 38], yellow: [251, 242, 54], purple: [118, 66, 138], pink: [215, 123, 186],
  swamp: [75, 105, 47], steel: [132, 126, 135],
};

function make(w, h) { return { w, h, data: new Uint8Array(w * h * 4) }; }
function px(s, x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  const i = (y * s.w + x) * 4;
  s.data[i] = c[0]; s.data[i + 1] = c[1]; s.data[i + 2] = c[2]; s.data[i + 3] = a;
}
function rect(s, x, y, w, h, c, a = 255) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(s, x + i, y + j, c, a);
}
function frame(s, x, y, w, h, c) {
  for (let i = 0; i < w; i++) { px(s, x + i, y, c); px(s, x + i, y + h - 1, c); }
  for (let j = 0; j < h; j++) { px(s, x, y + j, c); px(s, x + w - 1, y + j, c); }
}
function disc(s, cx, cy, r, c, a = 255) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r + r * 0.5) px(s, cx + x, cy + y, c, a);
}
function ring(s, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = x * x + y * y;
    if (d <= r * r + r * 0.5 && d >= (r - 1) * (r - 1)) px(s, cx + x, cy + y, c);
  }
}
// детерминированный дизер по координатам
function dither(s, base, spots, density, seed = 7) {
  rect(s, 0, 0, s.w, s.h, base);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++)
    if (hash2(seed, x, y) % 100 < density) px(s, x, y, spots);
}

const GEN = {
  water() {
    const s = make(16, 16);
    dither(s, C.blue, C.lblue, 10, 21);
    px(s, 3, 4, C.cyan); px(s, 4, 4, C.cyan); px(s, 11, 10, C.cyan); px(s, 12, 10, C.cyan);
    return s;
  },
  deepWater() {
    const s = make(16, 16);
    dither(s, C.navy, C.blue, 8, 22);
    return s;
  },
  waterEdge() {
    const s = make(16, 16);
    dither(s, C.blue, C.lblue, 12, 23);
    rect(s, 0, 0, 16, 2, C.sand); rect(s, 0, 2, 16, 1, C.cyan);
    return s;
  },
  sand() {
    const s = make(16, 16);
    dither(s, C.sand, C.tan, 12, 24);
    return s;
  },
  swamp() {
    const s = make(16, 16);
    dither(s, C.swamp, C.dgreen, 18, 25);
    px(s, 5, 6, C.green); px(s, 10, 12, C.green); px(s, 12, 3, C.lblue, 160);
    return s;
  },
  rockFloor() {
    const s = make(16, 16);
    dither(s, C.gray, C.lgray, 10, 26);
    px(s, 4, 5, C.dgray); px(s, 5, 5, C.dgray); px(s, 11, 11, C.dgray); px(s, 12, 12, C.dgray);
    return s;
  },
  rockSolid() {
    const s = make(16, 16);
    dither(s, C.gray, C.lgray, 8, 27);
    disc(s, 8, 9, 6, C.lgray); disc(s, 7, 8, 5, C.steel);
    px(s, 5, 6, C.white); px(s, 6, 6, C.white);
    for (let x = 3; x <= 12; x++) px(s, x, 13, C.dgray);
    return s;
  },
  field() {
    const s = make(16, 16);
    dither(s, C.brown, C.dbrown, 14, 28);
    for (const row of [3, 8, 13]) for (let x = 1; x < 16; x += 3) {
      px(s, x, row, C.green); px(s, x, row - 1, C.lgreen);
    }
    return s;
  },
  campfire({ frame: f = 0 } = {}) {
    const s = make(16, 16);
    rect(s, 3, 11, 10, 2, C.brown); rect(s, 5, 12, 6, 2, C.lbrown);
    const flick = f === 0 ? 0 : 1;
    disc(s, 8, 8 - flick, 3, C.orange); disc(s, 8, 7 - flick, 2, C.yellow);
    px(s, 8, 4 - flick, C.yellow); px(s, 7, 5, C.orange); px(s, 10, 6, C.orange);
    return s;
  },
  well() {
    const s = make(16, 16);
    disc(s, 8, 9, 6, C.steel); disc(s, 8, 9, 4, C.dgray); disc(s, 8, 9, 3, C.navy);
    rect(s, 3, 2, 2, 6, C.brown); rect(s, 11, 2, 2, 6, C.brown);
    rect(s, 2, 1, 12, 2, C.lbrown);
    return s;
  },
  bed() {
    const s = make(16, 16);
    rect(s, 2, 2, 12, 12, C.brown); rect(s, 3, 3, 10, 10, C.red);
    rect(s, 3, 3, 10, 4, C.white); rect(s, 4, 4, 8, 2, C.lgray);
    return s;
  },
  table() {
    const s = make(16, 16);
    rect(s, 2, 4, 12, 8, C.lbrown); frame(s, 2, 4, 12, 8, C.brown);
    rect(s, 4, 6, 3, 2, C.tan);
    return s;
  },
  stall() {
    const s = make(16, 16);
    for (let x = 0; x < 16; x++) rect(s, x, 1, 1, 3, (x >> 1) % 2 ? C.red : C.white);
    rect(s, 2, 8, 12, 5, C.lbrown); frame(s, 2, 8, 12, 5, C.brown);
    px(s, 5, 10, C.yellow); px(s, 8, 10, C.green); px(s, 11, 10, C.red);
    return s;
  },
  dungeonEntrance() {
    const s = make(16, 16);
    disc(s, 8, 10, 7, C.dgray); disc(s, 8, 11, 5, C.dblue);
    disc(s, 8, 12, 3, C.black);
    px(s, 3, 5, C.lgray); px(s, 12, 4, C.lgray); px(s, 8, 3, C.gray);
    return s;
  },
  exitPortal() {
    const s = make(16, 16);
    ring(s, 8, 8, 6, C.purple); ring(s, 8, 8, 4, C.pink);
    disc(s, 8, 8, 2, C.white);
    return s;
  },
  bow({ kind = 'short' } = {}) {
    const s = make(14, 14);
    const wood = kind === 'hunt' ? C.dbrown : C.lbrown;
    // дуга лука
    for (let y = 1; y <= 12; y++) {
      const dx = Math.round(Math.sin((y - 1) / 11 * Math.PI) * 4);
      px(s, 3 + dx, y, wood);
      if (kind === 'hunt') px(s, 3 + dx + 1, y, C.brown);
    }
    // тетива
    for (let y = 1; y <= 12; y++) px(s, 3, y, C.lgray, 200);
    // стрела наготове
    rect(s, 3, 6, 9, 1, C.tan); px(s, 12, 6, C.lgray); px(s, 2, 5, C.white); px(s, 2, 7, C.white);
    return s;
  },
  crossbow() {
    const s = make(14, 12);
    rect(s, 5, 5, 8, 2, C.brown);          // ложе
    rect(s, 4, 4, 2, 4, C.dbrown);         // приклад
    // дуга
    for (let y = 2; y <= 9; y++) { px(s, 8, y, C.gray); px(s, 9, y, C.dgray); }
    rect(s, 8, 5, 4, 1, C.lgray);          // болт
    px(s, 12, 5, C.white);
    return s;
  },
  staff({ gem = 'fire' } = {}) {
    const s = make(10, 16);
    for (let y = 4; y < 15; y++) { px(s, 5, y, C.brown); px(s, 4, y, C.dbrown); } // древко
    const g = gem === 'frost' ? C.cyan : gem === 'arcane' ? C.purple : C.orange;
    const gd = gem === 'frost' ? C.blue : gem === 'arcane' ? C.navy : C.red;
    disc(s, 5, 3, 2, gd); disc(s, 5, 3, 1, g); px(s, 4, 2, C.white);
    return s;
  },
  orb({ color = 'purple' } = {}) {
    const s = make(7, 7);
    const map = { red: [C.dred, C.red, C.pink], purple: [C.navy, C.purple, C.pink] };
    const [d, m, h] = map[color] || map.purple;
    disc(s, 3, 3, 3, d); disc(s, 3, 3, 2, m); px(s, 2, 2, h); px(s, 3, 2, C.white);
    return s;
  },
  magicOrb({ color = 'fire' } = {}) {
    const s = make(8, 8);
    const t = color === 'frost'
      ? { outer: C.blue, inner: C.cyan, core: C.white }
      : { outer: C.red, inner: C.orange, core: C.yellow };
    disc(s, 4, 4, 3, t.outer); disc(s, 4, 4, 2, t.inner); px(s, 3, 3, t.core); px(s, 4, 3, t.core);
    // хвостики пламени/инея
    px(s, 0, 4, t.inner); px(s, 7, 2, t.inner);
    return s;
  },
  arrow() {
    const s = make(11, 3);
    rect(s, 0, 1, 9, 1, C.brown);          // древко
    px(s, 9, 0, C.lgray); px(s, 10, 1, C.lgray); px(s, 9, 2, C.lgray); // наконечник
    px(s, 0, 0, C.tan); px(s, 0, 2, C.tan); px(s, 1, 0, C.tan); px(s, 1, 2, C.tan); // оперение
    return s;
  },
  knife() {
    const s = make(9, 5);
    rect(s, 0, 2, 3, 1, C.brown);          // рукоять
    rect(s, 3, 2, 5, 1, C.lgray);          // клинок
    px(s, 8, 2, C.white); px(s, 3, 1, C.dgray); px(s, 3, 3, C.dgray);
    return s;
  },
  bolt() {
    const s = make(9, 3);
    rect(s, 0, 1, 7, 1, C.brown); px(s, 7, 1, C.lgray); px(s, 8, 1, C.white);
    px(s, 0, 0, C.tan); px(s, 0, 2, C.tan);
    return s;
  },
  coin() {
    const s = make(8, 8);
    disc(s, 4, 4, 3, C.orange); disc(s, 4, 4, 2, C.yellow); px(s, 3, 3, C.white);
    return s;
  },
  meat({ cooked = false } = {}) {
    const s = make(10, 10);
    const main = cooked ? C.lbrown : C.red, hi = cooked ? C.tan : C.pink;
    disc(s, 4, 4, 3, main); px(s, 3, 3, hi); px(s, 4, 3, hi);
    rect(s, 6, 6, 3, 2, C.white); px(s, 8, 7, C.lgray);
    return s;
  },
  bread() {
    const s = make(10, 8);
    rect(s, 1, 2, 8, 4, C.tan); rect(s, 2, 1, 6, 1, C.sand);
    px(s, 3, 3, C.lbrown); px(s, 5, 3, C.lbrown); px(s, 7, 3, C.lbrown);
    return s;
  },
  bandage() {
    const s = make(9, 9);
    disc(s, 4, 4, 3, C.white); ring(s, 4, 4, 3, C.lgray);
    rect(s, 4, 2, 1, 5, C.red); rect(s, 2, 4, 5, 1, C.red);
    return s;
  },
  ammo({ color = 'yellow' } = {}) {
    const s = make(9, 9);
    rect(s, 1, 2, 7, 6, C.dgray); frame(s, 1, 2, 7, 6, C.black);
    rect(s, 2, 3, 5, 2, C[color] || C.yellow);
    px(s, 3, 6, C.lgray); px(s, 5, 6, C.lgray);
    return s;
  },
  wood() {
    const s = make(10, 8);
    rect(s, 0, 1, 10, 3, C.brown); rect(s, 0, 4, 10, 3, C.lbrown);
    px(s, 1, 2, C.tan); px(s, 8, 5, C.tan);
    return s;
  },
  hide() {
    const s = make(10, 9);
    rect(s, 2, 1, 6, 7, C.lbrown); px(s, 1, 2, C.lbrown); px(s, 8, 2, C.lbrown);
    px(s, 1, 6, C.lbrown); px(s, 8, 6, C.lbrown); rect(s, 4, 3, 2, 3, C.tan);
    return s;
  },
  herb() {
    const s = make(9, 9);
    rect(s, 4, 4, 1, 4, C.dgreen);
    px(s, 3, 3, C.green); px(s, 5, 3, C.green); px(s, 4, 2, C.lgreen);
    px(s, 2, 4, C.green); px(s, 6, 4, C.green);
    return s;
  },
  wolf() {
    const s = make(14, 10);
    rect(s, 2, 3, 9, 4, C.gray);
    rect(s, 10, 2, 3, 3, C.gray);
    px(s, 10, 1, C.dgray); px(s, 12, 1, C.dgray);
    px(s, 12, 3, C.red);
    px(s, 1, 3, C.lgray); px(s, 1, 4, C.lgray);
    rect(s, 3, 7, 1, 2, C.dgray); rect(s, 6, 7, 1, 2, C.dgray); rect(s, 9, 7, 1, 2, C.dgray);
    rect(s, 3, 3, 7, 1, C.lgray);
    return s;
  },
  totem({ variant = 0 } = {}) {
    const s = make(12, 16);
    const main = variant ? C.purple : C.gray, dark = variant ? C.navy : C.dgray;
    rect(s, 2, 2, 8, 12, main); frame(s, 2, 2, 8, 12, dark);
    rect(s, 1, 13, 10, 2, dark);
    disc(s, 6, 6, 2, variant ? C.pink : C.red); px(s, 6, 6, C.white);
    px(s, 3, 10, dark); px(s, 8, 10, dark); rect(s, 4, 11, 4, 1, dark);
    return s;
  },
  ogre() {
    const s = make(24, 24);
    rect(s, 5, 6, 14, 13, C.dgreen);
    rect(s, 6, 7, 12, 11, C.green);
    rect(s, 7, 2, 10, 7, C.green); frame(s, 7, 2, 10, 7, C.dgreen);
    px(s, 9, 5, C.red); px(s, 10, 5, C.white); px(s, 14, 5, C.red); px(s, 15, 5, C.white);
    rect(s, 10, 7, 5, 1, C.dred);
    px(s, 10, 6, C.white); px(s, 14, 6, C.white);
    rect(s, 2, 8, 3, 8, C.green); rect(s, 19, 8, 3, 8, C.green);
    rect(s, 7, 19, 4, 4, C.dgreen); rect(s, 13, 19, 4, 4, C.dgreen);
    rect(s, 6, 12, 12, 2, C.brown);
    px(s, 8, 1, C.dgreen); px(s, 16, 1, C.dgreen);
    return s;
  },
  heart({ fill = 'full' } = {}) {
    const s = make(9, 8);
    const c = fill === 'empty' ? C.dgray : C.red;
    disc(s, 2, 2, 1, c); disc(s, 6, 2, 1, c);
    for (let y = 2; y < 7; y++) rect(s, 2 + (y - 2), y, 5 - 2 * (y - 2) < 0 ? 0 : 5 - (y - 2) * 0 , 0, c);
    rect(s, 0, 2, 9, 2, c); rect(s, 1, 4, 7, 1, c); rect(s, 2, 5, 5, 1, c); rect(s, 3, 6, 3, 1, c); px(s, 4, 7, c);
    if (fill === 'half') { for (let y = 0; y < 8; y++) for (let x = 5; x < 9; x++) { const i = (y * 9 + x) * 4; if (s.data[i + 3]) { s.data[i] = C.dgray[0]; s.data[i + 1] = C.dgray[1]; s.data[i + 2] = C.dgray[2]; } } }
    if (fill !== 'empty') px(s, 1, 2, C.pink);
    return s;
  },
  shadow() {
    const s = make(12, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) {
      const dx = (x - 5.5) / 6, dy = (y - 2) / 2.5;
      if (dx * dx + dy * dy <= 1) px(s, x, y, C.black, 90);
    }
    return s;
  },
  crosshair() {
    const s = make(9, 9);
    ring(s, 4, 4, 3, C.white); px(s, 4, 4, C.white);
    px(s, 4, 0, C.white); px(s, 4, 8, C.white); px(s, 0, 4, C.white); px(s, 8, 4, C.white);
    return s;
  },
  questMark() {
    const s = make(6, 10);
    rect(s, 2, 0, 2, 6, C.yellow); rect(s, 2, 8, 2, 2, C.yellow);
    return s;
  },
};

export function genSprite(procName, args) {
  const fn = GEN[procName];
  if (!fn) throw new Error(`Нет генератора: ${procName}`);
  return fn(args || {});
}
