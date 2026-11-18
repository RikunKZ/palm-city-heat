// vehicles.js — builds every car mesh and owns how cars move when nobody is
// driving them: traffic that follows the grid keeping right, slows for the
// car ahead and turns at intersections. The player-driven physics and the
// police pursuit live in player.js and police.js but move the same Car.

import * as THREE from 'three';
import { CITY, CAR } from './config.js';
import { clamp, lerpAngle, pick, randRange } from './random.js';
import { collideCircle } from './world.js';

const TRAFFIC_COLORS = [0xd8d8d8, 0x3f6fb5, 0xb53f3f, 0x3fae6a, 0xe0a83c, 0x707880, 0x22262b, 0x8a4fb5, 0xe8e8e8, 0x4fb5a8];

export function makeCarMesh(colorHex, kind = 'sedan') {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const sport = kind === 'sport';

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, sport ? 0.5 : 0.62, sport ? 4.5 : 4.2), paint);
  body.position.y = sport ? 0.5 : 0.58;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, sport ? 1.9 : 2.1), glass);
  cabin.position.set(0, sport ? 0.92 : 1.1, sport ? -0.2 : -0.1);
  group.add(cabin);
  if (sport) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), paint);
    wing.position.set(0, 0.95, -2.05);
    group.add(wing);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = {};
  const wheelAt = (name, x, z) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    group.add(w);
    wheels[name] = w;
  };
  wheelAt('fl', -0.95, 1.35);
  wheelAt('fr', 0.95, 1.35);
  wheelAt('rl', -0.95, -1.35);
  wheelAt('rr', 0.95, -1.35);

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd43a2e });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), headMat);
    h.position.set(sx, 0.62, 2.12);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.06), tailMat);
    t.position.set(sx, 0.66, -2.12);
    group.add(t);
  }

  let lightBar = null;
  if (kind === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.5), new THREE.MeshLambertMaterial({ color: 0x181c20 }));
    barBase.position.set(0, 1.42, -0.1);
    group.add(barBase);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.33;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    blue.position.x = 0.33;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.55, -0.1);
    group.add(lightBar);
  }
  group.userData = { wheels, lightBar, paint };
  return group;
}

let nextCarId = 1;

export class Car {
  constructor(scene, colorHex, kind = 'sedan') {
    this.id = nextCarId++;
    this.kind = kind;
    this.mesh = makeCarMesh(colorHex, kind);
    this.angle = 0;
    this.speed = 0;
    this.steerVis = 0;
    this.health = 100;
    this.mode = 'traffic'; // traffic | parked | player | police | dead
    this.route = null;
    this.dead = false;
    scene.add(this.mesh);
  }

  get pos() {
    return this.mesh.position;
  }

  forward() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  right() {
    return { x: -Math.cos(this.angle), z: Math.sin(this.angle) };
  }

  place(x, z, angle) {
    this.mesh.position.set(x, 0, z);
    this.angle = angle;
    this.syncMesh(0);
  }

  syncMesh(dt) {
    this.mesh.rotation.y = this.angle;
    const { wheels } = this.mesh.userData;
    if (dt > 0) {
      const spin = (this.speed * dt) / 0.36;
      for (const key of ['fl', 'fr', 'rl', 'rr']) wheels[key].rotation.x += spin;
    }
    wheels.fl.rotation.y = this.steerVis * 0.5;
    wheels.fr.rotation.y = this.steerVis * 0.5;
  }

  // pick the lane point this car is currently steering toward
  trafficTarget() {
    const r = this.route;
    const ahead = 14;
    if (r.axis === 'v') {
      return { x: r.laneX, z: this.pos.z + r.dir * ahead };
    }
    return { x: this.pos.x + r.dir * ahead, z: r.laneZ };
  }

  // start travelling on a road: axis 'v' = along z on the vertical road x=line
  setRoute(axis, line, dir) {
    const lane = line + (axis === 'v' ? (dir > 0 ? -1 : 1) : (dir > 0 ? 1 : -1)) * CITY.laneOffset;
    this.route = { axis, line, dir, laneX: axis === 'v' ? lane : null, laneZ: axis === 'h' ? lane : null };
    this.angle = axis === 'v' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

// traffic driving: steer to a point far ahead on the current lane. Near an
// intersection the car picks straight/left/right once; a turning car aims at
// a point on the exit lane, then adopts that road as its route mid-corner.
export function updateTrafficCar(game, car, dt) {
  if (car.mode !== 'traffic' || car.dead) return;
  const r = car.route;
  if (!r) return;
  const pos = car.pos;
  const along = r.axis === 'v' ? pos.z : pos.x;

  // the next intersection ahead on this road, if any
  let cross = null;
  let crossDist = Infinity;
  for (const c of CITY.lines) {
    const d = (c - along) * r.dir;
    if (d > 1 && d < crossDist) {
      crossDist = d;
      cross = c;
    }
  }

  const crossKey = `${r.axis}:${r.line}:${cross}`;
  if (cross !== null && crossDist < 18 && r.decisionKey !== crossKey) {
    const roll = game.rng();
    r.decision = roll < 0.55 ? 'straight' : roll < 0.78 ? 'left' : 'right';
    r.decisionKey = crossKey;
    r.pendingRoute = null;
    if (r.decision !== 'straight') {
      const left = r.decision === 'left';
      if (r.axis === 'v') {
        const nd = r.dir * (left ? 1 : -1);
        r.pendingRoute = { axis: 'h', line: cross, dir: nd, laneZ: cross + (nd > 0 ? 1 : -1) * CITY.laneOffset };
      } else {
        const nd = r.dir * (left ? -1 : 1);
        r.pendingRoute = { axis: 'v', line: cross, dir: nd, laneX: cross + (nd > 0 ? -1 : 1) * CITY.laneOffset };
      }
    }
  }

  let target;
  if (r.pendingRoute && crossDist < 18) {
    target =
      r.pendingRoute.axis === 'h'
        ? { x: r.laneX + r.pendingRoute.dir * 16, z: r.pendingRoute.laneZ }
        : { x: r.pendingRoute.laneX, z: r.laneZ + r.pendingRoute.dir * 16 };
  } else {
    target = car.trafficTarget();
  }

  // mid-corner, the exit road becomes the route
  if (r.pendingRoute && cross !== null && crossDist < 2.2) {
    const p = r.pendingRoute;
    car.setRoute(p.axis, p.line, p.dir);
    car.route.decisionKey = crossKey;
    car.route.decision = 'straight';
    car.route.pendingRoute = null;
  }

  // desired heading toward the target, with a capped turn rate
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turnRate = 1.5;
  car.angle += clamp(diff, -turnRate * dt, turnRate * dt);
  car.steerVis = clamp(diff, -1, 1);

  // speed: cruise, slower in a turn, stopped behind the car ahead
  let targetSpeed = Math.abs(diff) > 0.5 ? 5.5 : 11.5;
  const fwd = car.forward();
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    const ox = other.pos.x - pos.x;
    const oz = other.pos.z - pos.z;
    const ahead = ox * fwd.x + oz * fwd.z;
    const side = Math.abs(ox * -fwd.z + oz * fwd.x);
    if (ahead > 0 && ahead < 8.5 && side < 1.9) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, other.speed) * (ahead < 5 ? 0 : 1));
    }
  }
  car.speed += clamp(targetSpeed - car.speed, -18 * dt, 7 * dt);
  pos.x += fwd.x * car.speed * dt;
  pos.z += fwd.z * car.speed * dt;
  collideCircle(game.world, pos, 1.5);
  car.syncMesh(dt);
}

export function spawnTraffic(game, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = new Car(game.scene, pick(game.rng, TRAFFIC_COLORS), game.rng() < 0.14 ? 'sport' : 'sedan');
    const axis = game.rng() < 0.5 ? 'v' : 'h';
    const line = pick(game.rng, CITY.lines);
    const dir = game.rng() < 0.5 ? 1 : -1;
    car.setRoute(axis, line, dir);
    const along = randRange(game.rng, -CITY.half, CITY.half);
    const lanePos = axis === 'v' ? car.route.laneX : car.route.laneZ;
    car.place(axis === 'v' ? lanePos : along, axis === 'v' ? along : lanePos, car.angle);
    car.speed = randRange(game.rng, 6, 11);
    cars.push(car);
    game.cars.push(car);
  }
  return cars;
}

export function spawnParked(game, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = new Car(game.scene, pick(game.rng, TRAFFIC_COLORS), 'sedan');
    car.mode = 'parked';
    const vertical = game.rng() < 0.5;
    const line = pick(game.rng, CITY.lines);
    const along = randRange(game.rng, -CITY.half + 12, CITY.half - 12);
    const sideSign = game.rng() < 0.5 ? -1 : 1;
    const off = CITY.roadHalf - 1.7;
    if (vertical) {
      car.place(line + sideSign * off, along, sideSign > 0 ? 0 : Math.PI);
    } else {
      car.place(along, line + sideSign * off, sideSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    cars.push(car);
    game.cars.push(car);
  }
  return cars;
}

// pairwise separation so cars never overlap; returns the hardest impact speed
export function separateCars(game, dt) {
  let worst = 0;
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.1;
      if (d2 > 0.0001 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / 2) * 0.8;
        const nx = dx / d;
        const nz = dz / d;
        if (a.mode !== 'parked') {
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
        }
        if (b.mode !== 'parked') {
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
        const impact = Math.abs(a.speed - b.speed);
        if (impact > worst) worst = impact;
        if (impact > 6) {
          a.health -= impact * 1.2;
          b.health -= impact * 1.2;
        }
      }
    }
  }
  return worst;
}

export function wreckCar(car) {
  car.dead = true;
  car.mode = 'dead';
  car.speed = 0;
  const paint = car.mesh.userData.paint;
  if (paint) paint.color.setHex(0x2a2a2e);
}
