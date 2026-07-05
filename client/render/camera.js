// Камера: lerp к точке между игроком и прицелом + тряска (trauma^2).
import { VIEW_W, VIEW_H } from '../../shared/constants.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
  }

  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }

  update(dt, targetX, targetY, aimX, aimY) {
    const tx = targetX + (aimX - targetX) * 0.25;
    const ty = targetY + (aimY - targetY) * 0.25;
    const k = 1 - Math.pow(0.0001, dt); // плавный lerp, независимый от fps
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * 6;
    this.shakeX = (Math.random() * 2 - 1) * sh;
    this.shakeY = (Math.random() * 2 - 1) * sh;
  }

  // мировые -> экранные (нативное разрешение)
  toScreen(wx, wy) {
    return {
      x: Math.round(wx - this.x + VIEW_W / 2 + this.shakeX),
      y: Math.round(wy - this.y + VIEW_H / 2 + this.shakeY),
    };
  }

  toWorld(sx, sy) {
    return { x: sx - VIEW_W / 2 + this.x, y: sy - VIEW_H / 2 + this.y };
  }
}
