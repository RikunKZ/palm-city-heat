// Palm City Heat — shared configuration: the city grid, named places and the
// wanted ladder. Every module reads its numbers from here so the world the
// world-builder makes is the world the AI drives on.

// Roads run along both axes at these coordinates; blocks sit between them.
export const ROAD_LINES = [-270, -180, -90, 0, 90, 180, 270];
export const ROAD_HALF = 7;          // half the road width, in metres
export const SIDEWALK = 3.2;         // sidewalk width beyond the road edge
export const CITY_EDGE = 315;        // buildings stop here; beach begins
export const BOARDWALK_X = 336;      // boardwalk centre line on the east side
export const SAND_X = 352;           // waterline: sea beyond this x
export const WORLD_LIMIT = 430;      // hard play boundary

// Named places. x/z are on the ground beside the place's sign; the world
// builder puts a building or stall there and the missions point at them.
export const PLACES = {
  noodles:  { name: "Rosa's Noodles",  short: 'Noodles',  x: -256, z: -196, color: 0xff7043 },
  auto:     { name: "Benny's Auto",    short: 'Auto',     x: -76,  z: 256,  color: 0x42a5f5 },
  market:   { name: 'Night Market',    short: 'Market',   x: 106,  z: -256, color: 0xab47bc },
  police:   { name: 'Palm City PD',    short: 'PD',       x: -256, z: 76,   color: 0x3d5afe },
  hospital: { name: 'St. Coral Hospital', short: 'Hospital', x: 166, z: 166, color: 0xef5350 },
  hotel:    { name: 'Hotel Solana',    short: 'Hotel',    x: 256,  z: -76,  color: 0xffca28 },
  mall:     { name: 'Coral Mall',      short: 'Mall',     x: -166, z: -166, color: 0x26a69a },
  pier:     { name: 'Palm Pier',       short: 'Pier',     x: 336,  z: 0,    color: 0x8d6e63 },
  hideout:  { name: 'The Hideout',     short: 'Hideout',  x: 76,   z: 106,  color: 0x78909c },
};

// Wanted ladder: heat thresholds for 1..5 stars, and how many patrol cars
// the city fields at each level.
export const STAR_THRESHOLDS = [12, 32, 52, 72, 90];
export const PATROL_CARS = [0, 1, 2, 3, 4, 5];
export const HEAT_MAX = 100;

// Heat paid for each crime, keyed by crime name.
export const CRIME_HEAT = {
  theft: 22,
  hitCar: 9,
  hitPed: 16,
  punchPed: 12,
  reckless: 4,
};

export const SAVE_KEY = 'palm-city-heat-save-v1';
