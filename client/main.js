// Точка входа клиента: цикл с фиксированным шагом, рендер, эффекты.
import { VIEW_W, VIEW_H, SIM_DT, TILE, PLAYER_RADIUS, WORLD_TILES } from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { getWeapon, getItem, rarityOf } from '../shared/rarity.js';
import { ITEMS } from '../shared/items.js';
import { abilitiesOf } from '../shared/abilities.js';
import { STR } from '../shared/strings.js';
import { MSG, rleDecode } from '../shared/protocol.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { Atlas } from './render/atlas.js';
import { Camera } from './render/camera.js';
import { Particles } from './render/particles.js';
import { TileRenderer } from './render/tilemap.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { SFX, playWeaponSound, Music } from './sfx.js';

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
const panels = new Panels(net, atlas);
window.__panels = panels; // для отладки и автотестов UI

// локальное косметическое состояние
let fireCd = 0;
let wasRolling = false;
let vignette = 0;          // красная вспышка урона
const flashes = new Map(); // id -> until (белая вспышка попадания)
let fps = 0, frames = 0, fpsT = 0;
let bigMap = false;
// вид карты: измерение, центр (мировые px) и зум; cx=null — авто-центр на герое
const mapView = { dim: 'over', cx: null, cy: null, zoom: 1 };
let mapDrag = null;      // перетаскивание карты ЛКМ
// раскладка карты: легенда слева + квадрат карты, вся композиция по центру
function mapLayout() {
  const S = Math.min(VIEW_W, VIEW_H) - 30;
  const LW = 112;
  const startX = Math.max(4, (VIEW_W - (LW + 22 + S)) / 2);
  return { S, LW, panelX: startX, x0: startX + LW + 22, y0: (VIEW_H - S) / 2 };
}
let localMag = 0, localWeapon = '';
let invRefresh = 0;
let swingAnim = 0;       // анимация замаха своего игрока
let atkShowT = 0;        // оружие видно только в момент атаки (не мельтешит в руках)
const remoteAtk = new Map(); // pid -> ms, до которого показывать оружие союзника
const swings = [];       // {x,y,aim,range,arc,t,maxT,color}
const floatTexts = [];   // летящие цифры урона {x,y,text,color,t,big}
const chainFx = [];      // молнии {pts:[[x,y]..], t}
const ringFx = [];       // кольца/конусы способностей {x,y,r0,r1,t,dur,color,arc?,aim?,fill?}

// crawl-спрайты хранятся 32px (красивые иконки) — в мире рисуем 0.5
function worldScale(name) {
  const s = atlas.map[name];
  return s && s.w > 20 ? 0.5 : 1;
}

function addFloatText(x, y, text, color, big = false) {
  floatTexts.push({ x: x + (Math.random() - 0.5) * 8, y: y - 10, text, color, t: 0.9, big });
  if (floatTexts.length > 40) floatTexts.shift();
}

function spawnSwing(x, y, aim, range, arc, w) {
  swings.push({ x, y, aim, range: range || 28, arc: (arc || 100) * Math.PI / 180, t: 0.18, maxT: 0.18, color: w?.swingColor || '#eee' });
  // искры вдоль дуги
  const half = (arc || 100) * Math.PI / 360;
  for (let i = 0; i < 6; i++) {
    const a = aim - half + Math.random() * half * 2;
    const r = (range || 28) * (0.6 + Math.random() * 0.4);
    particles.spawn({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, color: w?.swingColor || '#eee', life: 0.18, size: 1, drag: 0.05 });
  }
}

// ---------- меню ----------
const menu = document.getElementById('menu');
const nameInput = document.getElementById('nameInput');
nameInput.value = localStorage.getItem('heroName') || '';
document.getElementById('joinBtn').onclick = join;
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

// выбор класса
let pickedClass = localStorage.getItem('heroClass') || 'warrior';
for (const card of document.querySelectorAll('.clscard')) {
  if (card.dataset.cls === pickedClass) {
    document.querySelector('.clscard.selected')?.classList.remove('selected');
    card.classList.add('selected');
  }
  card.onclick = () => {
    document.querySelector('.clscard.selected')?.classList.remove('selected');
    card.classList.add('selected');
    pickedClass = card.dataset.cls;
    localStorage.setItem('heroClass', pickedClass);
  };
}

function join() {
  const name = nameInput.value.trim() || 'Безымянный';
  localStorage.setItem('heroName', name);
  document.getElementById('menuHint').textContent = STR.connecting;
  net.connect(name, pickedClass);
}

net.handlers.onWelcome = () => {
  menu.style.display = 'none';
  SFX.quest();
  buildBiomeCanvas();
  buildAshCanvas();
  Music.start(); // фоновая музыка (N — вкл/выкл)
};

// ---------- карта мира: скролл мышью и зум колесом ----------
screen.addEventListener('mousedown', e => {
  if (bigMap && e.button === 0) mapDrag = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', e => {
  if (!mapDrag || !bigMap) return;
  const r = screen.getBoundingClientRect();
  const S = Math.min(VIEW_W, VIEW_H) - 30;
  const worldPx = (mapView.dim === 'ash' ? (net.mapInfo.ash?.size || 160) : WORLD_TILES) * TILE;
  const k = S * mapView.zoom / worldPx;
  const px = VIEW_W / r.width; // клиентские px -> нативные
  mapView.cx -= (e.clientX - mapDrag.x) * px / k;
  mapView.cy -= (e.clientY - mapDrag.y) * px / k;
  mapDrag = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { mapDrag = null; });
screen.addEventListener('wheel', e => {
  if (!bigMap) return;
  e.preventDefault();
  // зум к курсору: точка мира под мышью остаётся на месте
  const { S, x0, y0 } = mapLayout();
  const worldPx = (mapView.dim === 'ash' ? (net.mapInfo.ash?.size || 160) : WORLD_TILES) * TILE;
  const r = screen.getBoundingClientRect();
  const nx = (e.clientX - r.left) / r.width * VIEW_W;
  const ny = (e.clientY - r.top) / r.height * VIEW_H;
  const oldZoom = mapView.zoom;
  const k = S * oldZoom / worldPx;
  const cx = mapView.cx ?? worldPx / 2, cy = mapView.cy ?? worldPx / 2;
  const wx = cx - worldPx / (2 * oldZoom) + (nx - x0) / k;  // мир под курсором
  const wy = cy - worldPx / (2 * oldZoom) + (ny - y0) / k;
  const zoom = Math.max(1, Math.min(10, oldZoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25)));
  const k2 = S * zoom / worldPx;
  mapView.zoom = zoom;
  mapView.cx = wx - (nx - x0) / k2 + worldPx / (2 * zoom);
  mapView.cy = wy - (ny - y0) / k2 + worldPx / (2 * zoom);
}, { passive: false });

// ---------- карта мира: биомная подложка ----------
const BIOME_COLORS = ['#1d2b53', '#2e5d9e', '#d9c27e', '#4e7c3a', '#33552b', '#6d6a60', '#4b5d3a'];
let ashCanvas = null;
function buildAshCanvas() {
  const a = net.mapInfo.ash;
  if (!a) return;
  const data = rleDecode(a.rle, a.size * a.size);
  ashCanvas = document.createElement('canvas');
  ashCanvas.width = a.size; ashCanvas.height = a.size;
  const c = ashCanvas.getContext('2d');
  const img = c.createImageData(a.size, a.size);
  const COL = ['#3a3844', '#df7126', '#16141f', '#26242e', '#fbf236', '#d9a066', '#b06ee1', '#fbf236', '#696a6a'];
  for (let i = 0; i < data.length; i++) {
    const hex = COL[data[i]] || COL[0];
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

let biomeCanvas = null;
function buildBiomeCanvas() {
  const b = net.mapInfo.biomes;
  if (!b) return;
  const N = net.mapInfo.biomesN || 128;
  const data = rleDecode(b, N * N);
  biomeCanvas = document.createElement('canvas');
  biomeCanvas.width = N; biomeCanvas.height = N;
  const bctx = biomeCanvas.getContext('2d');
  const img = bctx.createImageData(N, N);
  for (let i = 0; i < data.length; i++) {
    const c = BIOME_COLORS[data[i]] || '#4e7c3a';
    img.data[i * 4] = parseInt(c.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  // дороги — светлый пунктир
  bctx.fillStyle = '#b8a988';
  for (const [rx, ry] of net.mapInfo.roads || []) bctx.fillRect(Math.floor(rx / 4), Math.floor(ry / 4), 1, 1);
}
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
    case 'shot':
      particles.muzzle(m.x, m.y, m.aim);
      remoteAtk.set(m.pid, performance.now() + 350);
      if (m.pid !== net.myId) playWeaponSound(getWeapon(m.weapon)?.sound);
      break;
    case 'swing':
      remoteAtk.set(m.pid, performance.now() + 350);
      if (m.pid !== net.myId) { spawnSwing(m.x, m.y, m.aim, m.range, m.arc, getWeapon(m.weapon)); playWeaponSound(getWeapon(m.weapon)?.sound); }
      break;
    case 'eshot': SFX.enemy_shot(); break;
    case 'hit':
      if (m.kind === 'wall') particles.burst(m.x, m.y, '#847e87', 4, 40, 0.25);
      else particles.blood(m.x, m.y, 4);
      break;
    case 'hurt':
      flashes.set(m.id, performance.now() + 80);
      particles.blood(m.x, m.y, 5);
      if (m.dmg) addFloatText(m.x, m.y, (m.crit ? '💥' : '') + m.dmg, m.crit ? '#fbf236' : '#eeeeee', !!m.crit);
      SFX.hit();
      break;
    case 'levelup':
      particles.sparkle(m.x, m.y);
      particles.heal(m.x, m.y);
      if (m.pid === net.myId) { SFX.quest(); addFloatText(m.x, m.y - 8, 'УРОВЕНЬ!', '#fbf236', true); }
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
    case 'boom':
      particles.burst(m.x, m.y, '#df7126', 18, 110, 0.5, 2);
      particles.burst(m.x, m.y, '#fbf236', 10, 70, 0.35);
      cam.addTrauma(0.45);
      SFX.boom();
      break;
    case 'rubble':
      particles.burst(m.x, m.y, '#847e87', 10, 70, 0.45, 2);
      particles.burst(m.x, m.y, '#8f563b', 6, 50, 0.4);
      cam.addTrauma(0.2);
      SFX.die();
      break;
    case 'chain':
      chainFx.push({ pts: m.pts, t: 0.22 });
      SFX.zap();
      break;
    case 'sellMode': panels.openSellMode(); break;
    case 'shop': panels.showShop(m); break;
    case 'stash': panels.showStash(m); break;
    case 'bestiary': panels.showBestiary(m); break;
    case 'toast':
      panels.logMsg(m.text, m.w);
      // тихие мировые вести (w:1) не мельтешат — только летопись (L);
      // личные и ВАЖНЫЕ мировые (w:2 — события, война) всплывают
      if (m.w !== 1) panels.toast(m.text);
      break;
    case 'dialog': panels.showDialog(m); break;
    case 'marker': net.mapInfo.markers = net.mapInfo.markers || []; net.mapInfo.markers.push(m); break;
    case 'block':
      particles.burst(m.x, m.y, '#9badb7', 6, 60, 0.2);
      if (m.pid === net.myId) { addFloatText(m.x, m.y - 8, 'БЛОК', '#9badb7'); SFX.hit(); }
      break;
    case 'summon':
      particles.burst(m.x, m.y, '#df7126', 16, 80, 0.5, 2);
      particles.sparkle(m.x, m.y);
      ringFx.push({ x: m.x, y: m.y, r0: 20, r1: 6, t: 0, dur: 0.35, color: '#df7126' });
      SFX.boom();
      break;
    case 'poof':
      particles.burst(m.x, m.y, '#847e87', 10, 50, 0.4);
      break;
    case 'barrier':
      ringFx.push({ x: m.x, y: m.y, r0: 4, r1: 14, t: 0, dur: 0.35, color: '#63c5ff' });
      if (m.pid === net.myId) SFX.heal();
      break;
    case 'barrierHit':
      particles.burst(m.x, m.y, '#63c5ff', 8, 60, 0.25);
      if (m.pid === net.myId) { addFloatText(m.x, m.y - 8, 'БАРЬЕР', '#63c5ff'); SFX.hit(); }
      break;
    case 'net':
      ringFx.push({ x: m.x, y: m.y, r0: 55, r1: 40, t: 0, dur: 0.5, color: '#9badb7', fill: true });
      particles.burst(m.x, m.y, '#847e87', 12, 60, 0.35);
      SFX.roll();
      break;
    case 'loot': // подбор: летящий текст у героя вместо тоста
      addFloatText(m.x, m.y - 12, '+ ' + m.text, '#fbf236');
      if (m.pid === net.myId) SFX.ui();
      break;
    case 'react': // реакции стихий и всплески ресурсов: крупный текст
      addFloatText(m.x, m.y - 10, m.name, '#df7126', true);
      particles.burst(m.x, m.y, '#df7126', 10, 70, 0.3);
      break;
    case 'nova': // ледяная/огненная нова реликвий и сетов
      ringFx.push({ x: m.x, y: m.y, r0: 8, r1: 46, t: 0, dur: 0.4, color: '#df7126' });
      particles.burst(m.x, m.y, '#df7126', 14, 90, 0.35);
      SFX.hit();
      break;
    case 'ability': spawnAbilityFx(m); break;
    case 'telegraph':
      // босс замахнулся: красная зона — беги!
      ringFx.push({ x: m.x, y: m.y, r0: 6, r1: m.r, t: 0, dur: m.w, color: '#d9574a', fill: true });
      SFX.enemy_shot();
      break;
    case 'telegraphLine':
      // босс метит рывок: красная полоса — уйди с траектории!
      ringFx.push({ x: m.x, y: m.y, line: true, aim: m.a, len: m.len, t: 0, dur: m.w, color: '#d9574a' });
      SFX.enemy_shot();
      break;
    case 'enrage':
      // босс в ярости: багровая вспышка и дрожь земли
      ringFx.push({ x: m.x, y: m.y, r0: 8, r1: 52, t: 0, dur: 0.5, color: '#d9574a' });
      particles.burst(m.x, m.y, '#d9574a', 22, 100, 0.5, 2);
      cam.addTrauma(0.5);
      SFX.boom();
      break;
    case 'bloodcast':
      particles.blood(m.x, m.y, 8);
      ringFx.push({ x: m.x, y: m.y, r0: 4, r1: 16, t: 0, dur: 0.3, color: '#d9574a' });
      if (m.pid === net.myId) { addFloatText(m.x, m.y - 10, '🩸 КРОВАВЫЙ КАСТ', '#d9574a'); SFX.hurt(); }
      break;
    case 'ascend':
      // вознесение: столп света и золотое сияние
      for (let i = 0; i < 3; i++)
        ringFx.push({ x: m.x, y: m.y, r0: 6, r1: 60 + i * 30, t: -i * 0.15, dur: 0.9, color: '#fbf236' });
      particles.burst(m.x, m.y, '#fbf236', 30, 120, 0.9, 2);
      particles.sparkle(m.x, m.y);
      cam.addTrauma(0.6);
      SFX.quest();
      if (m.pid === net.myId) addFloatText(m.x, m.y - 16, '✸ БОЖЕСТВЕННОСТЬ ✸', '#fbf236', true);
      break;
    case 'dodge':
      if (m.pid === net.myId) addFloatText(m.x, m.y - 6, 'УВОРОТ', '#63c5ff');
      particles.dust(m.x, m.y);
      break;
    case 'eat': SFX.heal(); break;
    case 'heal': particles.heal(m.x, m.y); SFX.heal(); break;
  }
};

// разовые клавиши
input.onKey = k => {
  if (menu.style.display !== 'none') return;
  if (k === 'KeyE') { net.send({ t: MSG.INTERACT }); SFX.ui(); }
  if (k === 'KeyT') net.send({ t: MSG.RELOAD });
  if (k === 'KeyQ') useAbility(0);
  if (k === 'KeyX') useAbility(1);
  if (k === 'KeyR') useAbility(2);
  if (k === 'Tab') {
    // при открытой карте Tab листает измерения, иначе — инвентарь
    if (bigMap && net.mapInfo.ash) {
      mapView.dim = mapView.dim === 'over' ? 'ash' : 'over';
      mapView.cx = null; mapView.zoom = 1;
    } else panels.toggleInventory();
  }
  if (k === 'KeyC') panels.toggleChar();
  if (k === 'KeyP') panels.toggleFactions();
  if (k === 'KeyM') {
    bigMap = !bigMap;
    if (bigMap) { // открытие: измерение и центр — где стоишь
      mapView.dim = net.you?.map === 'ash' ? 'ash' : 'over';
      mapView.cx = null; mapView.zoom = 1;
    }
  }
  if (k === 'KeyJ') panels.toggleJournal();
  if (k === 'KeyL') panels.toggleLog();
  if (k === 'KeyK') panels.toggleSpellbook();
  if (k === 'KeyB') {
    if (panels.beOpen) panels.hideBestiary();
    else net.send({ t: MSG.BESTIARY });
  }
  if (k === 'KeyN') panels.toast(Music.toggle() ? '🎵 Музыка включена' : '🔇 Музыка выключена');
  if (k === 'F3') hud.debug = !hud.debug;
  if (k === 'Escape') panels.hideDialog();
  if (/^Digit[1-4]$/.test(k)) net.send({ t: MSG.SWITCH_WEAPON, slot: +k.slice(5) - 1 });
};

// анимации способностей: кольца, конусы, частицы, тряска
function spawnAbilityFx(m) {
  const my = m.pid === net.myId;
  switch (m.id) {
    case 'power_strike':
      particles.burst(m.x, m.y, '#df7126', 14, 90, 0.35, 2);
      ringFx.push({ x: m.x, y: m.y, r0: 8, r1: 44, t: 0, dur: 0.25, color: '#df7126' });
      cam.addTrauma(my ? 0.4 : 0.2); SFX.boom();
      break;
    case 'war_cry':
      ringFx.push({ x: m.x, y: m.y, r0: 10, r1: 95, t: 0, dur: 0.45, color: '#fbf236' });
      addFloatText(m.x, m.y - 12, 'КЛИЧ!', '#fbf236', true);
      cam.addTrauma(0.25); SFX.die();
      break;
    case 'whirlwind':
      for (let i = 0; i < 3; i++)
        ringFx.push({ x: m.x + Math.cos(m.aim) * i * 28, y: m.y + Math.sin(m.aim) * i * 28, r0: 6, r1: 30, t: -i * 0.06, dur: 0.3, color: '#eeeeee' });
      particles.dust(m.x, m.y); SFX.roll();
      break;
    case 'flame_wave':
      ringFx.push({ x: m.x, y: m.y, r0: 12, r1: 110, t: 0, dur: 0.4, color: '#df7126', arc: 1.3, aim: m.aim, fill: true });
      particles.burst(m.x + Math.cos(m.aim) * 30, m.y + Math.sin(m.aim) * 30, '#df7126', 16, 100, 0.4, 2);
      particles.burst(m.x + Math.cos(m.aim) * 60, m.y + Math.sin(m.aim) * 60, '#fbf236', 10, 60, 0.35);
      SFX.boom();
      break;
    case 'frost_nova':
      ringFx.push({ x: m.x, y: m.y, r0: 8, r1: 85, t: 0, dur: 0.45, color: '#63c5ff' });
      particles.burst(m.x, m.y, '#63c5ff', 20, 90, 0.5);
      SFX.zap();
      break;
    case 'blink':
      particles.burst(m.x, m.y, '#b57edc', 12, 70, 0.35);
      ringFx.push({ x: m.x, y: m.y, r0: 14, r1: 4, t: 0, dur: 0.25, color: '#b57edc' });
      SFX.zap();
      break;
    case 'shadow_dash':
      for (let i = 0; i < 4; i++)
        particles.burst(m.x + Math.cos(m.aim) * i * 24, m.y + Math.sin(m.aim) * i * 24, '#45283c', 5, 30, 0.3);
      SFX.roll();
      break;
    case 'smoke_bomb':
      particles.burst(m.x, m.y, '#847e87', 26, 60, 0.8, 2);
      ringFx.push({ x: m.x, y: m.y, r0: 6, r1: 40, t: 0, dur: 0.6, color: '#847e87', fill: true });
      SFX.boom();
      break;
    case 'blade_storm':
      ringFx.push({ x: m.x, y: m.y, r0: 6, r1: 50, t: 0, dur: 0.3, color: '#eeeeee' });
      SFX.shoot?.();
      break;
  }
}

// применить способность Q/E/R: клиент шлёт запрос, проверив уровень и кулдаун локально
function useAbility(slot) {
  const you = net.you;
  if (!you || you.dead || panels.dialogOpen) return;
  const ab = abilitiesOf(you.cls).find(a => a.id === you.abl?.[slot]) || abilitiesOf(you.cls)[slot];
  if (!ab) return;
  if (you.lvl < ab.lvl) { panels.toast(`«${ab.name}» откроется на уровне ${ab.lvl}`); return; }
  if ((you.ab?.[slot] || 0) > 0.2) return;
  // кровавый каст мага пропускаем на сервер даже без маны
  if (ab.mana > 0 && (you.mp || 0) < ab.mana && !(you.cls === 'mage' && you.hp > 2)) {
    panels.toast('Не хватает маны');
    return;
  }
  net.send({ t: MSG.ABILITY, slot });
}

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
  const fire = !panels.dialogOpen && !bigMap && input.fire; // при карте ЛКМ тащит карту, не стреляет
  const blk = !panels.dialogOpen && input.block;

  // разовое нажатие ПКМ: активный предмет левой руки (гримуар/сфера/сеть)
  const rmb = input.takeRmb();
  if (rmb && !panels.dialogOpen && net.you) {
    const off = getItem(net.you.eq?.offhand);
    if (off?.active) {
      if ((net.you.oc || 0) > 0.2) panels.toast(`${off.name}: ещё ${Math.ceil(net.you.oc)} с`);
      else net.send({ t: MSG.OFFHAND });
    }
  }

  net.simStep({ mx: mv.mx, my: mv.my, aim, fire, roll, blk });

  // локальная атака (косметика; авторитет — сервер)
  const you = net.you;
  if (you) {
    const w = getWeapon(you.w);
    if (you.w !== localWeapon) { localWeapon = you.w; fireCd = 0; }
    fireCd = Math.max(0, fireCd - SIM_DT);
    const canAct = fire && w && fireCd <= 0 && net.pred.rollT <= 0 && !you.dead;
    if (canAct && w.melee) {
      fireCd = 1 / w.fireRate;
      spawnSwing(net.pred.x, net.pred.y, aim, w.range, w.arcDeg, w);
      swingAnim = 0.18;
      atkShowT = 0.35;
      cam.addTrauma(w.recoilShake * 0.5);
      playWeaponSound(w.sound);
    } else if (canAct && (w.manaCost
      ? (you.mp >= w.manaCost || (you.cls === 'mage' && you.hp > 2)) // посох: мана или кровавый каст
      : (you.rt <= 0 && you.mag > 0))) {
      fireCd = 1 / w.fireRate;
      atkShowT = 0.35;
      net.spawnWeaponBullets(net.pred.x, net.pred.y, aim, w, (net.seq * 2654435761) >>> 0);
      particles.muzzle(net.pred.x + Math.cos(aim) * 8, net.pred.y - 4 + Math.sin(aim) * 8, aim);
      cam.addTrauma(w.recoilShake * 0.5);
      playWeaponSound(w.sound);
    }
  }

  // затухание свингов и цифр урона
  swingAnim = Math.max(0, swingAnim - SIM_DT);
  atkShowT = Math.max(0, atkShowT - SIM_DT);
  for (const s of swings) s.t -= SIM_DT;
  for (let i = swings.length - 1; i >= 0; i--) if (swings[i].t <= 0) swings.splice(i, 1);
  for (const f of floatTexts) { f.t -= SIM_DT; f.y -= 18 * SIM_DT; }
  for (let i = floatTexts.length - 1; i >= 0; i--) if (floatTexts[i].t <= 0) floatTexts.splice(i, 1);
  for (const c of chainFx) c.t -= SIM_DT;
  for (let i = chainFx.length - 1; i >= 0; i--) if (chainFx[i].t <= 0) chainFx.splice(i, 1);
  for (const r of ringFx) r.t += SIM_DT;
  for (let i = ringFx.length - 1; i >= 0; i--) if (ringFx[i].t >= ringFx[i].dur) ringFx.splice(i, 1);

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
  if (invRefresh <= 0) {
    if (panels.invOpen) panels.renderInventory();
    if (panels.charOpen) panels.renderChar();
    invRefresh = 0.5;
  }
}

// ---------- погода: дождь и снег поверх мира ----------
const weatherDrops = [];
let lastWeatherT = 0;
function renderWeather(timeSec) {
  const dtSec = Math.min(0.1, timeSec - lastWeatherT || 0.016);
  lastWeatherT = timeSec;
  const w = net.weather;
  if (net.mapId !== 'over' || !w || w === 'clear') { weatherDrops.length = 0; return; }
  const target = w === 'rain' ? 80 : 55;
  while (weatherDrops.length < target) {
    weatherDrops.push({
      x: Math.random() * VIEW_W, y: Math.random() * VIEW_H,
      spd: w === 'rain' ? 240 + Math.random() * 90 : 22 + Math.random() * 16,
      drift: Math.random() * 2 - 1,
    });
  }
  ctx.strokeStyle = 'rgba(150,180,230,0.45)';
  ctx.fillStyle = 'rgba(238,242,255,0.85)';
  ctx.lineWidth = 1;
  for (const d of weatherDrops) {
    d.y += d.spd * dtSec;
    d.x += (w === 'rain' ? 34 * dtSec : (d.drift * 12 + Math.sin(timeSec * 1.7 + d.y * 0.05) * 10) * dtSec);
    if (d.y > VIEW_H) { d.y = -4; d.x = Math.random() * VIEW_W; }
    if (d.x > VIEW_W) d.x -= VIEW_W;
    if (d.x < 0) d.x += VIEW_W;
    if (w === 'rain') {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 1.5, d.y - 7);
      ctx.stroke();
    } else {
      ctx.fillRect(d.x, d.y, 1.5, 1.5);
    }
  }
  if (w === 'rain') { // серая пелена ливня
    ctx.fillStyle = 'rgba(30,40,80,0.10)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// настроение музыки: данж — дрон, ночь — минор, день — мажор
setInterval(() => {
  if (!net.connected) return;
  Music.setMood(net.mapId !== 'over' ? 'dungeon'
    : (net.worldTime < 0.22 || net.worldTime > 0.85) ? 'night' : 'day');
}, 3000);

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

  // дуги ударов ближнего боя
  for (const sw of swings) {
    const c = cam.toScreen(sw.x, sw.y);
    const k = 1 - sw.t / sw.maxT;                 // 0..1 прогресс замаха
    const a0 = sw.aim - sw.arc / 2;
    const cur = a0 + sw.arc * k;
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y - 2, sw.range, a0, cur);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // кольца и конусы способностей
  for (const r of ringFx) {
    if (r.t < 0) continue; // отложенный старт (волны вихря)
    const k = Math.min(1, r.t / r.dur);
    if (r.line) { // телеграф рывка босса: красная полоса растёт вдоль траектории
      const s = cam.toScreen(r.x, r.y);
      ctx.globalAlpha = 0.25 + k * 0.3;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 2);
      ctx.lineTo(s.x + Math.cos(r.aim) * r.len * k, s.y - 2 + Math.sin(r.aim) * r.len * k);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    const rad = r.r0 + (r.r1 - r.r0) * k;
    const s = cam.toScreen(r.x, r.y);
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (r.arc !== undefined) ctx.arc(s.x, s.y - 2, rad, r.aim - r.arc / 2, r.aim + r.arc / 2);
    else ctx.arc(s.x, s.y - 2, rad, 0, Math.PI * 2);
    ctx.stroke();
    if (r.fill) {
      ctx.globalAlpha = (1 - k) * 0.25;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      if (r.arc !== undefined) { ctx.moveTo(s.x, s.y - 2); ctx.arc(s.x, s.y - 2, rad, r.aim - r.arc / 2, r.aim + r.arc / 2); ctx.closePath(); }
      else ctx.arc(s.x, s.y - 2, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // цепные молнии: ломаные линии между жертвами
  for (const c of chainFx) {
    ctx.strokeStyle = c.t > 0.1 ? '#fbf236' : '#eeeeee';
    ctx.globalAlpha = Math.min(1, c.t / 0.12);
    ctx.lineWidth = 1;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const a = cam.toScreen(c.pts[i][0], c.pts[i][1]);
      const b = cam.toScreen(c.pts[i + 1][0], c.pts[i + 1][1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 4);
      // зигзаг через две случайные промежуточные точки
      for (const k of [0.33, 0.66]) {
        ctx.lineTo(a.x + (b.x - a.x) * k + (Math.random() - 0.5) * 8,
          a.y - 4 + (b.y - a.y) * k + (Math.random() - 0.5) * 8);
      }
      ctx.lineTo(b.x, b.y - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // летящие цифры урона
  ctx.textAlign = 'center';
  for (const f of floatTexts) {
    const s = cam.toScreen(f.x, f.y);
    ctx.font = f.big ? 'bold 10px monospace' : '8px monospace';
    ctx.globalAlpha = Math.min(1, f.t / 0.4);
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, s.x + 1, s.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  particles.render(ctx, cam);
  renderLight(timeSec);
  renderWeather(timeSec);

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
  const sprite = net.sprite || 'player_0';
  atlas.draw(ctx, 'fx_shadow', s.x, s.y + 6);
  if (you.dead) {
    atlas.draw(ctx, sprite, s.x, s.y, { rot: Math.PI / 2, alpha: 0.7 });
    return;
  }
  const flipX = Math.cos(p.aim) < 0;
  const rolling = p.rollT > 0;
  const bob = Math.abs(Math.sin(timeSec * 10)) * (moving() ? 1 : 0);
  const alpha = (you.inv2 || 0) > 0 ? 0.35 : 1; // дымовая завеса: полупрозрачность
  if (rolling) {
    const prog = 1 - p.rollT / 0.45;
    atlas.draw(ctx, sprite, s.x, s.y - 2, { rot: prog * Math.PI * 2 * (flipX ? -1 : 1), alpha });
  } else {
    atlas.draw(ctx, sprite, s.x, s.y - bob, { flipX, alpha });
    if (you.blk && input.block) drawShield(you, s.x, s.y - 2 - bob, p.aim);
    // оружие показывается только в момент атаки — руки свободны в мирное время
    else if (atkShowT > 0) drawWeapon(getWeapon(you.w), s.x, s.y - 2 - bob, p.aim, flipX, swingAnim);
  }
  // божественный нимб: золотое кольцо над головой и редкие искры
  if (you.asc) {
    ctx.strokeStyle = '#fbf236';
    ctx.globalAlpha = 0.6 + Math.sin(timeSec * 3) * 0.2;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y - 13, 5, 1.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (Math.random() < 0.03) particles.sparkle(p.x + (Math.random() - 0.5) * 10, p.y - 6);
  }
  // барьер хрустальной сферы: мерцающее кольцо
  if ((you.sh || 0) > 0) {
    ctx.strokeStyle = '#63c5ff';
    ctx.globalAlpha = 0.5 + Math.sin(timeSec * 8) * 0.25;
    ctx.beginPath();
    ctx.arc(s.x, s.y - 2, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// щит поднят перед собой (блок на ПКМ)
function drawShield(you, cx, cy, aim) {
  const it = getItem(you.eq?.offhand);
  const icon = it?.icon || 'item_shield_wood';
  atlas.draw(ctx, icon, cx + Math.cos(aim) * 8, cy + Math.sin(aim) * 8, { scale: worldScale(icon) });
}

// Оружие в руке: у мелее — замах по дуге, у дальнего — направление прицела.
function drawWeapon(w, cx, cy, aim, flipX, swingT = 0) {
  if (!w) return;
  if (w.melee) {
    const half = (w.arcDeg || 100) * Math.PI / 360;
    const k = swingT > 0 ? 1 - swingT / 0.18 : 0.5;   // покой = середина дуги
    const ang = aim - half + half * 2 * k;
    const reach = 8 + (swingT > 0 ? (1 - Math.abs(k - 0.5) * 2) * 6 : 0);
    atlas.draw(ctx, w.sprite, cx + Math.cos(ang) * reach, cy + Math.sin(ang) * reach, { rot: ang + Math.PI / 2, scale: worldScale(w.sprite) });
  } else {
    atlas.draw(ctx, w.sprite, cx + Math.cos(aim) * 7, cy + Math.sin(aim) * 7, { rot: flipX ? aim + Math.PI : aim, flipX, scale: worldScale(w.sprite) });
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
    const spriteName = e.k.startsWith('weapon:') ? getWeapon(e.k.slice(7))?.sprite
      : (ITEMS[e.k]?.icon || 'item_' + e.k);
    atlas.draw(ctx, 'fx_shadow', s.x, s.y + 4, { alpha: 0.6 });
    atlas.draw(ctx, spriteName || 'item_coin', s.x, s.y - 3 + bob, { scale: worldScale(spriteName || 'item_coin') });
    return;
  }

  atlas.draw(ctx, 'fx_shadow', s.x, s.y + 6);
  const flipX = Math.cos(p.a || 0) < 0;

  if (e.tp === 'p') {
    if (e.dn) { atlas.draw(ctx, e.k, s.x, s.y, { rot: Math.PI / 2, alpha: 0.7 }); return; }
    if (flash) atlas.drawTinted(ctx, e.k, s.x, s.y, '#fff', { flipX });
    else atlas.draw(ctx, e.k, s.x, s.y, { flipX, alpha: e.iv ? 0.35 : 1 });
    // оружие союзника видно только в момент его атаки
    if ((remoteAtk.get(+id.slice(1)) || 0) > nowMs) drawWeapon(getWeapon(e.w), s.x, s.y - 2, p.a || 0, flipX, 0);
    if (e.asc) { // нимб бога-союзника
      ctx.strokeStyle = '#fbf236';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - 13, 5, 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.font = '8px monospace';
    ctx.fillStyle = e.asc ? '#fbf236' : '#99e550';
    ctx.textAlign = 'center';
    ctx.fillText(e.nm || '', s.x, s.y - 14);
    ctx.textAlign = 'left';
    return;
  }

  // враг или NPC
  const tint = flash ? '#fff' : (e.st === 'windup' || e.st === 'dash') ? '#d95763' : null;
  if (tint) atlas.drawTinted(ctx, e.k, s.x, s.y, tint, { flipX });
  else atlas.draw(ctx, e.k, s.x, s.y, { flipX });

  // элитный монстр: золотая звезда и полоса
  if (e.tp === 'e' && e.el) {
    ctx.font = '8px monospace';
    ctx.fillStyle = '#fbf236';
    ctx.textAlign = 'center';
    ctx.fillText('★', s.x, s.y - 16 + Math.sin(timeSec * 4) * 1.5);
    ctx.textAlign = 'left';
  }
  if (e.tp === 'e' && e.h < e.hm) {
    ctx.fillStyle = '#222034';
    ctx.fillRect(s.x - 7, s.y - 12, 14, 2);
    ctx.fillStyle = e.el ? '#fbf236' : '#d9574a';
    ctx.fillRect(s.x - 7, s.y - 12, Math.max(1, Math.round(14 * e.h / e.hm)), 2);
  }
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
  const { S, LW, panelX, x0, y0 } = mapLayout();
  const dim = mapView.dim === 'ash' && net.mapInfo.ash ? 'ash' : 'over';
  const worldPx = (dim === 'ash' ? net.mapInfo.ash.size : WORLD_TILES) * TILE;
  const youDim = net.you?.map === 'ash' ? 'ash' : net.you?.map === 'over' ? 'over' : null;

  // авто-центр: на герое в его измерении, иначе — середина карты
  if (mapView.cx === null) {
    mapView.cx = youDim === dim ? net.pred.x : worldPx / 2;
    mapView.cy = youDim === dim ? net.pred.y : worldPx / 2;
  }
  const half = worldPx / (2 * mapView.zoom);
  mapView.cx = Math.max(half, Math.min(worldPx - half, mapView.cx));
  mapView.cy = Math.max(half, Math.min(worldPx - half, mapView.cy));
  const k = S * mapView.zoom / worldPx;
  const vL = mapView.cx - half, vT = mapView.cy - half;
  const px = wx => x0 + (wx - vL) * k;          // мировые px -> экран карты
  const py = wy => y0 + (wy - vT) * k;
  const seen = (x, y) => x > x0 - 4 && x < x0 + S + 4 && y > y0 - 4 && y < y0 + S + 4;

  // карта — своё полотно; легенда — ОТДЕЛЬНОЕ меню слева в красной рамке
  ctx.fillStyle = 'rgba(14,12,20,.95)';
  ctx.fillRect(x0 - 6, y0 - 18, S + 12, S + 24);
  ctx.strokeStyle = dim === 'ash' ? '#df7126' : '#5b6ee1';
  ctx.strokeRect(x0 - 5.5, y0 - 17.5, S + 11, S + 23);
  // вкладки измерений
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = dim === 'over' ? '#fbf236' : '#696a6a';
  ctx.fillText('◈ Верхний мир', x0, y0 - 9);
  if (net.mapInfo.ash) {
    ctx.fillStyle = dim === 'ash' ? '#df7126' : '#696a6a';
    ctx.fillText('◈ Выжженные земли', x0 + 70, y0 - 9);
  }

  // ---- меню легенды: отдельная красная панель ----
  ctx.fillStyle = 'rgba(20,10,12,.95)';
  ctx.fillRect(panelX - 6, y0 - 18, LW + 8, S + 24);
  ctx.strokeStyle = '#d9574a';
  ctx.strokeRect(panelX - 5.5, y0 - 17.5, LW + 7, S + 23);
  ctx.strokeStyle = '#6e1e1e';
  ctx.strokeRect(panelX - 3.5, y0 - 15.5, LW + 3, S + 19); // двойная кромка
  let ly = y0 + 2;
  const line = (text, color = '#d9a3a3') => { ctx.fillStyle = color; ctx.fillText(text, panelX + 12, ly); ly += 10; };
  const key = (color, text) => {
    ctx.fillStyle = color; ctx.fillRect(panelX + 2, ly - 5, 5, 5);
    ctx.strokeStyle = '#6e1e1e'; ctx.strokeRect(panelX + 1.5, ly - 5.5, 6, 6);
    ctx.fillStyle = '#d9a3a3'; ctx.fillText(text, panelX + 12, ly); ly += 10;
  };
  ctx.fillStyle = '#d9574a';
  ctx.fillText('▌ЛЕГЕНДА', panelX + 2, y0 - 9);
  ctx.fillText(dim === 'ash' ? 'ВЫЖЖЕННЫЕ ЗЕМЛИ' : 'ПОГРАНИЧЬЕ', panelX + 2, ly); ly += 12;
  line(`День ${net.day} · ${['Весна', 'Лето', 'Осень', 'Зима'][Math.floor(((net.day || 1) - 1) / 3) % 4]}`, '#9a5a5a');
  ctx.strokeStyle = '#6e1e1e';
  ctx.beginPath(); ctx.moveTo(panelX + 2, ly - 4); ctx.lineTo(panelX + LW - 4, ly - 4); ctx.stroke();
  ly += 4;
  if (dim === 'over') {
    key('#99e550', 'деревня живёт');
    key('#d9574a', 'захвачена / данж');
    key('#7b2fbe', 'форт Тьмы');
    key('#696a6a', 'руины / зачищено');
    key('#df7126', 'лагерь · портал');
    key('#fbf236', 'обелиск · метка');
    key('#63c5ff', 'источник');
    key('#b06ee1', 'каменный круг');
    key('#639bff', 'союзник');
    key('#ffffff', 'ты');
    ly += 2;
    key('#fbf236', '✚ цель задания');
  } else {
    key('#df7126', 'лава');
    key('#16141f', 'обсидиан');
    key('#fbf236', 'жилы кристалла');
    key('#99e550', 'лагерь огнеходцев');
    key('#d9574a', 'логово големов');
    key('#b06ee1', 'портал домой');
    key('#ffffff', 'ты');
  }
  ly = y0 + S - 24;
  ctx.strokeStyle = '#6e1e1e';
  ctx.beginPath(); ctx.moveTo(panelX + 2, ly - 8); ctx.lineTo(panelX + LW - 4, ly - 8); ctx.stroke();
  line('Tab — измерение', '#9a5a5a');
  line('колесо — зум', '#9a5a5a');
  line('ЛКМ — тащить', '#9a5a5a');

  // подложка: рельеф выбранного измерения с учётом зума и сдвига
  const base = dim === 'ash' ? ashCanvas : biomeCanvas;
  if (base) {
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.9;
    const sw = base.width / mapView.zoom;
    ctx.drawImage(base, vL / worldPx * base.width, vT / worldPx * base.width, sw, sw, x0, y0, S, S);
    ctx.globalAlpha = 1;
  }

  if (dim === 'over') {
    for (const s of net.mapInfo.settlements) {
      const x = px(s.x * TILE), y = py(s.y * TILE);
      if (!seen(x, y)) continue;
      const sz = Math.min(7, 3 + Math.floor((s.pop || 6) / 4)); // размер точки = размер деревни
      // статус: зелёная — живёт, красная — захвачена, фиолетовая — форт Тьмы, серая — руины
      ctx.fillStyle = s.st === 3 ? '#7b2fbe' : s.st === 2 ? '#696a6a' : s.st === 1 ? '#d9574a' : '#99e550';
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      const mark = s.st === 3 ? ' ⛧' : s.st === 2 ? ' ☠' : s.st === 1 ? ' ⚔' : '';
      ctx.fillText(s.name + (s.pop ? ` (${s.pop})` : '') + mark, x - 18, y - 10);
    }
    // Чернокаменная Цитадель — сердце Тьмы
    if (net.mapInfo.citadel) {
      const c = net.mapInfo.citadel;
      const x = px(c.x * TILE), y = py(c.y * TILE);
      if (seen(x, y)) {
        ctx.fillStyle = '#7b2fbe';
        ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#b57edc';
        ctx.fillText('⛧ ' + c.name + (net.darkPower ? ` (мощь ${net.darkPower.pw})` : ''), x - 50, y + 6);
      }
    }
    const POI_COLORS = {
      dungeon: '#d9574a', camp: '#df7126',
      hermit: '#99e550', circle: '#b06ee1', obelisk: '#fbf236', spring: '#63c5ff', ashportal: '#df7126',
    };
    for (const p of net.mapInfo.pois) {
      const x = px(p.x * TILE), y = py(p.y * TILE);
      if (!seen(x, y)) continue;
      const special = !!POI_COLORS[p.type] && p.type !== 'dungeon' && p.type !== 'camp';
      ctx.fillStyle = (p.cleared && !special) ? '#696a6a' : POI_COLORS[p.type] || '#df7126';
      const sz = special ? 4 : 3;
      ctx.fillRect(x - 1, y - 1, sz, sz);
      if (special) ctx.fillText({ hermit: '🛖', circle: '⛧', obelisk: '▲', spring: '~', ashportal: '🔥' }[p.type] || '', x + 4, y - 4);
    }
    for (const m of net.mapInfo.markers || []) {
      const x = px(m.x * TILE), y = py(m.y * TILE);
      if (seen(x, y)) { ctx.fillStyle = '#fbf236'; ctx.fillRect(x - 1, y - 1, 3, 3); }
    }
    for (const q of net.you?.qs || []) {
      if (!q.tx) continue;
      const qx = px(q.tx * TILE), qy = py(q.ty * TILE);
      if (!seen(qx, qy)) continue;
      ctx.fillStyle = q.done ? '#99e550' : '#fbf236';
      ctx.fillRect(qx - 2, qy, 5, 1); ctx.fillRect(qx, qy - 2, 1, 5);
      ctx.fillText(q.title, qx - 30, qy + 6);
    }
  } else {
    // Выжженные земли: лагерь, логово, портал
    const a = net.mapInfo.ash;
    const mark = (tx, ty, color, label) => {
      const x = px(tx * TILE), y = py(ty * TILE);
      if (!seen(x, y)) return;
      ctx.fillStyle = color;
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillText(label, x - 24, y - 6);
    };
    mark(a.camp.x, a.camp.y, '#99e550', '🔥 Лагерь огнеходцев');
    mark(a.lair.x, a.lair.y, '#d9574a', '🗿 Логово големов');
    mark(a.portal.x, a.portal.y, '#b06ee1', 'Портал домой');
  }

  // герои (снапшот отдаёт только тех, кто в твоём измерении)
  if (youDim === dim) {
    for (const [, r] of net.remotes) {
      if (r.data.tp !== 'p') continue;
      const pos = net.lerpEnt(r);
      const x = px(pos.x), y = py(pos.y);
      if (!seen(x, y)) continue;
      ctx.fillStyle = '#639bff';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillText(r.data.nm || '', x - 10, y - 6);
    }
    // ты — белая точка с пульсирующим кольцом
    const mx = px(net.pred.x), my = py(net.pred.y);
    if (seen(mx, my)) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx - 1, my - 1, 3, 3);
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(mx, my, 5 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = '#696a6a';
    ctx.fillText(youDim === null ? 'ты — в подземелье' : 'ты — в другом измерении', x0 + 4, y0 + 10);
  }
}

function blit() {
  sctx.drawImage(view, 0, 0, screen.width, screen.height);
}

// ---------- старт ----------
atlas.load().then(() => requestAnimationFrame(frame));
