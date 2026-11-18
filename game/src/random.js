// A tiny seeded random number generator (mulberry32) plus helpers, so the
// city is laid out the same way on every visit and every machine.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** An integer in [min, max], both ends included. */
export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/** One element of a non-empty array. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** The shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Squared distance between two points on the ground plane. */
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}
