// Palm City Heat — shared tuning: the city grid, the named places, the wanted ladder.
// Everything in the game reads its numbers from here so the world stays consistent.

// Roads run along these coordinates on both axes: seven avenues each way,
// which leaves a 6 by 6 field of city blocks between them.
export const ROAD_LINES = [-216, -144, -72, 0, 72, 144, 216];
export const ROAD_HALF = 9; // half the width of a road, kerb to centre line
export const BLOCK_INSET = 13; // buildings keep this far from a block's centre lines
export const WORLD_HALF = 252; // the last kerb: east of here the promenade starts
export const PROMENADE_X = 234; // boardwalk band between the coast road and the sand
export const SAND_X = 256; // dry sand begins
export const SEA_X = 292; // open water begins

// The named places of Palm City: where they stand, what their sign says, who works there.
export const PLACES = {
  rosa: { x: 240, z: 18, name: "Rosa's Noodle Harbor", short: 'Rosa', color: 0xd84f35 },
  pier: { x: 272, z: -84, name: 'Palm Pier', short: 'the Pier', color: 0x2e7fb8 },
  market: { x: -160, z: -160, name: 'Night Market', short: 'the Night Market', color: 0xb03a8c },
  benny: { x: -160, z: 92, name: "Benny's Auto Works", short: "Benny's", color: 0xe08a1e },
  police: { x: 92, z: -92, name: 'Palm City Police', short: 'the police station', color: 0x2b4d9b },
  hospital: { x: -92, z: 92, name: 'Coral Bay Hospital', short: 'the hospital', color: 0xd8d8d8 },
  hotel: { x: 196, z: 92, name: 'Hotel Solana', short: 'Hotel Solana', color: 0xcaa64b },
  mall: { x: 92, z: 164, name: 'Coral Mall', short: 'Coral Mall', color: 0x3f9e8f },
  hideout: { x: -196, z: -196, name: 'Old Cannery', short: 'the Old Cannery', color: 0x707880 },
  beach: { x: 246, z: 150, name: 'Solana Beach', short: 'the beach', color: 0xe3cf9e },
};

// Wanted ladder: the heat score at which each star lights, and how many
// patrol cars the city sends out while that star is lit.
export const WANTED = {
  starHeat: [0, 25, 70, 140, 240, 380],
  patrolCars: [0, 2, 3, 4, 6, 8],
  coolRate: 9, // heat per second shed while no officer can see the player
  fineBase: 100,
  finePerStar: 75,
  hospitalFee: 150,
};

// What each crime adds to the heat score the moment it happens.
export const CRIMES = {
  carTheft: 12,
  punchPed: 8,
  hitPedWithCar: 16,
  hitCar: 5,
  hitBuilding: 3,
  punchCar: 4,
};

export const PLAYER = {
  walkSpeed: 6.2,
  sprintSpeed: 9.6,
  turnRate: 11,
  jumpSpeed: 8.4,
  gravity: 22,
  punchRange: 2.1,
  punchDamage: 34,
  startCash: 250,
  startHealth: 100,
};

export const SAVE_KEY = 'palm-city-heat-save-v1';
