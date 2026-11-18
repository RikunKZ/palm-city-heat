// The law in Palm City: a heat score behind the five stars, patrol cars
// that hunt and ram, officers who pile out and chase on foot, and the
// busted meter that fills while they have you cornered and slow.
import { WANTED } from './config.js';
import { clamp, angleDelta } from './random.js';
import { Car } from './vehicles.js';
import { makeHumanoid, animateWalk } from './pedestrians.js';
import { randomRoadPoint, resolveCollisions } from './world.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 1; i <= 5; i++) if (heat >= WANTED.starHeat[i]) stars = i;
  return stars;
}

export function addHeat(game, amount) {
  game.heat = clamp(game.heat + amount, 0, 520);
  game.stars = starsForHeat(game.heat);
}

export function playerAnchor(game) {
  return game.player.car ? game.player.car.pos : game.player.pos;
}

export function playerSpeed(game) {
  return game.player.car ? Math.abs(game.player.car.speed) : game.player.speedNow;
}

function spawnPoliceCar(game) {
  const anchor = playerAnchor(game);
  const p = randomRoadPoint(game.rng, anchor.x, anchor.z, 55);
  const dx = anchor.x - p.x;
  const dz = anchor.z - p.z;
  if (dx * dx + dz * dz > 150 * 150) return false;
  const car = new Car(game.scene, 0xf0f0ee, 'police');
  car.role = 'police';
  car.place(p.x, p.z, Math.atan2(dx, dz));
  car.officer = null;
  car.giveUpTimer = 0;
  game.cars.push(car);
  game.police.cars.push(car);
  return true;
}

function removePoliceCar(game, car) {
  car.dispose(game.scene);
  game.cars.splice(game.cars.indexOf(car), 1);
  game.police.cars.splice(game.police.cars.indexOf(car), 1);
  if (car.officer) removeOfficer(game, car.officer);
}

function spawnOfficer(game, car) {
  const h = makeHumanoid({ skin: 0xc68863, shirt: 0x22355e, pants: 0x1a2338 });
  game.scene.add(h.group);
  const officer = {
    h,
    mesh: h.group,
    pos: h.group.position,
    car,
    phase: Math.random() * 6,
    facing: car.angle,
  };
  officer.pos.set(car.pos.x + 1.8, 0, car.pos.z);
  car.officer = officer;
  game.police.officers.push(officer);
  return officer;
}

function removeOfficer(game, officer) {
  game.scene.remove(officer.mesh);
  const i = game.police.officers.indexOf(officer);
  if (i >= 0) game.police.officers.splice(i, 1);
  if (officer.car && officer.car.officer === officer) officer.car.officer = null;
}

function updateOfficer(game, dt, officer) {
  const anchor = playerAnchor(game);
  const dx = anchor.x - officer.pos.x;
  const dz = anchor.z - officer.pos.z;
  const d = Math.hypot(dx, dz);
  const pSpeed = playerSpeed(game);
  // A player who drives off fast is gone: the officer gives up and fades.
  if (game.player.car && pSpeed > 9 && d > 24) {
    removeOfficer(game, officer);
    return;
  }
  if (d > 85) {
    removeOfficer(game, officer);
    return;
  }
  if (d > 1.5) {
    const speed = 5.7;
    officer.pos.x += (dx / d) * speed * dt;
    officer.pos.z += (dz / d) * speed * dt;
    officer.facing = Math.atan2(dx, dz);
    officer.mesh.rotation.y = officer.facing;
    officer.phase += speed * dt * 2.1;
    animateWalk(officer.h, officer.phase, 1.2);
  }
  resolveCollisions(officer.pos, 0.45, game.colliders);
}

export function clearPolice(game) {
  for (const car of [...game.police.cars]) removePoliceCar(game, car);
  for (const officer of [...game.police.officers]) removeOfficer(game, officer);
  game.police.spawnTimer = 0;
  game.bustedMeter = 0;
}

export function updatePolice(game, dt) {
  const police = game.police;
  const anchor = playerAnchor(game);
  const wanted = WANTED.patrolCars[game.stars] || 0;

  // Reinforcements roll in while the stars demand them.
  if (police.cars.length < wanted) {
    police.spawnTimer -= dt;
    if (police.spawnTimer <= 0) {
      police.spawnTimer = 1.5;
      spawnPoliceCar(game);
    }
  }

  let nearest = Infinity;
  let seen = false;

  for (const car of [...police.cars]) {
    const dx = anchor.x - car.pos.x;
    const dz = anchor.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    if (d < 46) seen = true;
    if (d > 210) {
      removePoliceCar(game, car);
      continue;
    }
    if (game.stars === 0) {
      // The heat is gone: they break off and leave the streets.
      car.giveUpTimer += dt;
      car.driveFree(dt, 0.5, clamp(angleDelta(car.angle, Math.atan2(-dx, -dz)) * 1.4, -1, 1), false, 13);
      if (d > 55 || car.giveUpTimer > 6) removePoliceCar(game, car);
      continue;
    }
    const desired = Math.atan2(dx, dz);
    const diff = angleDelta(car.angle, desired);
    let throttle = Math.abs(diff) > 2.2 ? -0.7 : 1;
    if (d < 5.5) throttle = 0.35;
    const topSpeed = 23.5 + game.stars * 1.7;
    car.driveFree(dt, throttle, clamp(diff * 1.7, -1, 1), false, topSpeed);

    // Close and slow with the player on foot: an officer piles out.
    if (!car.officer && !game.player.car && d < 10 && Math.abs(car.speed) < 5) {
      spawnOfficer(game, car);
    }
  }

  for (const officer of [...police.officers]) {
    const d = Math.hypot(anchor.x - officer.pos.x, anchor.z - officer.pos.z);
    nearest = Math.min(nearest, d);
    if (d < 32) seen = true;
    updateOfficer(game, dt, officer);
  }
  game.nearestPolice = nearest;

  // Out of sight, the heat bleeds away.
  if (!seen && game.heat > 0) {
    game.heat = Math.max(0, game.heat - WANTED.coolRate * dt);
    game.stars = starsForHeat(game.heat);
    if (game.stars === 0) game.bustedMeter = Math.max(0, game.bustedMeter - dt * 0.5);
  }

  // Cornered and slow with the law at arm's reach: the meter fills.
  const cornered =
    game.stars > 0 &&
    playerSpeed(game) < 2.6 &&
    (nearestCarDist(game, anchor) < 7.5 || officerDist(game, anchor) < 2.4);
  if (cornered && game.state === 'playing') {
    game.bustedMeter = Math.min(1, game.bustedMeter + dt / 1.7);
    if (game.bustedMeter >= 1) game.onBusted();
  } else {
    game.bustedMeter = Math.max(0, game.bustedMeter - dt / 1.15);
  }
}

function nearestCarDist(game, anchor) {
  let best = Infinity;
  for (const car of game.police.cars) {
    best = Math.min(best, Math.hypot(anchor.x - car.pos.x, anchor.z - car.pos.z));
  }
  return best;
}

function officerDist(game, anchor) {
  let best = Infinity;
  for (const o of game.police.officers) {
    best = Math.min(best, Math.hypot(anchor.x - o.pos.x, anchor.z - o.pos.z));
  }
  return best;
}
