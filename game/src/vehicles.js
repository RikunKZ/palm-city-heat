// Palm City Heat — cars: one factory builds every car mesh (sedans, sports
// cars, vans, patrol cars with light bars), and the Car class carries the
// three drivers: grid traffic that keeps right and queues behind the car
// ahead, the arcade driving model for the player's car, and the pursuit
// steering the police use.

import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF } from './config.js';
import { resolveCollisions } from './world.js';
import { makeRng, pick, range } from './rng.js';
import { mergeBoxes, plainBoxMaterial } from './merge.js';

const rng = makeRng(777);
const LANE = 3.0;
const CAR_COLORS = [0xd64541, 0x3f7fbf, 0xe0a526, 0x59a96a, 0xb8bcc2, 0x7456a6, 0xe8e4da, 0x2f3542, 0xff7f50];
const smokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(70,70,70,0.55)');
  g.addColorStop(1, 'rgba(70,70,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function buildCarMesh(color, kind) {
  const g = new THREE.Group();
  const dims = kind === 'sport' ? [1.9, 0.5, 4.4] : kind === 'van' ? [2.0, 1.5, 4.6] : [1.85, 0.62, 4.2];
  const [w, h, l] = dims;
  const parts = [
    { w, h, d: l, x: 0, y: 0.35 + h / 2, z: 0, color },
    // Wheels as low boxes at the corners (merged in; the arcade look suits it).
    ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({
      w: 0.26, h: 0.62, d: 0.62,
      x: sx * (w / 2 - 0.02), y: 0.31, z: sz * (l / 2 - 0.85),
      color: 0x15161a,
    })),
    // Headlights.
    ...[-0.6, 0.6].map((sx) => ({ w: 0.34, h: 0.16, d: 0.08, x: sx, y: 0.72, z: l / 2 + 0.01, color: 0xfff6c8 })),
  ];
  if (kind === 'van') {
    parts.push({ w: w * 0.92, h: 0.34, d: l * 0.3, x: 0, y: 0.35 + h + 0.17, z: l * 0.22, color: 0x18242f });
  } else {
    parts.push({ w: w * 0.82, h: 0.5, d: l * 0.45, x: 0, y: 0.35 + h + 0.25, z: -0.2, color: 0x18242f });
  }
  if (kind === 'police') {
    parts.push({ w: w + 0.04, h: 0.3, d: l * 0.5, x: 0, y: 0.85, z: 0, color: 0x22335e });
  }
  g.add(new THREE.Mesh(mergeBoxes(parts), plainBoxMaterial));
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a5bff }));
    blue.position.x = 0.32;
    bar.add(red, blue);
    bar.position.y = 1.5;
    g.add(bar);
    g.userData.lightBar = bar;
  }
  return { group: g, wheels: [] };
}

let nextId = 1;

export class Car {
  constructor(scene, { kind = 'sedan', color, x = 0, z = 0, heading = 0, mode = 'traffic' } = {}) {
    this.id = nextId++;
    this.kind = kind;
    this.mode = mode; // traffic | parked | driven | police | wrecked
    const { group, wheels } = buildCarMesh(kind === 'police' ? 0xf2f3f5 : (color ?? pick(rng, CAR_COLORS)), kind);
    this.mesh = group;
    this.wheels = wheels;
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.maxSpeed = kind === 'sport' ? 33 : kind === 'police' ? 31 : 24;
    this.cruise = range(rng, 9, 13);
    this.target = null; // intersection node {x, z} for traffic
    this.stopTimer = 0;
    this.smoke = [];
    this.smokeTimer = 0;
    this.flash = 0;
    scene.add(group);
  }

  get pos() { return this.mesh.position; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  /** Shortest signed turn from the current heading to a target heading. */
  turnToward(targetHeading, maxTurn) {
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    this.heading += turn;
    return diff;
  }

  /** Grid traffic: follow lanes to a target intersection, then choose onward. */
  updateTraffic(dt, cars) {
    if (!this.target) this.target = this.nearestNodeAhead();
    const t = this.target;
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7) {
      this.target = this.nextNode(t);
      return;
    }
    // Aim at the lane point for the target: offset right of travel direction.
    const dirH = Math.atan2(dx, dz);
    const rx = -Math.cos(dirH), rz = Math.sin(dirH);
    const ax = t.x + rx * LANE, az = t.z + rz * LANE;
    const diff = this.turnToward(Math.atan2(ax - this.pos.x, az - this.pos.z), 1.9 * dt);
    let want = this.cruise * (Math.abs(diff) > 0.5 ? 0.45 : 1);
    // Queue behind a car ahead.
    const f = this.forward();
    for (const other of cars) {
      if (other === this) continue;
      const ox = other.pos.x - this.pos.x, oz = other.pos.z - this.pos.z;
      const ahead = ox * f.x + oz * f.z;
      const side = Math.abs(ox * -f.z + oz * f.x);
      if (ahead > 0 && ahead < 10 && side < 2.6) want = Math.min(want, Math.max(0, other.speed - 0.5));
    }
    this.driveToward(want, dt);
  }

  nearestNodeAhead() {
    const f = this.forward();
    let best = null, bestScore = -Infinity;
    for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
      const dx = x - this.pos.x, dz = z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) continue;
      const score = (dx * f.x + dz * f.z) - d * 0.35;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best ?? { x: 0, z: 0 };
  }

  nextNode(node) {
    const options = [];
    for (const [dx, dz] of [[90, 0], [-90, 0], [0, 90], [0, -90]]) {
      const nx = node.x + dx, nz = node.z + dz;
      if (nx < -270 || nx > 270 || nz < -270 || nz > 270) continue;
      const back = Math.sin(this.heading) * dx + Math.cos(this.heading) * dz < 0;
      if (back && rng() > 0.12) continue;
      options.push({ x: nx, z: nz });
    }
    return options.length ? pick(rng, options) : { x: 0, z: 0 };
  }

  /** Shared throttle: ease speed toward `want`, then roll forward. */
  driveToward(want, dt) {
    const accel = want > this.speed ? 7 : 16;
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, want - this.speed));
    this.roll(dt);
  }

  roll(dt) {
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.34;
    for (const w of this.wheels) w.rotation.x += spin;
  }

  /**
   * The player's driving model. input: {throttle -1..1, steer -1..1, brake}.
   * Returns impact speed when a building stops the car, else 0.
   */
  updateDriven(dt, input, colliders) {
    const power = this.damage >= 1 ? 6 : 15;
    if (input.throttle > 0) this.speed += power * dt * input.throttle;
    else if (input.throttle < 0) this.speed += (this.speed > 0.5 ? -26 : -7) * dt * -input.throttle;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
    this.speed = Math.max(-9, Math.min(this.maxSpeed * (this.damage >= 1 ? 0.35 : 1), this.speed));
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 6) * (input.brake ? 1.5 : 1);
    this.steer = input.steer;
    this.heading += input.steer * steerAuthority * dt * 1.55 * (this.speed < 0 ? -1 : 1);
    const before = { x: this.pos.x, z: this.pos.z };
    this.roll(dt);
    const [nx, nz] = resolveCollisions(colliders, this.pos.x, this.pos.z, 1.7);
    let impact = 0;
    if (nx !== this.pos.x || nz !== this.pos.z) {
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      const wanted = Math.abs(this.speed) * dt;
      if (wanted - moved > 0.05 && Math.abs(this.speed) > 4) impact = Math.abs(this.speed);
      this.pos.x = nx; this.pos.z = nz;
      this.speed *= 0.35;
    }
    this.mesh.rotation.y = this.heading;
    return impact;
  }

  /** Pursuit steering for police cars: aim at a point, full commitment. */
  updatePursuit(dt, tx, tz, colliders) {
    const diff = this.turnToward(Math.atan2(tx - this.pos.x, tz - this.pos.z), 2.3 * dt);
    const dist = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    let want = this.maxSpeed * (Math.abs(diff) > 0.7 ? 0.5 : 1);
    if (dist < 4) want = 2;
    this.driveToward(want, dt);
    const [nx, nz] = resolveCollisions(colliders, this.pos.x, this.pos.z, 1.7);
    if (nx !== this.pos.x || nz !== this.pos.z) {
      this.pos.x = nx; this.pos.z = nz;
      this.speed *= 0.5;
    }
    this.mesh.rotation.y = this.heading;
    this.updateLightBar(dt);
  }

  updateLightBar(dt) {
    if (this.mesh.userData.lightBar) {
      this.flash += dt * 9;
      this.mesh.userData.lightBar.rotation.y = Math.sin(this.flash) * 0.6;
    }
  }

  /**
   * Road routing for police cars still far from their target: hop from
   * intersection to intersection, always choosing the neighbour nearest
   * the goal, following lanes like traffic. Direct pursuit takes over
   * once the target is close (the caller decides).
   */
  updatePatrol(dt, tx, tz, cars) {
    let gx = ROAD_LINES[0], gz = ROAD_LINES[0], gd = Infinity;
    for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
      const d = (x - tx) * (x - tx) + (z - tz) * (z - tz);
      if (d < gd) { gd = d; gx = x; gz = z; }
    }
    if (!this.routeNode) {
      // Start toward the nearest intersection, whichever way it lies.
      let bd = Infinity;
      for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
        const d = (x - this.pos.x) ** 2 + (z - this.pos.z) ** 2;
        if (d < bd) { bd = d; this.routeNode = { x, z }; }
      }
    }
    // Passing any intersection? Re-pick the next hop greedily from there.
    for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
      if (Math.abs(x - this.pos.x) < 9 && Math.abs(z - this.pos.z) < 9) {
        if (x === gx && z === gz) {
          this.routeNode = { x: tx, z: tz };
        } else {
          const opts = [[90, 0], [-90, 0], [0, 90], [0, -90]]
            .map(([dx, dz]) => ({ x: x + dx, z: z + dz }))
            .filter((p) => p.x >= -270 && p.x <= 270 && p.z >= -270 && p.z <= 270);
          opts.sort((a, b) => ((a.x - gx) ** 2 + (a.z - gz) ** 2) - ((b.x - gx) ** 2 + (b.z - gz) ** 2));
          if (opts.length) this.routeNode = opts[0];
        }
      }
    }
    const t = this.routeNode;
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const dirH = Math.atan2(dx, dz);
    const rx = -Math.cos(dirH), rz = Math.sin(dirH);
    const ax = t.x + rx * LANE, az = t.z + rz * LANE;
    const diff = this.turnToward(Math.atan2(ax - this.pos.x, az - this.pos.z), 1.9 * dt);
    let want = this.maxSpeed * 0.82 * (Math.abs(diff) > 0.5 ? 0.45 : 1);
    const f = this.forward();
    for (const other of cars) {
      if (other === this) continue;
      const ox = other.pos.x - this.pos.x, oz = other.pos.z - this.pos.z;
      const ahead = ox * f.x + oz * f.z;
      const side = Math.abs(ox * -f.z + oz * f.x);
      if (ahead > 0 && ahead < 10 && side < 2.6) want = Math.min(want, Math.max(0, other.speed - 0.5));
    }
    this.driveToward(want, dt);
    this.mesh.rotation.y = this.heading;
    this.updateLightBar(dt);
  }

  addDamage(amount) {
    this.damage = Math.min(1, this.damage + amount);
  }

  /** Damage smoke: a small cycling pool of sprites above the bonnet. */
  updateSmoke(dt, scene) {
    if (this.damage > 0.5) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0 && this.smoke.length < 7) {
        this.smokeTimer = 0.16;
        const mat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.5, depthWrite: false });
        const s = new THREE.Sprite(mat);
        s.position.copy(this.pos).add(new THREE.Vector3(0, 1.1, 0));
        s.scale.setScalar(0.7);
        scene.add(s);
        this.smoke.push({ s, life: 0 });
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life += dt;
      p.s.position.y += dt * 1.6;
      p.s.scale.setScalar(0.7 + p.life * 1.8);
      p.s.material.opacity = 0.5 * (1 - p.life / 1.4);
      if (p.life > 1.4) {
        scene.remove(p.s);
        p.s.material.dispose();
        this.smoke.splice(i, 1);
      }
    }
  }
}

/** A random point on a random road, with a heading along it. */
export function randomRoadPose() {
  const alongX = rng() < 0.5;
  const line = pick(rng, ROAD_LINES);
  const at = range(rng, -300, 300);
  if (alongX) return { x: at, z: line + (rng() < 0.5 ? LANE : -LANE), heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  return { x: line + (rng() < 0.5 ? LANE : -LANE), z: at, heading: rng() < 0.5 ? 0 : Math.PI };
}

/** A parking pose on a curb beside a random road. */
export function randomParkedPose() {
  const alongX = rng() < 0.5;
  const line = pick(rng, ROAD_LINES);
  const at = range(rng, -290, 290);
  const side = rng() < 0.5 ? 1 : -1;
  if (alongX) return { x: at, z: line + side * (ROAD_HALF + 2.1), heading: side > 0 ? Math.PI / 2 : -Math.PI / 2 };
  return { x: line + side * (ROAD_HALF + 2.1), z: at, heading: side > 0 ? Math.PI : 0 };
}
