// missions.js — the story of Palm City Heat and its engine. Reno, a courier
// who owes money all over town, works it off one job at a time: five story
// missions with dialogue, markers, timers and rewards, then endless delivery
// work. A mission is a list of steps; the engine walks the steps, draws the
// beacon at the current objective and pays out at the end.

import * as THREE from 'three';
import { PLACES } from './world.js';
import { Car } from './vehicles.js';

const ROSA = PLACES.rosa;
const BENNY = PLACES.benny;

export const STORY = [
  {
    title: "Rosa's Errand",
    giver: ROSA,
    intro: [
      ['Rosa', 'Reno! You owe me three weeks of noodles, so today you work.'],
      ['Rosa', 'My moon peppers are sitting at the Night Market. Fetch them before they wilt.'],
      ['Reno', 'On my way, Rosa. Put a bowl aside for me.'],
    ],
    steps: [
      { type: 'goto', place: PLACES.market, label: 'Pick up the moon peppers at the Night Market', radius: 6 },
      { type: 'goto', place: ROSA, label: "Deliver the peppers to Rosa's stall", radius: 6 },
    ],
    reward: { cash: 150, respect: 1 },
    outro: [
      ['Rosa', 'Still warm. You are not useless after all.'],
      ['Rosa', 'Benny at the auto works needs a driver. Go earn, then come eat.'],
    ],
  },
  {
    title: 'Borrowed Sunset',
    giver: BENNY,
    intro: [
      ['Benny', 'See that orange Sunset GT at the Hotel Solana? Its owner owes me a gearbox.'],
      ['Benny', 'Borrow it. Permanently. Bring it here, and try not to gift-wrap it around a palm.'],
      ['Reno', 'Stealing cars now. Rosa would be proud.'],
    ],
    steps: [
      { type: 'steal', place: PLACES.hotel, label: 'Steal the orange Sunset GT at the Hotel Solana', radius: 7 },
      { type: 'deliverCar', place: BENNY, label: "Deliver the Sunset GT to Benny's Auto Works", radius: 8 },
    ],
    reward: { cash: 300, respect: 1 },
    outro: [
      ['Benny', 'Clean paint, full tank. You drive like you were born in a getaway.'],
      ['Benny', 'Rosa has a money problem at the beach side. Go see her.'],
    ],
  },
  {
    title: 'Three Bags',
    giver: ROSA,
    intro: [
      ['Rosa', 'A courier van spilled my takings all over Palm City. Three bags. Gone.'],
      ['Rosa', "Beach, the mall, the market. Bring them back before someone else 'finds' them."],
      ['Reno', 'Three bags, one city. Easy.'],
    ],
    steps: [
      {
        type: 'collect',
        label: 'Recover the cash bags',
        radius: 4,
        timer: 150,
        points: [PLACES.beach, PLACES.mall, PLACES.market],
      },
    ],
    reward: { cash: 400, respect: 1 },
    outro: [
      ['Rosa', 'Every last bill. The harbour provides, hm?'],
      ['Rosa', 'Benny says the police are watching his yard. He needs you cool-headed.'],
    ],
  },
  {
    title: 'Cool Down',
    giver: BENNY,
    intro: [
      ['Benny', 'Bad news: I moved a hot engine for you and the whole PCPD knows your face.'],
      ['Benny', 'They are coming NOW. Lose the heat, do not get busted, and do not lead them here.'],
      ['Reno', 'Running from the law. Again. Fine.'],
    ],
    steps: [{ type: 'escape', label: 'Lose the police heat (reach zero stars)', heat: 150 }],
    reward: { cash: 350, respect: 1 },
    outro: [
      ['Benny', 'Ghost. The yard is safe and so is my licence.'],
      ['Benny', 'One last run, Reno. The big one. Rosa is waiting at the pier.'],
    ],
  },
  {
    title: 'Harbour Run',
    giver: ROSA,
    intro: [
      ['Rosa', 'Final job, then your debt is ash. My new stall opens at the pier tonight.'],
      ['Rosa', 'The harbour crew wants a show: hit every checkpoint across town, then bring the crowd home.'],
      ['Reno', 'One run to end it all. Let us make it loud.'],
    ],
    steps: [
      {
        type: 'checkpoints',
        label: 'Hit every checkpoint, then reach the pier',
        radius: 7,
        timer: 170,
        points: [
          { x: -216, z: 0, label: 'Westgate' },
          { x: -72, z: 144, label: 'Uptown' },
          { x: 72, z: 144, label: 'Coral Heights' },
          { x: 216, z: 0, label: 'Marina' },
          { x: 72, z: -144, label: 'South Docks' },
          { x: -72, z: -144, label: 'Old Town' },
        ],
      },
      { type: 'goto', place: PLACES.pier, label: 'Finish at Palm Pier', radius: 8 },
    ],
    reward: { cash: 800, respect: 2 },
    outro: [
      ['Rosa', 'Debt paid, Reno. The stall has your name on the second stool.'],
      ['Reno', 'Free noodles for life. Best deal in Palm City.'],
      ['Rosa', 'Now go enjoy the city. And if you want work, you know where I stand.'],
    ],
  },
];

const JOB_PLACES = [PLACES.market, PLACES.mall, PLACES.hotel, PLACES.pier, PLACES.beach, PLACES.benny, PLACES.rosa];

export function createMissions(scene) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 24, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 12;
  beacon.visible = false;
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3, 28),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  scene.add(ring);

  return {
    index: 0,
    storyDone: false,
    active: false,
    stepIndex: 0,
    step: null,
    collected: 0,
    checkpoint: 0,
    timeLeft: null,
    marker: null,
    beacon,
    ring,
    specialCar: null,
    jobCount: 0,
  };
}

function currentStep(game) {
  const m = game.missions;
  const mission = m.active ? m.current : null;
  return mission ? mission.steps[m.stepIndex] : null;
}

export function missionObjective(game) {
  const m = game.missions;
  if (!m.active) {
    if (m.storyDone) return { text: 'Free roam — see Rosa or Benny for delivery work', marker: m.marker };
    const next = STORY[m.index];
    return { text: `Go to ${next.giver.label} — "${next.title}"`, marker: next.giver };
  }
  const step = currentStep(game);
  if (!step) return { text: '', marker: null };
  let text = step.label;
  if (step.type === 'collect') text += ` (${m.collected}/${step.points.length})`;
  if (step.type === 'checkpoints') text += ` (${m.checkpoint}/${step.points.length})`;
  if (m.timeLeft !== null) text += ` — ${Math.ceil(m.timeLeft)}s`;
  return { text, marker: m.marker };
}

function setMarker(game, x, z) {
  const m = game.missions;
  m.marker = { x, z };
  m.beacon.position.x = x;
  m.beacon.position.z = z;
  m.ring.position.x = x;
  m.ring.position.z = z;
  m.beacon.visible = true;
  m.ring.visible = true;
}

function clearMarker(game) {
  const m = game.missions;
  m.marker = null;
  m.beacon.visible = false;
  m.ring.visible = false;
}

function startStep(game) {
  const m = game.missions;
  const step = currentStep(game);
  m.collected = 0;
  m.checkpoint = 0;
  m.timeLeft = step && step.timer ? step.timer : null;
  if (!step) return;
  if (step.type === 'steal') {
    // the Sunset GT: a bright orange sport coupe waiting at the hotel
    const car = new Car(game.scene, 0xff7a1a, 'sport');
    car.mode = 'parked';
    car.place(211, 100, 0); // kerbside on the coast road, in front of the hotel
    game.cars.push(car);
    m.specialCar = car;
    setMarker(game, car.pos.x, car.pos.z);
  } else if (step.type === 'escape') {
    game.heat = Math.max(game.heat, step.heat || 150);
    clearMarker(game);
  } else if (step.type === 'collect') {
    setMarker(game, step.points[0].x, step.points[0].z);
  } else if (step.type === 'checkpoints') {
    setMarker(game, step.points[0].x, step.points[0].z);
  } else {
    setMarker(game, step.place.x, step.place.z);
  }
}

function finishMission(game) {
  const m = game.missions;
  const mission = m.current;
  m.active = false;
  m.current = null;
  clearMarker(game);
  game.cash += mission.reward.cash;
  game.respect += mission.reward.respect;
  game.audio.missionDone();
  game.hud.toast(`Mission complete: ${mission.title} — +$${mission.reward.cash}`);
  if (mission.outro) game.hud.showDialog(mission.outro, null);
  if (!m.storyDone) {
    m.index++;
    if (m.index >= STORY.length) {
      m.storyDone = true;
      game.hud.toast('Story complete — Palm City is yours. Delivery work pays forever.');
    }
  }
  game.saveSoon();
}

function startMission(game, def) {
  const m = game.missions;
  m.current = def;
  m.active = true;
  m.stepIndex = 0;
  game.hud.showDialog(def.intro, () => startStep(game));
  game.hud.toast(`Mission: ${def.title}`);
}

// delivery work: endless, pays by distance, alternates the two givers
function makeJob(game) {
  const m = game.missions;
  m.jobCount++;
  const giver = m.jobCount % 2 === 0 ? BENNY : ROSA;
  let dest = JOB_PLACES[Math.floor(game.rng() * JOB_PLACES.length)];
  if (dest === giver) dest = PLACES.mall;
  const dist = Math.sqrt((dest.x - giver.x) ** 2 + (dest.z - giver.z) ** 2);
  const pay = Math.round(60 + dist * 0.55);
  return {
    title: `Delivery #${m.jobCount}`,
    giver,
    intro: [[giver === ROSA ? 'Rosa' : 'Benny', `A package for ${dest.label}. $${pay} if it arrives warm.`]],
    steps: [
      { type: 'goto', place: giver, label: `Pick up the package at ${giver.label}`, radius: 6 },
      { type: 'goto', place: dest, label: `Deliver to ${dest.label}`, radius: 7 },
    ],
    reward: { cash: pay, respect: 0 },
    outro: null,
  };
}

export function updateMissions(game, dt) {
  const m = game.missions;
  const anchor = game.player.car ? game.player.car.pos : game.player.group.position;

  // idle: stand at the next giver (or Rosa/Benny for work) to pick up a job
  if (!m.active) {
    const next = m.storyDone ? null : STORY[m.index];
    const giver = next ? next.giver : m.jobCount % 2 === 0 ? ROSA : BENNY;
    setMarker(game, giver.x, giver.z);
    const d = Math.sqrt((anchor.x - giver.x) ** 2 + (anchor.z - giver.z) ** 2);
    if (d < 5 && !game.dialogActive) {
      startMission(game, next ?? makeJob(game));
    }
    return;
  }

  const step = currentStep(game);
  if (!step) {
    finishMission(game);
    return;
  }
  if (m.timeLeft !== null) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      game.hud.toast('Out of time — the step restarts.');
      startStep(game);
      return;
    }
  }

  const reach = (x, z, radius) => Math.sqrt((anchor.x - x) ** 2 + (anchor.z - z) ** 2) < radius;
  const advance = () => {
    m.stepIndex++;
    if (m.stepIndex >= m.current.steps.length) finishMission(game);
    else startStep(game);
  };

  switch (step.type) {
    case 'goto':
    case 'pickup':
      setMarker(game, step.place.x, step.place.z);
      if (reach(step.place.x, step.place.z, step.radius)) advance();
      break;
    case 'steal':
      if (m.specialCar) {
        setMarker(game, m.specialCar.pos.x, m.specialCar.pos.z);
        if (game.player.car === m.specialCar) {
          game.hud.toast('You have the Sunset GT. Benny is waiting.');
          advance();
        }
      }
      break;
    case 'deliverCar':
      setMarker(game, step.place.x, step.place.z);
      if (game.player.car !== m.specialCar) {
        game.hud.setPrompt('Get back in the Sunset GT');
      } else if (reach(step.place.x, step.place.z, step.radius)) {
        // hand the car over: it stays with Benny
        const car = m.specialCar;
        game.exitCarKeep();
        car.mode = 'parked';
        m.specialCar = null;
        advance();
      }
      break;
    case 'collect': {
      const point = step.points[m.collected];
      if (point) {
        setMarker(game, point.x, point.z);
        if (reach(point.x, point.z, step.radius)) {
          m.collected++;
          game.audio.pickup();
          game.cash += 25;
          game.hud.toast(`Bag recovered (${m.collected}/${step.points.length}) +$25`);
          if (m.collected >= step.points.length) advance();
        }
      }
      break;
    }
    case 'checkpoints': {
      const point = step.points[m.checkpoint];
      if (point) {
        setMarker(game, point.x, point.z);
        if (reach(point.x, point.z, step.radius)) {
          m.checkpoint++;
          game.audio.pickup();
          game.hud.toast(`Checkpoint ${m.checkpoint}/${step.points.length} — ${point.label}`);
          if (m.checkpoint >= step.points.length) advance();
        }
      }
      break;
    }
    case 'escape':
      clearMarker(game);
      if (game.stars === 0 && game.heat <= 0) advance();
      break;
    default:
      break;
  }

  // the beacon breathes so it is easy to spot across the city
  const pulse = 0.13 + Math.sin(game.time * 3) * 0.05;
  m.beacon.material.opacity = pulse;
  m.ring.material.opacity = 0.55 + Math.sin(game.time * 3) * 0.25;
}
