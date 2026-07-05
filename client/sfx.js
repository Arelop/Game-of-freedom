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
