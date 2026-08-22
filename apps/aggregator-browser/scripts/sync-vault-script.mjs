/**
 * Copy the generated cloud vault helper into public/js before a build.
 *
 * The unlock page loads this with a plain script tag, so it cannot import from
 * the workspace. It used to be a hand-maintained duplicate, which drifted from
 * the shared resolver and shipped an expired Drive token on every unlock. The
 * copy is now mechanical, and it fails the build if the source is missing so a
 * stale duplicate can never be shipped silently.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

const ASSETS = [
  { name: 'oauth-cloud-vault.js', generated: true, targetSubdir: 'js' },
  { name: 'oauth-callback.html', generated: false, targetSubdir: '' },
];

const SOURCE_DIR = resolve(REPO_ROOT, 'packages/oauth-ui/static');
const PUBLIC_ROOT = resolve(APP_ROOT, 'public');

mkdirSync(resolve(PUBLIC_ROOT, 'js'), { recursive: true });

for (const asset of ASSETS) {
  const source = resolve(SOURCE_DIR, asset.name);
  if (!existsSync(source)) {
    const hint = asset.generated
      ? "Run 'npm run build:vault-script' in packages/oauth-ui first."
      : 'Ensure packages/oauth-ui/static/oauth-callback.html exists.';
    console.error(`[sync-vault-script] Missing ${source}.\n${hint}`);
    process.exit(1);
  }
  const targetDir = asset.targetSubdir
    ? resolve(PUBLIC_ROOT, asset.targetSubdir)
    : PUBLIC_ROOT;
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, resolve(targetDir, asset.name));
  const rel = asset.targetSubdir ? `public/${asset.targetSubdir}/` : 'public/';
  console.log(`[sync-vault-script] ${asset.name} -> ${rel}`);
}
