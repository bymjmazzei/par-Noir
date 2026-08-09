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

const ASSETS = [{ name: 'oauth-cloud-vault.js', generated: true }];

const SOURCE_DIR = resolve(REPO_ROOT, 'packages/oauth-ui/static');
const TARGET_DIR = resolve(APP_ROOT, 'public/js');

mkdirSync(TARGET_DIR, { recursive: true });

for (const asset of ASSETS) {
  const source = resolve(SOURCE_DIR, asset.name);
  if (!existsSync(source)) {
    console.error(
      `[sync-vault-script] Missing ${source}.\n` +
        "Run 'npm run build:vault-script' in packages/oauth-ui first."
    );
    process.exit(1);
  }
  copyFileSync(source, resolve(TARGET_DIR, asset.name));
  console.log(`[sync-vault-script] ${asset.name} -> public/js`);
}
