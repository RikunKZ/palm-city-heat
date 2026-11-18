// pedestrians.js — the people of Palm City: low-poly humanoids (shared with
// the player and police officers) who stroll the sidewalks, flee from danger
// and fall when hit. A fallen pedestrian drops a cash pickup now and then.

import * as THREE from 'three';
import { clamp, pick, randRange } from './random.js';
import { collideCircle, randomSidewalkPoint } from './world.js';

const SHIRTS = [0xe8e3d8, 0x4f7fb5, 0xb54f4f, 0x4fb56a, 0xe0a83c, 0x8a4fb5, 0x3fb5a8, 0xd873a8, 0x5a6270];
const PANTS = [0x2e3a4a, 0x4a3a2e, 0x22242a, 0x5e6a72, 0x71563a];
const SKINS = [0xf2c79b, 0xd9a066, 0xa86f3e, 0x7a4a26, 0xffdbac];

export function makeHumanoid(rng, palette = {}) {
  const shirt = palette.shirt ?? pick(rng, SHIRTS);
  const pants = palette.pants ?? pick(rng, PANTS);
  const skin = palette.skin ?? pick(rng, SKINS);
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.06;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  head.position.y = 1.66;
  group.add(head);

  const limb = (mat, w, h, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, w);
    geo.translate(0, -h / 2, 0); // pivot at the top so limbs swing from the joint
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const armL = limb(skinMat, 0.16, 0.62, -0.42, 1.36, 0);
  const armR = limb(skinMat, 0.16, 0.62, 0.42, 1.36, 0);
  const legL = limb(pantsMat, 0.2, 0.72, -0.16, 0.72, 0);
  const legR = limb(pantsMat, 0.2, 0.72, 0.16, 0.72, 0);
  group.userData = { armL, armR, legL, legR, torso, head };
  return group;
}

// swing arms and legs in step with movement; phase advances with distance
export function animateWalk(group, phase, stride = 1) {
  const { armL, armR, legL, legR } = group.userData;
  const s = Math.sin(phase) * 0.55 * stride;
  legL.rotation.x = s;
  legR.rotation.x = -s;
  armL.rotation.x = -s * 0.8;
  armR.rotation.x = s * 0.8;
}

export function resetPose(group) {
  const { armL, armR, legL, legR } = group.userData;
  armL.rotation.x = armR.rotation.x = legL.rotation.x = legR.rotation.x = 0;
}

let nextPedId = 1;

export class Ped {
  constructor(scene, rng) {
    this.id = nextPedId++;
    this.group = makeHumanoid(rng);
    this.state = 'walk'; // walk | flee | down
    this.target = null;
    this.speed = randRange(rng, 1.1, 1.7);
    this.phase = randRange(rng, 0, 6);
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.fleeFrom = { x: 0, z: 0 };
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  place(x, z) {
    this.group.position.set(x, 0, z);
  }

  knockDown(game) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 5;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.25;
    game.onPedDown(this);
  }

  update(game, dt) {
    const pos = this.pos;
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // get up somewhere else: the city quietly replaces its casualties
        const p = randomSidewalkPoint(game.rng);
        this.place(p.x, p.z);
        this.group.rotation.x = 0;
        this.group.position.y = 0;
        this.state = 'walk';
        this.target = null;
      }
      return;
    }

    // danger sense: a fast car or a swinging fist nearby starts a flee
    if (game.threat && game.time - game.threat.time < 0.4) {
      const dx = pos.x - game.threat.x;
      const dz = pos.z - game.threat.z;
      if (dx * dx + dz * dz < 130) {
        this.state = 'flee';
        this.fleeTimer = randRange(game.rng, 2, 3.5);
        this.fleeFrom = { x: game.threat.x, z: game.threat.z };
      }
    }

    let moveX = 0;
    let moveZ = 0;
    let speed = this.speed;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      const dx = pos.x - this.fleeFrom.x;
      const dz = pos.z - this.fleeFrom.z;
      const d = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      moveX = dx / d;
      moveZ = dz / d;
      speed = 3.6;
      if (this.fleeTimer <= 0) this.state = 'walk';
    } else {
      if (!this.target) {
        const p = randomSidewalkPoint(game.rng);
        this.target = p;
      }
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.2) {
        this.target = null;
      } else {
        moveX = dx / d;
        moveZ = dz / d;
      }
    }

    if (moveX !== 0 || moveZ !== 0) {
      pos.x += moveX * speed * dt;
      pos.z += moveZ * speed * dt;
      this.group.rotation.y = Math.atan2(moveX, moveZ);
      this.phase += dt * speed * 3.4;
      animateWalk(this.group, this.phase, clamp(speed / 1.7, 0.6, 1.6));
      collideCircle(game.world, pos, 0.4);
    } else {
      resetPose(this.group);
    }
  }
}

export function spawnPeds(game, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const ped = new Ped(game.scene, game.rng);
    const p = randomSidewalkPoint(game.rng);
    ped.place(p.x, p.z);
    peds.push(ped);
    game.peds.push(ped);
  }
  return peds;
}
