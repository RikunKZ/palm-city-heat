// Palm City Heat — the game itself: scene, state, the loop, the camera,
// crime and consequence, getting in and out of cars, and the screens
// (start, pause, busted, wasted) that wrap the open world.
import * as THREE from 'three';
import { PLACES, WANTED, CRIMES } from './config.js';
import { makeRng, clamp, angleDelta } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave, clearSave, defaultSave } from './save.js';
import { buildWorld } from './world.js';
import { seedTraffic, separateCars } from './vehicles.js';
import { seedPeds, Ped } from './pedestrians.js';
import { createPlayer, placePlayer, updatePlayerOnFoot, hurtPlayer } from './player.js';
import { addHeat, updatePolice, clearPolice, playerAnchor } from './police.js';
import {
  createMissions,
  updateMissions,
  currentTarget,
  currentStep,
  nearbyGiver,
  talkToGiver,
  advanceDialog,
  failMission,
} from './missions.js';
import { createHud } from './hud.js';

const CRIME_LABELS = {
  carTheft: 'Grand theft auto',
  punchPed: 'Assault',
  hitPedWithCar: 'Hit and run',
  hitCar: 'Collision',
  hitBuilding: 'Reckless driving',
  punchCar: 'Vandalism',
};

function init() {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0xbfd9e8, 130, 430);
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
  sun.position.set(90, 150, 50);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7a5a, 0.85));

  const rng = makeRng(20261119);
  const world = buildWorld(scene, rng);
  const input = createInput();
  input.attach(canvas);
  const audio = createAudio();

  const game = {
    scene,
    camera,
    renderer,
    rng,
    input,
    audio,
    colliders: world.colliders,
    state: 'menu', // 'menu' | 'playing' | 'paused' | 'busted' | 'wasted'
    time: 0,
    cars: [],
    peds: [],
    pickups: [],
    police: { cars: [], officers: [], spawnTimer: 0 },
    player: createPlayer(scene),
    heat: 0,
    stars: 0,
    bustedMeter: 0,
    nearestPolice: Infinity,
    cash: 0,
    respect: 0,
    save: defaultSave(),
    dialog: null,
    dialogActive: false,
    lastCrime: null,
    crimeTimes: {},
    camYaw: -Math.PI / 2,
    camPitch: 0.34,
    endTimer: 0,
    toast: () => {},
  };
  game.missions = createMissions(game);
  const hud = createHud(game);
  game.hud = hud;
  game.toast = (text) => hud.toast(text);

  placePlayer(game.player, 230, 32, -Math.PI / 2);
  seedTraffic(game, 16, 10);
  seedPeds(game, 26);

  // ---------------------------------------------------------- game hooks

  game.saveProgress = () => {
    game.save.cash = game.cash;
    game.save.respect = game.respect;
    storeSave(game.save);
  };

  game.onCrime = (kind, x, z) => {
    game.lastCrime = { x, z, at: game.time };
    const throttled = kind === 'hitCar' || kind === 'hitBuilding' || kind === 'punchCar';
    if (throttled) {
      if (game.time - (game.crimeTimes[kind] || -9) < 1.1) return;
      game.crimeTimes[kind] = game.time;
    }
    const before = game.stars;
    addHeat(game, CRIMES[kind] || 5);
    if (game.stars > before) {
      hud.toast(`★ Wanted level ${game.stars} — ${CRIME_LABELS[kind] || 'Crime'}`);
      audio.alarm();
    }
  };

  game.spawnPickup = (x, z) => {
    if (game.pickups.length > 22) {
      const old = game.pickups.shift();
      scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.14, 14),
      new THREE.MeshBasicMaterial({ color: 0xffcf4d }),
    );
    mesh.rotation.x = Math.PI / 2.4;
    mesh.position.set(x, 0.65, z);
    scene.add(mesh);
    game.pickups.push({ mesh, x, z, value: 10 + Math.floor(rng() * 16) });
  };

  game.onBusted = () => {
    if (game.state !== 'playing') return;
    const fine = Math.min(game.cash, WANTED.fineBase + game.stars * WANTED.finePerStar);
    game.cash -= fine;
    game.saveProgress();
    if (game.player.car) exitCar(game, true);
    if (game.missions.active && game.missions.active.id === 'cooldown') {
      failMission(game, 'Busted — the detective sends his regards.');
    }
    clearPolice(game);
    game.heat = 0;
    game.stars = 0;
    showEndCard(game, 'BUSTED', fine > 0 ? `The fine is $${fine}. You walk out of Palm City Police.` : 'You walk out of Palm City Police.');
    game.state = 'busted';
    game.endTimer = 2.4;
    audio.jingle(false);
  };

  game.onWasted = () => {
    if (game.state !== 'playing') return;
    const fee = Math.min(game.cash, WANTED.hospitalFee);
    game.cash -= fee;
    game.saveProgress();
    if (game.player.car) exitCar(game, true);
    clearPolice(game);
    game.heat = 0;
    game.stars = 0;
    showEndCard(game, 'WASTED', `Coral Bay Hospital patches you up for $${fee}.`);
    game.state = 'wasted';
    game.endTimer = 2.4;
    audio.jingle(false);
  };

  // ---------------------------------------------------------- cars

  function nearestEnterableCar(game) {
    let best = null;
    let bestD = 3.6 * 3.6;
    for (const car of game.cars) {
      if (car.dead) continue;
      const d = (car.pos.x - game.player.pos.x) ** 2 + (car.pos.z - game.player.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(game, car) {
    const wasTraffic = car.role === 'traffic';
    if (wasTraffic) {
      // The driver is thrown out and runs for it.
      const driver = new Ped(game.scene, game.rng);
      driver.place(car.pos.x + 2, car.pos.z + 1);
      driver.scareFrom(game.player.pos.x, game.player.pos.z, 4);
      game.peds.push(driver);
    }
    if (car !== game.missions.sunsetCar) game.onCrime('carTheft', car.pos.x, car.pos.z);
    car.role = 'player';
    car.speed = 0;
    game.player.car = car;
    game.player.mesh.visible = false;
    game.camYaw = car.angle;
    audio.door();
  }

  function exitCar(game, silent = false) {
    const car = game.player.car;
    if (!car) return;
    car.role = 'parked';
    game.player.car = null;
    const sideX = Math.cos(car.angle);
    const sideZ = -Math.sin(car.angle);
    placePlayer(game.player, car.pos.x + sideX * 2.3, car.pos.z + sideZ * 2.3, car.angle);
    game.player.mesh.visible = true;
    if (!silent) audio.door();
  }
  game.exitCar = exitCar;

  function updateDriving(game, dt) {
    const car = game.player.car;
    const input = game.input;
    const throttle = input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0;
    const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) + (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0);
    const handbrake = input.isDown('Space');
    car.driveFree(dt, throttle, steer, handbrake, 34);
    game.player.pos.copy(car.pos);
  }

  /** Cars meeting people, and the player meeting consequences. */
  function carPeopleContact(game) {
    for (const car of game.cars) {
      if (Math.abs(car.speed) < 3.2) continue;
      for (const ped of game.peds) {
        if (ped.state === 'down') continue;
        const d2 = (ped.pos.x - car.pos.x) ** 2 + (ped.pos.z - car.pos.z) ** 2;
        if (d2 < 1.8 * 1.8) {
          ped.knockDown(game);
          audio.thud(0.8);
          if (car === game.player.car) game.onCrime('hitPedWithCar', ped.pos.x, ped.pos.z);
          car.speed *= 0.72;
        }
      }
      if (!game.player.car && game.state === 'playing') {
        const d2 = (game.player.pos.x - car.pos.x) ** 2 + (game.player.pos.z - car.pos.z) ** 2;
        if (d2 < 1.8 * 1.8) {
          hurtPlayer(game, car.role === 'police' ? 9 : 6);
          const dx = game.player.pos.x - car.pos.x;
          const dz = game.player.pos.z - car.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          game.player.pos.x += (dx / d) * 2.2;
          game.player.pos.z += (dz / d) * 2.2;
          audio.thud(1);
          car.speed *= 0.7;
        }
      }
    }
  }

  function buildingContact(game) {
    const car = game.player.car;
    if (!car || Math.abs(car.speed) < 7 || car.hitCooldown > 0) return;
    for (const c of game.colliders) {
      const nx = clamp(car.pos.x, c.x1, c.x2);
      const nz = clamp(car.pos.z, c.z1, c.z2);
      if ((car.pos.x - nx) ** 2 + (car.pos.z - nz) ** 2 < 1.75 * 1.75) {
        car.hitCooldown = 0.8;
        car.damage(4);
        car.speed *= 0.5;
        audio.thud(0.9);
        game.onCrime('hitBuilding', car.pos.x, car.pos.z);
        return;
      }
    }
  }

  // ---------------------------------------------------------- screens

  const menuEl = document.getElementById('menu');
  const pauseEl = document.getElementById('pauseMenu');
  const endEl = document.getElementById('endCard');
  const continueBtn = document.getElementById('btnContinue');

  function showEndCard(game, title, sub) {
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endSub').textContent = sub;
    endEl.classList.add('show');
  }

  function refreshContinue() {
    continueBtn.disabled = !loadSave();
  }
  refreshContinue();

  function startRun(game, fresh) {
    if (fresh) {
      clearSave();
      game.save = defaultSave();
    } else {
      game.save = loadSave() || defaultSave();
    }
    game.cash = game.save.cash;
    game.respect = game.save.respect;
    clearPolice(game);
    game.heat = 0;
    game.stars = 0;
    game.bustedMeter = 0;
    game.missions.active = null;
    game.missions.job = null;
    if (game.missions.sunsetCar) {
      game.missions.sunsetCar.dispose(scene);
      game.cars.splice(game.cars.indexOf(game.missions.sunsetCar), 1);
      game.missions.sunsetCar = null;
    }
    if (game.player.car) exitCar(game, true);
    game.player.health = 100;
    placePlayer(game.player, 230, 32, -Math.PI / 2);
    game.player.mesh.visible = true;
    game.camYaw = -Math.PI / 2;
    game.state = 'playing';
    menuEl.classList.remove('show');
    pauseEl.classList.remove('show');
    endEl.classList.remove('show');
    audio.unlock();
  }

  document.getElementById('btnNew').addEventListener('click', () => startRun(game, true));
  continueBtn.addEventListener('click', () => startRun(game, false));
  document.getElementById('btnResume').addEventListener('click', () => {
    game.state = 'playing';
    pauseEl.classList.remove('show');
    audio.unlock();
  });
  document.getElementById('btnQuitToMenu').addEventListener('click', () => {
    game.state = 'menu';
    pauseEl.classList.remove('show');
    menuEl.classList.add('show');
    refreshContinue();
  });
  menuEl.classList.add('show');

  canvas.addEventListener('mousedown', () => {
    audio.unlock();
    if (game.state === 'playing' && !game.dialogActive) input.lockPointer(canvas);
  });

  // ---------------------------------------------------------- the loop

  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const input = game.input;

    if (game.state === 'playing') {
      game.time += dt;

      // Interactions first: dialogue eats the E key and the click.
      if (game.dialogActive) {
        if (input.wasPressed('KeyE') || input.clicked) advanceDialog(game);
      } else if (input.wasPressed('KeyE')) {
        if (game.player.car) exitCar(game);
        else {
          const giver = nearbyGiver(game);
          if (giver) talkToGiver(game, giver.key);
          else {
            const car = nearestEnterableCar(game);
            if (car) enterCar(game, car);
          }
        }
      }
      if (input.wasPressed('KeyP')) {
        game.state = 'paused';
        pauseEl.classList.add('show');
      }

      if (game.player.car) updateDriving(game, dt);
      else updatePlayerOnFoot(game, dt);

      for (const car of game.cars) if (car.role === 'traffic') car.updateTraffic(game, dt);
      updatePolice(game, dt);
      separateCars(game, (a, b, impact) => {
        audio.thud(clamp(impact / 12, 0.3, 1));
        if (a === game.player.car || b === game.player.car) {
          game.onCrime('hitCar', game.player.car.pos.x, game.player.car.pos.z);
          if (impact > 9) hurtPlayer(game, impact * 0.45);
        }
      });
      buildingContact(game);
      carPeopleContact(game);
      for (const ped of game.peds) ped.update(game, dt);
      updateMissions(game, dt);

      // Cash pickups spin and wait to be walked or driven over.
      const anchor = playerAnchor(game);
      for (let i = game.pickups.length - 1; i >= 0; i--) {
        const pk = game.pickups[i];
        pk.mesh.rotation.z = game.time * 2.4;
        if ((pk.x - anchor.x) ** 2 + (pk.z - anchor.z) ** 2 < 2.1 * 2.1) {
          game.cash += pk.value;
          audio.coin();
          hud.toast(`+$${pk.value}`);
          scene.remove(pk.mesh);
          game.pickups.splice(i, 1);
        }
      }

      if (game.player.health <= 0) game.onWasted();

      // Objective line and context prompt.
      const target = currentTarget(game);
      if (target) {
        const dist = Math.round(Math.hypot(target.x - anchor.x, target.z - anchor.z));
        hud.setObjective(`${target.label} · ${dist}m`);
      } else {
        const step = currentStep(game);
        hud.setObjective(step ? `${step.label} — heat ${Math.round(game.heat)}` : '');
      }
      if (game.dialogActive) hud.setPrompt(null);
      else if (game.player.car) hud.setPrompt('E — exit · Space — handbrake');
      else {
        const giver = nearbyGiver(game);
        if (giver) hud.setPrompt(`E — Talk to ${giver.giver.name}`);
        else if (nearestEnterableCar(game)) hud.setPrompt('E — Steal this car');
        else hud.setPrompt(null);
      }

      updateCamera(game, dt);
      audio.update(dt, { inCar: !!game.player.car, speed: game.player.car ? game.player.car.speed : 0 }, game.nearestPolice);
    } else if (game.state === 'busted' || game.state === 'wasted') {
      game.endTimer -= dt;
      if (game.endTimer <= 0) {
        endEl.classList.remove('show');
        const place = game.state === 'busted' ? PLACES.police : PLACES.hospital;
        placePlayer(game.player, place.x + 11, place.z + 12, Math.PI / 2);
        game.player.mesh.visible = true;
        game.player.health = game.state === 'wasted' ? 100 : Math.max(game.player.health, 55);
        game.camYaw = Math.PI / 2;
        game.state = 'playing';
      }
      updateCamera(game, dt);
    } else if (game.state === 'menu') {
      // A slow cinematic drift over the bay while the menu is up.
      const t = performance.now() / 26000;
      camera.position.set(Math.sin(t) * 150, 46, Math.cos(t) * 150);
      camera.lookAt(20, 4, 0);
    }
    // 'paused' simply renders the frozen frame.

    hud.update();
    renderer.render(scene, camera);
    input.endFrame();
  }

  function updateCamera(game, dt) {
    const input = game.input;
    if (input.mouseDX) game.camYaw -= input.mouseDX * 0.0031;
    if (input.mouseDY) game.camPitch = clamp(game.camPitch + input.mouseDY * 0.0024, -0.12, 1.05);
    if (input.isDown('ArrowLeft') && !game.player.car) game.camYaw += dt * 1.9;
    if (input.isDown('ArrowRight') && !game.player.car) game.camYaw -= dt * 1.9;
    const anchor = playerAnchor(game);
    if (game.player.car) {
      // The camera settles behind a moving car unless the player is looking around.
      if (Math.abs(game.player.car.speed) > 3 && !input.mouseDX) {
        game.camYaw += angleDelta(game.camYaw, game.player.car.angle) * Math.min(1, dt * 2.2);
      }
    }
    const dist = game.player.car ? 9.6 : 6.9;
    const cosP = Math.cos(game.camPitch);
    const tx = anchor.x - Math.sin(game.camYaw) * cosP * dist;
    const tz = anchor.z - Math.cos(game.camYaw) * cosP * dist;
    const ty = anchor.y + 1.7 + Math.sin(game.camPitch) * dist;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 7);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 7);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 7);
    camera.lookAt(anchor.x, anchor.y + 1.8, anchor.z);
  }

  window.__pch = game;
  frame();
}

init();
