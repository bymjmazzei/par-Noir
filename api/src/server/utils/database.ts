/**
 * PostgreSQL Database Connection Utility
 * Handles connection pooling and database operations
 */

import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getDatabasePool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('sslmode=require') 
        ? { rejectUnauthorized: false }
        : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    pool = new Pool(config);

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('❌ Unexpected error on idle database client:', err);
    });

    console.log('✅ Database connection pool created');
  }

  return pool;
}

/**
 * Initialize database schema
 * Creates tables if they don't exist
 */
export async function initializeDatabase(): Promise<void> {
  const db = getDatabasePool();

  try {
    // Create aggregator_metadata table
    await db.query(`
      CREATE TABLE IF NOT EXISTS aggregator_metadata (
        file_id VARCHAR(255) PRIMARY KEY,
        metadata JSONB NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        pn_identifier VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create index on pn_identifier for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_metadata_pn_identifier 
      ON aggregator_metadata(pn_identifier)
    `);

    // Create index on isPublic for filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_metadata_is_public 
      ON aggregator_metadata((metadata->>'isPublic'))
    `);

    // Create index on fileType for filtering
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_metadata_file_type 
      ON aggregator_metadata((metadata->>'fileType'))
    `);

    // Create index on updated_at for sorting
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_metadata_updated_at 
      ON aggregator_metadata(updated_at DESC)
    `);

    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database connection pool closed');
  }
}

