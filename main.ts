// RUSTLINE — round 4 fix. Entrypoint: stages game/ and screenshots/ into the
// output directory and writes /output/dossier.json using buildDossier from
// vendor/makefun-threejs.ts. Node 22, standard library only.
//
// The round-3 version failed the grader's run_completes check: it called
// rmSync on the output directory itself, and in the grader /output is a
// mounted volume, so removing it fails with EBUSY. This version never
// removes the output directory — it only clears the two subdirectories
// inside it, which the grader's filesystem allows.
import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Make sure the output directory exists; never delete it (it may be a mount).
mkdirSync(outDir, { recursive: true });

for (const name of ['game', 'screenshots']) {
  const src = join(root, name);
  if (!existsSync(src)) throw new Error(`${name}/ is missing from the repository`);
  const dest = join(outDir, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`rustline: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
