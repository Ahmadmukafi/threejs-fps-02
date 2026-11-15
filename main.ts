// RUSTLINE — round 3. Entrypoint: copies game/ and screenshots/ into the
// output directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-threejs.ts. Node 22, standard library only; runs twice and
// both runs write the same bytes (buildDossier is deterministic).
import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const gameSrc = join(root, 'game');
const shotsSrc = join(root, 'screenshots');
if (!existsSync(gameSrc)) throw new Error('game/: no such directory');
if (!existsSync(shotsSrc)) throw new Error('screenshots/: no such directory');

cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`rustline: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
