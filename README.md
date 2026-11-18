# Palm City Heat

An original open-world crime game for the make.fun **gta6-01** bounty — a
sun-baked coastal city of towers, palms and boardwalks, built with three.js
and plain static files. No build step, no network: it runs offline in a
desktop browser.

## Play it

```sh
node serve.ts            # then open http://localhost:8080
```

or serve the `game/` folder with any static file server and open
`game/index.html`.

## The game

You are **Reno**, a courier who owes money all over Palm City. Work it off
across five story missions — an errand for Rosa's Noodle Harbor, a borrowed
Sunset GT for Benny's Auto Works, three lost cash bags, a police shake-off,
and the Harbour Run — then keep earning with endless delivery work.

- A procedural city on a 7×7 road grid: towers with lit windows, a beach,
  a boardwalk promenade, palms, lamps and named places (police station,
  hospital, Hotel Solana, Coral Mall, the Night Market, Palm Pier).
- On foot: walk, sprint, jump, punch. Cars: steal anything parked or moving,
  drive it with arcade physics and a handbrake.
- Living traffic that keeps right, queues and turns at intersections, and
  pedestrians who stroll, flee and drop cash.
- A five-star wanted system: heat from crimes, police cars that pursue and
  ram, officers who chase on foot, a busted meter, fines and hospital fees.
- HUD with cash, respect, health, wanted stars and a live minimap; dialogue,
  mission beacons, timers and checkpoints; procedural WebAudio sound and
  music (no audio files); progress saved to localStorage.

Controls: WASD move/drive · mouse look · E enter/exit car · click/F punch ·
Shift sprint · Space jump/handbrake · P pause.

## Layout

- `game/` — the game itself (`index.html`, `style.css`, `src/` modules,
  `vendor/three.module.min.js`).
- `screenshots/` — four screenshots of the game running.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` (run it with
  `MAKEFUN_OUTPUT_DIR=out node main.ts`).
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the vendored make.fun dossier library.

Palm City Heat is an original work: its city, characters, vehicles and story
are its own and use no assets or names from any commercial game.
