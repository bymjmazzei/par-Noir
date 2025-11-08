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

    // Create storage_credentials table for encrypted storage metadata
    await db.query(`
      CREATE TABLE IF NOT EXISTS storage_credentials (
        identity_id TEXT PRIMARY KEY,
        encrypted_metadata TEXT NOT NULL,
        cid TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Ensure existing installations have the correct column types
    try {
      await db.query(`
        ALTER TABLE storage_credentials
        ALTER COLUMN identity_id TYPE TEXT
      `);
    } catch (error) {
      console.debug('ℹ️ storage_credentials.identity_id already TEXT or table missing:', (error as Error).message);
    }

    try {
      await db.query(`
        ALTER TABLE storage_credentials
        ALTER COLUMN encrypted_metadata TYPE TEXT
        USING encrypted_metadata::text
      `);
    } catch (error) {
      console.debug('ℹ️ storage_credentials.encrypted_metadata already TEXT or table missing:', (error as Error).message);
    }

    try {
      await db.query(`
        ALTER TABLE storage_credentials
        ALTER COLUMN cid TYPE TEXT
      `);
    } catch (error) {
      console.debug('ℹ️ storage_credentials.cid already TEXT or table missing:', (error as Error).message);
    }

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_storage_credentials_updated_at
      ON storage_credentials(updated_at DESC)
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

