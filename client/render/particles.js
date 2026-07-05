// Пул частиц: вспышки, кровь, гильзы, пыль, искры.
const MAX = 600;

export class Particles {
  constructor() {
    this.pool = new Array(MAX).fill(null).map(() => ({ alive: false }));
    this.idx = 0;
  }

  spawn(o) {
    const p = this.pool[this.idx];
    this.idx = (this.idx + 1) % MAX;
    Object.assign(p, {
      alive: true, x: 0, y: 0, vx: 0, vy: 0, grav: 0, drag: 1,
      life: 0.4, maxLife: 0.4, size: 1, color: '#fff', ...o,
    });
    p.maxLife = p.life;
  }

  burst(x, y, color, n, speed = 60, life = 0.4, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life: life * (0.6 + Math.random() * 0.8), size, drag: 0.02 });
    }
  }

  muzzle(x, y, ang) {
    for (let i = 0; i < 5; i++) {
      const a = ang + (Math.random() - 0.5) * 0.7;
      const v = 90 + Math.random() * 80;
      this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: i < 2 ? '#fbf236' : '#df7126', life: 0.1 + Math.random() * 0.1, size: 1, drag: 0.1 });
    }
  }

  casing(x, y, ang) {
    const a = ang + Math.PI + (Math.random() - 0.5);
    this.spawn({ x, y, vx: Math.cos(a) * 40, vy: -50 - Math.random() * 30, grav: 260, color: '#d9a066', life: 0.5, size: 1 });
  }

  blood(x, y, n = 6) { this.burst(x, y, '#ac3232', n, 70, 0.45); }
  dust(x, y) {
    for (let i = 0; i < 4; i++)
      this.spawn({ x: x + (Math.random() - 0.5) * 8, y: y + 3, vx: (Math.random() - 0.5) * 30, vy: -8 - Math.random() * 12, color: '#847e87', life: 0.35, size: 1 });
  }
  sparkle(x, y) { this.burst(x, y, '#fbf236', 8, 50, 0.5); }
  heal(x, y) {
    for (let i = 0; i < 6; i++)
      this.spawn({ x: x + (Math.random() - 0.5) * 12, y, vx: 0, vy: -20 - Math.random() * 15, color: '#99e550', life: 0.7, size: 1 });
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60) || 1;
      p.vx *= 1 - Math.min(0.9, p.drag * dt * 60);
      p.vy *= 1 - Math.min(0.9, p.drag * dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(ctx, cam) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const s = cam.toScreen(p.x, p.y);
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x, s.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
