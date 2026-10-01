/**
 * Boot pass: copy public counts off person rows, then delete those rows.
 * Poll tallies, comments, the sealed vault, and billing tables stay.
 */

import { getDatabasePool } from '../utils/database';

export async function shrinkServerPersonRows(): Promise<void> {
  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('shrink-server-person-rows'))`);
    await client.query(`
      INSERT INTO engagement_public_counts (file_id, type, count)
      SELECT file_id, type, COUNT(*)::int
      FROM engagement
      WHERE type IN ('like', 'dislike', 'share', 'save')
      GROUP BY file_id, type
      ON CONFLICT (file_id, type) DO UPDATE
        SET count = engagement_public_counts.count + EXCLUDED.count
    `);
    await client.query(`
      DELETE FROM engagement
      WHERE type IN ('like', 'dislike', 'share', 'save')
    `);
    await client.query(`
      UPDATE feeds f
      SET subscriber_count = GREATEST(
        f.subscriber_count,
        COALESCE((
          SELECT COUNT(*)::int FROM feed_subscriptions s WHERE s.feed_id = f.feed_id
        ), 0)
      )
    `);
    await client.query(`DELETE FROM feed_subscriptions`);
    await client.query(`DELETE FROM creator_subscriber_index`);
    await client.query(`DELETE FROM user_tag_preferences`);
    await client.query(`DELETE FROM device_tokens`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
