/**
 * Script to delete all comments from the database
 * Run with: npx ts-node scripts/deleteAllComments.ts
 */

import { getDatabasePool } from '../src/server/utils/database';

async function deleteAllComments() {
  const db = getDatabasePool();
  
  try {
    console.log('🗑️  Starting comment deletion...');
    
    // Delete all comments
    const commentsResult = await db.query(`
      DELETE FROM engagement 
      WHERE type = 'comment'
      RETURNING engagement_id
    `);

    // Also delete all comment likes
    const likesResult = await db.query(`
      DELETE FROM engagement 
      WHERE type = 'comment_like'
    `);

    console.log(`✅ Deleted ${commentsResult.rowCount || 0} comments`);
    console.log(`✅ Deleted ${likesResult.rowCount || 0} comment likes`);
    console.log('🎉 Cleanup complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to delete comments:', error);
    process.exit(1);
  }
}

deleteAllComments();

