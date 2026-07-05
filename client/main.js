// Точка входа клиента: цикл с фиксированным шагом, рендер, эффекты.
import { VIEW_W, VIEW_H, SIM_DT, TILE, PLAYER_RADIUS } from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { STR } from '../shared/strings.js';
import { MSG } from '../shared/protocol.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { Atlas } from './render/atlas.js';
import { Camera } from './render/camera.js';
import { Particles } from './render/particles.js';
import { TileRenderer } from './render/tilemap.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { SFX, playWeaponSound } from './sfx.js';

// ---------- инициализация ----------
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
const view = document.createElement('canvas');
view.width = VIEW_W; view.height = VIEW_H;
const ctx = view.getContext('2d');
ctx.imageSmoothingEnabled = false;

const lightCanvas = document.createElement('canvas');
lightCanvas.width = VIEW_W; lightCanvas.height = VIEW_H;
const lctx = lightCanvas.getContext('2d');

function resize() {
  const k = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  screen.width = VIEW_W * k; screen.height = VIEW_H * k;
  sctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();

const atlas = new Atlas();
const net = new Net();
const input = new Input(screen);
const cam = new Camera();
const particles = new Particles();
const hud = new Hud(atlas);
const tiles = new TileRenderer(atlas, net);
const panels = new Panels(net);

// локальное косметическое состояние
let fireCd = 0;
let wasRolling = false;
let vignette = 0;          // красная вспышка урона
const flashes = new Map(); // id -> until (белая вспышка попадания)
let fps = 0, frames = 0, fpsT = 0;
let bigMap = false;
let localMag = 0, localWeapon = '';
let invRefresh = 0;

// ---------- меню ----------
const menu = document.getElementById('menu');
const nameInput = document.getElementById('nameInput');
nameInput.value = localStorage.getItem('heroName') || '';
document.getElementById('joinBtn').onclick = join;
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

function join() {
  const name = nameInput.value.trim() || 'Безымянный';
  localStorage.setItem('heroName', name);
  document.getElementById('menuHint').textContent = STR.connecting;
  net.connect(name);
}

net.handlers.onWelcome = () => { menu.style.display = 'none'; SFX.quest(); };
net.handlers.onFull = () => { document.getElementById('menuHint').textContent = 'Сервер полон (макс. 4).'; };
net.handlers.onDisconnect = () => {
  menu.style.display = 'flex';
  document.getElementById('menuHint').textContent = STR.disconnected;
};
net.handlers.onChunk = key => tiles.invalidate(key);
net.handlers.onMapChange = m => {
  tiles.clear();
  cam.x = m.x; cam.y = m.y;
  if (m.title) panels.toast('— ' + m.title + ' —');
};

net.handlers.onFx = (kind, m) => {
  switch (kind) {
    case 'shot': particles.muzzle(m.x, m.y, m.aim); if (m.pid !== net.myId) playWeaponSound(WEAPONS[m.weapon]?.sound); break;
    case 'eshot': SFX.enemy_shot(); break;
    case 'hit':
      if (m.kind === 'wall') particles.burst(m.x, m.y, '#847e87', 4, 40, 0.25);
      else particles.blood(m.x, m.y, 4);
      break;
    case 'hurt':
      flashes.set(m.id, performance.now() + 80);
      particles.blood(m.x, m.y, 5);
      SFX.hit();
      break;
    case 'phurt':
      if (m.id === net.myId) { vignette = 0.6; cam.addTrauma(0.5); SFX.hurt(); }
      else particles.blood(m.x, m.y, 6);
      break;
    case 'pdown':
      particles.blood(m.x, m.y, 20);
      cam.addTrauma(m.id === net.myId ? 0.9 : 0.3);
      SFX.die();
      break;
    case 'die': particles.blood(m.x, m.y, 12); SFX.die(); cam.addTrauma(0.15); break;
    case 'pickup': particles.sparkle(m.x, m.y); SFX.pickup(); break;
    case 'chest': particles.sparkle(m.x, m.y); SFX.pickup(); break;
    case 'toast': panels.toast(m.text); break;
    case 'dialog': panels.showDialog(m); break;
    case 'marker': net.mapInfo.markers = net.mapInfo.markers || []; net.mapInfo.markers.push(m); break;
    case 'eat': SFX.heal(); break;
    case 'heal': particles.heal(m.x, m.y); SFX.heal(); break;
  }
};

// разовые клавиши
input.onKey = k => {
  if (menu.style.display !== 'none') return;
  if (k === 'KeyE') { net.send({ t: MSG.INTERACT }); SFX.ui(); }
  if (k === 'KeyR') net.send({ t: MSG.RELOAD });
  if (k === 'Tab') panels.toggleInventory();
  if (k === 'KeyM') bigMap = !bigMap;
  if (k === 'F3') hud.debug = !hud.debug;
  if (k === 'Escape') panels.hideDialog();
  if (/^Digit[1-4]$/.test(k)) net.send({ t: MSG.SWITCH_WEAPON, slot: +k.slice(5) - 1 });
};

// ---------- цикл ----------
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dtMs = now - last;
  last = now;
  if (dtMs > 250) dtMs = 250;
  acc += dtMs / 1000;

  while (acc >= SIM_DT) {
    simStep();
    acc -= SIM_DT;
  }
  render(now / 1000, dtMs / 1000);

  frames++; fpsT += dtMs;
  if (fpsT > 500) { fps = Math.round(frames * 1000 / fpsT); frames = 0; fpsT = 0; }
}

function simStep() {
  if (!net.connected || !net.gotFirstSnap) return;

  // прицел
  const mx = input.mouseX * VIEW_W, my = input.mouseY * VIEW_H;
  const wpt = cam.toWorld(mx, my);
  const aim = Math.atan2(wpt.y - net.pred.y, wpt.x - net.pred.x);

  const mv = panels.dialogOpen ? { mx: 0, my: 0 } : input.moveVec();
  const roll = panels.dialogOpen ? false : input.takeRoll();
  const fire = !panels.dialogOpen && input.fire;

  net.simStep({ mx: mv.mx, my: mv.my, aim, fire, roll });

  // локальная стрельба (косметика; авторитет — сервер)
  const you = net.you;
  if (you) {
    const w = WEAPONS[you.w];
    if (you.w !== localWeapon) { localWeapon = you.w; localMag = you.mag; fireCd = 0; }
    localMag = Math.min(localMag, you.mag) || you.mag; // сервер — источник истины
    fireCd = Math.max(0, fireCd - SIM_DT);
    if (fire && w && fireCd <= 0 && net.pred.rollT <= 0 && you.rt <= 0 && you.mag > 0 && !you.dead) {
      fireCd = 1 / w.fireRate;
      net.spawnWeaponBullets(net.pred.x, net.pred.y, aim, w, (net.seq * 2654435761) >>> 0);
      particles.muzzle(net.pred.x + Math.cos(aim) * 8, net.pred.y - 4 + Math.sin(aim) * 8, aim);
      particles.casing(net.pred.x, net.pred.y - 4, aim);
      cam.addTrauma(w.recoilShake * 0.5);
      playWeaponSound(w.sound);
    }
  }

  // перекат: эффекты на старте
  if (net.pred.rollT > 0 && !wasRolling) { particles.dust(net.pred.x, net.pred.y); SFX.roll(); }
  wasRolling = net.pred.rollT > 0;

  // косметические пули + искры при попадании в стены/врагов
  net.stepBullets(SIM_DT, b => particles.burst(b.x, b.y, '#847e87', 3, 30, 0.2));
  for (const b of net.bullets) {
    if (b.hostile || b.delay > 0) continue;
    for (const [id, r] of net.remotes) {
      if (r.data.tp !== 'e') continue;
      const p = net.lerpEnt(r);
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < 49) { b.life = 0; particles.burst(b.x, b.y, '#fbf236', 3, 40, 0.15); break; }
    }
  }
  net.bullets = net.bullets.filter(b => b.life > 0);

  particles.update(SIM_DT);
  vignette = Math.max(0, vignette - SIM_DT * 1.2);

  // камера
  cam.update(SIM_DT, net.pred.x, net.pred.y, wpt.x, wpt.y);
  net.requestChunks(cam.x, cam.y);

  // мёртв?
  if (you) panels.setDead(!!you.dead, you.dt || 0);
  invRefresh -= SIM_DT;
  if (panels.invOpen && invRefresh <= 0) { panels.renderInventory(); invRefresh = 0.5; }
}

// ---------- рендер ----------
function render(timeSec) {
  ctx.fillStyle = '#14121a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!net.connected || !net.gotFirstSnap) { blit(); return; }

  tiles.render(ctx, cam, net.mapId, timeSec);

  // входы в данжи (поверх тайлов)
  if (net.mapId === 'over') {
    for (const poi of net.mapInfo.pois) {
      if (poi.type !== 'dungeon') continue;
      const s = cam.toScreen(poi.x * TILE + 8, poi.y * TILE + 8);
      if (s.x < -20 || s.y < -20 || s.x > VIEW_W + 20 || s.y > VIEW_H + 20) continue;
      atlas.draw(ctx, 'obj_dungeon_entrance', s.x, s.y);
      if (!poi.cleared) atlas.draw(ctx, 'ui_quest_mark', s.x, s.y - 14, { alpha: 0.8 });
    }
  }

  // сущности с сортировкой по y
  const drawList = [];
  for (const [id, r] of net.remotes) {
    const p = net.lerpEnt(r);
    drawList.push({ y: p.y, id, r, p });
  }
  drawList.push({ y: net.pred.y, me: true });
  drawList.sort((a, b) => a.y - b.y);

  const nowMs = performance.now();
  for (const d of drawList) {
    if (d.me) { drawMe(timeSec); continue; }
    drawEntity(d.id, d.r, d.p, nowMs, timeSec);
  }

  // пули
  for (const b of net.bullets) {
    if (b.delay > 0) continue;
    const s = cam.toScreen(b.x, b.y);
    atlas.draw(ctx, b.sprite, s.x, s.y, { rot: b.ang });
  }

  particles.render(ctx, cam);
  renderLight(timeSec);

  // виньетка урона
  if (vignette > 0) {
    ctx.fillStyle = `rgba(172,50,50,${(vignette * 0.45).toFixed(2)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  hud.render(ctx, net, fps);
  if (bigMap) renderBigMap();

  // прицел
  const mx = input.mouseX * VIEW_W, my = input.mouseY * VIEW_H;
  atlas.draw(ctx, 'ui_crosshair', mx, my);

  blit();
}

function drawMe(timeSec) {
  const you = net.you;
  if (!you) return;
  const p = net.pred;
  const s = cam.toScreen(p.x, p.y);
  const sprite = 'player_' + net.skin;
  atlas.draw(ctx, 'fx_shadow', s.x, s.y + 6);
  if (you.dead) {
    atlas.draw(ctx, sprite, s.x, s.y, { rot: Math.PI / 2, alpha: 0.7 });
    return;
  }
  const flipX = Math.cos(p.aim) < 0;
  const rolling = p.rollT > 0;
  const bob = Math.abs(Math.sin(timeSec * 10)) * (moving() ? 1 : 0);
  if (rolling) {
    const prog = 1 - p.rollT / 0.45;
    atlas.draw(ctx, sprite, s.x, s.y - 2, { rot: prog * Math.PI * 2 * (flipX ? -1 : 1) });
  } else {
    atlas.draw(ctx, sprite, s.x, s.y - bob, { flipX });
    // оружие
    const w = WEAPONS[you.w];
    if (w) {
      const gx = s.x + Math.cos(p.aim) * 7, gy = s.y - 2 + Math.sin(p.aim) * 7;
      atlas.draw(ctx, w.sprite, gx, gy, { rot: flipX ? p.aim + Math.PI : p.aim, flipX });
    }
  }
}

function moving() {
  const mv = input.moveVec();
  return mv.mx !== 0 || mv.my !== 0;
}

function drawEntity(id, r, p, nowMs, timeSec) {
  const e = r.data;
  const s = cam.toScreen(p.x, p.y);
  if (s.x < -30 || s.y < -30 || s.x > VIEW_W + 30 || s.y > VIEW_H + 30) return;
  const flash = flashes.get(id) > nowMs;

  if (e.tp === 'd') {
    const bob = Math.sin(timeSec * 4 + p.x) * 1.5;
    const spriteName = e.k.startsWith('weapon:') ? WEAPONS[e.k.slice(7)]?.sprite : 'item_' + e.k;
    atlas.draw(ctx, 'fx_shadow', s.x, s.y + 4, { alpha: 0.6 });
    atlas.draw(ctx, spriteName || 'item_coin', s.x, s.y - 3 + bob);
    return;
  }

  atlas.draw(ctx, 'fx_shadow', s.x, s.y + 6);
  const flipX = Math.cos(p.a || 0) < 0;

  if (e.tp === 'p') {
    if (e.dn) { atlas.draw(ctx, e.k, s.x, s.y, { rot: Math.PI / 2, alpha: 0.7 }); return; }
    if (flash) atlas.drawTinted(ctx, e.k, s.x, s.y, '#fff', { flipX });
    else atlas.draw(ctx, e.k, s.x, s.y, { flipX });
    if (e.rl) { /* перекат — можно добавить поворот */ }
    const w = WEAPONS[e.w];
    if (w) atlas.draw(ctx, w.sprite, s.x + Math.cos(p.a) * 7, s.y - 2 + Math.sin(p.a) * 7, { rot: flipX ? p.a + Math.PI : p.a, flipX });
    ctx.font = '8px monospace';
    ctx.fillStyle = '#99e550';
    ctx.textAlign = 'center';
    ctx.fillText(e.nm || '', s.x, s.y - 14);
    ctx.textAlign = 'left';
    return;
  }

  // враг или NPC
  const tint = flash ? '#fff' : (e.st === 'windup' || e.st === 'dash') ? '#d95763' : null;
  if (tint) atlas.drawTinted(ctx, e.k, s.x, s.y, tint, { flipX });
  else atlas.draw(ctx, e.k, s.x, s.y, { flipX });

  if (e.tp === 'e' && e.h < e.hm) {
    ctx.fillStyle = '#222034';
    ctx.fillRect(s.x - 7, s.y - 12, 14, 2);
    ctx.fillStyle = '#d9574a';
    ctx.fillRect(s.x - 7, s.y - 12, Math.max(1, Math.round(14 * e.h / e.hm)), 2);
  }
  if (e.tp === 'n' && e.ro === 'elder') atlas.draw(ctx, 'ui_quest_mark', s.x, s.y - 13);
}

// ---------- свет / день-ночь ----------
function renderLight(timeSec) {
  const t = net.worldTime;
  // темнота: 0 днём, до 0.82 ночью
  let dark = 0;
  if (t < 0.20) dark = 0.82;
  else if (t < 0.30) dark = 0.82 * (1 - (t - 0.20) / 0.10);
  else if (t > 0.87) dark = 0.82;
  else if (t > 0.78) dark = 0.82 * ((t - 0.78) / 0.09);
  if (net.mapId !== 'over') dark = Math.max(dark, 0.55); // в данжах всегда сумрак
  if (dark < 0.03) return;

  lctx.clearRect(0, 0, VIEW_W, VIEW_H);
  lctx.fillStyle = `rgba(8,8,24,${dark})`;
  lctx.fillRect(0, 0, VIEW_W, VIEW_H);
  lctx.globalCompositeOperation = 'destination-out';

  const lights = [];
  // игрок
  lights.push({ x: net.pred.x, y: net.pred.y, r: 55, a: 0.85 });
  for (const [, r] of net.remotes)
    if (r.data.tp === 'p') { const p = net.lerpEnt(r); lights.push({ x: p.x, y: p.y, r: 45, a: 0.7 }); }
  // костры и порталы из видимых чанков
  for (const [key, entry] of tiles.canvases) {
    if (!key.startsWith(net.mapId + ':')) continue;
    for (const a of entry.animated) {
      const flick = 1 + Math.sin(timeSec * 8 + a.x) * 0.1;
      lights.push({ x: a.x * TILE + 8, y: a.y * TILE + 8, r: 60 * flick, a: 0.95 });
    }
  }
  for (const l of lights) {
    const s = cam.toScreen(l.x, l.y);
    const g = lctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, l.r);
    g.addColorStop(0, `rgba(0,0,0,${l.a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath();
    lctx.arc(s.x, s.y, l.r, 0, Math.PI * 2);
    lctx.fill();
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);
}

// ---------- большая карта (M) ----------
function renderBigMap() {
  const S = Math.min(VIEW_W, VIEW_H) - 30;
  const x0 = (VIEW_W - S) / 2, y0 = (VIEW_H - S) / 2;
  ctx.fillStyle = 'rgba(14,12,20,.93)';
  ctx.fillRect(x0 - 6, y0 - 6, S + 12, S + 12);
  ctx.strokeStyle = '#5b6ee1';
  ctx.strokeRect(x0 - 5.5, y0 - 5.5, S + 11, S + 11);
  const k = S / (512 * TILE);
  ctx.font = '8px monospace';
  for (const s of net.mapInfo.settlements) {
    const x = x0 + s.x * TILE * k, y = y0 + s.y * TILE * k;
    ctx.fillStyle = '#99e550';
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillText(s.name, x - 18, y - 10);
  }
  for (const p of net.mapInfo.pois) {
    ctx.fillStyle = p.cleared ? '#696a6a' : p.type === 'dungeon' ? '#d9574a' : '#df7126';
    ctx.fillRect(x0 + p.x * TILE * k - 1, y0 + p.y * TILE * k - 1, 3, 3);
  }
  for (const m of net.mapInfo.markers || []) {
    ctx.fillStyle = '#fbf236';
    ctx.fillRect(x0 + m.x * TILE * k - 1, y0 + m.y * TILE * k - 1, 3, 3);
  }
  if (net.you?.q?.tx) {
    ctx.fillStyle = '#fbf236';
    const qx = x0 + net.you.q.tx * TILE * k, qy = y0 + net.you.q.ty * TILE * k;
    ctx.fillRect(qx - 2, qy, 5, 1); ctx.fillRect(qx, qy - 2, 1, 5);
    ctx.fillText(net.you.q.title, qx - 30, qy + 6);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 + net.pred.x * k - 1, y0 + net.pred.y * k - 1, 3, 3);
}

function blit() {
  sctx.drawImage(view, 0, 0, screen.width, screen.height);
}

// ---------- старт ----------
atlas.load().then(() => requestAnimationFrame(frame));
