// config.js — every shared constant for Palm City: city layout, tuning, colours.
// One place to tweak the feel of the game without hunting through systems.

export const CITY = {
  pitch: 72, // distance between neighbouring road centrelines (m)
  roadHalf: 8, // half the road width; the road is 16 m wide
  laneOffset: 3.6, // traffic keeps this far right of the centreline
  lines: [-216, -144, -72, 0, 72, 144, 216], // road centrelines on both axes
  half: 252, // playable half-extent of the city square
  beachX: 268, // sand starts here, water beyond it
};

export const PLAYER = {
  walkSpeed: 5.2,
  sprintSpeed: 8.4,
  radius: 0.55,
  punchRange: 1.9,
  punchCooldown: 0.38,
  maxHealth: 100,
};

export const CAR = {
  maxSpeed: 36,
  maxReverse: 11,
  accel: 15,
  brake: 26,
  drag: 0.6,
  radius: 1.35,
};

export const WANTED = {
  // heat points needed to hold each star, and how fast heat cools unseen
  starThresholds: [0, 25, 70, 140, 240, 380],
  coolRate: 9, // heat per second while no police can see the player
  sightRange: 48,
  policeByStars: [0, 2, 3, 4, 6, 8],
};

export const PALETTE = {
  sky: 0x87b5d9,
  fog: 0xa8c4dd,
  asphalt: 0x33373d,
  sidewalk: 0x9aa0a3,
  sand: 0xe3cf9e,
  water: 0x2e7fa8,
  grass: 0x6fae5d,
};

export const SAVE_KEY = 'palm-city-heat-save-v1';
