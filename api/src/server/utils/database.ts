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
    const dbUrl = process.env.DATABASE_URL;
    
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Railway and most cloud providers require SSL
    // Check if URL contains sslmode or if it's a Railway/cloud provider URL
    const requiresSSL = dbUrl.includes('sslmode=require') || 
                        dbUrl.includes('railway.app') ||
                        dbUrl.includes('railway.internal') ||
                        dbUrl.includes('supabase.co') ||
                        dbUrl.includes('neon.tech') ||
                        dbUrl.includes('render.com');

    // Pool max defaults to 20; can be increased via DATABASE_POOL_MAX if load testing shows exhaustion
    const poolMax = parseInt(process.env.DATABASE_POOL_MAX || '20', 10) || 20;
    const rejectUnauthorizedOverride = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const rejectUnauthorized =
      typeof rejectUnauthorizedOverride === 'string'
        ? rejectUnauthorizedOverride !== 'false'
        : false;

    const config: PoolConfig = {
      connectionString: dbUrl,
      ssl: requiresSSL
        ? {
            rejectUnauthorized,
          }
        : false,
      max: poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // Increased to 30 seconds for Railway network latency
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

  // Test connection first with retry logic
  let retries = 3;
  let lastError: Error | null = null;
  
  while (retries > 0) {
    try {
      // Simple connection test
      await db.query('SELECT 1');
      console.log('✅ Database connection test successful');
      break;
    } catch (error) {
      lastError = error as Error;
      retries--;
      if (retries > 0) {
        console.warn(`⚠️ Database connection test failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      }
    }
  }

  if (retries === 0 && lastError) {
    console.error('❌ Failed to connect to database after 3 attempts');
    throw lastError;
  }

  try {
    // Create content-type specific tables for better performance and organization
    // Each content type has its own table to eliminate filtering overhead
    
    // Media table (images, videos, audio)
    await db.query(`
      CREATE TABLE IF NOT EXISTS aggregator_media (
        file_id VARCHAR(255) PRIMARY KEY,
        metadata JSONB NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        pn_identifier VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Thoughts table (text posts, thoughts)
    await db.query(`
      CREATE TABLE IF NOT EXISTS aggregator_thoughts (
        file_id VARCHAR(255) PRIMARY KEY,
        metadata JSONB NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        pn_identifier VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Collections table (collections of files)
    await db.query(`
      CREATE TABLE IF NOT EXISTS aggregator_collections (
        file_id VARCHAR(255) PRIMARY KEY,
        metadata JSONB NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        pn_identifier VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for aggregator_media
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_media_pn_identifier 
      ON aggregator_media(pn_identifier)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_media_is_public 
      ON aggregator_media((metadata->>'isPublic'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_media_updated_at 
      ON aggregator_media(updated_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_media_public_only 
      ON aggregator_media(updated_at DESC)
      WHERE metadata->>'isPublic' = 'true'
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_media_keywords_gin 
      ON aggregator_media USING GIN((metadata->'keywords'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_media_feed_category
      ON aggregator_media USING GIN((metadata->'feedCategories'))
    `);

    // Create indexes for aggregator_thoughts
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_thoughts_pn_identifier 
      ON aggregator_thoughts(pn_identifier)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_thoughts_is_public 
      ON aggregator_thoughts((metadata->>'isPublic'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_thoughts_updated_at 
      ON aggregator_thoughts(updated_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_thoughts_public_only 
      ON aggregator_thoughts(updated_at DESC)
      WHERE metadata->>'isPublic' = 'true'
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_thoughts_keywords_gin 
      ON aggregator_thoughts USING GIN((metadata->'keywords'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_thoughts_feed_category
      ON aggregator_thoughts USING GIN((metadata->'feedCategories'))
    `);

    // Create indexes for aggregator_collections
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_collections_pn_identifier 
      ON aggregator_collections(pn_identifier)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_collections_is_public 
      ON aggregator_collections((metadata->>'isPublic'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_aggregator_collections_updated_at 
      ON aggregator_collections(updated_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_collections_public_only 
      ON aggregator_collections(updated_at DESC)
      WHERE metadata->>'isPublic' = 'true'
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_collections_keywords_gin 
      ON aggregator_collections USING GIN((metadata->'keywords'))
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_collections_feed_category
      ON aggregator_collections USING GIN((metadata->'feedCategories'))
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
    // Note: feed_id is TEXT to support both UUIDs and special formats like "saved-{userPnIdentifier}"
    // For regular feeds, we generate a UUID string. For saved feeds, we use "saved-{userPnIdentifier}"
    await db.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        feed_id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
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

    // Migrate existing UUID feed_id to TEXT if needed
    try {
      await db.query(`
        DO $$ 
        BEGIN
          -- Drop foreign key constraints first if they exist
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'feed_posts_feed_id_fkey'
          ) THEN
            ALTER TABLE feed_posts DROP CONSTRAINT feed_posts_feed_id_fkey;
          END IF;
          
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'feed_subscriptions_feed_id_fkey'
          ) THEN
            ALTER TABLE feed_subscriptions DROP CONSTRAINT feed_subscriptions_feed_id_fkey;
          END IF;
          
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'creator_subscriber_index_feed_id_fkey'
          ) THEN
            ALTER TABLE creator_subscriber_index DROP CONSTRAINT creator_subscriber_index_feed_id_fkey;
          END IF;
          
          -- Convert columns to TEXT if they're UUID
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'feeds' 
            AND column_name = 'feed_id'
            AND data_type = 'uuid'
          ) THEN
            ALTER TABLE feeds ALTER COLUMN feed_id TYPE TEXT USING feed_id::text;
          END IF;
          
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'feed_posts' 
            AND column_name = 'feed_id'
            AND data_type = 'uuid'
          ) THEN
            ALTER TABLE feed_posts ALTER COLUMN feed_id TYPE TEXT USING feed_id::text;
          END IF;
          
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'feed_subscriptions' 
            AND column_name = 'feed_id'
            AND data_type = 'uuid'
          ) THEN
            ALTER TABLE feed_subscriptions ALTER COLUMN feed_id TYPE TEXT USING feed_id::text;
          END IF;
          
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'creator_subscriber_index' 
            AND column_name = 'feed_id'
            AND data_type = 'uuid'
          ) THEN
            ALTER TABLE creator_subscriber_index ALTER COLUMN feed_id TYPE TEXT USING feed_id::text;
          END IF;
          
          -- Recreate foreign key constraints with TEXT
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'feed_posts_feed_id_fkey'
          ) THEN
            ALTER TABLE feed_posts ADD CONSTRAINT feed_posts_feed_id_fkey 
            FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE;
          END IF;
          
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'feed_subscriptions_feed_id_fkey'
          ) THEN
            ALTER TABLE feed_subscriptions ADD CONSTRAINT feed_subscriptions_feed_id_fkey 
            FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE;
          END IF;
          
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'creator_subscriber_index_feed_id_fkey'
          ) THEN
            ALTER TABLE creator_subscriber_index ADD CONSTRAINT creator_subscriber_index_feed_id_fkey 
            FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);
    } catch (error) {
      console.debug('ℹ️ feeds.feed_id migration error (may already be TEXT):', (error as Error).message);
    }

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
        feed_id TEXT NOT NULL REFERENCES feeds(feed_id) ON DELETE CASCADE,
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
        feed_id TEXT NOT NULL REFERENCES feeds(feed_id) ON DELETE CASCADE,
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
        feed_id TEXT REFERENCES feeds(feed_id) ON DELETE CASCADE,
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS engagement_file_user_type_toggle_unique
      ON engagement (file_id, user_did, type)
      WHERE type IN ('like', 'dislike', 'share', 'save')
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

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_engagement_file_user_type
      ON engagement(file_id, user_did, type)
    `);

    // User tag preferences table (for recommendation algorithm)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_tag_preferences (
        preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_did VARCHAR(255) NOT NULL,
        tag_id VARCHAR(255) NOT NULL,
        preference VARCHAR(20) NOT NULL,
        action VARCHAR(50) NOT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.5,
        source_file_id VARCHAR(255),
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_did, tag_id)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tag_preferences_user_did
      ON user_tag_preferences(user_did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tag_preferences_tag_id
      ON user_tag_preferences(tag_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tag_preferences_preference
      ON user_tag_preferences(preference)
    `);

    // NOTE: User data (notifications, activity ledger, messaging ledger) is now stored
    // in Google Drive (decentralized) - users own their data
    // Database tables for these have been removed to follow the decentralized architecture
    // 
    // Files stored in Google Drive:
    // - notifications.json (in user's _metadata folder)
    // - activity_ledger.json (in user's _metadata folder)
    // - messaging_ledger.json (in user's _metadata folder)

    // OAuth refresh tokens table (persistent storage for refresh tokens)
    await db.query(`
      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        refresh_token TEXT PRIMARY KEY,
        did VARCHAR(255) NOT NULL,
        pn_identifier VARCHAR(255),
        public_key TEXT,
        client_id VARCHAR(255) NOT NULL,
        scope TEXT[] DEFAULT ARRAY[]::TEXT[],
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      ALTER TABLE oauth_refresh_tokens
      ADD COLUMN IF NOT EXISTS family_id UUID,
      ADD COLUMN IF NOT EXISTS jti UUID,
      ADD COLUMN IF NOT EXISTS previous_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS replaced_by TEXT,
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
      ADD COLUMN IF NOT EXISTS reuse_detected_at TIMESTAMP WITH TIME ZONE
    `);
    
    // Add pn_identifier column if it doesn't exist (for existing installations)
    try {
      await db.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'oauth_refresh_tokens' 
            AND column_name = 'pn_identifier'
          ) THEN
            ALTER TABLE oauth_refresh_tokens ADD COLUMN pn_identifier VARCHAR(255);
          END IF;
        END $$;
      `);
    } catch (error) {
      // Column might already exist, ignore error
      console.debug('ℹ️ oauth_refresh_tokens.pn_identifier column migration error:', (error as Error).message);
    }
    
    // Add public_key column if it doesn't exist (for existing installations)
    try {
      await db.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'oauth_refresh_tokens' 
            AND column_name = 'public_key'
          ) THEN
            ALTER TABLE oauth_refresh_tokens ADD COLUMN public_key TEXT;
          END IF;
        END $$;
      `);
    } catch (error) {
      // Column might already exist, ignore error
      console.debug('ℹ️ oauth_refresh_tokens.public_key column migration error:', (error as Error).message);
    }

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_did
      ON oauth_refresh_tokens(did)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_expires_at
      ON oauth_refresh_tokens(expires_at)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_family_id
      ON oauth_refresh_tokens(family_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_used_at
      ON oauth_refresh_tokens(used_at)
    `);

    // OAuth client registry + API keys (persistent; see docs/architecture/why-oauth-registry-is-centralized.md)
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_oauth_clients_api_keys.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ oauth_clients / api_keys migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ oauth_clients / api_keys migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const ownerPnPath = path.join(__dirname, '../../migrations/add_oauth_clients_owner_pn.sql');
      const ownerPnSql = fs.readFileSync(ownerPnPath, 'utf-8');
      await db.query(ownerPnSql);
      console.log('✅ oauth_clients.owner_pn_id migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ oauth_clients owner_pn_id migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const platformPath = path.join(__dirname, '../../migrations/add_platform_registry_cache.sql');
      const platformSql = fs.readFileSync(platformPath, 'utf-8');
      await db.query(platformSql);
      console.log('✅ platform_registry_cache migration executed');
    } catch (migrationError: unknown) {
      console.error(
        '❌ platform_registry_cache migration failed:',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
      throw migrationError;
    }

    const { ClientRegistrationService } = await import('../modules/clientRegistration');
    await ClientRegistrationService.ensureDefaultClientsSeeded();

    // User profiles table - indexes pnIdentifier to displayName for fast lookups
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        pn_identifier VARCHAR(255) PRIMARY KEY,
        display_name VARCHAR(255),
        profile_image_file_id VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_profiles_pn_identifier
      ON user_profiles(pn_identifier)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at
      ON user_profiles(updated_at DESC)
    `);

    // Clean up expired refresh tokens periodically (via application logic)
    // The cleanup will happen in the service layer

    // Prism DMCA review tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS prism_review_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id VARCHAR(255) NOT NULL,
        owner_pn_identifier VARCHAR(255) NOT NULL,
        flag_source VARCHAR(50) NOT NULL,
        reporter_pn_identifier VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_review_queue_status ON prism_review_queue(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_review_queue_file_id ON prism_review_queue(file_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_review_queue_created_at ON prism_review_queue(created_at DESC)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS prism_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        queue_item_id UUID NOT NULL REFERENCES prism_review_queue(id) ON DELETE CASCADE,
        ray_pn_identifier VARCHAR(255) NOT NULL,
        vote VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(queue_item_id, ray_pn_identifier)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_votes_queue_item ON prism_votes(queue_item_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_votes_ray ON prism_votes(ray_pn_identifier)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS prism_ray_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pn_identifier VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        decided_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(pn_identifier)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_prism_ray_applications_status ON prism_ray_applications(status)`);

    // Repeat infringer timeouts (temporary restriction only; no permanent removal)
    await db.query(`
      CREATE TABLE IF NOT EXISTS repeat_infringer_timeouts (
        owner_pn_identifier VARCHAR(255) PRIMARY KEY,
        timeout_until TIMESTAMP WITH TIME ZONE NOT NULL,
        offense_number INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_repeat_infringer_timeouts_timeout_until ON repeat_infringer_timeouts(timeout_until)`);

    // Content notices (DMCA/index removal notices for content owners - in-app only)
    await db.query(`
      CREATE TABLE IF NOT EXISTS content_notices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_pn_identifier VARCHAR(255) NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        reason TEXT,
        source VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_content_notices_owner ON content_notices(owner_pn_identifier)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_content_notices_created_at ON content_notices(created_at DESC)`);

    // DMCA takedown requests (from claimants)
    await db.query(`
      CREATE TABLE IF NOT EXISTS dmca_takedown_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        claimant_name VARCHAR(255) NOT NULL,
        claimant_email VARCHAR(255) NOT NULL,
        copyrighted_work_description TEXT NOT NULL,
        infringing_content_ref VARCHAR(1024) NOT NULL,
        good_faith_statement TEXT NOT NULL,
        signature VARCHAR(512) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        processed_at TIMESTAMP WITH TIME ZONE,
        processed_by VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dmca_takedown_requests_status ON dmca_takedown_requests(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dmca_takedown_requests_created_at ON dmca_takedown_requests(created_at DESC)`);

    // DMCA counter-notices (from content owners)
    await db.query(`
      CREATE TABLE IF NOT EXISTS dmca_counter_notices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_notice_id UUID REFERENCES content_notices(id) ON DELETE SET NULL,
        dmca_takedown_request_id UUID REFERENCES dmca_takedown_requests(id) ON DELETE SET NULL,
        owner_pn_identifier VARCHAR(255) NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        statement TEXT NOT NULL,
        signature VARCHAR(512) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        forwarded_at TIMESTAMP WITH TIME ZONE,
        restore_after TIMESTAMP WITH TIME ZONE,
        restored_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dmca_counter_notices_status ON dmca_counter_notices(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dmca_counter_notices_restore_after ON dmca_counter_notices(restore_after)`);

    // Run bot detection migration
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_bot_detection.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ Bot detection migration executed');
    } catch (migrationError: any) {
      // Migration errors are non-fatal - table/columns may already exist
      const message = migrationError?.message || '';
      if (message.includes('functions in index expression must be marked IMMUTABLE')) {
        console.log('ℹ️ Bot detection migration skipped legacy immutable index expression; continuing startup');
      } else {
        console.debug('ℹ️ Bot detection migration error (may already be applied):', message);
      }
    }

    // Run prism min_required_reputation migration
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_prism_min_required_reputation.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ Prism min_required_reputation migration executed');
    } catch (migrationError: any) {
      console.debug('ℹ️ Prism min_required_reputation migration error (may already be applied):', migrationError?.message);
    }

    // Run device_tokens migration (push notifications)
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_device_tokens.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ Device tokens migration executed');
    } catch (migrationError: any) {
      console.debug('ℹ️ Device tokens migration error (may already be applied):', (migrationError as Error)?.message);
    }

    // Identity succession + audit_events
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_identity_succession_audit.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ Identity succession / audit migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ Identity succession migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(__dirname, '../../migrations/add_identity_migration.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      await db.query(migrationSQL);
      console.log('✅ Identity migration table migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ Identity migration table migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const driveProgressPath = path.join(__dirname, '../../migrations/add_identity_migration_drive_progress.sql');
      const driveProgressSql = fs.readFileSync(driveProgressPath, 'utf-8');
      await db.query(driveProgressSql);
      console.log('✅ Identity migration drive progress columns migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ Identity migration drive progress migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const { warmIdentitySuccessionCache } = await import('../modules/identitySuccessionService');
      await warmIdentitySuccessionCache();
      console.log('✅ Identity succession revocation cache warmed');
    } catch (warmErr: unknown) {
      console.debug(
        'ℹ️ Identity succession cache warm skipped:',
        warmErr instanceof Error ? warmErr.message : warmErr
      );
    }

    // pn_owned_assets registry + delegations + api_keys link columns
    try {
      const fs = await import('fs');
      const path = await import('path');
      const ownedPath = path.join(__dirname, '../../migrations/add_pn_owned_assets.sql');
      const ownedSql = fs.readFileSync(ownedPath, 'utf-8');
      await db.query(ownedSql);
      console.log('✅ pn_owned_assets migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ pn_owned_assets migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const { OwnedAssetService } = await import('../modules/ownedAssetService');
      await OwnedAssetService.backfillLegacyApiKeys();
    } catch (bfErr: unknown) {
      console.debug(
        'ℹ️ owned-assets backfill skipped:',
        bfErr instanceof Error ? bfErr.message : bfErr
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const musicPath = path.join(__dirname, '../../migrations/add_music_track_registry.sql');
      const musicSql = fs.readFileSync(musicPath, 'utf-8');
      await db.query(musicSql);
      console.log('✅ music_registry_tracks migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ music_registry_tracks migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const fundPath = path.join(__dirname, '../../migrations/add_creator_fund_monetization.sql');
      const fundSql = fs.readFileSync(fundPath, 'utf-8');
      await db.query(fundSql);
      console.log('✅ creator_fund_monetization migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ creator_fund_monetization migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const wfPath = path.join(__dirname, '../../migrations/add_creator_fund_period_waterfall.sql');
      const wfSql = fs.readFileSync(wfPath, 'utf-8');
      await db.query(wfSql);
      console.log('✅ creator_fund_period_waterfall migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ creator_fund_period_waterfall migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const allocPath = path.join(
        __dirname,
        '../../migrations/add_creator_fund_allocations_payouts_attestation_post_uses.sql'
      );
      const allocSql = fs.readFileSync(allocPath, 'utf-8');
      await db.query(allocSql);
      console.log('✅ creator_fund_allocations_payouts_attestation_post_uses migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ creator_fund_allocations_payouts_attestation_post_uses migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const musicKmsPath = path.join(
        __dirname,
        '../../migrations/add_creator_fund_music_buckets_kms_signature.sql'
      );
      const musicKmsSql = fs.readFileSync(musicKmsPath, 'utf-8');
      await db.query(musicKmsSql);
      console.log('✅ creator_fund_music_buckets_kms_signature migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ creator_fund_music_buckets_kms_signature migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const periodTzPath = path.join(__dirname, '../../migrations/add_creator_fund_period_tz_column.sql');
      const periodTzSql = fs.readFileSync(periodTzPath, 'utf-8');
      await db.query(periodTzSql);
      console.log('✅ creator_fund_period_tz_column migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ creator_fund_period_tz_column migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const engFundPath = path.join(
        __dirname,
        '../../migrations/add_engagement_fund_monetizable_flags.sql'
      );
      const engFundSql = fs.readFileSync(engFundPath, 'utf-8');
      await db.query(engFundSql);
      console.log('✅ engagement_fund_monetizable_flags migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ engagement_fund_monetizable_flags migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const webhookPath = path.join(__dirname, '../../migrations/add_integrator_webhook_subscriptions.sql');
      const webhookSql = fs.readFileSync(webhookPath, 'utf-8');
      await db.query(webhookSql);
      console.log('✅ integrator_webhook_subscriptions migration executed');
    } catch (migrationError: unknown) {
      console.debug(
        'ℹ️ integrator_webhook_subscriptions migration error (may already be applied):',
        migrationError instanceof Error ? migrationError.message : migrationError
      );
    }

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

