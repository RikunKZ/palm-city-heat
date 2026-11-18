// Cars: one class for everything with four wheels in Palm City. Traffic
// cars follow the road grid keeping right and turning at junctions; parked
// cars wait at kerbs; police and the player drive free with arcade physics.
import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF } from './config.js';
import { randRange, pick, clamp, angleDelta } from './random.js';
import { resolveCollisions } from './world.js';

export const CAR_COLORS = [0xd84f35, 0x2e7fb8, 0xe0a51e, 0x3f9e8f, 0xb03a8c, 0xd8d8d8, 0x707880, 0x7a4fd0, 0x4f7a3a];

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4 });
const taillightMat = new THREE.MeshBasicMaterial({ color: 0xd8332e });

function buildCarMesh(colorHex, kind) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const sport = kind === 'sport';
  const bodyLen = sport ? 4.6 : 4.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, sport ? 0.48 : 0.58, bodyLen), paint);
  body.position.y = sport ? 0.5 : 0.56;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, sport ? 1.9 : 2.2), glassMat);
  cabin.position.set(0, sport ? 0.92 : 1.06, sport ? -0.3 : -0.15);
  g.add(cabin);
  if (sport) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.42), paint);
    spoiler.position.set(0, 0.92, -2.05);
    g.add(spoiler);
    for (const px of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.3), paint);
      post.position.set(px, 0.78, -2.05);
      g.add(post);
    }
  }
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.37, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headlightMat);
    hl.position.set(side * 0.62, 0.62, bodyLen / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), taillightMat);
    tl.position.set(side * 0.62, 0.66, -bodyLen / 2 - 0.02);
    g.add(tl);
  }
  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a22 }));
    red.position.x = -0.26;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.26;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.38, -0.15);
    lightBar.userData = { red, blue };
    g.add(lightBar);
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 1.6), doorMat);
      door.position.set(side * 0.96, 0.58, 0.1);
      g.add(door);
    }
  }
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0 }),
  );
  smoke.position.set(0, 1.15, bodyLen / 2 - 0.4);
  g.add(smoke);
  return { group: g, wheels, lightBar, smoke };
}

let nextCarId = 1;

export class Car {
  constructor(scene, colorHex, kind = 'sedan') {
    this.id = nextCarId++;
    this.kind = kind;
    const built = buildCarMesh(colorHex, kind);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.smoke = built.smoke;
    this.pos = this.mesh.position;
    this.angle = 0;
    this.speed = 0;
    this.health = 100;
    this.dead = false;
    this.role = 'parked'; // 'traffic' | 'parked' | 'police' | 'player'
    // Traffic route state (used when role is 'traffic').
    this.axis = 'z';
    this.line = 0;
    this.dir = 1;
    this.junction = 0;
    this.turning = false;
    this.cruise = randRange(Math.random, 9.5, 12.5);
    this.hitCooldown = 0;
    scene.add(this.mesh);
  }

  place(x, z, angle) {
    this.pos.set(x, 0, z);
    this.angle = angle;
    this.mesh.rotation.y = angle;
  }

  get forwardX() {
    return Math.sin(this.angle);
  }
  get forwardZ() {
    return Math.cos(this.angle);
  }

  /** Join the traffic flow on a road: axis 'x' or 'z', on the given road line. */
  setRoute(axis, line, dir) {
    this.axis = axis;
    this.line = line;
    this.dir = dir;
    this.role = 'traffic';
    if (axis === 'z') this.pos.x = line - dir * 3.4;
    else this.pos.z = line + dir * 3.4;
    this.junction = this.nextJunctionAhead();
    this.angle = this.headingAngle();
  }

  headingAngle() {
    if (this.axis === 'z') return this.dir > 0 ? 0 : Math.PI;
    return this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  laneCoordinate() {
    return this.axis === 'z' ? this.line - this.dir * 3.4 : this.line + this.dir * 3.4;
  }

  nextJunctionAhead() {
    const along = this.axis === 'z' ? this.pos.z : this.pos.x;
    const ahead = ROAD_LINES.filter((l) => (this.dir > 0 ? l > along + 1 : l < along - 1));
    if (ahead.length === 0) return this.dir > 0 ? 252 : -252;
    return this.dir > 0 ? Math.min(...ahead) : Math.max(...ahead);
  }

  /** Distance to the car or obstacle directly ahead, or Infinity. */
  gapAhead(game) {
    let best = Infinity;
    const fx = this.forwardX;
    const fz = this.forwardZ;
    for (const other of game.cars) {
      if (other === this || other.dead) continue;
      const dx = other.pos.x - this.pos.x;
      const dz = other.pos.z - this.pos.z;
      const forward = dx * fx + dz * fz;
      if (forward < 0.5 || forward > 10) continue;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (lateral < 2.1) best = Math.min(best, forward);
    }
    return best;
  }

  updateTraffic(game, dt) {
    if (this.dead) return;
    const gap = this.gapAhead(game);
    let target = this.cruise;
    const distJunction = Math.abs((this.axis === 'z' ? this.pos.z : this.pos.x) - this.junction);
    if (this.turning) target = Math.min(target, 6.5);
    if (gap < 4) target = 0;
    else if (gap < 8) target = Math.min(target, 5);
    const accel = target > this.speed ? 6 : 14;
    this.speed += clamp(target - this.speed, -accel * dt, accel * dt);

    const alongBefore = this.axis === 'z' ? this.pos.z : this.pos.x;
    this.pos.x += this.forwardX * this.speed * dt;
    this.pos.z += this.forwardZ * this.speed * dt;

    // Ease onto the lane line for the road we are on.
    const lane = this.laneCoordinate();
    if (this.axis === 'z') this.pos.x += (lane - this.pos.x) * Math.min(1, dt * 2.6);
    else this.pos.z += (lane - this.pos.z) * Math.min(1, dt * 2.6);

    // Crossed the junction? Pick what happens there.
    const alongAfter = this.axis === 'z' ? this.pos.z : this.pos.x;
    if ((this.dir > 0 && alongBefore < this.junction && alongAfter >= this.junction) ||
        (this.dir < 0 && alongBefore > this.junction && alongAfter <= this.junction)) {
      this.decideAtJunction(game);
    }
    if (Math.abs(this.pos.x) > 262 || Math.abs(this.pos.z) > 262) {
      // Fell off the edge of the grid somehow: turn around.
      this.dir = -this.dir;
      this.junction = this.nextJunctionAhead();
    }

    const targetAngle = this.headingAngle();
    this.angle += angleDelta(this.angle, targetAngle) * Math.min(1, dt * 4);
    this.syncMesh(dt);
  }

  decideAtJunction(game) {
    const rng = game.rng;
    const junctionLine = this.junction;
    const roll = rng();
    this.turning = roll >= 0.55;
    if (roll < 0.55) {
      this.junction = this.nextJunctionAhead();
      return;
    }
    // Turn: swap axis, adopt the junction as the new road line.
    const left = roll < 0.775;
    if (this.axis === 'z') {
      // Heading +z: left is +x. Heading -z: left is -x.
      this.dir = left ? this.dir : -this.dir;
      this.axis = 'x';
    } else {
      // Heading +x: left is -z. Heading -x: left is +z.
      this.dir = left ? -this.dir : this.dir;
      this.axis = 'z';
    }
    this.line = junctionLine;
    this.junction = this.nextJunctionAhead();
  }

  /** Free driving (player and police): throttle -1..1, steer -1..1. */
  driveFree(dt, throttle, steer, handbrake, topSpeed) {
    if (this.dead) {
      this.speed = 0;
      return;
    }
    if (throttle > 0) this.speed += 15 * throttle * dt;
    else if (throttle < 0) this.speed += (this.speed > 0.6 ? -26 : -9) * -throttle * dt;
    const drag = handbrake ? 2.6 : 0.55;
    this.speed -= this.speed * drag * dt;
    if (throttle === 0 && Math.abs(this.speed) < 0.25) this.speed = 0;
    this.speed = clamp(this.speed, -13, topSpeed);
    const steerAuthority = clamp(this.speed / 7, -1, 1);
    this.angle += steer * steerAuthority * (handbrake ? 2.2 : 1.55) * dt;
    this.pos.x += this.forwardX * this.speed * dt;
    this.pos.z += this.forwardZ * this.speed * dt;
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * dt * 2.4;
    for (const wheel of this.wheels) wheel.rotation.x += spin;
    if (this.lightBar) {
      const t = performance.now() / 280;
      const { red, blue } = this.lightBar.userData;
      red.material.color.setHex(Math.sin(t) > 0 ? 0xff2a22 : 0x661512);
      blue.material.color.setHex(Math.sin(t) > 0 ? 0x112a66 : 0x2255ff);
    }
    if (this.health < 45 && !this.dead) {
      this.smoke.material.opacity = 0.34 + Math.sin(performance.now() / 130) * 0.1;
      const s = 1 + (this.health < 22 ? 0.7 : 0.25);
      this.smoke.scale.setScalar(s);
    } else {
      this.smoke.material.opacity = 0;
    }
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.speed = 0;
      this.mesh.rotation.z = 0.06;
      this.smoke.material.opacity = 0.55;
      this.smoke.scale.setScalar(1.9);
    }
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

/** Keep every pair of cars out of each other; report solid hits to onHit. */
export function separateCars(game, onHit) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.1;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      if (a.role !== 'parked') {
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
      }
      if (b.role !== 'parked') {
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 4.5 && a.hitCooldown <= 0 && b.hitCooldown <= 0) {
        a.hitCooldown = 0.7;
        b.hitCooldown = 0.7;
        a.damage(impact * 0.9);
        b.damage(impact * 0.9);
        const avgSpeed = (a.speed + b.speed) / 2;
        a.speed = avgSpeed * 0.6;
        b.speed = avgSpeed * 0.6;
        onHit(a, b, impact);
      }
    }
  }
  for (const car of cars) resolveCollisions(car.pos, 1.7, game.colliders);
}

/** Fill the streets: moving traffic on random routes, parked cars at kerbs. */
export function seedTraffic(game, trafficCount, parkedCount) {
  const rng = game.rng;
  for (let i = 0; i < trafficCount; i++) {
    const car = new Car(game.scene, pick(rng, CAR_COLORS), rng() < 0.16 ? 'sport' : 'sedan');
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = randRange(rng, -235, 235);
    if (axis === 'z') car.place(line, along, 0);
    else car.place(along, line, 0);
    car.setRoute(axis, line, dir);
    car.speed = car.cruise * 0.7;
    game.cars.push(car);
  }
  for (let i = 0; i < parkedCount; i++) {
    const car = new Car(game.scene, pick(rng, CAR_COLORS), rng() < 0.12 ? 'sport' : 'sedan');
    const vertical = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const side = rng() < 0.5 ? -1 : 1;
    const along = randRange(rng, -238, 238);
    if (vertical) car.place(line + side * (ROAD_HALF - 1.6), along, side > 0 ? Math.PI : 0);
    else car.place(along, line + side * (ROAD_HALF - 1.6), side > 0 ? -Math.PI / 2 : Math.PI / 2);
    car.role = 'parked';
    game.cars.push(car);
  }
}
