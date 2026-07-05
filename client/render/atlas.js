// Загрузка атласа и отрисовка спрайтов по логическим именам.
export class Atlas {
  constructor() { this.img = null; this.map = {}; this.tintCache = new Map(); }

  async load() {
    const [img, json] = await Promise.all([
      new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = rej;
        i.src = '/assets/atlas.png';
      }),
      fetch('/assets/atlas.json').then(r => r.json()),
    ]);
    this.img = img;
    this.map = json;
  }

  has(name) { return !!this.map[name]; }

  // отрисовка с центром в (x, y), опционально поворот/зеркало
  draw(ctx, name, x, y, { rot = 0, flipX = false, scale = 1, alpha = 1 } = {}) {
    const s = this.map[name];
    if (!s) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (rot) ctx.rotate(rot);
    if (flipX) ctx.scale(-1, 1);
    if (scale !== 1) ctx.scale(scale, scale);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(this.img, s.x, s.y, s.w, s.h, -s.w >> 1, -s.h >> 1, s.w, s.h);
    ctx.restore();
  }

  // прямое размещение (для тайлов) — левый верхний угол
  blit(ctx, name, x, y) {
    const s = this.map[name];
    if (!s) return;
    ctx.drawImage(this.img, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
  }

  // белая вспышка урона: кэш тонированных копий
  drawTinted(ctx, name, x, y, color, { flipX = false } = {}) {
    const s = this.map[name];
    if (!s) return;
    const key = name + ':' + color;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      const cx = c.getContext('2d');
      cx.drawImage(this.img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
      cx.globalCompositeOperation = 'source-atop';
      cx.fillStyle = color;
      cx.fillRect(0, 0, s.w, s.h);
      this.tintCache.set(key, c);
    }
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(c, -s.w >> 1, -s.h >> 1);
    ctx.restore();
  }
}
