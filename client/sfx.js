// Крошечный WebAudio-синтезатор эффектов — без аудиофайлов.
// Звук 2.0: мастер-громкость и мьют (M), позиционный микшер (затухание по
// расстоянию + стереопанорама от героя), звуки боёвки 4.x, боевая музыка.
let ctx = null, master = null;
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let muted = localStorage.getItem('sfxMuted') === '1';
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('sfxMuted', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 1;
  return !muted;
}

// ---------- позиционный микшер ----------
// Слушатель — герой; main.js обновляет каждый кадр. Звук с координатами
// затухает с расстоянием и уходит в нужное ухо.
let lx = 0, ly = 0;
export function setListener(x, y) { lx = x; ly = y; }

function spatial(at) {
  if (!at || at.x === undefined || at.y === undefined) return { vol: 1, pan: 0 };
  const dx = at.x - lx, dy = at.y - ly;
  const d = Math.hypot(dx, dy);
  const vol = d < 48 ? 1 : Math.max(0.06, 1 - (d - 48) / 280);
  const pan = Math.max(-0.8, Math.min(0.8, dx / 200));
  return { vol, pan };
}

let noiseBuf = null;
function noise() {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function play({ type = 'square', f0 = 440, f1 = f0, len = 0.1, vol = 0.15, noiseAmt = 0, delay = 0, at = null }) {
  try {
    const c = ac();
    const s = spatial(at);
    if (s.vol <= 0.061 && vol < 0.2) return; // далёкое и тихое — не считаем
    const t = c.currentTime + delay;
    const g = c.createGain();
    g.gain.setValueAtTime(vol * s.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    let out = g;
    if (s.pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = s.pan;
      g.connect(p); out = p;
    }
    out.connect(master);
    if (noiseAmt < 1) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
      const og = c.createGain(); og.gain.value = 1 - noiseAmt;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + len);
    }
    if (noiseAmt > 0) {
      const n = c.createBufferSource();
      n.buffer = noise();
      const ng = c.createGain(); ng.gain.value = noiseAmt;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = f0 * 4;
      n.connect(flt); flt.connect(ng); ng.connect(g);
      n.start(t); n.stop(t + len);
    }
  } catch { /* звук — не критично */ }
}

// Все эффекты принимают опциональную точку {x, y} (можно передавать fx-событие
// целиком) — тогда звук позиционный. Без неё — как раньше, в полный голос.
export const SFX = {
  // ближний бой
  swing: (at) => play({ type: 'triangle', f0: 620, f1: 180, len: 0.12, vol: 0.10, noiseAmt: 0.6, at }),
  swing_heavy: (at) => play({ type: 'sawtooth', f0: 300, f1: 80, len: 0.22, vol: 0.16, noiseAmt: 0.7, at }),
  // дальний бой
  shot_bow: (at) => play({ type: 'triangle', f0: 500, f1: 120, len: 0.14, vol: 0.13, noiseAmt: 0.3, at }),
  shot_crossbow: (at) => play({ type: 'triangle', f0: 360, f1: 90, len: 0.16, vol: 0.15, noiseAmt: 0.4, at }),
  shot_knife: (at) => play({ type: 'square', f0: 700, f1: 300, len: 0.08, vol: 0.08, noiseAmt: 0.4, at }),
  shot_fire: (at) => play({ type: 'sawtooth', f0: 260, f1: 120, len: 0.16, vol: 0.11, noiseAmt: 0.5, at }),
  shot_frost: (at) => play({ type: 'sine', f0: 900, f1: 400, len: 0.14, vol: 0.09, noiseAmt: 0.2, at }),
  shot_laserlike: (at) => play({ type: 'sawtooth', f0: 1600, f1: 500, len: 0.1, vol: 0.09, at }),
  zap: (at) => { play({ type: 'sawtooth', f0: 1800, f1: 200, len: 0.12, vol: 0.12, noiseAmt: 0.4, at }); },
  enemy_shot: (at) => play({ type: 'square', f0: 380, f1: 140, len: 0.1, vol: 0.05, at }),
  hit: (at) => play({ type: 'square', f0: 260, f1: 90, len: 0.07, vol: 0.10, noiseAmt: 0.4, at }),
  hurt: (at) => play({ type: 'sawtooth', f0: 190, f1: 55, len: 0.28, vol: 0.22, noiseAmt: 0.4, at }),
  die: (at) => play({ type: 'square', f0: 220, f1: 40, len: 0.3, vol: 0.14, noiseAmt: 0.6, at }),
  pickup: (at) => { play({ type: 'square', f0: 660, f1: 880, len: 0.07, vol: 0.08, at }); play({ type: 'square', f0: 990, f1: 1320, len: 0.09, vol: 0.07, delay: 0.06, at }); },
  roll: (at) => play({ type: 'triangle', f0: 300, f1: 120, len: 0.16, vol: 0.07, noiseAmt: 0.5, at }),
  reload: (at) => play({ type: 'square', f0: 200, f1: 420, len: 0.1, vol: 0.06, at }),
  ui: () => play({ type: 'square', f0: 520, f1: 520, len: 0.05, vol: 0.05 }),
  heal: (at) => play({ type: 'sine', f0: 440, f1: 880, len: 0.25, vol: 0.09, at }),
  boom: (at) => play({ type: 'sawtooth', f0: 120, f1: 30, len: 0.5, vol: 0.25, noiseAmt: 0.8, at }),
  quest: () => { play({ type: 'square', f0: 523, f1: 523, len: 0.09, vol: 0.08 }); play({ type: 'square', f0: 784, f1: 784, len: 0.14, vol: 0.08, delay: 0.09 }); },

  // ---------- боёвка 4.x ----------
  // замах врага: нарастающий вжух — аудио-телеграф, слышен и спиной
  windup: (at) => play({ type: 'triangle', f0: 180, f1: 620, len: 0.28, vol: 0.11, noiseAmt: 0.55, at }),
  // слом стойкости: хруст + звон
  stagger: (at) => {
    play({ type: 'square', f0: 150, f1: 45, len: 0.2, vol: 0.2, noiseAmt: 0.6, at });
    play({ type: 'sine', f0: 1250, f1: 900, len: 0.3, vol: 0.08, delay: 0.05, at });
  },
  // добивание: басовый удар + мясной треск
  finisher: (at) => {
    play({ type: 'sine', f0: 110, f1: 32, len: 0.4, vol: 0.3, at });
    play({ type: 'square', f0: 500, f1: 120, len: 0.14, vol: 0.16, noiseAmt: 0.8, at });
  },
  // рёв босса («ПАЛ НА КОЛЕНО!», комбо): два низких слоя с рыком
  roar: (at) => {
    play({ type: 'sawtooth', f0: 95, f1: 42, len: 0.7, vol: 0.24, noiseAmt: 0.3, at });
    play({ type: 'sawtooth', f0: 140, f1: 65, len: 0.55, vol: 0.14, noiseAmt: 0.4, delay: 0.06, at });
  },
  // вой вожака: глиссандо вверх и вниз
  howl: (at) => {
    play({ type: 'sine', f0: 340, f1: 720, len: 0.5, vol: 0.13, at });
    play({ type: 'sine', f0: 720, f1: 430, len: 0.55, vol: 0.11, delay: 0.48, at });
  },
  // заряд готов: тихий динь у самого героя
  charged: () => { play({ type: 'sine', f0: 880, f1: 880, len: 0.1, vol: 0.07 }); play({ type: 'sine', f0: 1320, f1: 1320, len: 0.14, vol: 0.05, delay: 0.05 }); },
  // блок щитом: металлический тинк
  block: (at) => play({ type: 'square', f0: 950, f1: 480, len: 0.09, vol: 0.12, noiseAmt: 0.35, at }),
  // фанфара легендарной находки
  fanfare: () => {
    [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.38]].forEach(([f, d]) =>
      play({ type: 'triangle', f0: f, f1: f, len: 0.35, vol: 0.11, delay: d }));
  },
  // осадный горн: два низких гудка
  horn: () => {
    play({ type: 'sawtooth', f0: 110, f1: 104, len: 1.1, vol: 0.16, noiseAmt: 0.15 });
    play({ type: 'sawtooth', f0: 165, f1: 156, len: 1.0, vol: 0.1, delay: 0.08 });
  },
};

export function playWeaponSound(soundId, at) { (SFX[soundId] || SFX.shot_bow)(at); }

// ---------- генеративная фоновая музыка ----------
// Медленный пад из двух слоёв + редкие ноты-переборы пентатоники.
// Настроения: day (мажор), night (минор, ниже и медленнее), dungeon (тёмный
// дрон), battle (тревожный минор с пульсом — включается при врагах рядом).
const MOODS = {
  day: { root: 220, scale: [0, 2, 4, 7, 9], chordEvery: 9, pluckEvery: [2.5, 6], padVol: 0.030, pluckVol: 0.045 },
  night: { root: 165, scale: [0, 3, 5, 7, 10], chordEvery: 12, pluckEvery: [4, 9], padVol: 0.026, pluckVol: 0.032 },
  dungeon: { root: 110, scale: [0, 1, 5, 7, 8], chordEvery: 14, pluckEvery: [5, 11], padVol: 0.034, pluckVol: 0.028 },
  battle: { root: 147, scale: [0, 2, 3, 5, 7], chordEvery: 5, pluckEvery: [1.1, 2.4], padVol: 0.036, pluckVol: 0.05, drum: 0.62 },
};

export const Music = {
  on: localStorage.getItem('musicOff') !== '1',
  mood: 'day',
  started: false,
  _timers: [],
  _pads: [],

  start() {
    if (this.started || !this.on) return;
    this.started = true;
    this._chordLoop();
    this._pluckLoop();
    this._drumLoop();
  },

  toggle() {
    this.on = !this.on;
    localStorage.setItem('musicOff', this.on ? '0' : '1');
    if (!this.on) this._stopAll();
    else { this.started = false; this.start(); }
    return this.on;
  },

  setMood(m) { if (MOODS[m]) this.mood = m; },

  _stopAll() {
    this.started = false;
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    for (const p of this._pads) { try { p.g.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 1); p.o.stop(ac().currentTime + 1.2); } catch { } }
    this._pads = [];
  },

  // аккорд-пад: тоника + квинта + терция/октава, плавная атака и затухание
  _chordLoop() {
    if (!this.on || !this.started) return;
    const M = MOODS[this.mood];
    try {
      const c = ac();
      const t = c.currentTime;
      const deg = [0, M.scale[2], 7, 12][Math.floor(Math.random() * 4)];
      const base = M.root * Math.pow(2, deg / 12) / 2;
      for (const [mult, detune] of [[1, 0], [1.5, 3], [2, -4]]) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = base * mult;
        o.detune.value = detune;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(M.padVol, t + (this.mood === 'battle' ? 0.8 : 2.5));
        g.gain.linearRampToValueAtTime(0.0001, t + M.chordEvery + 1.5);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + M.chordEvery + 2);
        this._pads.push({ o, g });
        if (this._pads.length > 9) this._pads.splice(0, 3);
      }
    } catch { }
    this._timers.push(setTimeout(() => this._chordLoop(), MOODS[this.mood].chordEvery * 1000));
  },

  // редкие ноты-переборы из пентатоники — «кто-то перебирает струны вдалеке»
  _pluckLoop() {
    if (!this.on || !this.started) return;
    const M = MOODS[this.mood];
    try {
      const note = M.scale[Math.floor(Math.random() * M.scale.length)] + 12 * (Math.random() < 0.3 ? 2 : 1);
      play({ type: 'sine', f0: M.root * Math.pow(2, note / 12), f1: M.root * Math.pow(2, note / 12), len: 1.4, vol: M.pluckVol });
    } catch { }
    const [a, b] = M.pluckEvery;
    this._timers.push(setTimeout(() => this._pluckLoop(), (a + Math.random() * (b - a)) * 1000));
  },

  // боевой пульс: глухой барабан, живёт только в battle-настроении
  _drumLoop() {
    if (!this.on || !this.started) return;
    const M = MOODS[this.mood];
    if (M.drum) {
      try {
        play({ type: 'sine', f0: 70, f1: 38, len: 0.16, vol: 0.12, noiseAmt: 0.5 });
        this._drumAlt = !this._drumAlt;
        if (this._drumAlt) play({ type: 'sine', f0: 55, f1: 34, len: 0.12, vol: 0.07, noiseAmt: 0.6, delay: M.drum / 2 });
      } catch { }
    }
    this._timers.push(setTimeout(() => this._drumLoop(), (M.drum || 1.4) * 1000));
  },
};
