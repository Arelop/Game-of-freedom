// Клавиатура и мышь -> инпуты симуляции.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0; this.mouseY = 0;   // экранные координаты канваса (нативные пиксели)
    this.fire = false;
    this.rollQueued = false;
    this.canvas = canvas;
    this.onKey = null;                   // колбэк для разовых клавиш (E, Tab, цифры...)

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') { this.rollQueued = true; e.preventDefault(); }
      if (k === 'Tab') e.preventDefault();
      if (this.onKey) this.onKey(k);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fire = false; });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = (e.clientY - r.top) / r.height;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.rollQueued = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  moveVec() {
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    return { mx, my };
  }

  takeRoll() { const r = this.rollQueued; this.rollQueued = false; return r; }
}
