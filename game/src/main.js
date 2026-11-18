// main.js — Palm City Heat's bootstrap and heartbeat. Builds the scene and
// every system, owns the top-level game state (menu, playing, paused,
// busted, wasted), the heat/star bookkeeping, cash pickups, the camera, and
// the frame loop that updates the world in a fixed order.

import * as THREE from 'three';
import { CITY, PALETTE, WANTED } from './config.js';
import { makeRng } from './random.js';
import { initInput, endFrameInput, lockPointer, unlockPointer, pressed } from './input.js';
import { GameAudio } from './audio.js';
import { buildWorld, PLACES } from './world.js';
import { spawnParked, spawnTraffic, separateCars, updateTrafficCar, wreckCar } from './vehicles.js';
import { spawnPeds } from './pedestrians.js';
import { createPlayer, exitCar, playerAnchor, updatePlayer } from './player.js';
import { createPolice, starsForHeat, updatePolice } from './police.js';
import { createMissions, updateMissions } from './missions.js';
import { createHud } from './hud.js';
import { clearSave, loadSave, writeSave } from './save.js';

const canvasHost = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 190, 640);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(190, 42, 130);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const game = {
  scene,
  camera,
  renderer,
  rng: makeRng(987654321),
  audio: new GameAudio(),
  time: 0,
  state: 'menu',
  cars: [],
  peds: [],
  pickups: [],
  cash: 250,
  respect: 0,
  heat: 0,
  stars: 0,
  bustedMeter: 0,
  seenByPolice: false,
  threat: null,
  dialogActive: false,
  camYaw: 2.6,
  camPitch: 0.32,
  shake: 0,
  saveTimer: 0,
  suppressPause: false,
};

game.world = buildWorld(scene);
game.player = createPlayer(game);
game.police = createPolice();
game.missions = createMissions(scene);
game.hud = createHud(game);
spawnTraffic(game, 15);
spawnParked(game, 16);
spawnPeds(game, 26);
initInput(renderer.domElement);

game.addHeat = (points, label) => {
  if (game.state !== 'playing') return;
  const before = game.stars;
  game.heat += points;
  game.stars = starsForHeat(game.heat);
  if (game.stars > before) game.hud.toast(`★ Wanted level ${game.stars} — ${label}`);
};

game.onPedDown = (ped) => {
  if (game.rng() < 0.45) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.14, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }),
    );
    coin.position.set(ped.pos.x, 0.5, ped.pos.z);
    coin.rotation.x = Math.PI / 2.4;
    scene.add(coin);
    game.pickups.push({ mesh: coin, amount: 10 + Math.floor(game.rng() * 30), spin: game.rng() * 6 });
  }
};

game.exitCarKeep = () => exitCar(game);
game.saveSoon = () => writeSave(game);

// ---------- state changes ----------

function setState(state) {
  game.state = state;
  document.getElementById('startScreen').classList.toggle('show', state === 'menu');
  document.getElementById('pauseMenu').classList.toggle('show', state === 'paused');
  document.getElementById('hud').classList.toggle('show', state === 'playing' || state === 'paused');
}

function startPlaying(fromSave) {
  game.audio.ensure();
  if (fromSave) {
    const s = loadSave();
    if (s) {
      game.cash = s.cash ?? game.cash;
      game.respect = s.respect ?? 0;
      game.missions.index = s.missionIndex ?? 0;
      game.missions.storyDone = !!s.storyDone;
      if (typeof s.x === 'number') game.player.group.position.set(s.x, 0, s.z);
    }
  }
  setState('playing');
  lockPointer(renderer.domElement);
}

function pauseGame() {
  if (game.state !== 'playing') return;
  writeSave(game);
  game.suppressPause = true;
  unlockPointer();
  setState('paused');
}

function resumeGame() {
  setState('playing');
  lockPointer(renderer.domElement);
}

function endRun(kind) {
  // kind: 'busted' | 'wasted' — a fine, a fee, and a trip across town
  game.audio.engine(null);
  game.audio.siren(null, 0);
  if (kind === 'busted') {
    game.audio.bustedJingle();
    const fine = Math.round(game.cash * 0.15);
    game.cash -= fine;
    document.getElementById('endTitle').textContent = 'BUSTED';
    document.getElementById('endText').textContent = `The PCPD takes $${fine} in fines. You walk out of the station on foot.`;
  } else {
    const fee = Math.round(game.cash * 0.1);
    game.cash -= fee;
    document.getElementById('endTitle').textContent = 'WASTED';
    document.getElementById('endText').textContent = `Palma General patches you up for $${fee}. The city is still out there.`;
  }
  game.heat = 0;
  game.stars = 0;
  game.bustedMeter = 0;
  game.suppressPause = true;
  unlockPointer();
  setState(kind);
  document.getElementById('endScreen').classList.add('show');
  writeSave(game);
}
game.onBusted = () => {
  if (game.state === 'playing') endRun('busted');
};

function respawn() {
  document.getElementById('endScreen').classList.remove('show');
  // clear the response and put the player at the relevant front door
  for (const car of [...game.police.cars]) {
    game.scene.remove(car.mesh);
    game.cars.splice(game.cars.indexOf(car), 1);
  }
  game.police.cars = [];
  for (const officer of game.police.officers) game.scene.remove(officer.group);
  game.police.officers = [];
  if (game.player.car) exitCar(game);
  const door = game.state === 'busted' ? PLACES.police : PLACES.hospital;
  game.player.health = 100;
  game.player.group.position.set(door.x - 16, 0, door.z);
  game.player.group.visible = true;
  setState('playing');
  lockPointer(renderer.domElement);
}

// ---------- menu wiring ----------

const save = loadSave();
document.getElementById('btnContinue').style.display = save ? '' : 'none';
document.getElementById('btnNew').addEventListener('click', () => {
  clearSave();
  game.cash = 250;
  game.respect = 0;
  game.missions.index = 0;
  game.missions.storyDone = false;
  game.player.group.position.set(232, 0, 30);
  startPlaying(false);
});
document.getElementById('btnContinue').addEventListener('click', () => startPlaying(true));
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnRestart').addEventListener('click', () => {
  clearSave();
  location.reload();
});
document.getElementById('btnRespawn').addEventListener('click', respawn);
renderer.domElement.addEventListener('click', () => {
  game.audio.ensure();
  if (game.state === 'playing') lockPointer(renderer.domElement);
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.state === 'playing' && !game.suppressPause) pauseGame();
  game.suppressPause = false;
});

// ---------- camera ----------

function updateCamera(dt) {
  if (game.state === 'menu') {
    const t = performance.now() * 0.00004;
    camera.position.set(150 + Math.cos(t) * 120, 46, 60 + Math.sin(t) * 120);
    camera.lookAt(60, 4, 0);
    return;
  }
  const anchor = playerAnchor(game);
  const driving = !!game.player.car;
  if (driving) {
    // the camera settles behind the car; the mouse can still look around
    const targetYaw = game.player.car.angle;
    let diff = targetYaw - game.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.camYaw += diff * Math.min(1, dt * 2.4);
    game.camPitch += (0.26 - game.camPitch) * Math.min(1, dt * 2);
  }
  const dist = driving ? 10.5 : 6.8;
  const fx = Math.sin(game.camYaw);
  const fz = Math.cos(game.camYaw);
  const height = 1.7 + Math.sin(game.camPitch) * dist;
  const back = Math.cos(game.camPitch) * dist;
  const shakeAmp = game.shake;
  game.shake = Math.max(0, game.shake - dt * 2.2);
  camera.position.set(
    anchor.x - fx * back + (Math.random() - 0.5) * shakeAmp,
    height + (Math.random() - 0.5) * shakeAmp * 0.5,
    anchor.z - fz * back + (Math.random() - 0.5) * shakeAmp,
  );
  camera.lookAt(anchor.x, 1.6, anchor.z);
}

// mouse look is read here so input.js stays a dumb state bucket
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === renderer.domElement && game.state === 'playing') {
    game.camYaw -= (event.movementX || 0) * 0.0026;
    game.camPitch = Math.max(-0.12, Math.min(1.05, game.camPitch + (event.movementY || 0) * 0.0022));
  }
});

// ---------- the frame ----------

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.state === 'playing') {
    game.time += dt;

    if (pressed.has('KeyP') || pressed.has('Escape')) {
      pauseGame();
    } else {
      // a proximity prompt first; missions may override it below
      if (!game.player.car && !game.dialogActive) {
        const p = game.player.group.position;
        for (const car of game.cars) {
          if (car.dead) continue;
          const d = Math.sqrt((car.pos.x - p.x) ** 2 + (car.pos.z - p.z) ** 2);
          if (d < 3.4) {
            game.hud.setPrompt('Press E to enter car');
            break;
          }
        }
      } else if (game.player.car) {
        game.hud.setPrompt('E — exit · Space — handbrake');
      }

      updatePlayer(game, dt);
      for (const car of game.cars) updateTrafficCar(game, dt);
      const impact = separateCars(game, dt);
      if (impact > 8) {
        game.audio.crash(Math.min(1, impact / 16));
        game.shake = Math.min(0.7, impact / 22);
        if (game.player.car) game.addHeat(6, 'Collision');
      }
      for (const car of game.cars) {
        if (car.health <= 0 && !car.dead && car.mode !== 'police') wreckCar(car);
      }
      for (const ped of game.peds) ped.update(game, dt);
      updatePolice(game, dt);
      updateMissions(game, dt);

      // heat cools while nobody in uniform can see the player
      if (!game.seenByPolice && game.heat > 0) {
        game.heat = Math.max(0, game.heat - WANTED.coolRate * dt);
        game.stars = starsForHeat(game.heat);
      }

      // pickups spin and wait to be pocketed
      const anchor = playerAnchor(game);
      for (let i = game.pickups.length - 1; i >= 0; i--) {
        const pickup = game.pickups[i];
        pickup.mesh.rotation.z += dt * 2.4;
        pickup.mesh.position.y = 0.5 + Math.sin(game.time * 3 + pickup.spin) * 0.12;
        const d = Math.sqrt((pickup.mesh.position.x - anchor.x) ** 2 + (pickup.mesh.position.z - anchor.z) ** 2);
        if (d < 1.9) {
          game.cash += pickup.amount;
          game.audio.cash();
          game.hud.toast(`+$${pickup.amount}`);
          scene.remove(pickup.mesh);
          game.pickups.splice(i, 1);
        }
      }

      if (game.player.health <= 0) endRun('wasted');

      game.saveTimer += dt;
      if (game.saveTimer > 8) {
        game.saveTimer = 0;
        writeSave(game);
      }
    }
  }

  const anchor = playerAnchor(game);
  game.world.followTarget = anchor;
  game.world.update(dt, game.time);
  if (game.state === 'playing' || game.state === 'paused') game.hud.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  endFrameInput();
}

setState('menu');
frame();

// a handle for automated play-tests and curious players in the console
window.__pch = game;
