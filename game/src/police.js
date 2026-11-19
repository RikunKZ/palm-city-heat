// Palm City Heat — the wanted system and Palm City PD. Crimes feed a heat
// score; heat maps to 1–5 stars; the city fields patrol cars to match the
// stars. Patrol cars pursue and ram, officers get out and chase on foot
// when they are close, and standing cornered fills the busted meter.

import * as THREE from 'three';
import { STAR_THRESHOLDS, PATROL_CARS, HEAT_MAX, PLACES } from './config.js';
import { Car, randomRoadPose } from './vehicles.js';
import { buildFigure, animateFigure } from './pedestrians.js';
import { resolveCollisions } from './world.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (heat >= t) stars++;
  return stars;
}

class Officer {
  constructor(scene, car) {
    this.fig = buildFigure({ shirt: 0x22335e, pants: 0x1a2332, skin: 0xe0ac69, hat: 0x22335e });
    this.fig.position.copy(car.pos);
    this.car = car;
    this.phase = 0;
    this.hitCooldown = 0;
    scene.add(this.fig);
  }
  get pos() { return this.fig.position; }
  remove(scene) { scene.remove(this.fig); }
}

export class Police {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { onBusted(), onPlayerDamage(n) }
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.busted = 0;      // 0..1
    this.seenTimer = 99;  // seconds since a unit last had eyes on the player
  }

  get stars() { return starsForHeat(this.heat); }

  addHeat(n) {
    this.heat = Math.min(HEAT_MAX, this.heat + n);
  }

  clearHeat() {
    this.heat = 0;
    this.busted = 0;
  }

  nearestUnitDistance(p) {
    let d = Infinity;
    for (const c of this.cars) d = Math.min(d, c.pos.distanceTo(p));
    for (const o of this.officers) d = Math.min(d, o.pos.distanceTo(p));
    return d;
  }

  spawnCar(playerPos) {
    // A road pose 120–190 m from the player: close enough to matter, never
    // right on top of them.
    for (let tries = 0; tries < 12; tries++) {
      const pose = randomRoadPose();
      const d = Math.hypot(pose.x - playerPos.x, pose.z - playerPos.z);
      if (d > 110 && d < 200) {
        const car = new Car(this.scene, { kind: 'police', x: pose.x, z: pose.z, heading: pose.heading, mode: 'police' });
        this.cars.push(car);
        return;
      }
    }
  }

  update(dt, ctx) {
    const { playerPos, playerSpeed, driving, colliders } = ctx;
    const stars = this.stars;

    // Eyes on the player?
    const nearest = this.nearestUnitDistance(playerPos);
    if (nearest < 65) this.seenTimer = 0; else this.seenTimer += dt;
    // Heat cools slowly under pursuit, faster once you break contact.
    const coolRate = this.seenTimer > 6 ? 3.4 : 0.55;
    if (stars > 0) this.heat = Math.max(0, this.heat - coolRate * dt);

    // Field the right number of patrol cars.
    const want = PATROL_CARS[stars];
    while (this.cars.length < want) this.spawnCar(playerPos);
    if (this.cars.length > want) {
      const far = this.cars.findIndex((c) => c.pos.distanceTo(playerPos) > 200);
      if (far >= 0) {
        const [gone] = this.cars.splice(far, 1);
        this.scene.remove(gone.mesh);
        this.officers = this.officers.filter((o) => o.car !== gone);
      }
    }
    // At zero stars the incident is over: officers climb back in and any
    // patrol car the player walks away from leaves the field.
    if (stars === 0) {
      for (const o of this.officers) o.remove(this.scene);
      this.officers = [];
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const car = this.cars[i];
        car.driveToward(0, dt);
        if (car.pos.distanceTo(playerPos) > 55) {
          this.scene.remove(car.mesh);
          this.cars.splice(i, 1);
        }
      }
      this.busted = Math.max(0, this.busted - dt);
      return;
    }

    // Drive the patrol cars at the player (or at their car): road routing
    // while far away, direct pursuit once close.
    for (const car of this.cars) {
      const hasOfficerOut = this.officers.some((o) => o.car === car);
      const distToPlayer = car.pos.distanceTo(playerPos);
      if (hasOfficerOut && distToPlayer < 26) {
        car.driveToward(0, dt); // parked up while the officer works
      } else if (distToPlayer > 45) {
        car.updatePatrol(dt, playerPos.x, playerPos.z, ctx.allCars ?? []);
      } else {
        car.updatePursuit(dt, playerPos.x, playerPos.z, colliders);
      }
      car.updateSmoke(dt, this.scene);
      // An officer steps out when the car is close and the player is slow.
      const close = car.pos.distanceTo(playerPos) < 15;
      if (close && !hasOfficerOut && (!driving || playerSpeed < 3.5)) {
        this.officers.push(new Officer(this.scene, car));
      }
    }

    // Officers chase on foot; cornering the player fills the busted meter.
    let cornered = false;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      const d = o.pos.distanceTo(playerPos);
      if (d > 42) { // the player escaped: the officer climbs back in
        o.remove(this.scene);
        this.officers.splice(i, 1);
        continue;
      }
      const want = Math.atan2(playerPos.x - o.pos.x, playerPos.z - o.pos.z);
      let nx = o.pos.x + Math.sin(want) * 5.7 * dt;
      let nz = o.pos.z + Math.cos(want) * 5.7 * dt;
      [nx, nz] = resolveCollisions(colliders, nx, nz, 0.4);
      o.pos.x = nx; o.pos.z = nz;
      o.fig.rotation.y = want;
      o.phase += dt * 13;
      animateFigure(o.fig, o.phase);
      o.hitCooldown = Math.max(0, o.hitCooldown - dt);
      if (d < 1.25 && o.hitCooldown <= 0) {
        o.hitCooldown = 0.9;
        this.hooks.onPlayerDamage(6);
      }
      if (d < 2.7 && playerSpeed < 2.6) cornered = true;
    }
    if (cornered) {
      this.busted = Math.min(1, this.busted + dt / 2.1);
      if (this.busted >= 1) {
        this.busted = 0;
        this.hooks.onBusted();
      }
    } else {
      this.busted = Math.max(0, this.busted - dt * 0.7);
    }
  }

  /** After a bust: clear the field so the player restarts clean. */
  reset() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const o of this.officers) o.remove(this.scene);
    this.cars = [];
    this.officers = [];
    this.clearHeat();
  }

  stationPos() { return PLACES.police; }
}
