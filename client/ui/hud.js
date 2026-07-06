// HUD на низкоразрешённом канвасе: сердца, голод, патроны, монеты,
// миникарта, квест, день/время, F3-отладка.
import { VIEW_W, VIEW_H, WORLD_TILES, TILE, PLAYER_MAX_HP, SEASONS, seasonOf } from '../../shared/constants.js';
import { getWeapon } from '../../shared/rarity.js';
import { STR } from '../../shared/strings.js';
import { abilitiesOf } from '../../shared/abilities.js';

export class Hud {
  constructor(atlas) { this.atlas = atlas; this.debug = false; }

  render(ctx, net, fps) {
    const you = net.you;
    if (!you) return;
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';

    // сердца
    for (let i = 0; i < Math.ceil(you.hm / 2); i++) {
      const v = you.hp - i * 2;
      const spr = v >= 2 ? 'ui_heart_full' : v === 1 ? 'ui_heart_half' : 'ui_heart_empty';
      this.atlas.draw(ctx, spr, 10 + i * 11, 9);
    }
    // голод
    ctx.fillStyle = '#222034';
    ctx.fillRect(5, 16, 42, 5);
    ctx.fillStyle = you.hunger < 20 ? '#d9574a' : '#d9a066';
    ctx.fillRect(6, 17, Math.round(40 * you.hunger / 100), 3);

    // уровень и опыт
    ctx.fillStyle = '#fbf236';
    ctx.fillText('Ур.' + (you.lvl || 1), 50, 8);
    ctx.fillStyle = '#222034';
    ctx.fillRect(5, 22, 42, 3);
    ctx.fillStyle = '#99e550';
    ctx.fillRect(5, 22, Math.round(42 * Math.min(1, (you.xp || 0) / (you.xpn || 1))), 3);
    if ((you.sp || 0) + (you.tp2 || 0) > 0 && Math.floor(performance.now() / 600) % 2 === 0) {
      ctx.fillStyle = '#fbf236';
      ctx.fillText('+C', 50, 17);
    }

    // оружие и патроны (справа снизу)
    const w = getWeapon(you.w);
    if (w) {
      const gx = VIEW_W - 78, gy = VIEW_H - 26;
      const ws = this.atlas.map[w.sprite];
      this.atlas.draw(ctx, w.sprite, gx, gy + 6, { scale: ws && ws.w > 20 ? 0.5 : 1 });
      ctx.fillStyle = '#eee';
      ctx.fillText(w.name, gx + 12, gy);
      let ammoTxt, col;
      if (w.melee) { ammoTxt = 'ближний бой'; col = '#99e550'; }
      else if (w.infiniteAmmo) { ammoTxt = STR.ammoInf; col = '#99e550'; }
      else { ammoTxt = `${you.mag}/${you.ammo[w.ammoType] ?? 0}`; col = you.mag === 0 ? '#d9574a' : '#99e550'; }
      ctx.fillStyle = col;
      ctx.fillText(you.rt > 0 && !w.melee ? STR.reloading : ammoTxt, gx + 12, gy + 9);
      // слоты оружия
      for (let i = 0; i < you.ws.length; i++) {
        ctx.fillStyle = i === you.wi ? '#fbf236' : '#696a6a';
        ctx.fillText(String(i + 1), gx + 12 + i * 8, gy + 18);
      }
    }

    // монеты
    this.atlas.draw(ctx, 'item_coin', 10, VIEW_H - 12);
    ctx.fillStyle = '#fbf236';
    ctx.fillText(String(you.coins), 18, VIEW_H - 16);

    // время суток и сезон
    const t = net.worldTime;
    const icon = (t > 0.22 && t < 0.85) ? '☀' : '☾';
    ctx.fillStyle = '#eee';
    ctx.fillText(`${icon} День ${net.day} · ${SEASONS[seasonOf(net.day)]}`, VIEW_W / 2 - 36, 4);

    // квест
    if (you.q) {
      ctx.fillStyle = you.q.done ? '#99e550' : '#fbf236';
      ctx.fillText((you.q.done ? '✓ ' : '• ') + you.q.title, 5, 26);
    }

    this.renderAbilities(ctx, you);
    this.renderMinimap(ctx, net);

    if (this.debug) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(2, 40, 120, 40);
      ctx.fillStyle = '#99e550';
      ctx.fillText(`fps ${fps}  ping ${net.ping}ms`, 5, 43);
      ctx.fillText(`ents ${net.remotes.size}  bul ${net.bullets.length}`, 5, 52);
      ctx.fillText(`resim ${net.resims}  chunks ${net.chunks.size}`, 5, 61);
      ctx.fillText(`map ${net.mapId}`, 5, 70);
    }
  }

  // панель способностей Q/E/R с кулдаунами (снизу по центру)
  renderAbilities(ctx, you) {
    const abs = abilitiesOf(you.cls);
    if (!abs.length) return;
    const KEYS = ['Q', 'E', 'R'];
    const S = 18, GAP = 3;
    const x0 = Math.round(VIEW_W / 2 - (S * 3 + GAP * 2) / 2), y0 = VIEW_H - S - 5;
    ctx.textAlign = 'left';
    for (let i = 0; i < abs.length; i++) {
      const ab = abs[i];
      const x = x0 + i * (S + GAP);
      const locked = (you.lvl || 1) < ab.lvl;
      const cd = you.ab?.[i] || 0;
      const noMana = ab.mana > 0 && (you.ammo?.mana || 0) < ab.mana;
      ctx.fillStyle = 'rgba(20,18,26,.85)';
      ctx.fillRect(x - 1, y0 - 1, S + 2, S + 2);
      this.atlas.draw(ctx, ab.icon, x + S / 2, y0 + S / 2, {
        alpha: locked ? 0.25 : noMana ? 0.5 : 1,
        scale: (this.atlas.map[ab.icon]?.w || 16) > 20 ? 0.5 : 1,
      });
      if (locked) { // замок: откроется с уровнем
        ctx.fillStyle = '#696a6a';
        ctx.fillText(String(ab.lvl), x + S / 2 - 2, y0 + S / 2 - 4);
      } else if (cd > 0) { // шторка кулдауна снизу вверх
        const k = Math.min(1, cd / ab.cd);
        ctx.fillStyle = 'rgba(10,10,16,.75)';
        ctx.fillRect(x, y0 + S * (1 - k), S, S * k);
        ctx.fillStyle = '#eee';
        ctx.fillText(Math.ceil(cd) + '', x + S / 2 - 2, y0 + S / 2 - 4);
      }
      ctx.fillStyle = locked ? '#696a6a' : '#fbf236';
      ctx.fillText(KEYS[i], x + 1, y0 + S - 8);
    }
  }

  renderMinimap(ctx, net) {
    if (net.mapId !== 'over' || !net.you) return;
    const S = 52, M = 4;
    const x0 = VIEW_W - S - M, y0 = M;
    ctx.fillStyle = 'rgba(20,18,26,.8)';
    ctx.fillRect(x0 - 1, y0 - 1, S + 2, S + 2);
    const k = S / (WORLD_TILES * TILE);
    for (const s of net.mapInfo.settlements) {
      ctx.fillStyle = s.st === 3 ? '#7b2fbe' : s.st === 2 ? '#696a6a' : s.st === 1 ? '#d9574a' : '#99e550';
      ctx.fillRect(x0 + Math.round(s.x * TILE * k) - 1, y0 + Math.round(s.y * TILE * k) - 1, 2, 2);
    }
    if (net.mapInfo.citadel) {
      ctx.fillStyle = '#7b2fbe';
      ctx.fillRect(x0 + Math.round(net.mapInfo.citadel.x * TILE * k) - 1, y0 + Math.round(net.mapInfo.citadel.y * TILE * k) - 1, 3, 3);
    }
    for (const p of net.mapInfo.pois) {
      ctx.fillStyle = p.cleared ? '#696a6a' : p.type === 'dungeon' ? '#d9574a' : '#df7126';
      ctx.fillRect(x0 + Math.round(p.x * TILE * k), y0 + Math.round(p.y * TILE * k), 1, 1);
    }
    if (net.you.q && net.you.q.tx) {
      ctx.fillStyle = '#fbf236';
      const qx = x0 + Math.round(net.you.q.tx * TILE * k), qy = y0 + Math.round(net.you.q.ty * TILE * k);
      ctx.fillRect(qx - 1, qy, 3, 1); ctx.fillRect(qx, qy - 1, 1, 3);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0 + Math.round(net.pred.x * k) - 1, y0 + Math.round(net.pred.y * k) - 1, 2, 2);
  }
}
