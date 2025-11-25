/**
 * Run database migration script
 * Usage: node scripts/run-migration.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('📊 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    const migrationPath = path.join(__dirname, '../migrations/add_enhanced_feed_posts.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🔄 Running migration...');
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

