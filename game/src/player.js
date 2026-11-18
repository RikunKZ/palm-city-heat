// player.js — Reno, the player character: walking, sprinting, jumping and
// punching on foot; entering, stealing and driving cars; and the arcade
// driving physics (accelerate, steer, handbrake drift, building collisions).

import { CAR, PLAYER } from './config.js';
import { keys, pressed, mouse } from './input.js';
import { clamp } from './random.js';
import { collideCircle } from './world.js';
import { animateWalk, makeHumanoid, resetPose } from './pedestrians.js';
import { wreckCar } from './vehicles.js';

export function createPlayer(game) {
  const group = makeHumanoid(game.rng, { shirt: 0x1f8a8a, pants: 0x2e3a4a, skin: 0xd9a066 });
  group.position.set(232, 0, 30);
  game.scene.add(group);
  return {
    group,
    car: null,
    health: PLAYER.maxHealth,
    vy: 0,
    grounded: true,
    phase: 0,
    punchCd: 0,
    facing: 0,
  };
}

function nearestCar(game, maxDist) {
  const p = game.player.group.position;
  let best = null;
  let bestDist = maxDist;
  for (const car of game.cars) {
    if (car.dead) continue;
    const dx = car.pos.x - p.x;
    const dz = car.pos.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(game, car) {
  const player = game.player;
  if (!car.stolen) {
    car.stolen = true;
    game.addHeat(car.mode === 'traffic' ? 30 : 16, 'Grand theft auto');
    game.threat = { x: car.pos.x, z: car.pos.z, time: game.time };
  }
  car.mode = 'player';
  car.route = null;
  player.car = car;
  player.group.visible = false;
  game.audio.door();
}

export function exitCar(game) {
  const player = game.player;
  const car = player.car;
  if (!car) return;
  const right = car.right();
  player.group.position.set(car.pos.x + right.x * 2.2, 0, car.pos.z + right.z * 2.2);
  collideCircle(game.world, player.group.position, PLAYER.radius);
  player.group.visible = true;
  player.facing = car.angle;
  if (!car.dead) car.mode = 'parked';
  car.speed = 0;
  player.car = null;
  game.audio.door();
  game.audio.engine(null);
}

function doPunch(game) {
  const player = game.player;
  player.punchCd = PLAYER.punchCooldown;
  const p = player.group.position;
  const fx = Math.sin(player.facing);
  const fz = Math.cos(player.facing);
  game.audio.punch();
  game.threat = { x: p.x, z: p.z, time: game.time };
  // a pedestrian in front goes down and the city notices
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.pos.x - p.x;
    const dz = ped.pos.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < PLAYER.punchRange && dx * fx + dz * fz > 0.2) {
      ped.knockDown(game);
      game.addHeat(14, 'Assault');
      return;
    }
  }
  // punching a car dents it and angers everyone nearby
  const car = nearestCar(game, PLAYER.punchRange + 1.2);
  if (car) {
    car.health -= 6;
    game.audio.crash(0.4);
    game.addHeat(8, 'Vandalism');
    if (car.health <= 0) wreckCar(car);
  }
}

function updateOnFoot(game, dt) {
  const player = game.player;
  const pos = player.group.position;
  const yaw = game.camYaw;

  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;

  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  let mx = 0;
  let mz = 0;
  if (ix !== 0 || iz !== 0) {
    const len = Math.sqrt(ix * ix + iz * iz);
    ix /= len;
    iz /= len;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    mx = (ix * cos + iz * sin) * speed;
    mz = (iz * cos - ix * sin) * speed;
    player.facing = Math.atan2(mx, mz);
  }
  pos.x += mx * dt;
  pos.z += mz * dt;
  collideCircle(game.world, pos, PLAYER.radius);

  // a small hop, because every open world deserves one
  if (pressed.has('Space') && player.grounded) {
    player.vy = 4.6;
    player.grounded = false;
  }
  if (!player.grounded) {
    player.vy -= 12 * dt;
    pos.y += player.vy * dt;
    if (pos.y <= 0) {
      pos.y = 0;
      player.vy = 0;
      player.grounded = true;
    }
  }

  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    player.phase += dt * speed * 2.6;
    animateWalk(player.group, player.phase, sprint ? 1.5 : 1);
    player.group.rotation.y = player.facing;
  } else {
    resetPose(player.group);
    player.group.rotation.y = player.facing;
  }

  player.punchCd -= dt;
  if ((mouse.clicked || pressed.has('KeyF')) && player.punchCd <= 0 && !game.dialogActive) {
    // swing the right arm as well as landing the hit
    player.group.userData.armR.rotation.x = -2.2;
    doPunch(game);
  }

  if (pressed.has('KeyE') && !game.dialogActive) {
    const car = nearestCar(game, 3.4);
    if (car) enterCar(game, car);
  }

  // slow health recovery keeps the roam forgiving
  player.health = Math.min(PLAYER.maxHealth, player.health + dt * 1.6);
}

function updateDriving(game, dt) {
  const player = game.player;
  const car = player.car;
  if (!car) return;
  const pos = car.pos;

  const throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  const brakeKey = keys.has('KeyS') || keys.has('ArrowDown');
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const handbrake = keys.has('Space');

  if (throttle) car.speed += CAR.accel * dt;
  if (brakeKey) {
    car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.7) * dt;
  }
  // drag and rolling resistance
  car.speed -= car.speed * CAR.drag * dt * (handbrake ? 0.4 : 1);
  if (!throttle && !brakeKey) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);

  const steerAuthority = clamp(Math.abs(car.speed) / 6, 0, 1) * Math.sign(car.speed);
  car.angle += steer * steerAuthority * (handbrake ? 1.5 : 1.05) * dt * 1.9;
  car.steerVis = steer;

  const fwd = car.forward();
  pos.x += fwd.x * car.speed * dt;
  pos.z += fwd.z * car.speed * dt;
  const beforeX = pos.x;
  const beforeZ = pos.z;
  collideCircle(game.world, pos, 1.5);
  if ((pos.x !== beforeX || pos.z !== beforeZ) && Math.abs(car.speed) > 7) {
    // grinding a wall costs speed, paint and health
    car.health -= Math.abs(car.speed) * 0.55;
    game.audio.crash(0.5);
    car.speed *= 0.45;
    if (car.health <= 0 && !car.dead) {
      wreckCar(car);
      player.health -= 12;
      exitCar(game);
      return;
    }
  }

  // running someone down is the fastest way to earn stars
  if (Math.abs(car.speed) > 3) {
    game.threat = { x: pos.x, z: pos.z, time: game.time };
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - pos.x;
      const dz = ped.pos.z - pos.z;
      if (dx * dx + dz * dz < 3.4) {
        ped.knockDown(game);
        game.addHeat(30, 'Vehicular assault');
        game.audio.crash(0.7);
        car.speed *= 0.82;
      }
    }
  }

  player.group.position.copy(pos); // the player anchor rides with the car
  game.audio.engine(Math.abs(car.speed) / CAR.maxSpeed);
  car.syncMesh(dt);

  if (pressed.has('KeyE')) exitCar(game);
}

export function updatePlayer(game, dt) {
  if (game.player.car) updateDriving(game, dt);
  else updateOnFoot(game, dt);
}

// where the camera and minimap should consider "the player" to be
export function playerAnchor(game) {
  return game.player.car ? game.player.car.pos : game.player.group.position;
}
