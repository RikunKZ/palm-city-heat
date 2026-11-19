# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/RikunKZ/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/RikunKZ/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palm City Heat** is an original open-world crime game for the browser, built
for the make.fun bounty [gta6-01](https://make.fun/bounty/gta6-01). Palm City
is a sun-baked coastal grid of towers, palm trees and neon shopfronts: explore
it on foot or by car, steal rides, run errands for the locals, and try to keep
the Palm City PD off your tail.

Everything in the city, story and cast is original: Rosa of Rosa's Noodles,
Benny of Benny's Auto, the Night Market runners and the rest of Palm City's
residents were all invented for this game, and every texture, sound and note
of music is generated in code at run time.

## The game

- **A living city** — a 7×7 road grid with traffic that keeps right, slows
  for the car ahead and turns at intersections; pedestrians stroll the
  sidewalks and scatter when trouble starts; a beach, boardwalk and the sea
  run down the east side.
- **On foot and behind the wheel** — walk, sprint, jump and punch on foot;
  press E beside any car to take it, then drive with arcade handling,
  handbrake turns, collision damage and smoke when a car is wrecked.
- **Wanted system** — crimes raise your heat through five wanted stars. Palm
  City PD patrol cars pursue and ram, officers chase on foot, and a busted
  meter fills when they corner you: get caught and you pay a fine at the
  station; get flattened and the hospital sends its bill instead.
- **A five-mission story** — an errand for Rosa, a borrowed sports car for
  Benny, three lost cash bags, a cool-down escape and a timed harbour run to
  the pier, then endless delivery work once the story is done.
- **HUD and minimap** — objective text with distance, cash and respect,
  wanted stars, health, a speedometer, and a live circular minimap with the
  mission marker and police blips.
- **Sound, all synthesized** — engine hum, sirens, thuds, pickups, mission
  jingles and an ambient loop, all from the WebAudio API with no audio files.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Orbit the camera (click the game to lock the pointer) |
| Shift | Sprint on foot |
| Space | Jump on foot / handbrake in a car |
| E | Talk, enter or leave a car, pick up |
| F or mouse click | Punch |
| P or Esc | Pause |

Progress — cash, respect and story position — is saved in the browser's
localStorage, and the start screen offers New Game or Continue.

## Layout

- `game/` — the playable game as static files: `index.html`, `style.css` and
  ES modules under `game/src/` (one job each: world, vehicles, pedestrians,
  player, police, missions, HUD, audio, save, input). Three.js is vendored at
  `game/vendor/three.module.min.js`. It runs offline in desktop Chrome with
  no build step: serve `game/` with any static server, or run `node serve.ts`
  and open <http://localhost:8080>.
- `screenshots/` — four 1280×720 renders of the game itself; the first is the
  cover.
- `main.ts` — the hand-in program: it copies `game/` and `screenshots/` to
  the output directory (`MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with
  `buildDossier` from `vendor/makefun-game.ts`.
- `serve.ts` — the tiny local-play server described above.
- `vendor/makefun-game.ts` — the make.fun kit's dossier library, unchanged.
