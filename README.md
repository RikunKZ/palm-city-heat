# Palm City Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/RikunKZ/palm-city-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/RikunKZ/palm-city-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game that runs as plain static files in a
desktop browser — no build step, no network, everything vendored or
generated in code. You are **Reno**, a courier who owes money all over
Palm City, a sun-baked coastal city of towers, palms and boardwalks.

Work the debt off across five story missions — an errand for Rosa's
Noodle Harbor, a borrowed Sunset GT for Benny's Auto Works, three lost
cash bags, a police shake-off, and the timed Harbour Run — then keep
earning with endless delivery jobs.

## Play it

```sh
node serve.ts            # then open http://localhost:8080
```

or serve the `game/` folder with any static file server and open
`game/index.html`.

## What's in the city

- A procedural city on a 7×7 road grid: towers with lit windows, a beach,
  a boardwalk promenade, palms, lamps and named places — the police
  station, Coral Bay Hospital, Hotel Solana, Coral Mall, the Night
  Market, Palm Pier and the Old Cannery.
- On foot: walk, sprint, jump, punch. Cars: steal anything parked or
  moving and drive it with arcade physics and a handbrake.
- Living traffic that keeps right, queues and turns at junctions, and
  pedestrians who stroll, flee trouble and drop cash when knocked down.
- A five-star wanted system driven by a heat score: patrol cars pursue
  and ram, officers chase on foot, a busted meter fills when they corner
  you — fines at the station, hospital fees when you're wasted, and heat
  that cools while you stay out of sight.
- A HUD with cash, respect, health, wanted stars and a live circular
  minimap; dialogue, mission beacons, timers and checkpoints; procedural
  WebAudio sound and music (no audio files); progress — cash, respect
  and story — saved to localStorage.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move, drive, steer |
| Mouse (click game to lock) | Camera; click also punches |
| E | Talk, steal / enter car, exit car, advance dialogue |
| Shift | Sprint |
| Space | Jump on foot, handbrake in a car |
| F | Punch |
| P | Pause |

## Layout

- `game/` — the game itself: `index.html`, `style.css`, one job per file
  under `src/` (world, vehicles, pedestrians, player, police, missions,
  hud, audio, input, save), and Three.js vendored at
  `vendor/three.module.min.js`.
- `screenshots/` — four screenshots of the game running; the first is
  the cover.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json` with `buildDossier`
  from `vendor/makefun-game.ts`. Run it with
  `MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `serve.ts` — a tiny static server for local play.

Palm City Heat is an original work: its city, characters, vehicles and
story are its own, and it uses no names, art or assets from any
commercial game.
