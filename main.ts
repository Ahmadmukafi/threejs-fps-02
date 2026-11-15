// RUSTLINE — the entrypoint: hands the game in to make.fun.
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier, the kit's
// own library. Node 22, standard library only; two runs write the same bytes.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function fail(msg) {
  console.error(`rustline: ${msg}`);
  process.exit(1);
}

if (!existsSync(join(repoDir, 'game'))) fail('game/ is missing from the repository');
if (!existsSync(join(repoDir, 'screenshots'))) fail('screenshots/ is missing from the repository');

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const dest = join(outDir, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(repoDir, name), dest, { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`rustline: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
