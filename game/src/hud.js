// Palm City Heat — the HUD: objective panel, cash/respect/stars, health,
// busted meter, speedometer, prompts, toasts, the dialogue box and the live
// circular minimap (roads, water, player arrow, gold objective marker and
// blue police blips, north-up).

import { ROAD_LINES, SAND_X } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.objTitle = $('objective-title');
    this.objText = $('objective-text');
    this.objDist = $('objective-dist');
    this.objTimer = $('objective-timer');
    this.starsEl = $('stars');
    this.cashEl = $('cash');
    this.respectEl = $('respect');
    this.healthFill = $('health-fill');
    this.modeLabel = $('mode-label');
    this.speedo = $('speedo');
    this.speedEl = $('speed');
    this.promptEl = $('prompt');
    this.toastsEl = $('toasts');
    this.dialogueEl = $('dialogue');
    this.dialogueWho = $('dialogue-who');
    this.dialogueText = $('dialogue-text');
    this.bustedBox = $('busted-box');
    this.bustedFill = $('busted-fill');
    this.map = $('minimap').getContext('2d');
    this.starsHtml = '';
    this.bannerTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  toast(msg, ms = 3400) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toastsEl.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  banner(title, text, ms = 2600) {
    const banner = $('banner');
    $('banner-title').textContent = title;
    $('banner-title').style.color = title === 'BUSTED' ? '#ff5252' : '#ffb340';
    $('banner-text').textContent = text;
    banner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  update(s) {
    // Objective.
    this.objTitle.textContent = s.objective.title;
    this.objText.textContent = s.objective.text;
    if (s.objective.target) {
      const d = Math.hypot(s.objective.target.x - s.playerPos.x, s.objective.target.z - s.playerPos.z);
      this.objDist.textContent = `${Math.round(d)} m`;
    } else {
      this.objDist.textContent = '';
    }
    if (s.objective.timer != null) {
      this.objTimer.classList.remove('hidden');
      const t = Math.max(0, Math.ceil(s.objective.timer));
      this.objTimer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    } else {
      this.objTimer.classList.add('hidden');
    }
    // Stars.
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < s.stars ? 'lit' : ''}">★</span>`;
    if (html !== this.starsHtml) {
      this.starsEl.innerHTML = html;
      this.starsHtml = html;
    }
    this.cashEl.textContent = `$${Math.round(s.cash)}`;
    this.respectEl.textContent = `Respect ${Math.round(s.respect)}`;
    this.healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    this.modeLabel.textContent = s.driving ? 'DRIVING' : 'ON FOOT';
    if (s.driving) {
      this.speedo.classList.remove('hidden');
      this.speedEl.textContent = String(Math.round(Math.abs(s.speedKmh)));
    } else {
      this.speedo.classList.add('hidden');
    }
    // Prompt.
    if (s.prompt) {
      this.promptEl.classList.remove('hidden');
      this.promptEl.innerHTML = s.prompt;
    } else {
      this.promptEl.classList.add('hidden');
    }
    // Busted meter.
    if (s.busted > 0.02) {
      this.bustedBox.classList.remove('hidden');
      this.bustedFill.style.width = `${Math.round(s.busted * 100)}%`;
    } else {
      this.bustedBox.classList.add('hidden');
    }
    // Dialogue.
    if (s.dialogue) {
      this.dialogueEl.classList.remove('hidden');
      this.dialogueWho.textContent = s.dialogue.who;
      this.dialogueText.textContent = s.dialogue.text;
    } else {
      this.dialogueEl.classList.add('hidden');
    }
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.map;
    const W = 190, C = W / 2, RANGE = 300, K = C / RANGE;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#243447';
    ctx.fillRect(0, 0, W, W);
    const toMap = (x, z) => [C + (x - s.playerPos.x) * K, C + (z - s.playerPos.z) * K];
    // Sea.
    const [seaX] = toMap(SAND_X, 0);
    ctx.fillStyle = '#1d6f9f';
    ctx.fillRect(seaX, 0, W - seaX, W);
    // Roads.
    ctx.strokeStyle = '#4d6076';
    ctx.lineWidth = 5;
    for (const L of ROAD_LINES) {
      const [rx] = toMap(L, 0);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, W); ctx.stroke();
      const [, rz] = toMap(0, L);
      ctx.beginPath(); ctx.moveTo(0, rz); ctx.lineTo(W, rz); ctx.stroke();
    }
    // Objective marker (clamped to the rim when far).
    if (s.objective.target) {
      let [tx, ty] = toMap(s.objective.target.x, s.objective.target.z);
      const dx = tx - C, dy = ty - C;
      const d = Math.hypot(dx, dy);
      if (d > C - 10) { tx = C + (dx / d) * (C - 10); ty = C + (dy / d) * (C - 10); }
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(tx, ty, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#14100a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#5b8cff';
    for (const p of s.policePts) {
      const [bx, by] = toMap(p.x, p.z);
      if (bx < -6 || bx > W + 6 || by < -6 || by > W + 6) continue;
      ctx.beginPath(); ctx.arc(bx, by, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow, pointing along the facing heading.
    ctx.translate(C, C);
    ctx.rotate(Math.PI - s.facing);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
