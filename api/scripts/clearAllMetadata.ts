/**
 * Script to clear all metadata from the aggregator database
 * Run with: npx ts-node api/scripts/clearAllMetadata.ts
 */

import { getDatabasePool } from '../src/server/utils/database';

async function clearAllMetadata() {
  const db = getDatabasePool();
  
  try {
    console.log('🗑️  Starting metadata cleanup...');
    
    // Get count before deletion
    const countResult = await db.query('SELECT COUNT(*) as count FROM aggregator_metadata');
    const beforeCount = parseInt(countResult.rows[0].count, 10);
    
    // Delete all entries
    await db.query('DELETE FROM aggregator_metadata');
    
    // Also clear feed_posts if they exist
    try {
      await db.query('DELETE FROM feed_posts');
      console.log('✅ Cleared feed_posts table');
    } catch (feedError) {
      console.log('ℹ️ feed_posts table not found or already empty');
    }
    
    console.log(`✅ Deleted ${beforeCount} entries from aggregator_metadata`);
    console.log('🎉 Cleanup complete! Public feed should now be empty.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear metadata:', error);
    process.exit(1);
  }
}

clearAllMetadata();

