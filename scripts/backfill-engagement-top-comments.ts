#!/usr/bin/env node
/**
 * OPTIONAL: denormalize engagement.topComments onto aggregator metadata rows.
 *
 * Prefer for test fixtures: delete old public posts in browse Storage/Me and
 * create new posts (write path refreshes topComments). Use this only if you
 * need to keep existing public rows.
 *
 * Usage (from api/ with DATABASE_URL set):
 *   npx tsx ../scripts/backfill-engagement-top-comments.ts
 *   npx tsx ../scripts/backfill-engagement-top-comments.ts --limit 50
 */

import path from 'path';

async function main() {
  process.chdir(path.resolve(__dirname, '../api'));

  const { AggregatorMetadataServiceDB } = await import(
    '../api/src/server/modules/aggregatorMetadataServiceDB'
  );
  const { getDatabasePool } = await import('../api/src/server/utils/database');

  const limitIdx = process.argv.indexOf('--limit');
  const limit =
    limitIdx >= 0 && process.argv[limitIdx + 1]
      ? Math.max(1, parseInt(process.argv[limitIdx + 1], 10) || 0)
      : 0;

  const db = getDatabasePool();
  const tables = ['aggregator_media', 'aggregator_notes', 'aggregator_collections'];
  const fileIds = new Set<string>();

  for (const table of tables) {
    const result = await db.query<{ file_id: string }>(
      `SELECT file_id FROM ${table} WHERE is_public = true`
    );
    for (const row of result.rows) {
      if (row.file_id) fileIds.add(row.file_id);
    }
  }

  let ids = [...fileIds];
  if (limit > 0) ids = ids.slice(0, limit);

  console.log(`Backfilling topComments for ${ids.length} public file(s)…`);
  const svc = AggregatorMetadataServiceDB.getInstance();
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const fileId of ids) {
    try {
      const updated = await svc.refreshEngagementTopComments(fileId);
      if (updated) ok += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.warn(`Failed ${fileId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done. updated=${ok} skipped=${skipped} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
