// The heads-up display: objective, cash, respect, stars, health, speed,
// prompts, toasts, the dialogue box, the busted meter — and the circular
// minimap, redrawn every frame with roads, water, police and the target.
import { ROAD_LINES, ROAD_HALF, SAND_X, SEA_X } from './config.js';
import { currentTarget } from './missions.js';

export function createHud(game) {
  const el = (id) => document.getElementById(id);
  const objectiveEl = el('objective');
  const cashEl = el('cash');
  const respectEl = el('respect');
  const starsEl = el('stars');
  const healthFill = el('healthFill');
  const speedoEl = el('speedo');
  const promptEl = el('prompt');
  const toastWrap = el('toasts');
  const dialogEl = el('dialog');
  const dialogWho = el('dialogWho');
  const dialogText = el('dialogText');
  const bustedWrap = el('bustedWrap');
  const bustedFill = el('bustedFill');
  const timerEl = el('timer');
  const mapCanvas = el('minimap');
  const mctx = mapCanvas.getContext('2d');

  let lastObjective = '';
  let lastPrompt = '';

  function toast(text) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    toastWrap.appendChild(div);
    setTimeout(() => div.classList.add('show'), 20);
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, 3600);
    while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
  }

  function setObjective(text) {
    if (text !== lastObjective) {
      objectiveEl.textContent = text;
      lastObjective = text;
    }
  }

  function setPrompt(text) {
    if (text === lastPrompt) return;
    lastPrompt = text;
    if (text) {
      promptEl.textContent = text;
      promptEl.classList.add('show');
    } else {
      promptEl.classList.remove('show');
    }
  }

  function drawMinimap() {
    const S = mapCanvas.width;
    const C = S / 2;
    const K = S / 580; // world units to pixels, ±290 fits the circle
    const px = (x) => C + x * K;
    const pz = (z) => C + z * K;
    mctx.clearRect(0, 0, S, S);
    mctx.save();
    mctx.beginPath();
    mctx.arc(C, C, C - 2, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = '#232a30';
    mctx.fillRect(0, 0, S, S);
    // Sand and sea down the east edge.
    mctx.fillStyle = '#c9ae76';
    mctx.fillRect(px(SAND_X), 0, px(SEA_X) - px(SAND_X), S);
    mctx.fillStyle = '#2f7fb4';
    mctx.fillRect(px(SEA_X), 0, S - px(SEA_X), S);
    // Roads.
    mctx.fillStyle = '#4a5058';
    for (const line of ROAD_LINES) {
      mctx.fillRect(px(line - ROAD_HALF), 0, ROAD_HALF * 2 * K, S);
      mctx.fillRect(0, pz(line - ROAD_HALF), S, ROAD_HALF * 2 * K);
    }
    // The mission target, clamped to the rim when it is far away.
    const target = currentTarget(game);
    if (target) {
      let tx = px(target.x);
      let tz = pz(target.z);
      const dx = tx - C;
      const dz = tz - C;
      const d = Math.hypot(dx, dz);
      const maxR = C - 9;
      if (d > maxR) {
        tx = C + (dx / d) * maxR;
        tz = C + (dz / d) * maxR;
      }
      mctx.fillStyle = '#ffcf4d';
      mctx.beginPath();
      mctx.arc(tx, tz, 4.4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police blips, strobing red and blue.
    const flash = Math.sin(game.time * 9) > 0;
    for (const car of game.police.cars) {
      mctx.fillStyle = flash ? '#ff4038' : '#4d7dff';
      mctx.beginPath();
      mctx.arc(px(car.pos.x), pz(car.pos.z), 3.2, 0, Math.PI * 2);
      mctx.fill();
    }
    for (const o of game.police.officers) {
      mctx.fillStyle = flash ? '#ff4038' : '#4d7dff';
      mctx.fillRect(px(o.pos.x) - 2, pz(o.pos.z) - 2, 4, 4);
    }
    // The player: a white arrow turned to his facing.
    const p = game.player.car ? game.player.car.pos : game.player.pos;
    const facing = game.player.car ? game.player.car.angle : game.player.facing;
    mctx.translate(px(p.x), pz(p.z));
    mctx.rotate(Math.PI - facing);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4.4, 5);
    mctx.lineTo(-4.4, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
    // Rim.
    mctx.strokeStyle = 'rgba(255,255,255,0.35)';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(C, C, C - 2, 0, Math.PI * 2);
    mctx.stroke();
  }

  function update() {
    cashEl.textContent = `$${game.cash}`;
    respectEl.textContent = `Respect ${game.respect}`;
    starsEl.textContent = '★'.repeat(game.stars) + '☆'.repeat(5 - game.stars);
    starsEl.classList.toggle('lit', game.stars > 0);
    const hp = Math.max(0, Math.round(game.player.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp > 35 ? '#58c94d' : '#e0483e';
    if (game.player.car) {
      speedoEl.textContent = `${Math.round(Math.abs(game.player.car.speed) * 3.6)} km/h`;
      speedoEl.classList.add('show');
    } else {
      speedoEl.classList.remove('show');
    }
    if (game.bustedMeter > 0.02 && game.stars > 0) {
      bustedWrap.classList.add('show');
      bustedFill.style.width = `${Math.round(game.bustedMeter * 100)}%`;
    } else {
      bustedWrap.classList.remove('show');
    }
    const step = game.missions.active ? game.missions.active.steps[game.missions.stepIndex] : null;
    if (step && step.time && game.missions.timer > 0) {
      const t = Math.max(0, Math.ceil(game.missions.timer));
      timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      timerEl.classList.add('show');
    } else {
      timerEl.classList.remove('show');
    }
    // Dialogue box follows the conversation state.
    if (game.dialog) {
      const line = game.dialog.lines[game.dialog.index];
      dialogEl.classList.add('show');
      dialogWho.textContent = line.who.toUpperCase();
      dialogText.textContent = line.text;
    } else {
      dialogEl.classList.remove('show');
    }
    drawMinimap();
  }

  return { toast, setObjective, setPrompt, update };
}
