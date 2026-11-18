// hud.js — everything drawn over the 3D view: cash and respect, wanted
// stars, health, the busted meter, the objective line, prompts, toasts, the
// dialogue box, and the canvas minimap with its blips.

import { CITY } from './config.js';
import { pressed, mouse } from './input.js';
import { missionObjective } from './missions.js';
import { playerAnchor } from './player.js';

const $ = (id) => document.getElementById(id);

export function createHud(game) {
  const els = {
    cash: $('cash'),
    respect: $('respect'),
    stars: $('stars'),
    health: $('healthFill'),
    busted: $('bustedWrap'),
    bustedFill: $('bustedFill'),
    objective: $('objective'),
    speedo: $('speedo'),
    prompt: $('prompt'),
    toast: $('toast'),
    dialog: $('dialog'),
    dialogName: $('dialogName'),
    dialogText: $('dialogText'),
    minimap: $('minimap'),
  };
  const mapCtx = els.minimap.getContext('2d');

  const hud = {
    promptText: null,
    toastUntil: 0,
    dialogQueue: [],
    dialogTimer: 0,
    dialogDone: null,

    toast(text) {
      els.toast.textContent = text;
      els.toast.classList.add('show');
      this.toastUntil = game.time + 3.6;
    },

    setPrompt(text) {
      this.promptText = text;
    },

    showDialog(lines, onDone) {
      this.dialogQueue = [...lines];
      this.dialogDone = onDone || null;
      game.dialogActive = true;
      this.nextDialogLine();
    },

    nextDialogLine() {
      const line = this.dialogQueue.shift();
      if (!line) {
        els.dialog.classList.remove('show');
        game.dialogActive = false;
        const done = this.dialogDone;
        this.dialogDone = null;
        if (done) done();
        return;
      }
      els.dialogName.textContent = line[0];
      els.dialogText.textContent = line[1];
      els.dialog.classList.add('show');
      this.dialogTimer = 4.4;
    },

    update(dt) {
      // money, respect, health
      els.cash.textContent = `$${Math.round(game.cash).toLocaleString('en-US')}`;
      els.respect.textContent = `Respect ${game.respect}`;
      els.health.style.width = `${Math.max(0, game.player.health)}%`;
      els.health.style.background = game.player.health < 30 ? '#d43a2e' : '#57c256';

      // wanted stars, flashing while the heat is fresh
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < game.stars ? '★' : '☆';
      els.stars.textContent = stars;
      els.stars.style.opacity = game.stars === 0 ? '0.25' : '1';

      // busted meter only exists while it is filling
      if (game.bustedMeter > 0.02 && game.stars > 0) {
        els.busted.classList.add('show');
        els.bustedFill.style.width = `${game.bustedMeter * 100}%`;
      } else {
        els.busted.classList.remove('show');
      }

      // objective line with distance to the marker
      const obj = missionObjective(game);
      let text = obj.text;
      if (obj.marker) {
        const a = playerAnchor(game);
        const d = Math.round(Math.sqrt((a.x - obj.marker.x) ** 2 + (a.z - obj.marker.z) ** 2));
        text += ` · ${d}m`;
      }
      els.objective.textContent = text;

      // speedometer while driving
      if (game.player.car) {
        els.speedo.classList.add('show');
        els.speedo.textContent = `${Math.round(Math.abs(game.player.car.speed) * 3.6)} km/h`;
      } else {
        els.speedo.classList.remove('show');
      }

      // centre prompt, set fresh each frame by whichever system needs it
      if (this.promptText) {
        els.prompt.textContent = this.promptText;
        els.prompt.classList.add('show');
      } else {
        els.prompt.classList.remove('show');
      }
      this.promptText = null;

      if (this.toastUntil && game.time > this.toastUntil) {
        els.toast.classList.remove('show');
        this.toastUntil = 0;
      }

      // dialogue: advance on E, click, or after a few seconds
      if (game.dialogActive) {
        this.dialogTimer -= dt;
        if (pressed.has('KeyE') || mouse.clicked || this.dialogTimer <= 0) this.nextDialogLine();
      }

      this.drawMinimap();
    },

    drawMinimap() {
      const ctx = mapCtx;
      const S = els.minimap.width;
      const C = S / 2;
      const RANGE = 105; // metres shown from centre to edge
      const px = (wx, wz) => {
        const a = playerAnchor(game);
        return [C + ((wx - a.x) / RANGE) * C, C + ((wz - a.z) / RANGE) * C];
      };
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, C - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#20262c';
      ctx.fillRect(0, 0, S, S);
      // water on the east edge
      const [wx] = px(CITY.beachX, 0);
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(wx, 0, S - wx, S);
      // roads
      ctx.strokeStyle = '#4a5058';
      ctx.lineWidth = Math.max(2, (16 / RANGE) * C * 0.5);
      for (const c of CITY.lines) {
        const [x1, y1] = px(c, -CITY.half - 20);
        const [x2, y2] = px(c, CITY.half + 20);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const [x3, y3] = px(-CITY.half - 20, c);
        const [x4, y4] = px(CITY.half + 20, c);
        ctx.beginPath();
        ctx.moveTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.stroke();
      }
      const blip = (x, z, color, size = 3) => {
        const [bx, by] = px(x, z);
        if (bx < -6 || by < -6 || bx > S + 6 || by > S + 6) return;
        ctx.fillStyle = color;
        ctx.fillRect(bx - size / 2, by - size / 2, size, size);
      };
      for (const ped of game.peds) if (ped.state !== 'down') blip(ped.pos.x, ped.pos.z, 'rgba(230,230,230,0.5)', 2);
      for (const car of game.cars) {
        if (car.mode === 'traffic') blip(car.pos.x, car.pos.z, 'rgba(160,160,160,0.55)', 3);
      }
      for (const car of game.police.cars) blip(car.pos.x, car.pos.z, Math.floor(game.time * 3) % 2 ? '#ff5252' : '#5b8cff', 5);
      const obj = missionObjective(game);
      if (obj.marker) {
        const [mx, my] = px(obj.marker.x, obj.marker.z);
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath();
        ctx.arc(Math.max(6, Math.min(S - 6, mx)), Math.max(6, Math.min(S - 6, my)), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // the player arrow, rotated to facing
      const facing = game.player.car ? game.player.car.angle : game.player.facing;
      ctx.translate(C, C);
      ctx.rotate(-facing);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(-4.6, -5);
      ctx.lineTo(4.6, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // rim
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(C, C, C - 2, 0, Math.PI * 2);
      ctx.stroke();
    },
  };

  return hud;
}
