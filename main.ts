// Palm City Heat — make.fun gta6-01 hand-in program.
//
// Run by the grader as `node main.ts` with MAKEFUN_OUTPUT_DIR naming the
// output directory (the platform uses /output). It copies the static game
// and its screenshots out of this repository, then writes dossier.json with
// the kit's own buildDossier so the handed-in dossier is byte for byte the
// one the scorer rebuilds from the same files.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Palm City Heat handed in: dossier.json (${dossier.length} bytes) written to ${outDir}`);
