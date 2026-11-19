// Palm City Heat — the on-foot player: camera-relative WASD movement with
// sprint and jump, a punch with a short wind-up, and the shared figure
// animation. Cars, health and crimes live elsewhere; this class only moves
// the person.

import { buildFigure, animateFigure } from './pedestrians.js';
import { resolveCollisions, inSea } from './world.js';
import { WORLD_LIMIT } from './config.js';

export class Player {
  constructor(scene) {
    this.fig = buildFigure({ shirt: 0xff7847, pants: 0x27324a, skin: 0xe0ac69, hat: 0x27324a });
    this.fig.position.set(-240, 0, -180);
    scene.add(this.fig);
    this.heading = Math.PI / 4;
    this.vy = 0;
    this.y = 0;
    this.speed = 0;
    this.phase = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
  }

  get pos() { return this.fig.position; }

  teleport(x, z) {
    this.fig.position.set(x, 0, z);
    this.vy = 0;
    this.y = 0;
  }

  /** Start a punch; returns false while the previous one is still swinging. */
  punch() {
    if (this.punchCooldown > 0) return false;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.45;
    return true;
  }

  get punching() { return this.punchTimer > 0.12 && this.punchTimer < 0.26; }

  update(dt, input, camYaw, colliders) {
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);

    let mx = 0, mz = 0;
    if (input.down('KeyW')) mz += 1;
    if (input.down('KeyS')) mz -= 1;
    if (input.down('KeyA')) mx -= 1;
    if (input.down('KeyD')) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const top = sprint ? 7.4 : 4.3;

    if (moving) {
      const len = Math.hypot(mx, mz);
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      // world move = camera-right * mx + camera-forward * mz
      const wx = (mz * sin - mx * cos) / len;
      const wz = (mz * cos + mx * sin) / len;
      // Face the way we run.
      const want = Math.atan2(wx, wz);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += Math.max(-11 * dt, Math.min(11 * dt, diff));
      let nx = this.pos.x + wx * top * dt;
      let nz = this.pos.z + wz * top * dt;
      if (!inSea(nx, nz)) {
        [nx, nz] = resolveCollisions(colliders, nx, nz, 0.45);
        this.pos.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, nx));
        this.pos.z = Math.max(-330, Math.min(330, nz));
      }
      this.speed = top;
      this.phase += dt * top * 2.4;
    } else {
      this.speed = 0;
    }

    if ((input.wasPressed('Space')) && this.y <= 0) this.vy = 5.4;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= 15 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
    }
    this.pos.y = this.y;
    this.fig.rotation.y = this.heading;
    animateFigure(this.fig, this.phase, moving ? 1 : 0);
    // Punch: right arm swings through.
    if (this.punchTimer > 0) {
      const { armR } = this.fig.userData.limbs;
      armR.rotation.x = -Math.sin((0.28 - this.punchTimer) / 0.28 * Math.PI) * 1.9;
    }
  }
}
