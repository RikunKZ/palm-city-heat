// Reno, the player: on-foot movement against the camera, sprinting,
// jumping, and throwing punches. Driving lives in main.js, which hands the
// wheel of the stolen car to the same input this file reads.
import { PLAYER } from './config.js';
import { clamp, angleDelta } from './random.js';
import { makeHumanoid, animateWalk, resetPose } from './pedestrians.js';
import { resolveCollisions } from './world.js';

export function createPlayer(scene) {
  const h = makeHumanoid({ skin: 0xc68863, shirt: 0x1f7a72, pants: 0x2c3550 });
  scene.add(h.group);
  return {
    h,
    mesh: h.group,
    pos: h.group.position,
    facing: -Math.PI / 2,
    vy: 0,
    grounded: true,
    health: PLAYER.startHealth,
    car: null,
    phase: 0,
    punchTimer: 0,
    punchCooldown: 0,
    lastHurtAt: -99,
    speedNow: 0,
  };
}

export function placePlayer(player, x, z, facing = -Math.PI / 2) {
  player.pos.set(x, 0, z);
  player.facing = facing;
  player.mesh.rotation.y = facing;
  player.vy = 0;
}

export function hurtPlayer(game, amount) {
  const p = game.player;
  p.health -= amount;
  p.lastHurtAt = game.time;
  if (p.health < 0) p.health = 0;
}

/** On-foot update. Driving is handled by updateDriving in main.js. */
export function updatePlayerOnFoot(game, dt) {
  const p = game.player;
  const input = game.input;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.punchTimer > 0) p.punchTimer -= dt;

  // Slow recovery once the trouble is a few seconds behind him.
  if (game.time - p.lastHurtAt > 5 && p.health > 0) {
    p.health = Math.min(PLAYER.startHealth, p.health + 1.6 * dt);
  }
  if (game.state !== 'playing' || game.dialogActive) {
    resetPose(p.h);
    return;
  }

  const fwdX = Math.sin(game.camYaw);
  const fwdZ = Math.cos(game.camYaw);
  let mx = 0;
  let mz = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += fwdX; mz += fwdZ; }
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { mx += fwdZ; mz -= fwdX; }
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx -= fwdZ; mz += fwdX; }
  const moving = mx !== 0 || mz !== 0;
  const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  p.speedNow = moving ? speed : 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len;
    mz /= len;
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;
    const target = Math.atan2(mx, mz);
    p.facing += angleDelta(p.facing, target) * Math.min(1, dt * PLAYER.turnRate);
    p.phase += speed * dt * 1.9;
    animateWalk(p.h, p.phase, sprint ? 1.2 : 0.85);
  } else {
    resetPose(p.h);
  }
  p.mesh.rotation.y = p.facing;

  // Jumping: a simple arc, no platforms to land on but the ground itself.
  if ((input.wasPressed('Space')) && p.grounded) {
    p.vy = PLAYER.jumpSpeed;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy -= PLAYER.gravity * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      p.vy = 0;
      p.grounded = true;
    }
  }

  // Punching: a click or F, with a short wind-up and a real reach check.
  const wantsPunch = (input.clicked && input.pointerLocked) || input.wasPressed('KeyF');
  if (wantsPunch && p.punchCooldown <= 0) {
    p.punchCooldown = 0.42;
    p.punchTimer = 0.22;
    game.audio.punch();
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    let hitSomething = false;
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - p.pos.x;
      const dz = ped.pos.z - p.pos.z;
      if (dx * dx + dz * dz > PLAYER.punchRange * PLAYER.punchRange) continue;
      if (dx * fx + dz * fz < 0.1) continue;
      if (ped.knockDown(game)) {
        game.onCrime('punchPed', ped.pos.x, ped.pos.z);
        hitSomething = true;
      }
    }
    for (const car of game.cars) {
      if (car.dead) continue;
      const dx = car.pos.x - p.pos.x;
      const dz = car.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 3.1 * 3.1) continue;
      car.damage(5);
      game.audio.thud(0.5);
      game.onCrime('punchCar', car.pos.x, car.pos.z);
      hitSomething = true;
    }
    if (hitSomething) game.audio.thud(0.7);
  }
  if (p.punchTimer > 0) {
    p.h.armR.rotation.x = -1.9 * Math.sin((p.punchTimer / 0.22) * Math.PI);
  } else if (!moving) {
    p.h.armR.rotation.x = 0;
  }

  resolveCollisions(p.pos, 0.55, game.colliders);
}
