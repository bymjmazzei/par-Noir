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

    // Third-party indexers catalog
    await db.query(`
      CREATE TABLE IF NOT EXISTS third_party_indexers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        website TEXT,
        status TEXT DEFAULT 'active',
        requested_scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS pn_third_party_access (
        identity TEXT NOT NULL,
        third_party_id TEXT NOT NULL REFERENCES third_party_indexers(id) ON DELETE CASCADE,
        granted_scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
        status TEXT DEFAULT 'active',
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (identity, third_party_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS file_index_visibility (
        file_id TEXT NOT NULL,
        third_party_id TEXT NOT NULL REFERENCES third_party_indexers(id) ON DELETE CASCADE,
        is_allowed BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (file_id, third_party_id)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_pn_third_party_access_identity
      ON pn_third_party_access(identity)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_file_index_visibility_file
      ON file_index_visibility(file_id)
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

    // Feeds table for curated feed management
    await db.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        feed_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_name VARCHAR(255) NOT NULL,
        feed_category VARCHAR(50),
        feed_description TEXT,
        creator_did VARCHAR(255) NOT NULL,
        creator_tier VARCHAR(20) DEFAULT 'free',
        rating_range JSONB DEFAULT '[]'::jsonb,
        branding JSONB DEFAULT '{}'::jsonb,
        subscriber_count INTEGER DEFAULT 0,
        post_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feeds_creator_did
      ON feeds(creator_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feeds_category
      ON feeds(feed_category)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feeds_created_at
      ON feeds(created_at DESC)
    `);

    // Feed subscriptions table
    await db.query(`
      CREATE TABLE IF NOT EXISTS feed_subscriptions (
        subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id UUID NOT NULL REFERENCES feeds(feed_id) ON DELETE CASCADE,
        user_did VARCHAR(255) NOT NULL,
        subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(feed_id, user_did)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feed_subscriptions_user_did
      ON feed_subscriptions(user_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feed_subscriptions_feed_id
      ON feed_subscriptions(feed_id)
    `);

    // Feed posts table (links files to feeds)
    await db.query(`
      CREATE TABLE IF NOT EXISTS feed_posts (
        post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id UUID NOT NULL REFERENCES feeds(feed_id) ON DELETE CASCADE,
        file_id VARCHAR(255) NOT NULL,
        added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        added_by VARCHAR(255),
        UNIQUE(feed_id, file_id)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feed_posts_feed_id
      ON feed_posts(feed_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feed_posts_file_id
      ON feed_posts(file_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_feed_posts_added_at
      ON feed_posts(added_at DESC)
    `);

    // Creator subscriber index table (tracks who subscribes to creator's feeds)
    // Also synced to creator's Google Drive
    await db.query(`
      CREATE TABLE IF NOT EXISTS creator_subscriber_index (
        index_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_did VARCHAR(255) NOT NULL,
        subscriber_did VARCHAR(255) NOT NULL,
        feed_id UUID REFERENCES feeds(feed_id) ON DELETE CASCADE,
        subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        synced_to_drive BOOLEAN DEFAULT FALSE,
        UNIQUE(creator_did, subscriber_did, feed_id)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_creator_subscriber_index_creator_did
      ON creator_subscriber_index(creator_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_creator_subscriber_index_subscriber_did
      ON creator_subscriber_index(subscriber_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_creator_subscriber_index_feed_id
      ON creator_subscriber_index(feed_id)
    `);

    // Engagement table (if not exists)
    await db.query(`
      CREATE TABLE IF NOT EXISTS engagement (
        engagement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id VARCHAR(255) NOT NULL,
        user_did VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        content TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(file_id, user_did, type)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_engagement_file_id
      ON engagement(file_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_engagement_user_did
      ON engagement(user_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_engagement_type
      ON engagement(type)
    `);

    // Notifications table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_did VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_did
      ON notifications(user_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_read
      ON notifications(user_did, read)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at
      ON notifications(created_at DESC)
    `);

    // Notification preferences table
    await db.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_did VARCHAR(255) PRIMARY KEY,
        feed_new_post BOOLEAN DEFAULT true,
        feed_new_comment BOOLEAN DEFAULT true,
        feed_new_like BOOLEAN DEFAULT false,
        feed_new_subscriber BOOLEAN DEFAULT true,
        comment_reply BOOLEAN DEFAULT true,
        mention BOOLEAN DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // OAuth refresh tokens table (persistent storage for refresh tokens)
    await db.query(`
      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        refresh_token TEXT PRIMARY KEY,
        did VARCHAR(255) NOT NULL,
        pn_identifier VARCHAR(255),
        client_id VARCHAR(255) NOT NULL,
        scope TEXT[] DEFAULT ARRAY[]::TEXT[],
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_did
      ON oauth_refresh_tokens(did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_expires_at
      ON oauth_refresh_tokens(expires_at)
    `);

    // Clean up expired refresh tokens periodically (via application logic)
    // The cleanup will happen in the service layer

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

