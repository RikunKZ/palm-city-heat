// Palm City Heat — builds the city: one painted ground canvas (roads,
// sidewalks, crosswalks, sand, boardwalk), canvas-facade towers on every
// block, signed storefronts for the named places, palms, lamps, the pier
// and the sea. Exports the building colliders and a circle-vs-box resolver
// every moving thing uses.

import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF, SIDEWALK, PLACES, SAND_X, BOARDWALK_X } from './config.js';
import { makeRng, pick, range, chance } from './rng.js';
import { mergeBoxes, plainBoxMaterial } from './merge.js';

const WORLD = 900; // ground plane size in metres

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** World metres -> ground-canvas pixels. */
const px = (m) => ((m + WORLD / 2) / WORLD) * 2048;

function paintGround(ctx) {
  ctx.fillStyle = '#77806b';
  ctx.fillRect(0, 0, 2048, 2048);
  // Block interiors get a faint checker of pavement tones.
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < 64; i += 2) for (let j = 0; j < 64; j++) {
    if ((i + j) % 2 === 0) ctx.fillRect(i * 32, j * 32, 32, 32);
  }
  // Sand down the east side, then the boardwalk strip on top of it.
  ctx.fillStyle = '#e6cf9a';
  ctx.fillRect(px(SAND_X - 26), 0, 2048 - px(SAND_X - 26), 2048);
  ctx.fillStyle = '#a9805a';
  ctx.fillRect(px(BOARDWALK_X - 8), 0, px(BOARDWALK_X + 8) - px(BOARDWALK_X - 8), 2048);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let z = -450; z < 450; z += 6) ctx.fillRect(px(BOARDWALK_X - 8), px(z), px(BOARDWALK_X + 8) - px(BOARDWALK_X - 8), 2);
  // Sidewalks (drawn as a halo under each road), then the asphalt.
  const walk = ROAD_HALF + SIDEWALK;
  for (const L of ROAD_LINES) {
    ctx.fillStyle = '#b3ae9f';
    ctx.fillRect(px(L - walk), 0, px(L + walk) - px(L - walk), 2048);
    ctx.fillRect(0, px(L - walk), 2048, px(L + walk) - px(L - walk));
  }
  for (const L of ROAD_LINES) {
    ctx.fillStyle = '#33373d';
    ctx.fillRect(px(L - ROAD_HALF), 0, px(L + ROAD_HALF) - px(L - ROAD_HALF), 2048);
    ctx.fillRect(0, px(L - ROAD_HALF), 2048, px(L + ROAD_HALF) - px(L - ROAD_HALF));
  }
  // Dashed centre lines.
  ctx.fillStyle = '#e8e4c8';
  for (const L of ROAD_LINES) {
    for (let m = -450; m < 450; m += 12) {
      ctx.fillRect(px(L) - 1, px(m), 2, px(m + 6) - px(m));
      ctx.fillRect(px(m), px(L) - 1, px(m + 6) - px(m), 2);
    }
  }
  // Crosswalk zebras on each intersection approach.
  ctx.fillStyle = 'rgba(240,240,235,0.75)';
  for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
    for (let s = -5; s <= 5; s += 2.5) {
      ctx.fillRect(px(x + s - 0.8), px(z - ROAD_HALF - 3), px(x + s + 0.8) - px(x + s - 0.8), px(z - ROAD_HALF) - px(z - ROAD_HALF - 3));
      ctx.fillRect(px(x + s - 0.8), px(z + ROAD_HALF), px(x + s + 0.8) - px(x + s - 0.8), px(z + ROAD_HALF + 3) - px(z + ROAD_HALF));
      ctx.fillRect(px(x - ROAD_HALF - 3), px(z + s - 0.8), px(x - ROAD_HALF) - px(x - ROAD_HALF - 3), px(z + s + 0.8) - px(z + s - 0.8));
      ctx.fillRect(px(x + ROAD_HALF), px(z + s - 0.8), px(x + ROAD_HALF + 3) - px(x + ROAD_HALF), px(z + s + 0.8) - px(z + s - 0.8));
    }
  }
}

function facadeTexture(rng, base, trim) {
  return canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillRect(0, 246, 128, 10);
    for (let y = 22; y < 240; y += 24) {
      for (let x = 12; x < 116; x += 24) {
        const lit = rng() < 0.28;
        ctx.fillStyle = lit ? '#ffd98a' : 'rgba(16,24,40,0.85)';
        ctx.fillRect(x, y, 15, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x, y, 15, 4);
      }
    }
  });
}

function signTexture(place) {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#ffb340';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 52px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(place.name.toUpperCase(), 256, 66);
  });
}

export function buildWorld(scene) {
  const rng = makeRng(20261119);
  const colliders = [];

  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 180, 720);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(160, 260, 90);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfdcff, 0x8a7f5c, 1.15));

  // Ground.
  const groundTex = canvasTexture(2048, 2048, paintGround);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Sea: a separate scrolling plane east of the waterline.
  const seaTex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#1d6f9f';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      const y = rng() * 256;
      ctx.moveTo(rng() * 60, y);
      ctx.bezierCurveTo(80, y - 8, 170, y + 8, 256, y - 4);
      ctx.stroke();
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(6, 24);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(360, WORLD),
    new THREE.MeshLambertMaterial({ map: seaTex }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SAND_X + 178, -0.25, 0);
  scene.add(sea);

  // Towers on every block, kept clear of the named places. All of them are
  // merged into a single geometry (one facade texture, per-building tints
  // as vertex colours, roofs tinted dark) so the whole skyline is one draw.
  const facadeTex = facadeTexture(rng, '#e9e3d3', '#b3a68c');
  const tints = [0xd8c6a5, 0xa9c3d4, 0xe0aa68, 0xbdb2d6, 0xd69a86, 0xaec79b, 0xcfd4d9];
  const towerParts = [];
  const placePts = Object.values(PLACES);
  const bounds = [-315, ...ROAD_LINES, 315];
  for (let bi = 0; bi < bounds.length - 1; bi++) {
    for (let bj = 0; bj < bounds.length - 1; bj++) {
      const x0 = bounds[bi] + ROAD_HALF + SIDEWALK + 2, x1 = bounds[bi + 1] - ROAD_HALF - SIDEWALK - 2;
      const z0 = bounds[bj] + ROAD_HALF + SIDEWALK + 2, z1 = bounds[bj + 1] - ROAD_HALF - SIDEWALK - 2;
      if (x1 - x0 < 24 || z1 - z0 < 24) continue;
      const count = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const w = range(rng, 16, Math.min(30, (x1 - x0) / count));
        const d = range(rng, 16, 30);
        const cx = range(rng, x0 + w / 2, x1 - w / 2);
        const cz = range(rng, z0 + d / 2, z1 - d / 2);
        if (placePts.some((p) => Math.abs(p.x - cx) < 30 && Math.abs(p.z - cz) < 30)) continue;
        const h = range(rng, 14, 58) * (rng() < 0.2 ? 1.5 : 1);
        towerParts.push({ w, h, d, x: cx, y: h / 2, z: cz, color: pick(rng, tints), topColor: 0x3a3835 });
        colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
      }
    }
  }
  const towers = new THREE.Mesh(
    mergeBoxes(towerParts),
    new THREE.MeshLambertMaterial({ map: facadeTex, vertexColors: true }),
  );
  scene.add(towers);

  // Named places: a storefront box, an awning in the place's colour, a sign.
  // The boxes join one merged plain-colour mesh; only the signs stand alone.
  const plainParts = [];
  for (const place of Object.values(PLACES)) {
    if (place === PLACES.pier) continue; // the pier is built below
    plainParts.push({ w: 13, h: 5, d: 9, x: place.x, y: 2.5, z: place.z, color: 0xe8e0cf });
    plainParts.push({ w: 13.6, h: 0.5, d: 9.6, x: place.x, y: 5.2, z: place.z, color: place.color });
    plainParts.push({ w: 0.18, h: 4.6, d: 0.18, x: place.x - 4.5, y: 2.3, z: place.z, color: 0x37474f });
    plainParts.push({ w: 0.18, h: 4.6, d: 0.18, x: place.x + 4.5, y: 2.3, z: place.z, color: 0x37474f });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 2.75),
      new THREE.MeshBasicMaterial({ map: signTexture(place), side: THREE.DoubleSide }),
    );
    sign.position.set(place.x, 7.6, place.z);
    scene.add(sign);
    colliders.push({ x0: place.x - 6.5, z0: place.z - 4.5, x1: place.x + 6.5, z1: place.z + 4.5 });
  }

  // The pier: a wooden deck reaching into the sea at the boardwalk.
  plainParts.push({ w: 86, h: 1, d: 11, x: BOARDWALK_X + 42, y: 0.5, z: 0, color: 0x8a6844 });
  scene.add(new THREE.Mesh(mergeBoxes(plainParts), plainBoxMaterial));

  // Palms: instanced trunks and fronds along the boardwalk and sidewalks.
  const palmSpots = [];
  for (let z = -300; z <= 300; z += 30) palmSpots.push([BOARDWALK_X - 12, z + (rng() * 8 - 4)]);
  for (const L of ROAD_LINES) for (let m = -300; m <= 300; m += 75) {
    if (chance(rng, 0.6)) palmSpots.push([L + ROAD_HALF + 2, m + rng() * 10]);
    if (chance(rng, 0.6)) palmSpots.push([m + rng() * 10, L - ROAD_HALF - 2]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6d46 });
  const frondGeo = new THREE.ConeGeometry(2.6, 1.6, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3e9e4f });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  palmSpots.forEach(([x, z], i) => {
    m4.makeRotationZ(range(rng, -0.09, 0.09));
    m4.setPosition(x, 2.7, z);
    trunks.setMatrixAt(i, m4);
    m4.identity();
    m4.setPosition(x, 5.9, z);
    fronds.setMatrixAt(i, m4);
  });
  scene.add(trunks, fronds);

  // Street lamps: instanced poles with emissive heads at intersections.
  const lampSpots = [];
  for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
    lampSpots.push([x + ROAD_HALF + 1.5, z + ROAD_HALF + 1.5], [x - ROAD_HALF - 1.5, z - ROAD_HALF - 1.5]);
  }
  const lampGeo = new THREE.CylinderGeometry(0.07, 0.07, 5.6, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
  const headGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.identity(); m4.setPosition(x, 2.8, z); lamps.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(x, 5.7, z); heads.setMatrixAt(i, m4);
  });
  scene.add(lamps, heads);

  return {
    colliders,
    update(t) {
      seaTex.offset.y = t * 0.008;
      seaTex.offset.x = Math.sin(t * 0.11) * 0.01;
    },
  };
}

/** Push a circle (x, z, radius r) out of every collider box; returns [x, z]. */
export function resolveCollisions(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      z = nz + (dz / d) * r;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = x - c.x0, right = c.x1 - x, top = z - c.z0, bottom = c.z1 - z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = c.x0 - r;
      else if (min === right) x = c.x1 + r;
      else if (min === top) z = c.z0 - r;
      else z = c.z1 + r;
    }
  }
  return [x, z];
}

/** Whether a point is in the sea (past the waterline and off the pier). */
export function inSea(x, z) {
  const onPier = Math.abs(z) < 6.5 && x > BOARDWALK_X;
  return x > SAND_X + 6 && !onPier;
}
