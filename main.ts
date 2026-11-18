// Palm City Heat — the hand-in program for the make.fun gta6-01 bounty.
// It copies the game and its screenshots into the output directory and
// writes the dossier the scorer expects, using the vendored library.
// Run it with: MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps, from the competition's gate: only text_max_bytes
// shapes the dossier's bytes; the rest refuse an entry the scorer would
// refuse anyway (over 4 screenshots or one over 256 KiB, over 993 entries
// or 48 MiB under game/, or a game path over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`Palm City Heat handed in: dossier.json (${dossier.length} bytes) -> ${out}`);
