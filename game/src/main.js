// Palm City Heat — the game itself: scene, camera, the city and its people,
// crimes and consequences, car entry/exit, busted/wasted flow, saving, and
// the debug handle the headless play-test drives (window.__pch).

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Car, randomRoadPose, randomParkedPose } from './vehicles.js';
import { Pedestrian } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundKit } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { CRIME_HEAT, PLACES } from './config.js';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
const world = buildWorld(scene);
const input = new Input(canvas);
const hud = new Hud();
const sound = new SoundKit();

const game = {
  state: 'menu', // menu | playing | paused
  cash: 0,
  respect: 0,
  health: 100,
  damageCooldown: 0,
  crimeCooldown: 0,
  lastHarmTimer: 99,
  saveTimer: 0,
  camYaw: Math.PI / 4,
  camPitch: 0.34,
  mouseIdle: 0,
  driving: null,
  lastCrime: null,
  pickups: [],
  time: 0,
};

const player = new Player(scene);
const police = new Police(scene, {
  onBusted: () => game.onBusted(),
  onPlayerDamage: (n) => game.harmPlayer(n),
});
const missions = new Missions(scene, {
  toast: (m) => hud.toast(m),
  reward: (cash, respect) => {
    game.cash += cash;
    game.respect += respect;
    hud.toast(`+$${cash} · +${respect} respect`);
    sound.cash();
    game.saveNow();
  },
  addHeat: (n) => police.addHeat(n),
  spawnMissionCar: (x, z, heading) => {
    const car = new Car(scene, { kind: 'sport', color: 0xff7b1c, x, z, heading, mode: 'parked' });
    game.cars.push(car);
    return car;
  },
  jingle: (win) => sound.jingle(win),
  blip: () => sound.blip(),
});

// Traffic and parked cars.
game.cars = [];
for (let i = 0; i < 15; i++) {
  const p = randomRoadPose();
  game.cars.push(new Car(scene, { kind: ['sedan', 'hatch', 'van', 'sport'][i % 4], ...p, mode: 'traffic' }));
}
for (let i = 0; i < 11; i++) {
  const p = randomParkedPose();
  game.cars.push(new Car(scene, { kind: ['sedan', 'hatch', 'sport'][i % 3], ...p, mode: 'parked' }));
}

// Pedestrians.
game.peds = [];
for (let i = 0; i < 26; i++) game.peds.push(new Pedestrian(scene));

// ---------- crimes, harm, consequences ----------

game.commitCrime = (type, x, z) => {
  police.addHeat(CRIME_HEAT[type] ?? 5);
  game.lastCrime = { x, z, t: game.time };
};

game.harmPlayer = (n) => {
  if (game.state !== 'playing') return;
  game.health -= n;
  game.lastHarmTimer = 0;
  if (game.health <= 0) game.onWasted();
};

game.onBusted = () => {
  const fine = Math.min(game.cash, 50 + police.stars * 25);
  game.cash -= fine;
  sound.bustedSound();
  hud.banner('BUSTED', `The Palm City PD relieve you of $${fine}. You are released at the station.`);
  police.reset();
  missions.onPlayerDown();
  player.teleport(PLACES.police.x, PLACES.police.z + 16);
  game.driving = null;
  player.fig.visible = true;
  game.health = Math.max(60, game.health);
  game.saveNow();
};

game.onWasted = () => {
  const fee = Math.min(game.cash, 40);
  game.cash -= fee;
  hud.banner('WASTED', `You wake up at St. Coral Hospital. Bill: $${fee}.`);
  sound.jingle(false);
  missions.onPlayerDown();
  police.heat *= 0.35;
  player.teleport(PLACES.hospital.x, PLACES.hospital.z + 16);
  if (game.driving) {
    game.driving.mode = 'parked';
    game.driving = null;
  }
  player.fig.visible = true;
  game.health = 100;
  game.saveNow();
};

game.saveNow = () => {
  storeSave({ cash: game.cash, respect: game.respect, story: missions.story, x: player.pos.x, z: player.pos.z });
};

// ---------- car entry / exit ----------

game.nearestCar = (maxDist) => {
  let best = null, bestD = maxDist;
  for (const car of [...game.cars, ...police.cars]) {
    if (car.kind === 'police') continue;
    const d = car.pos.distanceTo(player.pos);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
};

game.enterCar = (car) => {
  game.driving = car;
  player.fig.visible = false;
  if (car.mode === 'traffic') {
    game.commitCrime('theft', car.pos.x, car.pos.z);
    // The driver bails out and runs.
    const ped = new Pedestrian(scene);
    ped.fig.position.set(car.pos.x + 2, 0, car.pos.z + 1);
    ped.state = 'flee';
    game.peds.push(ped);
    hud.toast('Car stolen!');
  }
  car.mode = 'driven';
  sound.unlock();
};

game.exitCar = () => {
  const car = game.driving;
  if (!car) return;
  const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  player.teleport(car.pos.x + side.x * 2.4, car.pos.z + side.z * 2.4);
  player.heading = car.heading;
  car.mode = 'parked';
  car.speed = 0;
  game.driving = null;
  player.fig.visible = true;
};

// ---------- flow ----------

game.startNew = () => {
  clearSave();
  game.cash = 0;
  game.respect = 0;
  game.health = 100;
  missions.story = 0;
  missions.active = null;
  police.reset();
  player.teleport(-240, -180);
  game.beginPlay();
};

game.startContinue = () => {
  const save = loadSave();
  if (!save) return game.startNew();
  game.cash = save.cash;
  game.respect = save.respect;
  game.health = 100;
  missions.story = save.story;
  missions.active = null;
  police.reset();
  player.teleport(save.x || -240, save.z || -180);
  game.beginPlay();
};

game.beginPlay = () => {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  hud.show();
  game.state = 'playing';
  sound.unlock();
};

game.pause = () => {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  document.getElementById('pause').classList.remove('hidden');
};

game.resume = () => {
  document.getElementById('pause').classList.add('hidden');
  game.state = 'playing';
};

game.quitToMenu = () => {
  game.saveNow();
  document.getElementById('pause').classList.add('hidden');
  hud.hide();
  game.state = 'menu';
  const menu = document.getElementById('menu');
  menu.classList.remove('hidden');
  document.getElementById('btn-continue').disabled = !loadSave();
};

document.getElementById('btn-new').addEventListener('click', () => game.startNew());
document.getElementById('btn-continue').addEventListener('click', () => game.startContinue());
document.getElementById('btn-resume').addEventListener('click', () => game.resume());
document.getElementById('btn-quit').addEventListener('click', () => game.quitToMenu());
document.getElementById('btn-continue').disabled = !loadSave();

// ---------- per-frame ----------

const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  game.time += dt;
  world.update(game.time);

  if (game.state === 'playing') step(dt);

  // Camera follows whoever we are: the walker or the driven car.
  const focus = game.driving ? game.driving.pos : player.pos;
  const { dx, dy } = input.takeMouse();
  if (dx || dy) {
    game.camYaw -= dx * 0.0031;
    game.camPitch = Math.max(0.06, Math.min(1.05, game.camPitch + dy * 0.0026));
    game.mouseIdle = 0;
  } else {
    game.mouseIdle += dt;
  }
  if (game.driving && game.mouseIdle > 1.1) {
    let diff = game.driving.heading - game.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.camYaw += diff * Math.min(1, dt * 2.6);
  }
  const dist = game.driving ? 10.5 : 8.2;
  const back = {
    x: -Math.sin(game.camYaw) * Math.cos(game.camPitch),
    z: -Math.cos(game.camYaw) * Math.cos(game.camPitch),
  };
  camera.position.set(
    focus.x + back.x * dist,
    focus.y + 1.7 + Math.sin(game.camPitch) * dist,
    focus.z + back.z * dist,
  );
  camTarget.set(focus.x, focus.y + 1.5, focus.z);
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
  input.endFrame();
}

function step(dt) {
  game.crimeCooldown = Math.max(0, game.crimeCooldown - dt);
  game.damageCooldown = Math.max(0, game.damageCooldown - dt);
  game.lastHarmTimer += dt;
  if (game.lastHarmTimer > 5 && game.health < 100) game.health = Math.min(100, game.health + dt * 1.1);

  const dialogueOpen = !!missions.dialogue;
  const clicked = input.takeClick();

  // Dialogue consumes E and clicks.
  if (dialogueOpen && (input.wasPressed('KeyE') || clicked)) missions.advanceDialogue();

  // Pause.
  if (input.wasPressed('KeyP')) return game.pause();

  // --- the player, on foot or driving ---
  let playerSpeed = 0;
  if (game.driving) {
    const car = game.driving;
    const driveInput = {
      throttle: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0),
      steer: (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0),
      brake: input.down('Space'),
    };
    const impact = car.updateDriven(dt, driveInput, world.colliders);
    playerSpeed = Math.abs(car.speed);
    if (impact > 7) {
      car.addDamage(impact / 55);
      sound.thud(Math.min(2, impact / 9));
      if (impact > 12 && game.crimeCooldown <= 0) {
        game.commitCrime('hitCar', car.pos.x, car.pos.z);
        game.crimeCooldown = 1.2;
      }
      if (impact > 17) game.harmPlayer(5);
    }
    if (input.wasPressed('KeyE') && Math.abs(car.speed) < 4.5) game.exitCar();
  } else if (!dialogueOpen) {
    player.update(dt, input, game.camYaw, world.colliders);
    playerSpeed = player.speed;
    // Punch.
    if (input.wasPressed('KeyF') || clicked) {
      if (player.punch()) {
        sound.punch();
        const f = { x: Math.sin(player.heading), z: Math.cos(player.heading) };
        for (const ped of game.peds) {
          const d = ped.pos.distanceTo(player.pos);
          const ahead = (ped.pos.x - player.pos.x) * f.x + (ped.pos.z - player.pos.z) * f.z;
          if (d < 1.9 && ahead > 0.2 && ped.state !== 'down') {
            ped.knockDown((x, z) => game.dropCash(x, z));
            game.commitCrime('punchPed', player.pos.x, player.pos.z);
            hud.toast('Assault! The city saw that.');
          }
        }
      }
    }
    // Interact: talk first, then cars.
    if (input.wasPressed('KeyE')) {
      if (!missions.tryTalk(player.pos)) {
        const car = game.nearestCar(3.6);
        if (car) game.enterCar(car);
      }
    }
  }

  // --- traffic ---
  for (const car of game.cars) {
    if (car === game.driving) continue;
    if (car.mode === 'traffic') car.updateTraffic(dt, game.cars);
    else if (car.mode === 'wrecked') {
      car.stopTimer -= dt;
      car.driveToward(0, dt);
      if (car.stopTimer <= 0) car.mode = 'traffic';
    }
    car.updateSmoke(dt, scene);
  }

  // Car vs car and car vs pedestrian for the driven car.
  if (game.driving) game.drivenCarContacts(dt);

  // --- pedestrians ---
  const fastCar = game.driving && Math.abs(game.driving.speed) > 6
    ? { x: game.driving.pos.x, z: game.driving.pos.z, r: 12 }
    : null;
  const crime = game.lastCrime && game.time - game.lastCrime.t < 3.5
    ? { x: game.lastCrime.x, z: game.lastCrime.z, r: 17 }
    : null;
  for (const ped of game.peds) ped.update(dt, world.colliders, fastCar ?? crime);

  // --- police & missions ---
  const focusPos = game.driving ? game.driving.pos : player.pos;
  police.update(dt, {
    playerPos: focusPos,
    playerSpeed,
    driving: !!game.driving,
    colliders: world.colliders,
    allCars: game.cars,
  });
  missions.update(dt, { playerPos: focusPos, drivingCar: game.driving, police });
  if (!missions.active && !missions.dialogue && missions.story >= 5) missions.startDelivery();

  // --- cash pickups ---
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const p = game.pickups[i];
    p.mesh.rotation.y += dt * 2.4;
    p.mesh.position.y = 0.6 + Math.sin(game.time * 3 + i) * 0.12;
    if (Math.hypot(p.x - focusPos.x, p.z - focusPos.z) < 2) {
      game.cash += 25;
      sound.cash();
      hud.toast('+$25');
      scene.remove(p.mesh);
      game.pickups.splice(i, 1);
    }
  }

  // --- audio & HUD ---
  const nearestCop = police.cars.length ? Math.min(...police.cars.map((c) => c.pos.distanceTo(focusPos))) : 999;
  sound.update(game.driving ? Math.abs(game.driving.speed) * 3.6 : 0, THREE.MathUtils.clamp(1 - nearestCop / 75, 0, 1), game.time);

  let prompt = null;
  if (!dialogueOpen) {
    if (game.driving) {
      if (Math.abs(game.driving.speed) < 4.5) prompt = '<b>E</b> Exit car';
    } else if (missions.giverForStory() && missions.story < 5 && !missions.active) {
      const g = missions.givers[missions.giverForStory()];
      if (player.pos.distanceTo(g.fig.position) < 3.4) prompt = '<b>E</b> Talk';
    }
    if (!prompt && !game.driving && game.nearestCar(3.6)) prompt = '<b>E</b> Enter car';
  }
  hud.update({
    objective: missions.objective(),
    cash: game.cash,
    respect: game.respect,
    stars: police.stars,
    health: game.health,
    driving: !!game.driving,
    speedKmh: game.driving ? game.driving.speed * 3.6 : 0,
    busted: police.busted,
    dialogue: missions.dialogueLine,
    prompt,
    playerPos: focusPos,
    facing: game.driving ? game.driving.heading : player.heading,
    policePts: [...police.cars.map((c) => c.pos), ...police.officers.map((o) => o.pos)],
  });

  // Periodic save.
  game.saveTimer += dt;
  if (game.saveTimer > 6) {
    game.saveTimer = 0;
    game.saveNow();
  }
}

game.drivenCarContacts = (dt) => {
  const car = game.driving;
  const speed = Math.abs(car.speed);
  // Other cars.
  for (const other of [...game.cars, ...police.cars]) {
    if (other === car) continue;
    const d = other.pos.distanceTo(car.pos);
    if (d < 3.1) {
      const push = {
        x: (other.pos.x - car.pos.x) / (d || 1),
        z: (other.pos.z - car.pos.z) / (d || 1),
      };
      if (other.kind !== 'police') {
        other.pos.x += push.x * (3.1 - d) * 0.6;
        other.pos.z += push.z * (3.1 - d) * 0.6;
      }
      if (speed > 5) {
        other.addDamage(speed / 70);
        car.addDamage(speed / 90);
        sound.thud(Math.min(2, speed / 8));
        if (other.mode === 'traffic') { other.mode = 'wrecked'; other.stopTimer = 4; other.speed = 0; }
        if (game.crimeCooldown <= 0) {
          game.commitCrime(other.kind === 'police' ? 'hitCar' : 'hitCar', car.pos.x, car.pos.z);
          game.crimeCooldown = 1.2;
        }
        car.speed *= 0.55;
      }
    }
  }
  // Pedestrians.
  if (speed > 3) {
    for (const ped of game.peds) {
      if (ped.state !== 'down' && ped.pos.distanceTo(car.pos) < 2.3) {
        ped.knockDown((x, z) => game.dropCash(x, z));
        sound.thud(1.2);
        game.commitCrime('hitPed', car.pos.x, car.pos.z);
        car.speed *= 0.8;
      }
    }
  }
};

game.dropCash = (x, z) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.1, 0.3),
    new THREE.MeshBasicMaterial({ color: 0x69d97b }),
  );
  mesh.position.set(x, 0.6, z);
  scene.add(mesh);
  game.pickups.push({ mesh, x, z });
};

// Debug handle for the headless play-test.
window.__pch = {
  game, player, police, missions, hud, scene, renderer, camera,
  cars: game.cars, peds: game.peds,
  startNew: () => game.startNew(),
  startContinue: () => game.startContinue(),
  teleport: (x, z) => player.teleport(x, z),
  setHeat: (n) => { police.heat = n; },
  enterNearestCar: () => {
    const car = game.nearestCar(6);
    if (car) game.enterCar(car);
    return !!car;
  },
  state: () => ({
    state: game.state,
    cash: game.cash,
    respect: game.respect,
    health: game.health,
    stars: police.stars,
    heat: Math.round(police.heat),
    driving: !!game.driving,
    story: missions.story,
    active: missions.active ? missions.active.id : null,
    dialogue: !!missions.dialogue,
    player: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
    policeCars: police.cars.length,
    objective: missions.objective().text,
  }),
};

frame();
