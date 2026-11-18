// The story of Palm City Heat: five missions with their own people and
// dialogue, then honest delivery work forever. Missions are data — steps
// the manager walks the player through with a beacon and an objective line.
import * as THREE from 'three';
import { PLACES } from './config.js';
import { addHeat } from './police.js';
import { makeHumanoid } from './pedestrians.js';
import { Car } from './vehicles.js';

export const GIVERS = {
  rosa: { place: 'rosa', name: 'Rosa', colors: { skin: 0x8a5a3b, shirt: 0xd84f35, pants: 0x2c3550 } },
  benny: { place: 'benny', name: 'Benny', colors: { skin: 0x6e4426, shirt: 0x707880, pants: 0x22262b } },
  ilya: { place: 'pier', name: 'Captain Ilya', colors: { skin: 0xe8b98d, shirt: 0x2e7fb8, pants: 0xd8d8d8 } },
};

export const STORY = [
  {
    id: 'errand',
    title: "Rosa's Errand",
    giver: 'rosa',
    intro: [
      { who: 'Rosa', text: 'Reno! You owe me three weeks of noodles, so today you work.' },
      { who: 'Rosa', text: 'The Night Market has my moon peppers. Fetch them before the lunch crowd and the debt is history.' },
      { who: 'Reno', text: 'Peppers. Life or death stuff. On it.' },
    ],
    steps: [
      { type: 'pickup', at: 'market', r: 4.5, label: 'Pick up the moon peppers at the Night Market' },
      { type: 'return', at: 'rosa', r: 5, label: 'Bring the peppers back to Rosa' },
    ],
    outro: [{ who: 'Rosa', text: 'Still warm. You might be worth the noodles after all.' }],
    reward: { cash: 180, respect: 10 },
  },
  {
    id: 'sunset',
    title: 'Borrowed Sunset',
    giver: 'benny',
    intro: [
      { who: 'Benny', text: 'Reno, I need hands I can half-trust. A Sunset GT sits at Hotel Solana — its owner owes me storage.' },
      { who: 'Benny', text: 'Bring her to my shop. In one piece. Mostly one piece.' },
    ],
    steps: [
      { type: 'enterCar', label: 'Take the Sunset GT at Hotel Solana' },
      { type: 'deliverCar', at: 'benny', r: 8.5, label: "Deliver the Sunset GT to Benny's" },
    ],
    outro: [{ who: 'Benny', text: 'She purrs. Storage is paid — and a little extra for the driver.' }],
    reward: { cash: 260, respect: 15 },
  },
  {
    id: 'bags',
    title: 'Three Bags',
    giver: 'rosa',
    intro: [
      { who: 'Rosa', text: 'Three bags of my money never reached the bank. Long story. Short version: find them.' },
      { who: 'Rosa', text: 'One by the beach umbrellas, one behind the Old Cannery, one in the market alley. Bring them home.' },
    ],
    steps: [
      { type: 'pickup', at: 'beach', r: 4.5, label: 'Find the bag at Solana Beach' },
      { type: 'pickup', at: 'cannery', r: 4.5, label: 'Find the bag behind the Old Cannery' },
      { type: 'pickup', at: 'alley', r: 4.5, label: 'Find the bag in the market alley' },
      { type: 'return', at: 'rosa', r: 5, label: 'Bring the bags back to Rosa' },
    ],
    outro: [{ who: 'Rosa', text: 'Every last note. The city provides, Reno.' }],
    reward: { cash: 340, respect: 20 },
  },
  {
    id: 'cooldown',
    title: 'Cool Down',
    giver: 'rosa',
    intro: [
      { who: 'Rosa', text: 'A detective has been asking questions about my delivery boy. Lose the heat — all of it — and stay lost.' },
      { who: 'Reno', text: 'So, one quiet drive around the block, then.' },
    ],
    steps: [{ type: 'escape', label: 'Lose the police — get your heat to zero', time: 150 }],
    outro: [{ who: 'Rosa', text: 'Nobody saw a thing. As usual.' }],
    reward: { cash: 300, respect: 25 },
  },
  {
    id: 'harbour',
    title: 'Harbour Run',
    giver: 'ilya',
    intro: [
      { who: 'Captain Ilya', text: 'The Harbour Run, Reno. Six lights around the city, then home to my pier before the tide clock runs out.' },
      { who: 'Captain Ilya', text: 'Everyone talks about the run. Almost nobody finishes it.' },
    ],
    steps: [
      {
        type: 'checkpoints',
        label: 'Run the Harbour Run checkpoints',
        time: 170,
        points: [
          { x: 0, z: -216 },
          { x: -216, z: -72 },
          { x: -144, z: 144 },
          { x: 72, z: 216 },
          { x: 216, z: 72 },
          { x: 272, z: -84 },
        ],
      },
    ],
    outro: [{ who: 'Captain Ilya', text: 'Finished — and the car still has all its corners. The harbour respects that.' }],
    reward: { cash: 500, respect: 40 },
  },
];

// Loose points a step can name besides the PLACES keys.
const EXTRA_POINTS = {
  cannery: { x: -196, z: -206 },
  alley: { x: -168, z: -152 },
};

export function stepPoint(step) {
  if (!step.at) return null;
  return PLACES[step.at] || EXTRA_POINTS[step.at] || null;
}

// ---------------------------------------------------------------- manager

export function createMissions(game) {
  const state = {
    active: null, // the mission definition being run
    stepIndex: 0,
    checkpointIndex: 0,
    timer: 0,
    job: null, // { phase: 'pickup'|'deliver', fromKey, toKey, pay }
    sunsetCar: null,
    giverNpcs: {},
  };

  // The beacon: a column of gold light and a ring on the ground.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 24, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 12;
  beacon.visible = false;
  game.scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  game.scene.add(ring);
  state.beacon = beacon;
  state.ring = ring;

  // The thing to fetch: a small green money bag / parcel that bobs and spins.
  const parcel = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.55, 0.72),
    new THREE.MeshLambertMaterial({ color: 0x3f9e4f }),
  );
  parcel.visible = false;
  game.scene.add(parcel);
  state.parcel = parcel;

  // A drive-through ring for the checkpoint run.
  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.24, 10, 26),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d }),
  );
  gate.visible = false;
  game.scene.add(gate);
  state.gate = gate;

  // The givers stand at their places, waiting to be talked to.
  for (const [key, giver] of Object.entries(GIVERS)) {
    const h = makeHumanoid(giver.colors);
    const place = PLACES[giver.place];
    h.group.position.set(place.x + 2.5, 0, place.z + 3.5);
    h.group.rotation.y = Math.PI * 0.8;
    game.scene.add(h.group);
    state.giverNpcs[key] = h;
  }
  return state;
}

export function currentStep(game) {
  const m = game.missions;
  if (!m.active) return null;
  return m.active.steps[m.stepIndex] || null;
}

/** Where the objective points right now: {x, z, label} or null. */
export function currentTarget(game) {
  const m = game.missions;
  const step = currentStep(game);
  if (step) {
    if (step.type === 'escape') return null;
    if (step.type === 'enterCar') {
      return m.sunsetCar ? { x: m.sunsetCar.pos.x, z: m.sunsetCar.pos.z, label: step.label } : null;
    }
    if (step.type === 'checkpoints') {
      const p = step.points[m.checkpointIndex];
      return p ? { x: p.x, z: p.z, label: `${step.label} (${m.checkpointIndex + 1}/${step.points.length})` } : null;
    }
    const p = stepPoint(step);
    return p ? { x: p.x, z: p.z, label: step.label } : null;
  }
  if (m.job) {
    const key = m.job.phase === 'pickup' ? m.job.fromKey : m.job.toKey;
    const p = PLACES[key];
    return { x: p.x, z: p.z, label: m.job.phase === 'pickup' ? `Pick up a package at ${PLACES[key].name}` : `Deliver the package to ${PLACES[key].name}` };
  }
  // Idle: point at whoever has work.
  if (!game.save.storyDone) {
    const def = STORY[game.save.storyIndex];
    if (def) {
      const giver = GIVERS[def.giver];
      const p = PLACES[giver.place];
      return { x: p.x, z: p.z, label: `Go to ${p.name} — "${def.title}"` };
    }
  }
  const p = PLACES.rosa;
  return { x: p.x, z: p.z, label: "Pick up delivery work at Rosa's" };
}

/** The giver the player is close enough to talk to, or null. */
export function nearbyGiver(game) {
  if (game.player.car || game.missions.active) return null;
  const p = game.player.pos;
  for (const [key, giver] of Object.entries(GIVERS)) {
    const place = PLACES[giver.place];
    const dx = p.x - place.x;
    const dz = p.z - place.z;
    if (dx * dx + dz * dz < 5.2 * 5.2) return { key, giver };
  }
  return null;
}

export function startDialog(game, lines, onDone) {
  game.dialog = { lines, index: 0, onDone: onDone || null };
  game.dialogActive = true;
}

export function advanceDialog(game) {
  const d = game.dialog;
  if (!d) return;
  game.audio.blip();
  d.index++;
  if (d.index >= d.lines.length) {
    game.dialog = null;
    game.dialogActive = false;
    if (d.onDone) d.onDone();
  }
}

/** Talk to a giver: start the next story mission, or hand out a job. */
export function talkToGiver(game, giverKey) {
  const m = game.missions;
  if (!game.save.storyDone) {
    const def = STORY[game.save.storyIndex];
    if (def && def.giver === giverKey) {
      startDialog(game, [{ who: 'Mission', text: def.title }, ...def.intro], () => beginMission(game, def));
      return;
    }
  }
  if (giverKey === 'rosa' && game.save.storyDone && !m.job) {
    const keys = Object.keys(PLACES).filter((k) => k !== 'rosa');
    const fromKey = keys[Math.floor(game.rng() * keys.length)];
    let toKey = keys[Math.floor(game.rng() * keys.length)];
    if (toKey === fromKey) toKey = keys[(keys.indexOf(fromKey) + 3) % keys.length];
    const a = PLACES[fromKey];
    const b = PLACES[toKey];
    const pay = Math.round(80 + Math.hypot(a.x - b.x, a.z - b.z) * 0.35);
    startDialog(
      game,
      [{ who: 'Rosa', text: `Package waiting at ${a.name}, bound for ${b.name}. $${pay} if it arrives in one piece.` }],
      () => {
        m.job = { phase: 'pickup', fromKey, toKey, pay };
        game.toast(`Delivery job: $${pay}`);
      },
    );
    return;
  }
  const name = GIVERS[giverKey].name;
  startDialog(game, [{ who: name, text: 'Nothing for you right now, Reno. Rosa keeps the work in this city.' }], null);
}

function beginMission(game, def) {
  const m = game.missions;
  m.active = def;
  m.stepIndex = 0;
  m.checkpointIndex = 0;
  const step = currentStep(game);
  m.timer = step && step.time ? step.time : 0;
  if (def.id === 'sunset') {
    const car = new Car(game.scene, 0xe07b26, 'sport');
    car.place(186, 92, -Math.PI / 2);
    car.role = 'parked';
    m.sunsetCar = car;
    game.cars.push(car);
  }
  if (def.id === 'cooldown') addHeat(game, 150);
  game.toast(`Mission: ${def.title}`);
  game.audio.jingle(true);
}

export function failMission(game, reason) {
  const m = game.missions;
  if (!m.active) return;
  game.toast(reason);
  game.audio.jingle(false);
  if (m.sunsetCar && m.sunsetCar.role === 'parked') {
    m.sunsetCar.dispose(game.scene);
    game.cars.splice(game.cars.indexOf(m.sunsetCar), 1);
  }
  m.sunsetCar = null;
  m.active = null;
  m.stepIndex = 0;
  m.checkpointIndex = 0;
  m.timer = 0;
}

function completeMission(game) {
  const m = game.missions;
  const def = m.active;
  game.cash += def.reward.cash;
  game.respect += def.reward.respect;
  game.save.storyIndex++;
  if (game.save.storyIndex >= STORY.length) game.save.storyDone = true;
  game.saveProgress();
  m.active = null;
  m.stepIndex = 0;
  m.sunsetCar = null;
  game.audio.jingle(true);
  game.toast(`Mission complete: ${def.title} — +$${def.reward.cash}, +${def.reward.respect} respect`);
  if (game.save.storyDone) game.toast('The story is done. Rosa always has delivery work.');
}

function advanceStep(game) {
  const m = game.missions;
  m.stepIndex++;
  m.checkpointIndex = 0;
  const step = currentStep(game);
  if (!step) {
    // The walk is over: the outro plays, then the rewards land.
    const def = m.active;
    startDialog(game, def.outro, () => completeMission(game));
    return;
  }
  m.timer = step.time ? step.time : 0;
  if (step.type === 'escape') addHeat(game, 0); // already hot from the intro
  game.audio.blip();
}

export function updateMissions(game, dt) {
  const m = game.missions;
  const target = currentTarget(game);
  const step = currentStep(game);

  // Beacon, ring and parcel follow the current target.
  const showBeacon = !!target && !game.dialogActive;
  m.beacon.visible = showBeacon;
  m.ring.visible = showBeacon;
  if (target) {
    m.beacon.position.x = target.x;
    m.beacon.position.z = target.z;
    m.beacon.material.opacity = 0.13 + Math.sin(game.time * 3) * 0.05;
    m.ring.position.x = target.x;
    m.ring.position.z = target.z;
    const s = 1 + Math.sin(game.time * 3) * 0.08;
    m.ring.scale.setScalar(s);
  }
  const showParcel = step && step.type === 'pickup';
  m.parcel.visible = !!showParcel;
  if (showParcel) {
    const p = stepPoint(step);
    m.parcel.position.set(p.x, 0.9 + Math.sin(game.time * 2.4) * 0.18, p.z);
    m.parcel.rotation.y = game.time * 1.4;
  }
  const showGate = step && step.type === 'checkpoints';
  m.gate.visible = !!showGate;
  if (showGate) {
    const p = step.points[m.checkpointIndex];
    if (p) {
      m.gate.position.set(p.x, 2.6 + Math.sin(game.time * 2) * 0.3, p.z);
      m.gate.rotation.y = game.time * 0.7;
    }
  }
  if (game.dialogActive || game.state !== 'playing') return;

  const anchor = game.player.car ? game.player.car.pos : game.player.pos;

  // Job pickups and deliveries resolve at their places.
  if (m.job) {
    const key = m.job.phase === 'pickup' ? m.job.fromKey : m.job.toKey;
    const p = PLACES[key];
    const d2 = (anchor.x - p.x) ** 2 + (anchor.z - p.z) ** 2;
    if (d2 < 6 * 6) {
      if (m.job.phase === 'pickup') {
        m.job.phase = 'deliver';
        game.audio.blip();
        game.toast('Package on board');
      } else {
        game.cash += m.job.pay;
        game.save.jobsDone++;
        game.saveProgress();
        game.audio.jingle(true);
        game.toast(`Delivered — +$${m.job.pay}`);
        m.job = null;
      }
    }
    return;
  }
  if (!step) return;

  // Timers: the escape and the Harbour Run can both run out.
  if (step.time) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(game, step.type === 'escape' ? 'Too slow — the detective got a good look.' : 'The tide clock ran out. The run is off.');
      return;
    }
  }

  if (step.type === 'pickup' || step.type === 'return') {
    const p = stepPoint(step);
    const d2 = (anchor.x - p.x) ** 2 + (anchor.z - p.z) ** 2;
    const arrived = step.type === 'pickup' ? d2 < step.r * step.r : d2 < step.r * step.r && !game.player.car;
    if (arrived) {
      if (step.type === 'pickup') game.audio.coin();
      advanceStep(game);
    }
  } else if (step.type === 'enterCar') {
    if (m.sunsetCar && game.player.car === m.sunsetCar) advanceStep(game);
    if (m.sunsetCar && m.sunsetCar.dead) failMission(game, 'The Sunset GT is wrecked. Benny will not be pleased.');
  } else if (step.type === 'deliverCar') {
    const p = stepPoint(step);
    const d2 = (anchor.x - p.x) ** 2 + (anchor.z - p.z) ** 2;
    if (game.player.car === m.sunsetCar && d2 < step.r * step.r) advanceStep(game);
    if (m.sunsetCar && m.sunsetCar.dead) failMission(game, 'The Sunset GT is wrecked. Benny will not be pleased.');
  } else if (step.type === 'escape') {
    if (game.heat <= 0 && game.stars === 0) advanceStep(game);
  } else if (step.type === 'checkpoints') {
    const p = step.points[m.checkpointIndex];
    if (p) {
      const d2 = (anchor.x - p.x) ** 2 + (anchor.z - p.z) ** 2;
      if (d2 < 8 * 8) {
        m.checkpointIndex++;
        game.audio.blip();
        if (m.checkpointIndex >= step.points.length) advanceStep(game);
        else game.toast(`Checkpoint ${m.checkpointIndex}/${step.points.length}`);
      }
    }
  }
}
