// People of Palm City: a small articulated humanoid used by pedestrians,
// the player and police officers alike, plus the pedestrian brain — stroll
// the pavements, run from trouble, fall when hit, sometimes drop cash.
import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF } from './config.js';
import { randRange, pick, clamp } from './random.js';
import { resolveCollisions } from './world.js';

const SKIN_TONES = [0xe8b98d, 0xc68863, 0x8a5a3b, 0xf0c8a0, 0x6e4426];
const SHIRTS = [0xd84f35, 0x2e7fb8, 0x3f9e8f, 0xe0a51e, 0xd8d8d8, 0xb03a8c, 0x707880, 0x4f7a3a];
const PANTS = [0x2c3550, 0x4a3b2c, 0x22262b, 0x5d7186, 0x707880];

export function makeHumanoid({ skin, shirt, pants }) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skinMat);
  head.position.y = 1.62;
  g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), shirtMat);
  torso.position.y = 1.12;
  g.add(torso);
  const mkLimb = (mat, w, h, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    limb.position.y = -h / 2;
    pivot.add(limb);
    g.add(pivot);
    return pivot;
  };
  const armL = mkLimb(skinMat, 0.16, 0.62, -0.37, 1.42);
  const armR = mkLimb(skinMat, 0.16, 0.62, 0.37, 1.42);
  const legL = mkLimb(pantsMat, 0.2, 0.78, -0.15, 0.8);
  const legR = mkLimb(pantsMat, 0.2, 0.78, 0.15, 0.8);
  return { group: g, armL, armR, legL, legR, head };
}

/** Swing arms and legs for a walker; phase advances with distance covered. */
export function animateWalk(h, phase, amount = 1) {
  const s = Math.sin(phase) * 0.55 * amount;
  h.legL.rotation.x = s;
  h.legR.rotation.x = -s;
  h.armL.rotation.x = -s * 0.8;
  h.armR.rotation.x = s * 0.8;
}

export function resetPose(h) {
  h.legL.rotation.x = 0;
  h.legR.rotation.x = 0;
  h.armL.rotation.x = 0;
  h.armR.rotation.x = 0;
}

export class Ped {
  constructor(scene, rng) {
    this.h = makeHumanoid({ skin: pick(rng, SKIN_TONES), shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS) });
    this.mesh = this.h.group;
    this.pos = this.mesh.position;
    this.facing = rng() * Math.PI * 2;
    this.state = 'walk'; // 'walk' | 'flee' | 'down'
    this.target = { x: 0, z: 0 };
    this.phase = rng() * 6;
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.threat = { x: 0, z: 0 };
    this.hasTarget = false;
    scene.add(this.mesh);
  }

  place(x, z) {
    this.pos.set(x, 0, z);
    this.hasTarget = false;
  }

  pickTarget(game) {
    const rng = game.rng;
    if (rng() < 0.16) {
      // A stroll along the boardwalk.
      this.target = { x: randRange(rng, 236, 250), z: randRange(rng, -240, 240) };
    } else {
      const line = pick(rng, ROAD_LINES);
      const side = rng() < 0.5 ? -1 : 1;
      const along = randRange(rng, -240, 240);
      if (rng() < 0.5) this.target = { x: line + side * (ROAD_HALF + 2.4), z: along };
      else this.target = { x: along, z: line + side * (ROAD_HALF + 2.4) };
    }
    this.hasTarget = true;
  }

  knockDown(game) {
    if (this.state === 'down') return false;
    this.state = 'down';
    this.downTimer = 4.5;
    this.mesh.rotation.x = -Math.PI / 2;
    this.pos.y = 0.32;
    if (game.rng() < 0.45) game.spawnPickup(this.pos.x, this.pos.z);
    return true;
  }

  scareFrom(x, z, seconds = 3.2) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeTimer = seconds;
    this.threat = { x, z };
  }

  update(game, dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'flee';
        this.fleeTimer = 2.2;
        this.threat = { x: this.pos.x + 6, z: this.pos.z };
        this.mesh.rotation.x = 0;
        this.pos.y = 0;
      }
      return;
    }
    // Trouble nearby sends everyone running: a fresh crime, or a fast car.
    if (game.lastCrime && game.time - game.lastCrime.at < 3.5) {
      const dx = this.pos.x - game.lastCrime.x;
      const dz = this.pos.z - game.lastCrime.z;
      if (dx * dx + dz * dz < 15 * 15) this.scareFrom(game.lastCrime.x, game.lastCrime.z);
    }

    let speed = 1.7;
    let tx;
    let tz;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.hasTarget = false;
      }
      const dx = this.pos.x - this.threat.x;
      const dz = this.pos.z - this.threat.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + (dx / d) * 10;
      tz = this.pos.z + (dz / d) * 10;
      speed = 5.1;
    } else {
      if (!this.hasTarget) this.pickTarget(game);
      tx = this.target.x;
      tz = this.target.z;
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) {
        this.pickTarget(game);
        return;
      }
    }
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const targetFacing = Math.atan2(dx, dz);
    let diff = targetFacing - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += clamp(diff, -8 * dt, 8 * dt);
    this.mesh.rotation.y = this.facing;
    this.phase += step * 2.6;
    animateWalk(this.h, this.phase, this.state === 'flee' ? 1.25 : 0.8);
    resolveCollisions(this.pos, 0.45, game.colliders);
  }
}

export function seedPeds(game, count) {
  for (let i = 0; i < count; i++) {
    const ped = new Ped(game.scene, game.rng);
    ped.pickTarget(game);
    ped.place(ped.target.x, ped.target.z);
    ped.pickTarget(game);
    game.peds.push(ped);
  }
}
