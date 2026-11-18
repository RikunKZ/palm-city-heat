// world.js — builds Palm City itself: the road grid painted onto one big
// ground texture, procedural tower facades, city blocks, palms, lamps, the
// beach and the water, plus the named places the story visits. It also owns
// collision: every building is an AABB the other systems push circles out of.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { makeRng, pick, randRange } from './random.js';

export const PLACES = {
  rosa: { x: 246, z: 18, label: "Rosa's Noodle Harbor" },
  pier: { x: 258, z: -60, label: 'Palm Pier' },
  market: { x: -148, z: -148, label: 'Night Market' },
  benny: { x: -148, z: 76, label: "Benny's Auto Works" },
  police: { x: 76, z: -76, label: 'Palm City Police' },
  hospital: { x: -76, z: 76, label: 'Palma General Hospital' },
  hotel: { x: 212, z: 76, label: 'Hotel Solana' },
  hideout: { x: -246, z: -246, label: "Reno's Hideout" },
  mall: { x: 76, z: 148, label: 'Coral Mall' },
  beach: { x: 250, z: 150, label: 'Palm Beach' },
};

const FACADE_HUES = [0xcfd6da, 0xe8dcc8, 0xb9c8d4, 0xdcc4ae, 0xc4d2c0, 0xe3e6ea];

function makeFacadeTexture(rng, baseHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 128, 256);
  // subtle vertical shading so flat walls still read as surfaces
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.16)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  // window grid; a few windows glow warm, most reflect the sky
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = rng() < 0.16;
      ctx.fillStyle = lit ? '#ffd98a' : rng() < 0.5 ? '#5d7484' : '#718794';
      ctx.fillRect(8 + col * 20, 10 + row * 15, 12, 9);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = fg;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  // one 2048px canvas painted with the whole street plan: roads, dashes,
  // crosswalks, sidewalks and block interiors, mapped over the city square
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const world = CITY.half * 2 + 56; // texture spans a little past the last road
  const toPx = (v) => ((v + world / 2) / world) * S;
  const scale = S / world;

  ctx.fillStyle = '#8f9597';
  ctx.fillRect(0, 0, S, S); // sidewalk base everywhere

  // block interiors: alternating pavement and plaza tones
  const rng = makeRng(777);
  for (let i = 0; i < CITY.lines.length - 1; i++) {
    for (let j = 0; j < CITY.lines.length - 1; j++) {
      const x0 = CITY.lines[i] + CITY.roadHalf;
      const x1 = CITY.lines[i + 1] - CITY.roadHalf;
      const z0 = CITY.lines[j] + CITY.roadHalf;
      const z1 = CITY.lines[j + 1] - CITY.roadHalf;
      ctx.fillStyle = pick(rng, ['#a7a49b', '#9aa78f', '#a49a8c', '#98a2a8']);
      ctx.fillRect(toPx(x0), toPx(z0), (x1 - x0) * scale, (z1 - z0) * scale);
    }
  }

  // roads
  ctx.fillStyle = '#33373d';
  for (const c of CITY.lines) {
    ctx.fillRect(toPx(c - CITY.roadHalf), 0, CITY.roadHalf * 2 * scale, S);
    ctx.fillRect(0, toPx(c - CITY.roadHalf), S, CITY.roadHalf * 2 * scale);
  }
  // centre dashes
  ctx.fillStyle = '#e8c85a';
  for (const c of CITY.lines) {
    for (let d = -world / 2; d < world / 2; d += 9) {
      ctx.fillRect(toPx(c) - 1, toPx(d), 2, 4.5 * scale);
      ctx.fillRect(toPx(d), toPx(c) - 1, 4.5 * scale, 2);
    }
  }
  // crosswalks at intersections
  ctx.fillStyle = 'rgba(240,240,240,0.75)';  for (const x of CITY.lines) {
    for (const z of CITY.lines) {
      for (let s = -3; s <= 3; s++) {
        ctx.fillRect(toPx(x + s * 2) - 1, toPx(z - CITY.roadHalf) - 2, 2, 4);
        ctx.fillRect(toPx(x + s * 2) - 1, toPx(z + CITY.roadHalf) - 2, 2, 4);
        ctx.fillRect(toPx(x - CITY.roadHalf) - 2, toPx(z + s * 2) - 1, 4, 2);
        ctx.fillRect(toPx(x + CITY.roadHalf) - 2, toPx(z + s * 2) - 1, 4, 2);
      }
    }
  }
  // the east promenade: a boardwalk band between the last road and the sand
  ctx.fillStyle = '#b09a72';
  ctx.fillRect(toPx(226), 0, (262 - 226) * scale, S);
  ctx.fillStyle = 'rgba(90,70,40,0.35)';
  for (let d = -world / 2; d < world / 2; d += 4) {
    ctx.fillRect(toPx(226), toPx(d), (262 - 226) * scale, 1.5);
  }
  ctx.fillStyle = '#e3cf9e';
  ctx.fillRect(toPx(262), 0, (world / 2 - 262) * scale, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, world };
}

function makePalm(rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide });
  const lean = randRange(rng, -0.12, 0.12);
  let x = 0;
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 1.6, 6), trunkMat);
    x += lean * 1.6 * i * 0.4;
    y += 1.45;
    seg.position.set(x, y, 0);
    seg.rotation.z = lean;
    group.add(seg);
  }
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5), leafMat);
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(x + Math.cos(a) * 1.3, y + 0.75, Math.sin(a) * 1.3);
    frond.rotation.set(-1.02, a, 0, 'YXZ');
    group.add(frond);
  }
  return group;
}

export function buildWorld(scene) {
  const rng = makeRng(20261117);
  const world = {
    colliders: [],
    water: null,
    lampHeads: [],
    time: 0,
  };

  // sky light: warm late-afternoon sun plus soft ambient bounce
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x77694f, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.6);
  sun.position.set(-140, 190, 80);
  scene.add(sun);
  scene.add(sun.target);
  world.sun = sun;

  // sand everywhere underneath, then the painted city slab on top
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  scene.add(sand);

  const { tex, world: span } = makeGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span, span),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // the sea: a big animated plane east of the beach
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 1600),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY.beachX + 330, -0.35, 0);
  scene.add(water);
  world.water = water;

  // buildings: one or four per block, facades from the canvas variants
  const facades = FACADE_HUES.map((h) => makeFacadeTexture(rng, h));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4f52 });
  const facadeMats = facades.map(
    (t) => new THREE.MeshLambertMaterial({ map: t }),
  );
  const boxGeoCache = new Map();
  const boxGeo = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };
  const addBuilding = (cx, cz, w, h, d) => {
    const mat = pick(rng, facadeMats);
    const mesh = new THREE.Mesh(boxGeo(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    world.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  };

  const landmarkBlocks = new Set(['3,2', '2,4', '4,4', '1,4', '4,1']); // kept clear-ish for named places
  for (let i = 0; i < CITY.lines.length - 1; i++) {
    for (let j = 0; j < CITY.lines.length - 1; j++) {
      const x0 = CITY.lines[i] + CITY.roadHalf + 5;
      const x1 = CITY.lines[i + 1] - CITY.roadHalf - 5;
      const z0 = CITY.lines[j] + CITY.roadHalf + 5;
      const z1 = CITY.lines[j + 1] - CITY.roadHalf - 5;
      const bw = x1 - x0;
      const bd = z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const key = `${i},${j}`;
      if (landmarkBlocks.has(key)) {
        addBuilding(cx, cz, bw * 0.62, randRange(rng, 16, 26), bd * 0.62);
        continue;
      }
      const pattern = rng();
      if (pattern < 0.42) {
        addBuilding(cx, cz, bw * randRange(rng, 0.55, 0.8), randRange(rng, 26, 88), bd * randRange(rng, 0.55, 0.8));
      } else if (pattern < 0.78) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addBuilding(
              cx + (sx * bw) / 4.4,
              cz + (sz * bd) / 4.4,
              bw * 0.34,
              randRange(rng, 12, 42),
              bd * 0.34,
            );
          }
        }
      } else {
        addBuilding(cx - bw / 5, cz, bw * 0.36, randRange(rng, 18, 55), bd * 0.7);
        addBuilding(cx + bw / 5, cz, bw * 0.36, randRange(rng, 18, 55), bd * 0.7);
      }
    }
  }

  // named-place dressing: signs the player can navigate by
  const addSign = (place, text, bg, fg, y = 7) => {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 2.8),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg), side: THREE.DoubleSide }),
    );
    sign.position.set(place.x - 14, y, place.z);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);
  };
  addSign(PLACES.police, 'POLICE', '#1d3fbf', '#ffffff');
  addSign(PLACES.hospital, 'HOSPITAL', '#e8e8e8', '#c02727');
  addSign(PLACES.hotel, 'HOTEL SOLANA', '#123a4d', '#ffd98a', 16);
  addSign(PLACES.benny, "BENNY'S AUTO", '#2b2b2b', '#ffb84d');
  addSign(PLACES.mall, 'CORAL MALL', '#7a2d5e', '#ffffff', 10);

  // Rosa's stall: a striped kiosk on the promenade
  const stall = new THREE.Group();
  const stallBody = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.6, 3.4),
    new THREE.MeshLambertMaterial({ color: 0xc94f38 }),
  );
  stallBody.position.y = 1.3;
  stall.add(stallBody);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.25, 4.6),
    new THREE.MeshLambertMaterial({ color: 0xf3e3c2 }),
  );
  awning.position.y = 3.1;
  awning.rotation.z = 0.08;
  stall.add(awning);
  stall.position.set(PLACES.rosa.x, 0, PLACES.rosa.z);
  scene.add(stall);
  world.colliders.push({ minX: PLACES.rosa.x - 3, maxX: PLACES.rosa.x + 3, minZ: PLACES.rosa.z - 1.7, maxZ: PLACES.rosa.z + 1.7 });
  const rosaSign = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1.5),
    new THREE.MeshBasicMaterial({ map: makeSignTexture("ROSA'S NOODLES", '#c94f38', '#fff6e0'), side: THREE.DoubleSide }),
  );
  rosaSign.position.set(PLACES.rosa.x - 3.6, 3.4, PLACES.rosa.z);
  rosaSign.rotation.y = -Math.PI / 2;
  scene.add(rosaSign);

  // palms along the beach and scattered on sidewalks; lamps at intersections
  for (let z = -240; z <= 240; z += 24) {
    const palm = makePalm(rng);
    palm.position.set(CITY.beachX - randRange(rng, 2, 10), 0, z + randRange(rng, -5, 5));
    scene.add(palm);
  }
  for (let i = 0; i < 46; i++) {
    const palm = makePalm(rng);
    const bx = pick(rng, CITY.lines) + randRange(rng, 12, 56) * (rng() < 0.5 ? -1 : 1);
    const bz = pick(rng, CITY.lines) + randRange(rng, 12, 56) * (rng() < 0.5 ? -1 : 1);
    palm.position.set(bx, 0, bz);
    scene.add(palm);
  }
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const lampPositions = [];
  for (const x of CITY.lines) {
    for (const z of CITY.lines) {
      lampPositions.push([x + CITY.roadHalf + 1.2, z + CITY.roadHalf + 1.2]);
      lampPositions.push([x - CITY.roadHalf - 1.2, z - CITY.roadHalf - 1.2]);
    }
  }
  const poles = new THREE.InstancedMesh(lampPoleGeo, lampPoleMat, lampPositions.length);
  const heads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach(([x, z], idx) => {
    m4.makeTranslation(x, 2.7, z);
    poles.setMatrixAt(idx, m4);
    m4.makeTranslation(x, 5.5, z);
    heads.setMatrixAt(idx, m4);
  });
  scene.add(poles);
  scene.add(heads);

  world.update = (dt, t) => {
    world.time = t;
    if (world.water) {
      world.water.position.y = -0.35 + Math.sin(t * 0.7) * 0.08;
    }
    // keep the sun (and its light) centred on the action
    if (world.followTarget) {
      const p = world.followTarget;
      sun.position.set(p.x - 140, 190, p.z + 80);
      sun.target.position.set(p.x, 0, p.z);
    }
  };

  return world;
}

// push a circle (x, z, radius) out of every building AABB; mutates pos
export function collideCircle(world, pos, radius) {
  for (const c of world.colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: leave by the shortest side
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const top = pos.z - c.minZ;
        const bottom = c.maxZ - pos.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = c.minX - radius;
        else if (min === right) pos.x = c.maxX + radius;
        else if (min === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  // world bounds: the sea is not for walking, the map edge is a wall
  pos.x = Math.max(-CITY.half - 6, Math.min(pos.x, CITY.beachX + 14));
  pos.z = Math.max(-CITY.half - 6, Math.min(pos.z, CITY.half + 6));
}

export function isOnRoad(x, z) {
  const near = (v) => CITY.lines.some((c) => Math.abs(v - c) < CITY.roadHalf);
  return near(x) || near(z);
}

// a random point on a random road, at least `minDist` from (x, z) if given
export function randomRoadPoint(rng, x = 0, z = 0, minDist = 0) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng() < 0.5;
    const line = pick(rng, CITY.lines);
    const along = randRange(rng, -CITY.half, CITY.half);
    const px = vertical ? line : along;
    const pz = vertical ? along : line;
    const dx = px - x;
    const dz = pz - z;
    if (Math.sqrt(dx * dx + dz * dz) >= minDist) return { x: px, z: pz };
  }
  return { x: 0, z: 0 };
}

export function randomSidewalkPoint(rng) {
  const bx = pick(rng, CITY.lines) + (CITY.roadHalf + randRange(rng, 1.5, 5)) * (rng() < 0.5 ? -1 : 1);
  const bz = randRange(rng, -CITY.half, CITY.half);
  return rng() < 0.5 ? { x: bx, z: bz } : { x: bz, z: bx };
}
