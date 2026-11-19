// Palm City Heat — the story: five missions with original characters and
// dialogue, then endless delivery work. This class owns the mission state
// machine, the dialogue box data, the world markers (a gold beacon, cash
// bags, checkpoint rings) and the giver NPCs who stand at their places.

import * as THREE from 'three';
import { PLACES } from './config.js';
import { buildFigure } from './pedestrians.js';

function markerSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14100a';
  ctx.font = 'bold 84px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.setScalar(2.2);
  s.renderOrder = 20;
  return s;
}

const ROSA_LINES_1 = [
  ['Rosa', 'You! Yes, you with the hungry face. I am Rosa. My noodles feed half this city, and today the city is winning.'],
  ['Rosa', 'The Night Market is holding my moon peppers hostage — some paperwork nonsense. You look like paperwork is not your style.'],
  ['Rosa', 'Fetch the crate from the market stall, then take it to the Hotel Solana kitchen door. Their chef is desperate, and desperate chefs tip.'],
  ['You', 'Consider it done, Rosa.'],
];
const ROSA_LINES_1_DONE = [
  ['Rosa', 'Peppers delivered, chef happy, and my soup stays legendary. You are good people.'],
];
const BENNY_LINES = [
  ['Benny', 'Benny. Benny\'s Auto. You have the look of someone who borrows cars professionally.'],
  ['Benny', 'A customer left a Sunset GT by the pier and "forgot" where. Orange, loud, impossible to miss.'],
  ['Benny', 'Bring her to my shop — gently, she is worth more than this building. There is money in it for you.'],
  ['You', 'One gently borrowed sunset, coming up.'],
];
const ROSA_LINES_3 = [
  ['Rosa', 'My cousin Lito moves cash for the market stalls, and Lito has lost THREE bags of it. Do not ask how. Lito is a poet, not a courier.'],
  ['Rosa', 'One by the Coral Mall, one near the Hideout, one down the boardwalk. The bags are green. Bring them back to me and the stalls eat again.'],
  ['You', 'Three green bags. On it.'],
];
const BENNY_LINES_4 = [
  ['Benny', 'Word is the PD thinks you are a myth. Let us help them believe harder — then vanish.'],
  ['Benny', 'I may have mentioned your name near a patrol radio. Repeatedly. You have about ten seconds before this gets loud.'],
  ['Benny', 'Get them interested, then lose them completely. Break their line of sight and let the heat die. Do that and the whole street owes you.'],
  ['You', 'You are a terrible friend, Benny.'],
  ['Benny', 'I am an excellent friend with terrible hobbies. Run!'],
];
const MARINA_LINES = [
  ['Marina', 'I run the Palm Pier ferry desk. The harbour master needs the tide ledger at the pier office, and the harbour is a whole city away today.'],
  ['Marina', 'Follow the gold rings, every one, and finish here at the pier before the clock dies. The ledger rides with you — drive like the tide is chasing.'],
  ['You', 'Rings, clock, pier. Got it.'],
];

export class Missions {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { toast, reward(cash, respect), addHeat, spawnMissionCar, jingle }
    this.story = 0;      // next story mission index, 0..5
    this.active = null;  // { id, stage, data }
    this.dialogue = null;
    this.dialogueDone = null;
    this.deliveriesDone = 0;

    // Giver NPCs.
    this.givers = {};
    const defs = [
      ['rosa', PLACES.noodles, 0xd84315],
      ['benny', PLACES.auto, 0x1565c0],
      ['marina', PLACES.pier, 0x00838f],
    ];
    for (const [key, place, color] of defs) {
      const fig = buildFigure({ shirt: color, pants: 0x37474f, skin: 0xc68642, hat: null });
      fig.position.set(place.x + 3, 0, place.z + 6);
      fig.rotation.y = -0.6;
      scene.add(fig);
      const mark = markerSprite('!', '#ffd23e');
      mark.position.set(place.x + 3, 2.9, place.z + 6);
      scene.add(mark);
      this.givers[key] = { fig, mark, place };
    }

    // The shared gold beacon that marks the current objective.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.visible = false;
    scene.add(this.beacon);

    this.bags = [];
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.45, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85 }),
    );
    this.ring.visible = false;
    scene.add(this.ring);
    this.time = 0;
  }

  giverForStory() {
    return ['rosa', 'benny', 'rosa', 'benny', 'marina'][this.story] ?? null;
  }

  /** Talk to a giver: returns true when a dialogue opened. */
  tryTalk(playerPos) {
    if (this.dialogue || this.active) return false;
    const key = this.giverForStory();
    if (!key) return false;
    const g = this.givers[key];
    if (playerPos.distanceTo(g.fig.position) > 3.4) return false;
    const lines = [ROSA_LINES_1, BENNY_LINES, ROSA_LINES_3, BENNY_LINES_4, MARINA_LINES][this.story];
    this.startDialogue(lines, () => this.beginStoryMission());
    return true;
  }

  startDialogue(lines, onDone) {
    this.dialogue = { lines, i: 0 };
    this.dialogueDone = onDone;
  }

  get dialogueLine() {
    if (!this.dialogue) return null;
    const [who, text] = this.dialogue.lines[this.dialogue.i];
    return { who, text };
  }

  advanceDialogue() {
    if (!this.dialogue) return;
    this.dialogue.i++;
    if (this.dialogue.i >= this.dialogue.lines.length) {
      this.dialogue = null;
      const done = this.dialogueDone;
      this.dialogueDone = null;
      done?.();
    }
  }

  beginStoryMission() {
    const id = this.story;
    if (id === 0) {
      this.active = { id, stage: 'pickup', target: PLACES.market };
      this.hooks.toast('Mission: Rosa\'s Errand');
    } else if (id === 1) {
      const car = this.hooks.spawnMissionCar(272, 26, -Math.PI / 2);
      this.active = { id, stage: 'find', target: null, car };
      this.hooks.toast('Mission: Borrowed Sunset');
    } else if (id === 2) {
      const spots = [
        { x: -150, z: -118 }, { x: 82, z: 92 }, { x: 330, z: 118 },
      ];
      this.bags = spots.map((s) => {
        const bag = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 10, 8),
          new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
        );
        bag.scale.y = 0.75;
        bag.position.set(s.x, 0.45, s.z);
        this.scene.add(bag);
        return { mesh: bag, taken: false };
      });
      this.active = { id, stage: 'collect', count: 0 };
      this.hooks.toast('Mission: Three Bags');
    } else if (id === 3) {
      this.active = { id, stage: 'escape', peaked: false };
      this.hooks.addHeat(64);
      this.hooks.toast('Mission: Cool Down — lose the heat!');
    } else if (id === 4) {
      this.active = {
        id, stage: 'run', step: 0, timer: 170,
        points: [
          { x: 180, z: 186 }, { x: -96, z: 200 }, { x: -186, z: -46 },
          { x: 66, z: -186 }, { x: PLACES.pier.x, z: PLACES.pier.z },
        ],
      };
      this.hooks.toast('Mission: Harbour Run');
    }
  }

  startDelivery() {
    const keys = Object.keys(PLACES);
    const from = PLACES[keys[Math.floor(Math.random() * keys.length)]];
    let to = from;
    while (to === from) to = PLACES[keys[Math.floor(Math.random() * keys.length)]];
    this.active = { id: 'delivery', stage: 'pickup', from, to };
    this.hooks.toast(`Delivery: collect at ${from.name}`);
  }

  completeMission(cash, respect, lines) {
    this.hooks.reward(cash, respect);
    this.hooks.jingle(true);
    if (lines) this.startDialogue(lines, null);
    if (this.active && this.active.id !== 'delivery') this.story++;
    if (this.active && this.active.id === 'delivery') this.deliveriesDone++;
    this.active = null;
    this.clearProps();
  }

  failMission(why) {
    if (!this.active) return;
    this.hooks.toast(`Mission failed: ${why}`);
    this.hooks.jingle(false);
    this.active = null;
    this.clearProps();
  }

  onPlayerDown() {
    if (this.active) this.failMission('you went down');
  }

  clearProps() {
    for (const b of this.bags) this.scene.remove(b.mesh);
    this.bags = [];
    this.ring.visible = false;
  }

  /** What the HUD shows: title, text, target point and timer (or nulls). */
  objective() {
    const a = this.active;
    if (this.dialogue) return { title: 'Talking', text: 'Hear them out', target: null, timer: null };
    if (!a) {
      if (this.story < 5) {
        const g = this.givers[this.giverForStory()];
        return { title: 'Story', text: `Talk to your contact at ${g.place.name}`, target: g.fig.position, timer: null };
      }
      return { title: 'Free roam', text: 'Palm City is yours — deliveries pay at any marker', target: null, timer: null };
    }
    switch (a.id) {
      case 0:
        return a.stage === 'pickup'
          ? { title: 'Rosa\'s Errand', text: 'Pick up the pepper crate at the Night Market', target: a.target, timer: null }
          : { title: 'Rosa\'s Errand', text: 'Deliver the crate to Hotel Solana', target: PLACES.hotel, timer: null };
      case 1:
        return a.stage === 'find'
          ? { title: 'Borrowed Sunset', text: 'Find the orange Sunset GT near the pier', target: a.car.pos, timer: null }
          : { title: 'Borrowed Sunset', text: 'Drive the Sunset GT to Benny\'s Auto', target: PLACES.auto, timer: null };
      case 2: {
        const left = this.bags.filter((b) => !b.taken);
        if (a.stage === 'collect') {
          return { title: 'Three Bags', text: `Recover the cash bags (${a.count}/3)`, target: left.length ? left[0].mesh.position : null, timer: null };
        }
        return { title: 'Three Bags', text: 'Bring the bags back to Rosa', target: this.givers.rosa.fig.position, timer: null };
      }
      case 3:
        return { title: 'Cool Down', text: 'Break police line of sight and let the heat die', target: null, timer: null };
      case 4: {
        const p = a.points[a.step];
        return { title: 'Harbour Run', text: `Checkpoint ${a.step + 1} of ${a.points.length}`, target: p, timer: a.timer };
      }
      default:
        return a.stage === 'pickup'
          ? { title: 'Delivery', text: `Collect the parcel at ${a.from.name}`, target: a.from, timer: null }
          : { title: 'Delivery', text: `Deliver to ${a.to.name}`, target: a.to, timer: null };
    }
  }

  update(dt, ctx) {
    this.time += dt;
    const { playerPos, drivingCar, police } = ctx;
    // Giver markers: only the current contact glows.
    const key = this.giverForStory();
    for (const [k, g] of Object.entries(this.givers)) {
      g.mark.visible = !this.active && !this.dialogue && k === key && this.story < 5;
      g.mark.position.y = 2.9 + Math.sin(this.time * 2.4) * 0.18;
    }

    const obj = this.objective();
    if (obj.target) {
      this.beacon.visible = true;
      this.beacon.position.set(obj.target.x, 17, obj.target.z);
      this.beacon.material.opacity = 0.22 + Math.sin(this.time * 3) * 0.08;
    } else {
      this.beacon.visible = false;
    }

    const a = this.active;
    if (!a || this.dialogue) return;
    const near = (p, r) => Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < r;

    if (a.id === 0) {
      if (a.stage === 'pickup' && near(PLACES.market, 7.5)) {
        a.stage = 'deliver';
        this.hooks.toast('Crate collected');
        this.hooks.blip();
      } else if (a.stage === 'deliver' && near(PLACES.hotel, 8)) {
        this.completeMission(120, 10, ROSA_LINES_1_DONE);
      }
    } else if (a.id === 1) {
      if (a.stage === 'find' && drivingCar === a.car) {
        a.stage = 'deliver';
        this.hooks.toast('Got the GT — take it to Benny\'s');
      } else if (a.stage === 'deliver' && drivingCar === a.car && near(PLACES.auto, 11)) {
        this.completeMission(200, 12, [['Benny', 'Not a scratch. You are wasted on honest work, friend.']]);
      } else if (a.car.damage >= 1) {
        this.failMission('the Sunset GT is wrecked');
      }
    } else if (a.id === 2) {
      if (a.stage === 'collect') {
        for (const b of this.bags) {
          if (!b.taken && near(b.mesh.position, 2.4)) {
            b.taken = true;
            this.scene.remove(b.mesh);
            a.count++;
            this.hooks.toast(`Bag recovered (${a.count}/3)`);
            this.hooks.blip();
            if (a.count >= 3) a.stage = 'return';
          }
        }
      } else if (a.stage === 'return' && near(this.givers.rosa.fig.position, 3.6)) {
        this.completeMission(260, 14, [['Rosa', 'All three! The stalls eat, Lito lives, and you — you I feed free forever.']]);
      }
    } else if (a.id === 3) {
      if (police.stars >= 3) a.peaked = true;
      if (a.peaked && police.stars === 0) {
        this.completeMission(300, 16, [['Benny', 'Gone like a rumour. The street is talking about you now.']]);
      }
    } else if (a.id === 4) {
      const p = a.points[a.step];
      this.ring.visible = true;
      this.ring.position.set(p.x, 2.6, p.z);
      this.ring.rotation.x = 0;
      a.timer -= dt;
      if (a.timer <= 0) {
        this.failMission('out of time');
        return;
      }
      if (near(p, 9.5)) {
        this.hooks.blip();
        a.step++;
        a.timer += 12;
        if (a.step >= a.points.length) {
          this.completeMission(400, 20, [['Marina', 'Ledger delivered, and with minutes to spare. The harbour owes you.']]);
        } else {
          this.hooks.toast(`Checkpoint ${a.step} cleared — bonus time!`);
        }
      }
    } else if (a.id === 'delivery') {
      if (a.stage === 'pickup' && near(a.from, 7.5)) {
        a.stage = 'deliver';
        this.hooks.toast(`Parcel aboard — deliver to ${a.to.name}`);
        this.hooks.blip();
      } else if (a.stage === 'deliver' && near(a.to, 8)) {
        const pay = 45 + Math.round(Math.hypot(a.from.x - a.to.x, a.from.z - a.to.z) / 5);
        this.completeMission(pay, 3, null);
        this.startDelivery();
      }
    }
  }
}
