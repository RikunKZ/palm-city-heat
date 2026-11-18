// police.js — the Palm City Police Department: the wanted system and its
// response. Heat points from crimes set the star level; the level sets how
// many units respond. Police cars pursue and ram, officers chase on foot,
// and standing still next to either fills the busted meter.

import { WANTED } from './config.js';
import { clamp, randRange } from './random.js';
import { collideCircle, randomRoadPoint } from './world.js';
import { Car, wreckCar } from './vehicles.js';
import { animateWalk, makeHumanoid } from './pedestrians.js';
import { playerAnchor } from './player.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.starThresholds.length; i++) {
    if (heat >= WANTED.starThresholds[i]) stars = i;
  }
  return stars;
}

export function createPolice() {
  return { cars: [], officers: [], spawnTimer: 0 };
}

function spawnPoliceCar(game) {
  const anchor = playerAnchor(game);
  let point = null;
  for (let tries = 0; tries < 20; tries++) {
    const p = randomRoadPoint(game.rng, anchor.x, anchor.z, 52);
    const d = Math.sqrt((p.x - anchor.x) ** 2 + (p.z - anchor.z) ** 2);
    if (d < 100) {
      point = p;
      break;
    }
  }
  if (!point) return;
  const car = new Car(game.scene, 0xf2f2f2, 'police');
  car.mode = 'police';
  const dx = anchor.x - point.x;
  const dz = anchor.z - point.z;
  car.place(point.x, point.z, Math.atan2(dx, dz));
  game.cars.push(car);
  game.police.cars.push(car);
}

function removePoliceCar(game, car) {
  game.scene.remove(car.mesh);
  game.cars.splice(game.cars.indexOf(car), 1);
  game.police.cars.splice(game.police.cars.indexOf(car), 1);
}

function spawnOfficer(game, nearCar) {
  const group = makeHumanoid(game.rng, { shirt: 0x1d2f6e, pants: 0x141c33, skin: undefined });
  group.position.set(nearCar.pos.x + randRange(game.rng, -2, 2), 0, nearCar.pos.z + randRange(game.rng, -2, 2));
  game.scene.add(group);
  game.police.officers.push({ group, phase: randRange(game.rng, 0, 6), car: nearCar });
}

function removeOfficer(game, officer) {
  game.scene.remove(officer.group);
  game.police.officers.splice(game.police.officers.indexOf(officer), 1);
}

// pursuit steering: aim at where the player will be in half a second
function updatePoliceCar(game, car, dt) {
  const anchor = playerAnchor(game);
  const pos = car.pos;
  const lead = game.player.car ? 0.45 : 0.15;
  const targetX = anchor.x + (game.player.car ? game.player.car.forward().x * game.player.car.speed * lead : 0);
  const targetZ = anchor.z + (game.player.car ? game.player.car.forward().z * game.player.car.speed * lead : 0);
  const dx = targetX - pos.x;
  const dz = targetZ - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += clamp(diff, -1.9 * dt, 1.9 * dt);
  car.steerVis = clamp(diff, -1, 1);

  const topSpeed = 26 + game.stars * 1.6;
  let targetSpeed = dist < 5 ? 0 : topSpeed;
  if (Math.abs(diff) > 1.1) targetSpeed = Math.min(targetSpeed, 8);
  car.speed += clamp(targetSpeed - car.speed, -22 * dt, 10 * dt);
  const fwd = car.forward();
  pos.x += fwd.x * car.speed * dt;
  pos.z += fwd.z * car.speed * dt;
  collideCircle(game.world, pos, 1.5);
  car.syncMesh(dt);

  // flash the light bar
  const bar = car.mesh.userData.lightBar;
  if (bar) {
    const phase = Math.floor(game.time * 3) % 2;
    bar.children[0].visible = phase === 0;
    bar.children[1].visible = phase === 1;
  }

  // an officer piles out when the car is close and slow
  if (
    dist < 13 &&
    Math.abs(car.speed) < 4 &&
    game.police.officers.length < game.stars + 1 &&
    !car.officerOut &&
    !game.player.car
  ) {
    car.officerOut = true;
    spawnOfficer(game, car);
  }
  if (dist > 30) car.officerOut = false;
}

function updateOfficer(game, officer, dt) {
  const anchor = playerAnchor(game);
  const pos = officer.group.position;
  const dx = anchor.x - pos.x;
  const dz = anchor.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 1.4) {
    const speed = 4.7;
    pos.x += (dx / dist) * speed * dt;
    pos.z += (dz / dist) * speed * dt;
    officer.group.rotation.y = Math.atan2(dx, dz);
    officer.phase += dt * speed * 3.2;
    animateWalk(officer.group, officer.phase, 1.5);
    collideCircle(game.world, pos, 0.4);
  }
  return dist;
}

export function updatePolice(game, dt) {
  const police = game.police;
  const anchor = playerAnchor(game);
  game.seenByPolice = false;
  let nearest = Infinity;

  // keep the response sized to the star level
  police.spawnTimer -= dt;
  const wanted = WANTED.policeByStars[game.stars] || 0;
  if (game.stars > 0 && police.cars.length < wanted && police.spawnTimer <= 0) {
    spawnPoliceCar(game);
    police.spawnTimer = 1.6;
  }
  for (let i = police.cars.length - 1; i >= 0; i--) {
    const car = police.cars[i];
    if (car.dead) {
      police.cars.splice(i, 1);
      continue;
    }
    const d = Math.sqrt((car.pos.x - anchor.x) ** 2 + (car.pos.z - anchor.z) ** 2);
    nearest = Math.min(nearest, d);
    if (d < WANTED.sightRange) game.seenByPolice = true;
    if ((game.stars === 0 && d > 40) || d > 190) {
      removePoliceCar(game, car);
      continue;
    }
    if (game.stars > 0) updatePoliceCar(game, car, dt);
    else {
      // no heat: units peel away and park up
      car.speed += clamp(0 - car.speed, -10 * dt, 10 * dt);
      car.syncMesh(dt);
    }
  }

  // officers work on foot; they give up when the heat dies or they fall behind
  let officerNear = false;
  for (let i = police.officers.length - 1; i >= 0; i--) {
    const officer = police.officers[i];
    const d = updateOfficer(game, officer, dt);
    if (d < WANTED.sightRange) game.seenByPolice = true;
    if (d < 2) officerNear = true;
    if (game.stars === 0 || d > 120) removeOfficer(game, officer);
  }

  // the busted meter: stand next to the law while wanted and it fills
  const carNear = game.player.car === null && nearest < 5.5;
  if (game.stars > 0 && (officerNear || carNear)) {
    game.bustedMeter = Math.min(1, game.bustedMeter + dt * 0.42);
  } else {
    game.bustedMeter = Math.max(0, game.bustedMeter - dt * 0.3);
  }
  if (game.bustedMeter >= 1) game.onBusted();

  // siren volume follows the nearest unit
  game.audio.siren(game.stars > 0 && nearest < 80 ? clamp(1 - nearest / 80, 0, 1) : null, dt);

  // wrecked police cars are removed from the response (and remembered)
  for (const car of [...police.cars]) {
    if (car.health <= 0 && !car.dead) {
      wreckCar(car);
      game.addHeat(24, 'Disabled a police car');
    }
  }
}
