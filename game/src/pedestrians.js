// Palm City Heat — people. buildFigure makes the low-poly humanoid the
// player, pedestrians and officers all share; the Pedestrian class strolls
// the sidewalks, flees from danger, gets knocked down and sometimes drops
// a cash pickup when it is.

import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF, BOARDWALK_X } from './config.js';
import { resolveCollisions } from './world.js';
import { makeRng, pick, range } from './rng.js';
import { mergeBoxes, plainBoxMaterial } from './merge.js';

const rng = makeRng(4242);
const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xfd79a8];
const PANTS = [0x2c3e50, 0x5d4037, 0x546e7a, 0x795548, 0x37474f];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

/** A jointed low-poly person. Limbs swing from userData refs by walk phase. */
export function buildFigure({ shirt, pants, skin, hat = null }) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  // Torso, head and hat are one merged mesh; only the limbs move.
  const bodyParts = [
    { w: 0.52, h: 0.66, d: 0.28, x: 0, y: 1.12, z: 0, color: shirt },
    { w: 0.3, h: 0.34, d: 0.3, x: 0, y: 1.66, z: 0, color: skin },
  ];
  if (hat !== null) bodyParts.push({ w: 0.36, h: 0.1, d: 0.36, x: 0, y: 1.86, z: 0, color: hat });
  g.add(new THREE.Mesh(mergeBoxes(bodyParts), plainBoxMaterial));
  const limb = (w, h, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(c));
  const mkLimb = (x, y, mesh) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    mesh.position.y = -mesh.geometry.parameters.height / 2;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const legL = mkLimb(-0.14, 0.82, limb(0.17, 0.8, pants));
  const legR = mkLimb(0.14, 0.82, limb(0.17, 0.8, pants));
  const armL = mkLimb(-0.35, 1.4, limb(0.13, 0.68, shirt));
  const armR = mkLimb(0.35, 1.4, limb(0.13, 0.68, shirt));
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

/** Swing a figure's limbs for a walk cycle; phase advances with distance. */
export function animateFigure(fig, phase, amount = 1) {
  const { legL, legR, armL, armR } = fig.userData.limbs;
  const s = Math.sin(phase) * 0.55 * amount;
  legL.rotation.x = s;
  legR.rotation.x = -s;
  armL.rotation.x = -s * 0.8;
  armR.rotation.x = s * 0.8;
}

export class Pedestrian {
  constructor(scene) {
    this.fig = buildFigure({
      shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS), skin: pick(rng, SKINS),
      hat: rng() < 0.3 ? pick(rng, SHIRTS) : null,
    });
    const start = this.sidewalkPoint();
    this.fig.position.set(start.x, 0, start.z);
    this.heading = range(rng, 0, Math.PI * 2);
    this.speed = 0;
    this.state = 'stroll'; // stroll | flee | down
    this.target = this.sidewalkPoint();
    this.downTimer = 0;
    this.phase = range(rng, 0, 6);
    this.droppedCash = false;
    scene.add(this.fig);
  }

  get pos() { return this.fig.position; }

  sidewalkPoint() {
    if (rng() < 0.14) return { x: BOARDWALK_X + range(rng, -4, 4), z: range(rng, -300, 300) };
    const line = pick(rng, ROAD_LINES);
    const side = rng() < 0.5 ? 1 : -1;
    const at = range(rng, -305, 305);
    return rng() < 0.5
      ? { x: at, z: line + side * (ROAD_HALF + 1.7) }
      : { x: line + side * (ROAD_HALF + 1.7), z: at };
  }

  knockDown(onDropCash) {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = range(rng, 3, 5);
    this.fig.rotation.x = -Math.PI / 2;
    this.fig.position.y = 0.25;
    if (!this.droppedCash && rng() < 0.45) {
      this.droppedCash = true;
      onDropCash?.(this.pos.x, this.pos.z);
    }
  }

  /** danger: {x, z, r} the pedestrians run from, or null. */
  update(dt, colliders, danger) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = 'stroll';
        this.fig.rotation.x = 0;
        this.fig.position.y = 0;
        this.target = this.sidewalkPoint();
      }
      return;
    }
    let tx, tz, speed;
    if (danger && Math.hypot(this.pos.x - danger.x, this.pos.z - danger.z) < danger.r) {
      this.state = 'flee';
      tx = this.pos.x + (this.pos.x - danger.x) * 2;
      tz = this.pos.z + (this.pos.z - danger.z) * 2;
      speed = 4.3;
    } else {
      this.state = 'stroll';
      tx = this.target.x; tz = this.target.z;
      speed = 1.55;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 1.6) this.target = this.sidewalkPoint();
    }
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    this.speed = speed;
    let nx = this.pos.x + Math.sin(this.heading) * speed * dt;
    let nz = this.pos.z + Math.cos(this.heading) * speed * dt;
    [nx, nz] = resolveCollisions(colliders, nx, nz, 0.4);
    this.pos.x = nx; this.pos.z = nz;
    this.fig.rotation.y = this.heading;
    this.phase += dt * speed * 2.6;
    animateFigure(this.fig, this.phase);
  }
}
