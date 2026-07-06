// Крошечный WebAudio-синтезатор эффектов — без аудиофайлов.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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

function play({ type = 'square', f0 = 440, f1 = f0, len = 0.1, vol = 0.15, noiseAmt = 0, delay = 0 }) {
  try {
    const c = ac();
    const t = c.currentTime + delay;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    g.connect(c.destination);
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

export const SFX = {
  // ближний бой
  swing: () => play({ type: 'triangle', f0: 620, f1: 180, len: 0.12, vol: 0.10, noiseAmt: 0.6 }),
  swing_heavy: () => play({ type: 'sawtooth', f0: 300, f1: 80, len: 0.22, vol: 0.16, noiseAmt: 0.7 }),
  // дальний бой
  shot_bow: () => play({ type: 'triangle', f0: 500, f1: 120, len: 0.14, vol: 0.13, noiseAmt: 0.3 }),
  shot_crossbow: () => play({ type: 'triangle', f0: 360, f1: 90, len: 0.16, vol: 0.15, noiseAmt: 0.4 }),
  shot_knife: () => play({ type: 'square', f0: 700, f1: 300, len: 0.08, vol: 0.08, noiseAmt: 0.4 }),
  shot_fire: () => play({ type: 'sawtooth', f0: 260, f1: 120, len: 0.16, vol: 0.11, noiseAmt: 0.5 }),
  shot_frost: () => play({ type: 'sine', f0: 900, f1: 400, len: 0.14, vol: 0.09, noiseAmt: 0.2 }),
  shot_laserlike: () => play({ type: 'sawtooth', f0: 1600, f1: 500, len: 0.1, vol: 0.09 }),
  zap: () => { play({ type: 'sawtooth', f0: 1800, f1: 200, len: 0.12, vol: 0.12, noiseAmt: 0.4 }); },
  enemy_shot: () => play({ type: 'square', f0: 380, f1: 140, len: 0.1, vol: 0.05 }),
  hit: () => play({ type: 'square', f0: 260, f1: 90, len: 0.07, vol: 0.10, noiseAmt: 0.4 }),
  hurt: () => play({ type: 'sawtooth', f0: 190, f1: 55, len: 0.28, vol: 0.22, noiseAmt: 0.4 }),
  die: () => play({ type: 'square', f0: 220, f1: 40, len: 0.3, vol: 0.14, noiseAmt: 0.6 }),
  pickup: () => { play({ type: 'square', f0: 660, f1: 880, len: 0.07, vol: 0.08 }); play({ type: 'square', f0: 990, f1: 1320, len: 0.09, vol: 0.07, delay: 0.06 }); },
  roll: () => play({ type: 'triangle', f0: 300, f1: 120, len: 0.16, vol: 0.07, noiseAmt: 0.5 }),
  reload: () => play({ type: 'square', f0: 200, f1: 420, len: 0.1, vol: 0.06 }),
  ui: () => play({ type: 'square', f0: 520, f1: 520, len: 0.05, vol: 0.05 }),
  heal: () => play({ type: 'sine', f0: 440, f1: 880, len: 0.25, vol: 0.09 }),
  boom: () => play({ type: 'sawtooth', f0: 120, f1: 30, len: 0.5, vol: 0.25, noiseAmt: 0.8 }),
  quest: () => { play({ type: 'square', f0: 523, f1: 523, len: 0.09, vol: 0.08 }); play({ type: 'square', f0: 784, f1: 784, len: 0.14, vol: 0.08, delay: 0.09 }); },
};

export function playWeaponSound(soundId) { (SFX[soundId] || SFX.shot_bow)(); }

// ---------- генеративная фоновая музыка ----------
// Медленный пад из двух слоёв + редкие ноты-переборы пентатоники.
// Настроения: day (мажор), night (минор, ниже и медленнее), dungeon (тёмный дрон).
const MOODS = {
  day: { root: 220, scale: [0, 2, 4, 7, 9], chordEvery: 9, pluckEvery: [2.5, 6], padVol: 0.030, pluckVol: 0.045 },
  night: { root: 165, scale: [0, 3, 5, 7, 10], chordEvery: 12, pluckEvery: [4, 9], padVol: 0.026, pluckVol: 0.032 },
  dungeon: { root: 110, scale: [0, 1, 5, 7, 8], chordEvery: 14, pluckEvery: [5, 11], padVol: 0.034, pluckVol: 0.028 },
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
        g.gain.linearRampToValueAtTime(M.padVol, t + 2.5);
        g.gain.linearRampToValueAtTime(0.0001, t + M.chordEvery + 1.5);
        o.connect(g); g.connect(c.destination);
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
};
