// RUSTLINE — entrypoint (Node 22, stdlib only). Hands the game in: copies
// game/ and screenshots/ from this repository to the output directory and
// writes dossier.json with buildDossier from vendor/makefun-threejs.ts.
// Deterministic: two runs write the same bytes.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function main() {
  const gameSrc = join(repoRoot, 'game');
  const shotsSrc = join(repoRoot, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('game/ is missing from the repository');
  if (!existsSync(shotsSrc)) throw new Error('screenshots/ is missing from the repository');

  // Start clean so a stale file can never leak into the hand-in.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outDir, caps);
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  // A short, stable summary for the log.
  const parsed = JSON.parse(dossier);
  const game = parsed.game || {};
  console.log(
    `rustline: game ${game.files?.length ?? 0} files, ` +
    `${game.totalBytes ?? 0} bytes, ` +
    `screenshots ${parsed.screenshots?.length ?? 0}, ` +
    `dossier ${dossier.length} bytes`,
  );
}

main();
