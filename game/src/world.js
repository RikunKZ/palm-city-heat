// The city of Palm City, built procedurally: a ground canvas painted with
// roads, crosswalks and the boardwalk; towers with canvas facades; palms,
// lamps, a beach and sea; and the named places with their signs. Buildings
// register axis-aligned colliders that every mover in the game respects.
import * as THREE from 'three';
import { ROAD_LINES, ROAD_HALF, WORLD_HALF, PROMENADE_X, SAND_X, SEA_X, PLACES } from './config.js';
import { randRange, randInt, pick, clamp } from './random.js';

const WORLD_SPAN = 616; // the ground canvas covers -308..308 on both axes

function makeGroundTexture() {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const scale = S / WORLD_SPAN;
  const toPx = (v) => (v + WORLD_SPAN / 2) * scale;

  ctx.fillStyle = '#83898c'; // pavement everywhere first
  ctx.fillRect(0, 0, S, S);

  // Block interiors get a warmer paving tone so the grid reads at a glance.
  ctx.fillStyle = '#7c8078';
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x1 = ROAD_LINES[i] + ROAD_HALF;
      const x2 = ROAD_LINES[i + 1] - ROAD_HALF;
      const z1 = ROAD_LINES[j] + ROAD_HALF;
      const z2 = ROAD_LINES[j + 1] - ROAD_HALF;
      ctx.fillRect(toPx(x1), toPx(z1), (x2 - x1) * scale, (z2 - z1) * scale);
    }
  }

  // The east edge: boardwalk planks, then sand to the waterline.
  ctx.fillStyle = '#b59a6d';
  ctx.fillRect(toPx(PROMENADE_X), 0, (SAND_X - PROMENADE_X) * scale, S);
  ctx.fillStyle = 'rgba(96,74,44,0.4)';
  for (let z = -WORLD_SPAN / 2; z < WORLD_SPAN / 2; z += 4) {
    ctx.fillRect(toPx(PROMENADE_X), toPx(z), (SAND_X - PROMENADE_X) * scale, 1.4);
  }
  ctx.fillStyle = '#e6cf9c';
  ctx.fillRect(toPx(SAND_X), 0, (WORLD_SPAN / 2 - SAND_X) * scale, S);

  // Asphalt: a band along every road line, both ways.
  ctx.fillStyle = '#33373c';
  for (const line of ROAD_LINES) {
    ctx.fillRect(toPx(line - ROAD_HALF), 0, ROAD_HALF * 2 * scale, S);
    ctx.fillRect(0, toPx(line - ROAD_HALF), S, ROAD_HALF * 2 * scale);
  }

  // Kerb lines.
  ctx.fillStyle = 'rgba(230,230,225,0.5)';
  for (const line of ROAD_LINES) {
    for (const off of [-ROAD_HALF + 0.7, ROAD_HALF - 0.7]) {
      ctx.fillRect(toPx(line + off) - 1, 0, 2, S);
      ctx.fillRect(0, toPx(line + off) - 1, S, 2);
    }
  }

  // Centre dashes, broken at intersections.
  ctx.fillStyle = '#d8a723';
  const dash = (x, z, w, d) => ctx.fillRect(toPx(x), toPx(z), w * scale, d * scale);
  for (const line of ROAD_LINES) {
    for (let t = -WORLD_HALF - 12; t < WORLD_HALF + 12; t += 12) {
      if (ROAD_LINES.some((l) => Math.abs(t - l) < ROAD_HALF + 4)) continue;
      dash(line - 0.35, t, 0.7, 5.5);
      dash(t, line - 0.35, 5.5, 0.7);
    }
  }

  // Crosswalks: zebra stripes on all four approaches of every junction.
  ctx.fillStyle = 'rgba(238,238,238,0.8)';
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      for (const side of [-1, 1]) {
        for (let s = -7; s <= 7; s += 3.5) {
          ctx.fillRect(toPx(lx + s - 1), toPx(lz + side * (ROAD_HALF + 1.2) - 1.4), 2 * scale, 2.8 * scale);
          ctx.fillRect(toPx(lx + side * (ROAD_HALF + 1.2) - 1.4), toPx(lz + s - 1), 2.8 * scale, 2 * scale);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const FACADE_PALETTES = [
  { wall: '#b8ab9c', win: '#3c4c5c', lit: '#ffd98a' },
  { wall: '#9fb2bd', win: '#33424f', lit: '#ffe9a8' },
  { wall: '#c4b299', win: '#46525e', lit: '#ffd98a' },
  { wall: '#a8a29a', win: '#39434e', lit: '#fff0b3' },
  { wall: '#bfae94', win: '#414c58', lit: '#ffd98a' },
  { wall: '#93a8b5', win: '#2f3e4c', lit: '#ffe9a8' },
];

function makeFacadeTexture(rng, palette) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.wall;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < 0.28;
      ctx.fillStyle = lit ? palette.lit : palette.win;
      ctx.fillRect(c * cw + 3, r * ch + 4, cw - 6, ch - 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

function makeSign(text, colorHex, w = 9) {
  const bg = `#${colorHex.toString(16).padStart(6, '0')}`;
  const tex = makeSignTexture(text.toUpperCase(), bg);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  return sign;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 5.6, 6), trunkMat);
  trunk.position.y = 2.8;
  trunk.rotation.z = randRange(rng, -0.09, 0.09);
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e8e4f, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.55), leafMat);
    const a = (i / 6) * Math.PI * 2 + rng() * 0.5;
    frond.position.set(Math.cos(a) * 1.35, 5.85, Math.sin(a) * 1.35);
    frond.rotation.set(-1.0, a, 0, 'YXZ');
    palm.add(frond);
  }
  return palm;
}

// ---------------------------------------------------------------- places

function buildPlace(kind, place) {
  const g = new THREE.Group();
  g.position.set(place.x, 0, place.z);
  const c = place.color;
  if (kind === 'rosa') {
    g.add(box(6, 2.4, 3.2, 0xa03c28, 0, 1.2, 0)); // counter block
    g.add(box(7, 0.25, 4.6, 0xe8ddc8, 0, 3.05, 0)); // awning
    const sign = makeSign("Rosa's Noodles", c, 7.5);
    sign.position.set(0, 4.1, 0);
    g.add(sign);
    g.add(box(0.25, 3, 0.25, 0x5a4632, -3.2, 1.5, -1.9));
    g.add(box(0.25, 3, 0.25, 0x5a4632, 3.2, 1.5, -1.9));
  } else if (kind === 'benny') {
    g.add(box(13, 5, 9, 0x707880, 0, 2.5, 0));
    g.add(box(13.6, 0.5, 9.6, 0x3c4147, 0, 5.2, 0));
    g.add(box(4.5, 3.4, 0.3, 0x22262b, -3.4, 1.7, 4.6)); // roller doors
    g.add(box(4.5, 3.4, 0.3, 0x22262b, 3.4, 1.7, 4.6));
    const sign = makeSign("Benny's Auto", c, 11);
    sign.position.set(0, 6.4, 0);
    g.add(sign);
  } else if (kind === 'market') {
    const awnings = [0xd84f35, 0x3f9e8f, 0xe0a51e];
    for (let i = -1; i <= 1; i++) {
      g.add(box(4.6, 2.1, 3.4, 0x8a6f52, i * 5.6, 1.05, 0));
      const awn = box(5.4, 0.2, 4.2, awnings[i + 1], i * 5.6, 2.7, 0);
      awn.rotation.x = 0.16;
      g.add(awn);
    }
    const sign = makeSign('Night Market', c, 10);
    sign.position.set(0, 4.6, 0);
    g.add(sign);
  } else if (kind === 'police') {
    g.add(box(15, 8, 10, 0x5d7186, 0, 4, 0));
    g.add(box(15.6, 0.6, 10.6, 0x2b4d9b, 0, 8.3, 0));
    const sign = makeSign('Police', c, 10);
    sign.position.set(0, 9.6, 0);
    g.add(sign);
    g.add(box(0.18, 7, 0.18, 0xcccccc, 6, 3.5, 6)); // flag pole
    g.add(box(1.8, 1.1, 0.06, 0x2b4d9b, 6.9, 6.4, 6));
  } else if (kind === 'hospital') {
    g.add(box(14, 11, 10, 0xe8e8e6, 0, 5.5, 0));
    const sign = makeSign('Hospital', 0xc23b2e, 10);
    sign.position.set(0, 12.4, 0);
    g.add(sign);
    g.add(box(2.6, 0.5, 0.5, 0xc23b2e, 0, 10.2, 5.1)); // the cross
    g.add(box(0.5, 2.6, 0.5, 0xc23b2e, 0, 10.2, 5.1));
  } else if (kind === 'hotel') {
    g.add(box(12, 17, 9, 0xd9c491, 0, 8.5, 0));
    g.add(box(12.6, 0.6, 9.6, 0x8a6f3c, 0, 17.3, 0));
    const sign = makeSign('Hotel Solana', c, 11);
    sign.position.set(0, 18.8, 0);
    g.add(sign);
  } else if (kind === 'mall') {
    g.add(box(17, 7, 11, 0x9fc4bd, 0, 3.5, 0));
    g.add(box(17.6, 0.6, 11.6, 0x3f9e8f, 0, 7.3, 0));
    const sign = makeSign('Coral Mall', c, 12);
    sign.position.set(0, 8.8, 0);
    g.add(sign);
  } else if (kind === 'hideout') {
    g.add(box(13, 6, 10, 0x8a5f43, 0, 3, 0));
    g.add(box(13.6, 0.5, 10.6, 0x5d4433, 0, 6.2, 0));
    const sign = makeSign('Old Cannery', c, 10);
    sign.position.set(0, 7.4, 0);
    g.add(sign);
  } else if (kind === 'pier') {
    const deck = box(34, 0.5, 7, 0x9a7c58, 14, 0.45, 0);
    g.add(deck);
    for (let i = 0; i < 5; i++) g.add(box(0.4, 1.4, 0.4, 0x6e5638, -1 + i * 8, -0.2, 3.2));
    const sign = makeSign('Palm Pier', c, 8);
    sign.position.set(-2, 3.4, 0);
    g.add(sign);
    g.add(box(0.25, 3.2, 0.25, 0x5a4632, -2, 1.6, -1.6));
    g.add(box(0.25, 3.2, 0.25, 0x5a4632, -2, 1.6, 1.6));
  } else if (kind === 'beach') {
    for (let i = 0; i < 3; i++) {
      const umb = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 0.8, 8),
        new THREE.MeshLambertMaterial({ color: [0xd84f35, 0x2e7fb8, 0xe0a51e][i] }),
      );
      umb.position.set(-4 + i * 5, 2.2, -3 + (i % 2) * 5);
      g.add(umb);
      g.add(box(0.12, 2.2, 0.12, 0xdddddd, -4 + i * 5, 1.1, -3 + (i % 2) * 5));
    }
    const sign = makeSign('Solana Beach', 0x2e7fb8, 9);
    sign.position.set(0, 3.6, 4);
    g.add(sign);
  }
  return g;
}

// Footprints (half extents) of the solid place structures, for colliders.
const PLACE_SOLID = {
  benny: [6.5, 4.5],
  police: [7.5, 5],
  hospital: [7, 5],
  hotel: [6, 4.5],
  mall: [8.5, 5.5],
  hideout: [6.5, 5],
  rosa: [3, 1.6],
};

// ---------------------------------------------------------------- the build

export function buildWorld(scene, rng) {
  const colliders = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SPAN, WORLD_SPAN),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // The sea: a broad plane east of the waterline, and the wet sand under it.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(430, WORLD_SPAN + 120),
    new THREE.MeshLambertMaterial({ color: 0x2f7fb4, transparent: true, opacity: 0.92 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SEA_X + 215, -0.35, 0);
  scene.add(sea);
  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(460, WORLD_SPAN + 120),
    new THREE.MeshLambertMaterial({ color: 0xd9bd85 }),
  );
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.set(SEA_X + 215, -0.7, 0);
  scene.add(seabed);

  // Towers on the blocks. A block holding a named place stays a plaza.
  const facades = FACADE_PALETTES.map((p) => makeFacadeTexture(rng, p));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4c4c });
  const placePoints = Object.values(PLACES);
  for (let i = 0; i < ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < ROAD_LINES.length - 1; j++) {
      const x1 = ROAD_LINES[i] + ROAD_HALF + 3;
      const x2 = ROAD_LINES[i + 1] - ROAD_HALF - 3;
      const z1 = ROAD_LINES[j] + ROAD_HALF + 3;
      const z2 = ROAD_LINES[j + 1] - ROAD_HALF - 3;
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      if (placePoints.some((p) => Math.abs(p.x - cx) < 34 && Math.abs(p.z - cz) < 34)) continue;
      const layout = rng();
      const spots =
        layout < 0.42
          ? [{ x: cx, z: cz, w: randRange(rng, 24, 34), d: randRange(rng, 24, 34), h: randRange(rng, 26, 54) }]
          : [
              { x: cx - 13, z: cz - 13, w: 20, d: 20, h: randRange(rng, 13, 30) },
              { x: cx + 13, z: cz + 13, w: 20, d: 20, h: randRange(rng, 13, 34) },
              ...(rng() < 0.6 ? [{ x: cx + 13, z: cz - 13, w: 20, d: 20, h: randRange(rng, 10, 22) }] : []),
            ];
      for (const s of spots) {
        const mat = new THREE.MeshLambertMaterial({ map: pick(rng, facades) });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), [mat, mat, roofMat, roofMat, mat, mat]);
        tower.position.set(s.x, s.h / 2, s.z);
        scene.add(tower);
        colliders.push({ x1: s.x - s.w / 2, z1: s.z - s.d / 2, x2: s.x + s.w / 2, z2: s.z + s.d / 2 });
      }
    }
  }

  // The named places and their signs.
  for (const [kind, place] of Object.entries(PLACES)) {
    scene.add(buildPlace(kind, place));
    const solid = PLACE_SOLID[kind];
    if (solid) {
      colliders.push({ x1: place.x - solid[0], z1: place.z - solid[1], x2: place.x + solid[0], z2: place.z + solid[1] });
    }
  }

  // Palms along the promenade and dotted through the city.
  for (let z = -238; z <= 238; z += 22) {
    if (Math.abs(z - PLACES.pier.z) < 12) continue;
    const palm = makePalm(rng);
    palm.position.set(247.5, 0, z + randRange(rng, -3, 3));
    scene.add(palm);
  }
  for (let i = 0; i < 26; i++) {
    const palm = makePalm(rng);
    const lx = pick(rng, ROAD_LINES) + (rng() < 0.5 ? -11.5 : 11.5);
    const lz = randRange(rng, -238, 238);
    palm.position.set(lx, 0, lz);
    scene.add(palm);
  }

  // Street lamps, instanced: a pole and a glowing head every 36 units.
  const lampPositions = [];
  for (const line of ROAD_LINES) {
    for (let t = -234; t <= 234; t += 36) {
      lampPositions.push([line - ROAD_HALF - 1.1, t + 18]);
      lampPositions.push([line + ROAD_HALF + 1.1, t]);
      lampPositions.push([t + 18, line - ROAD_HALF - 1.1]);
      lampPositions.push([t, line + ROAD_HALF + 1.1]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 4.8, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const headGeo = new THREE.SphereGeometry(0.3, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach(([x, z], idx) => {
    m4.makeTranslation(x, 2.4, z);
    poles.setMatrixAt(idx, m4);
    m4.makeTranslation(x, 4.9, z);
    heads.setMatrixAt(idx, m4);
  });
  scene.add(poles);
  scene.add(heads);

  return { colliders, sea };
}

// ---------------------------------------------------------------- helpers

/** True when a point is on a road (either axis), kerb included. */
export function isOnRoad(x, z) {
  return ROAD_LINES.some((l) => Math.abs(x - l) <= ROAD_HALF + 0.6 || Math.abs(z - l) <= ROAD_HALF + 0.6);
}

/** A random point on the road network, at least minDist from (cx, cz). */
export function randomRoadPoint(rng, cx, cz, minDist) {
  for (let tries = 0; tries < 30; tries++) {
    const along = randRange(rng, -240, 240);
    const line = pick(rng, ROAD_LINES);
    const p = rng() < 0.5 ? { x: line, z: along } : { x: along, z: line };
    const dx = p.x - cx;
    const dz = p.z - cz;
    if (dx * dx + dz * dz >= minDist * minDist) return p;
  }
  return { x: 0, z: 0 };
}

/** Push a circle (pos, radius) out of every building collider it overlaps. */
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.x1, c.x2);
    const nz = clamp(pos.z, c.z1, c.z2);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest wall.
      const left = pos.x - c.x1;
      const right = c.x2 - pos.x;
      const top = pos.z - c.z1;
      const bottom = c.z2 - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = c.x1 - radius;
      else if (min === right) pos.x = c.x2 + radius;
      else if (min === top) pos.z = c.z1 - radius;
      else pos.z = c.z2 + radius;
    }
  }
  // The sea is not for walking or driving: keep everyone west of the waterline.
  if (pos.x > SEA_X - 1) pos.x = SEA_X - 1;
  if (pos.x < -WORLD_HALF - 14) pos.x = -WORLD_HALF - 14;
  if (pos.z > WORLD_HALF + 14) pos.z = WORLD_HALF + 14;
  if (pos.z < -WORLD_HALF - 14) pos.z = -WORLD_HALF - 14;
}
