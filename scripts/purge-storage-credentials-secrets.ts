#!/usr/bin/env node
/**
 * One-time ops: purge OAuth / provider secrets from storage_credentials
 * after DEVICE_CLOUD_CUSTODY migration. Keeps layout metadata.
 *
 * Usage (from api/ with DATABASE_URL + STORAGE_CREDENTIALS_SECRET set):
 *   npx tsx ../scripts/purge-storage-credentials-secrets.ts
 *   npx tsx ../scripts/purge-storage-credentials-secrets.ts --identity pn-...
 */

import path from 'path';

async function main() {
  process.chdir(path.resolve(__dirname, '../api'));
  const { storageCredentialsService } = await import(
    '../api/src/server/modules/storageCredentialsService'
  );
  const { getDatabasePool } = await import('../api/src/server/utils/database');
  const { isDeviceCloudCustodyEnabled } = await import(
    '../api/src/server/modules/socialMailboxService'
  );

  if (!isDeviceCloudCustodyEnabled()) {
    console.error('Refuse to purge: set DEVICE_CLOUD_CUSTODY=1 first.');
    process.exit(1);
  }

  const identityArgIdx = process.argv.indexOf('--identity');
  const onlyIdentity =
    identityArgIdx >= 0 ? process.argv[identityArgIdx + 1] : undefined;

  const db = getDatabasePool();
  const result = onlyIdentity
    ? await db.query(`SELECT identity_id FROM storage_credentials WHERE identity_id = $1`, [
        onlyIdentity
      ])
    : await db.query(`SELECT identity_id FROM storage_credentials`);

  let purged = 0;
  for (const row of result.rows) {
    const id = row.identity_id as string;
    await storageCredentialsService.purgeCloudSecrets(id);
    purged += 1;
    console.log(`purged secrets for identity (${id.slice(0, 8)}…)`);
  }
  console.log(`Done. Purged ${purged} row(s). Rotate STORAGE_CREDENTIALS_SECRET after cutover.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
