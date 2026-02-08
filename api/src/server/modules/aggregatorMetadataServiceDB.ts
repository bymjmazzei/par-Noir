/**
 * Aggregator Metadata Service (Database-Backed)
 * 
 * IMPORTANT: This service maintains a PERFORMANCE CACHE, not the source of truth.
 * 
 * Architecture:
 * - Google Drive (`public-file-index.xlsx`) is the SOURCE OF TRUTH (decentralized, user-owned)
 * - This database is a PERFORMANCE CACHE for fast queries (PostgreSQL)
 * - Sync service (GoogleDriveSyncService) keeps cache fresh by syncing from Google Drive
 * - Users own their data on Google Drive; this cache is just for performance
 * 
 * When files are updated via API, both the cache (this database) and the source of truth
 * (Google Drive index) should be updated to keep them in sync.
 */

import { getDatabasePool } from '../utils/database';
import { isDriveFileUrlDead } from '../utils/driveUrlCheck';
import { PublicMetadata, CentralIndexEntry, CentralIndexResponse, EngagementMetrics } from './aggregatorMetadataService';

export class AggregatorMetadataServiceDB {
  private static instance: AggregatorMetadataServiceDB;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): AggregatorMetadataServiceDB {
    if (!AggregatorMetadataServiceDB.instance) {
      AggregatorMetadataServiceDB.instance = new AggregatorMetadataServiceDB();
    }
    return AggregatorMetadataServiceDB.instance;
  }

  /**
   * Get table name for a given content class
   */
  private getTableNameForContentClass(contentClass: 'media' | 'thought' | 'collection'): string {
    switch (contentClass) {
      case 'media':
        return 'aggregator_media';
      case 'thought':
        return 'aggregator_thoughts';
      case 'collection':
        return 'aggregator_collections';
      default:
        throw new Error(`Unknown contentClass: ${contentClass}`);
    }
  }

  /**
   * Get all content type table names
   */
  private getAllContentTypeTables(): string[] {
    return ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'];
  }

  /**
   * Submit public metadata to central index
   * Validates structure before adding
   */
  async submitMetadata(metadata: PublicMetadata, pnIdentifier?: string, ownerDid?: string): Promise<void> {
    // Only require fileId - other fields can have defaults
    if (!metadata.fileId) {
      throw new Error('Invalid metadata: missing required field: fileId');
    }

    const db = getDatabasePool();

    // Determine contentClass early to know which table to query/update
    let validatedContentClass = (metadata as any).contentClass;
    if (!validatedContentClass) {
      const { determineContentClass } = await import('../utils/fileTypeUtils');
      validatedContentClass = determineContentClass({
        fileType: metadata.fileType,
        collection: (metadata as any).collection,
        textPost: (metadata as any).textPost,
        thought: (metadata as any).thought,
        isThoughtThumbnail: (metadata as any).isThoughtThumbnail,
        isPartOfCollection: (metadata as any).isPartOfCollection
      });
    }

    // Check existing metadata in all tables to find where it currently exists
    const allTables = this.getAllContentTypeTables();
    let existingRow: any = null;
    let existingTable: string | null = null;
    let existingMetadata: any = null;
    let existingIsPublic: any = null;
    let existingPnIdentifier: string | null = null;
    let existingContentClass: string | null = null;

    for (const table of allTables) {
      const result = await db.query(
        `SELECT metadata, pn_identifier FROM ${table} WHERE file_id = $1`,
      [metadata.fileId]
    );
      if (result.rows.length > 0) {
        existingRow = result.rows[0];
        existingTable = table;
        existingMetadata = existingRow.metadata;
        existingIsPublic = existingMetadata?.isPublic;
        existingPnIdentifier = existingRow.pn_identifier;
        existingContentClass = existingMetadata?.contentClass;
        break;
      }
    }

    // OWNERSHIP VERIFICATION: If file exists and isPublic is being changed, verify ownership
    if (existingMetadata && metadata.isPublic !== undefined) {
      const existingIsPublicBool = existingIsPublic === true || existingIsPublic === 'true';
      const isChangingIsPublic = metadata.isPublic !== existingIsPublicBool;
      
      if (isChangingIsPublic) {
        if (!ownerDid) {
          throw new Error('CRITICAL: Cannot change isPublic without owner verification. Owner DID required.');
        }
        
        // Verify owner matches
        const fileOwnerDid = existingMetadata.creator?.identifier?.value || 
                            existingMetadata.creator?.["@id"] || 
                            existingMetadata.author?.did ||
                            existingPnIdentifier;
        
        if (fileOwnerDid !== ownerDid && existingPnIdentifier !== ownerDid) {
          throw new Error(`CRITICAL: Unauthorized - Only owner can change isPublic. File owner: ${fileOwnerDid || 'unknown'}, Attempted by: ${ownerDid}`);
        }
      }
    }

    // PRESERVE isPublic: Only change if explicitly provided AND owner verified
    // Otherwise preserve existing value (don't accidentally make public files private)
    const finalIsPublic = existingMetadata && metadata.isPublic === undefined
      ? existingIsPublic  // Preserve whatever it was (true, false, null, undefined)
      : metadata.isPublic;

    // Validate and auto-fix fileType to match metadata content
    let validatedFileType = metadata.fileType || 'other';
    
    // Auto-set fileType to 'collection' if collection data is present but fileType doesn't match
    if ((metadata as any).collection?.collectionFileIds?.length && validatedFileType !== 'collection') {
      console.warn(`[AggregatorMetadataServiceDB] Collection data present but fileType is '${validatedFileType}', auto-setting to 'collection': ${metadata.fileId}`);
      validatedFileType = 'collection';
    }
    
    // Warn if fileType is 'collection' but no collection data
    if (validatedFileType === 'collection' && !(metadata as any).collection?.collectionFileIds?.length) {
      console.warn(`[AggregatorMetadataServiceDB] Collection fileType set but no collection data: ${metadata.fileId}`);
    }
    
    // Auto-set fileType to 'text' if textPost/thought data is present but fileType doesn't match
    // Preserve thought-collection types as they're explicitly set
    const thoughtCollectionTypes = ['thought-collection-thumbnail', 'thought-collection-page', 'thought-collection'];
    if ((metadata.textPost || (metadata as any).thought) && 
        validatedFileType !== 'text' && 
        validatedFileType !== 'thought' && 
        !thoughtCollectionTypes.includes(validatedFileType)) {
      console.warn(`[AggregatorMetadataServiceDB] Text/thought data present but fileType is '${validatedFileType}', auto-setting to 'text': ${metadata.fileId}`);
      validatedFileType = 'text';
    }

    // Re-determine contentClass after fileType validation (in case fileType changed)
    if (!validatedContentClass || validatedFileType !== metadata.fileType) {
      const { determineContentClass } = await import('../utils/fileTypeUtils');
      validatedContentClass = determineContentClass({
        fileType: validatedFileType,
        collection: (metadata as any).collection,
        textPost: (metadata as any).textPost,
        thought: (metadata as any).thought,
        isThoughtThumbnail: (metadata as any).isThoughtThumbnail,
        isPartOfCollection: (metadata as any).isPartOfCollection
      });
      // Log if we had to determine it (helps debug missing contentClass issues)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AggregatorMetadataServiceDB] Determined contentClass '${validatedContentClass}' for file ${metadata.fileId}`);
      }
    }

    // Get target table name based on contentClass
    const targetTable = this.getTableNameForContentClass(validatedContentClass as 'media' | 'thought' | 'collection');
    
    // If contentClass changed, we need to move the row from old table to new table
    const contentClassChanged = existingTable && existingTable !== targetTable;

    // Enhance metadata structure - preserve isPublic value
    const validatedMetadata: PublicMetadata = {
      ...metadata,
      isPublic: finalIsPublic,
      backend: metadata.backend || 'google_drive',
      backendFileId: metadata.backendFileId || metadata.fileId,
      name: metadata.name || metadata.title || metadata.fileId,
      uploadDate: metadata.uploadDate || new Date().toISOString(),
      fileType: validatedFileType,
      contentClass: validatedContentClass,
      // Ensure @context is always an array
      "@context": Array.isArray(metadata["@context"]) 
        ? metadata["@context"] 
        : metadata["@context"] 
          ? [metadata["@context"]] 
          : ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
      // Ensure @id is set if not provided
      "@id": metadata["@id"] || `https://parnoir.com/resource/${metadata.fileId}`,
      // Initialize engagement metrics if not provided
      engagement: metadata.engagement || {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        lastUpdated: metadata.uploadDate || new Date().toISOString()
      }
    };

    try {
      // If contentClass changed, delete from old table first
      if (contentClassChanged && existingTable) {
        await db.query(`DELETE FROM ${existingTable} WHERE file_id = $1`, [metadata.fileId]);
        console.log(`[AggregatorMetadataServiceDB] Moved file ${metadata.fileId} from ${existingTable} to ${targetTable} (contentClass changed)`);
      }

      if (existingRow && !contentClassChanged) {
        // UPDATE: Use jsonb_set to preserve isPublic unless explicitly changing it
        // Only update isPublic if it was explicitly provided in metadata parameter
        if (metadata.isPublic !== undefined) {
          // Explicitly changing isPublic - use jsonb_set to update only that field
          await db.query(
            `UPDATE ${targetTable} 
             SET metadata = jsonb_set(metadata, '{isPublic}', $1::jsonb, true),
                 pn_identifier = COALESCE($2, pn_identifier),
                 updated_at = NOW()
             WHERE file_id = $3`,
            [JSON.stringify(finalIsPublic), pnIdentifier, validatedMetadata.fileId]
          );
        } else {
          // Not changing isPublic - preserve existing value by using jsonb_set for other fields only
          // Update other fields but preserve isPublic
          const updateFields: string[] = [];
          const updateValues: any[] = [];
          let paramIndex = 1;

          if (metadata.name || metadata.title) {
            updateFields.push(`metadata = jsonb_set(metadata, '{name}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify(validatedMetadata.name));
            paramIndex++;
          }
          if (metadata.description !== undefined) {
            updateFields.push(`metadata = jsonb_set(metadata, '{description}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify(validatedMetadata.description || null));
            paramIndex++;
          }
          if (metadata.keywords || metadata.tags) {
            updateFields.push(`metadata = jsonb_set(metadata, '{keywords}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify(validatedMetadata.keywords || []));
            paramIndex++;
          }
          if (metadata.fileType) {
            updateFields.push(`metadata = jsonb_set(metadata, '{fileType}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify(validatedMetadata.fileType));
            paramIndex++;
          }
          // Always update contentClass if it's missing from existing metadata (backfill for existing files)
          const existingContentClass = existingMetadata?.contentClass;
          if (!existingContentClass && validatedContentClass) {
            updateFields.push(`metadata = jsonb_set(metadata, '{contentClass}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify(validatedContentClass));
            paramIndex++;
          }
          if ((metadata as any).feedIds !== undefined) {
            updateFields.push(`metadata = jsonb_set(metadata, '{feedIds}', $${paramIndex}::jsonb, true)`);
            updateValues.push(JSON.stringify((metadata as any).feedIds || []));
            paramIndex++;
          }

          if (updateFields.length > 0) {
            updateFields.push(`pn_identifier = COALESCE($${paramIndex}, pn_identifier)`);
            updateValues.push(pnIdentifier);
            paramIndex++;
            updateFields.push(`updated_at = NOW()`);
            updateValues.push(validatedMetadata.fileId);
            
            await db.query(
              `UPDATE ${targetTable} 
               SET ${updateFields.join(', ')}
               WHERE file_id = $${paramIndex}`,
              updateValues
            );
          } else if (pnIdentifier) {
            // Only updating pn_identifier
            await db.query(
              `UPDATE ${targetTable} 
               SET pn_identifier = $1, updated_at = NOW()
               WHERE file_id = $2`,
              [pnIdentifier, validatedMetadata.fileId]
            );
          }
        }
      } else {
        // INSERT: New file (or moved from another table)
        await db.query(
          `INSERT INTO ${targetTable} (file_id, metadata, pn_identifier, updated_at)
           VALUES ($1, $2, $3, NOW())`,
          [validatedMetadata.fileId, JSON.stringify(validatedMetadata), pnIdentifier]
        );
      }

      const displayTitle = validatedMetadata.name || validatedMetadata.title || 'Untitled';
      const authorDid = validatedMetadata.creator?.identifier?.value || validatedMetadata.creator?.["@id"] || validatedMetadata.author?.did;
      const authorDisplay = authorDid ? authorDid.substring(0, 12) + '...' : 'Unknown';
      const hasTextPost = !!(validatedMetadata as any).textPost;
      const hasThought = !!(validatedMetadata as any).thought;
      const fileType = validatedMetadata.fileType;
      const contentClass = (validatedMetadata as any).contentClass;
      console.log(`✅ Added public metadata for file: ${validatedMetadata.fileId} (${displayTitle}) by ${authorDisplay}`, {
        fileType,
        contentClass,
        hasTextPost,
        hasThought,
        isThoughtThumbnail: !!(validatedMetadata as any).isThoughtThumbnail,
        textPostKeys: hasTextPost ? Object.keys((validatedMetadata as any).textPost || {}) : [],
        thoughtKeys: hasThought ? Object.keys((validatedMetadata as any).thought || {}) : []
      });

      await this.syncFileVisibilityOverrides(validatedMetadata.fileId, validatedMetadata.indexingPermissions);
      
      // SCALABILITY: Invalidate cache when metadata is added/updated
      try {
        const { invalidateIndexCache } = await import('../utils/cache');
        await invalidateIndexCache();
        console.log(`🗑️ [submitMetadata] Invalidated index cache after metadata update`);
      } catch (error) {
        console.warn('⚠️ [submitMetadata] Cache invalidation failed (non-critical):', error);
        // Continue even if cache invalidation fails
      }
    } catch (error) {
      console.error(`❌ Failed to submit metadata for file ${validatedMetadata.fileId}:`, error);
      throw error;
    }
  }

  /**
   * Remove all metadata for a specific pnIdentifier
   * This removes all files belonging to a user from the aggregator database
   */
  async removeAllMetadataForUser(pnIdentifier: string): Promise<number> {
    const db = getDatabasePool();
    let totalRemoved = 0;

    try {
      const allTables = this.getAllContentTypeTables();
      
      // Get all file IDs for this user before deleting (for feed_posts cleanup)
      const fileIds: string[] = [];
      for (const table of allTables) {
        const result = await db.query(
          `SELECT file_id FROM ${table} WHERE pn_identifier = $1`,
          [pnIdentifier]
        );
        fileIds.push(...result.rows.map((row: any) => row.file_id));
      }

      // Delete from all three tables
      for (const table of allTables) {
        const result = await db.query(
          `DELETE FROM ${table} WHERE pn_identifier = $1`,
          [pnIdentifier]
        );
        totalRemoved += result.rowCount || 0;
      }

      // Also remove from feed_posts
      if (fileIds.length > 0) {
        try {
          await db.query(
            `DELETE FROM feed_posts WHERE file_id = ANY($1::text[])`,
            [fileIds]
          );
          console.log(`🗑️ [removeAllMetadataForUser] Removed ${fileIds.length} file(s) from feed_posts`);
        } catch (feedPostsError: any) {
          console.warn(`⚠️ [removeAllMetadataForUser] Could not delete from feed_posts:`, feedPostsError?.message || feedPostsError);
        }
      }

      // Invalidate cache
      try {
        const { invalidateIndexCache } = await import('../utils/cache');
        await invalidateIndexCache();
      } catch (error) {
        console.warn('⚠️ [removeAllMetadataForUser] Cache invalidation failed (non-critical):', error);
      }

      console.log(`🗑️ [removeAllMetadataForUser] Removed ${totalRemoved} file(s) for pnIdentifier: ${pnIdentifier}`);
      return totalRemoved;
    } catch (error) {
      console.error(`❌ Failed to remove all metadata for pnIdentifier ${pnIdentifier}:`, error);
      throw error;
    }
  }

  /**
   * Remove metadata from central index
   * Accepts either fileId (pN file ID) or backendFileId (Google Drive file ID)
   */
  async removeMetadata(fileIdOrBackendFileId: string): Promise<boolean> {
    const db = getDatabasePool();

    try {
      // CRITICAL FIX: Also delete from feed_posts table - files can't appear in feeds if removed
      // Delete from feed_posts using all possible file_id variations
      try {
        // Try deleting by file_id directly
        const feedPostsResult = await db.query('DELETE FROM feed_posts WHERE file_id = $1', [fileIdOrBackendFileId]);
        const feedPostsDeleted = feedPostsResult.rowCount || 0;
        
        // Also try deleting by backendFileId if it's different - search all tables
        const allTables = this.getAllContentTypeTables();
        let actualFileId: string | null = null;
        
        for (const table of allTables) {
        const findResult = await db.query(
            `SELECT file_id FROM ${table} 
           WHERE metadata->>'backendFileId' = $1 
              OR metadata->>'fileId' = $1
           LIMIT 1`,
          [fileIdOrBackendFileId]
        );
        
        if (findResult.rows.length > 0) {
            actualFileId = findResult.rows[0].file_id;
            break;
          }
        }
        
        let additionalFeedPostsDeleted = 0;
        if (actualFileId && actualFileId !== fileIdOrBackendFileId) {
          const additionalResult = await db.query('DELETE FROM feed_posts WHERE file_id = $1', [actualFileId]);
          additionalFeedPostsDeleted = additionalResult.rowCount || 0;
        }
        
        const totalFeedPostsDeleted = feedPostsDeleted + additionalFeedPostsDeleted;
        if (totalFeedPostsDeleted > 0) {
          console.log(`🗑️ [removeMetadata] Removed ${totalFeedPostsDeleted} feed_posts entry/entries for file ${fileIdOrBackendFileId}`);
        } else {
          console.log(`ℹ️ [removeMetadata] No feed_posts entries found for file ${fileIdOrBackendFileId} (may not have been in any feeds)`);
        }
      } catch (feedPostsError: any) {
        // Table might not exist or have different structure - that's okay
        console.warn(`⚠️ [removeMetadata] Could not delete from feed_posts (non-critical):`, feedPostsError?.message || feedPostsError);
      }
      
      // Delete from all three tables
      const allTables = this.getAllContentTypeTables();
      let removed = false;
      
      for (const table of allTables) {
      // Try to remove by file_id first (most common case)
      let result = await db.query(
          `DELETE FROM ${table} WHERE file_id = $1`,
        [fileIdOrBackendFileId]
      );

        if ((result.rowCount ?? 0) > 0) {
          removed = true;
        }

      // If not found by file_id, try to find by backendFileId in metadata JSON
      if (!removed) {
        result = await db.query(
            `DELETE FROM ${table} 
           WHERE metadata->>'backendFileId' = $1 
              OR metadata->>'fileId' = $1`,
          [fileIdOrBackendFileId]
        );
          if ((result.rowCount ?? 0) > 0) {
            removed = true;
          }
        }
      }

      if (removed) {
        console.log(`🗑️ Removed metadata for file: ${fileIdOrBackendFileId}`);
        
        // SCALABILITY: Invalidate cache when metadata is removed
        try {
          const { invalidateIndexCache } = await import('../utils/cache');
          await invalidateIndexCache();
          console.log(`🗑️ [removeMetadata] Invalidated index cache after metadata removal`);
        } catch (error) {
          console.warn('⚠️ [removeMetadata] Cache invalidation failed (non-critical):', error);
          // Continue even if cache invalidation fails
        }
      } else {
        console.log(`ℹ️ File ${fileIdOrBackendFileId} was not found in database metadata index`);
      }
      return removed;
    } catch (error) {
      console.error(`❌ Failed to remove metadata for file ${fileIdOrBackendFileId}:`, error);
      throw error;
    }
  }

  /**
   * Build query for a single content type table
   */
  private buildTableQuery(
    tableName: string,
    filters: {
    feedId?: string;
      indexerId?: string;
    }
  ): { query: string; countQuery: string; params: any[] } {
      const joinType = 'LEFT';
    const params: any[] = [];
    let paramIndex = 1;
      
      let query = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
      FROM ${tableName} am
        ${joinType} JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND (
          am.metadata->>'isNSFW' IS NULL 
          OR am.metadata->>'isNSFW' = 'false'
          OR am.metadata->>'isNSFW' = 'False'
          OR am.metadata->>'isNSFW' = 'FALSE'
          OR (am.metadata->>'isNSFW')::text = 'false'
        )
        AND NOT (
          am.metadata->>'isNSFW' = 'true'
          OR am.metadata->>'isNSFW' = 'True'
          OR am.metadata->>'isNSFW' = 'TRUE'
          OR (am.metadata->>'isNSFW')::text = 'true'
          OR (am.metadata->'isNSFW')::boolean = true
        )
      `;
      
    // Add feedId filter if provided
      if (filters?.feedId) {
        query += ` AND (
          fp.feed_id = $${paramIndex}
          OR (am.metadata->'feedIds' ? $${paramIndex})
        )`;
        params.push(filters.feedId);
        paramIndex++;
      }

      if (filters?.indexerId) {
        const idxParam = `$${paramIndex}`;
        query += ` AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
            AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? ${idxParam})
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
        )`;
        params.push(filters.indexerId);
        paramIndex++;
      }

    query += ` GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier`;
      query += ` ORDER BY am.updated_at DESC`;

    // Build count query with same params
      let countQuery = `
        SELECT COUNT(DISTINCT am.file_id) as count
      FROM ${tableName} am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND (
          am.metadata->>'isNSFW' IS NULL 
          OR am.metadata->>'isNSFW' = 'false'
          OR am.metadata->>'isNSFW' = 'False'
          OR am.metadata->>'isNSFW' = 'FALSE'
          OR (am.metadata->>'isNSFW')::text = 'false'
        )
        AND NOT (
          am.metadata->>'isNSFW' = 'true'
          OR am.metadata->>'isNSFW' = 'True'
          OR am.metadata->>'isNSFW' = 'TRUE'
          OR (am.metadata->>'isNSFW')::text = 'true'
          OR (am.metadata->'isNSFW')::boolean = true
        )
    `;

    let countParamIndex = 1;
      if (filters?.feedId) {
        countQuery += ` AND (
          fp.feed_id = $${countParamIndex}
          OR (am.metadata->'feedIds' ? $${countParamIndex})
        )`;
        countParamIndex++;
      }
      
      if (filters?.indexerId) {
      const idxParam = `$${countParamIndex}`;
        countQuery += ` AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
          AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
          AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? ${idxParam})
          AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
        )`;
        countParamIndex++;
      }
      
    return { query, countQuery, params };
  }

  /**
   * Get all public metadata with optional filters
   * 
   * IMPORTANT: This is the SOURCE OF TRUTH for the public feed.
   * The public feed reads directly from the database - NOT from Google Drive files.
   * Google Drive `public-file-index.xlsx` files are NOT used by the API for the public feed.
   * 
   * Only files with `isPublic = 'true'` in the database will appear in the public feed.
   */
  async getPublicMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    contentClass?: 'media' | 'thought' | 'collection';
    authorDid?: string;
    indexerId?: string;
    feedId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const db = getDatabasePool();

    try {
      const params: any[] = [];
      let paramIndex = 1;
      
      // Determine which table(s) to query
      let tablesToQuery: string[];
      if (filters?.contentClass) {
        // Query specific table
        tablesToQuery = [this.getTableNameForContentClass(filters.contentClass)];
      } else {
        // Query all tables for aggregate feed
        tablesToQuery = this.getAllContentTypeTables();
      }

      // Build queries for each table
      const tableQueries = tablesToQuery.map(table => {
        const { query, countQuery, params: tableParams } = this.buildTableQuery(
          table,
          { feedId: filters?.feedId, indexerId: filters?.indexerId }
        );
        return { table, query, countQuery, params: tableParams };
      });

      // Execute queries in parallel
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;
      
      // Execute queries with pagination (fetch more than needed for proper merging)
      const queryPromises = tableQueries.map(({ query, params: tableParams }) => {
        const finalParams = [...tableParams];
        finalParams.push(limit * 3); // Fetch more to account for merging and sorting
        finalParams.push(0); // Start from beginning for each table
        const finalQuery = query + ` LIMIT $${tableParams.length + 1} OFFSET $${tableParams.length + 2}`;
        return db.query(finalQuery, finalParams);
      });

      const countPromises = tableQueries.map(({ countQuery, params: tableParams }) => 
        db.query(countQuery, tableParams)
      );

      const [queryResults, countResults] = await Promise.all([
        Promise.all(queryPromises),
        Promise.all(countPromises)
      ]);

      // Merge results from all tables
      let allFiles: any[] = [];
      let total = 0;
      
      for (let i = 0; i < queryResults.length; i++) {
        allFiles.push(...queryResults[i].rows);
        total += parseInt(countResults[i].rows[0]?.count || '0', 10);
      }

      // Remove duplicates (in case file exists in multiple tables - shouldn't happen but safety check)
      const uniqueFiles = new Map<string, any>();
      for (const file of allFiles) {
        if (!uniqueFiles.has(file.file_id)) {
          uniqueFiles.set(file.file_id, file);
        }
      }
      allFiles = Array.from(uniqueFiles.values());

      // Sort by updated_at descending
      allFiles.sort((a, b) => {
        const aTime = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
        const bTime = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
        return bTime - aTime;
      });

      // Apply pagination after merging
      const paginatedFiles = allFiles.slice(offset, offset + limit);
      const hasMore = allFiles.length > offset + limit;
      
      // Convert to CentralIndexEntry format
      let entries: CentralIndexEntry[] = paginatedFiles.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        // Add feedIds to metadata if they exist
        if (row.feed_ids && row.feed_ids.length > 0) {
          metadata.feedIds = row.feed_ids.map((id: string) => id.toString());
        }
        
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier
        };
      });

      // Filter by tags (PostgreSQL JSONB array contains is complex, so filter in JS)
      if (filters?.tags && filters.tags.length > 0) {
        entries = entries.filter(entry => {
          const keywords = entry.metadata.keywords || [];
          return keywords.some((tag: string) => filters.tags!.includes(tag));
        });
      }

      // Filter by authorDid (same pattern as tags - filter in JS to avoid SQL type issues)
      if (filters?.authorDid) {
        entries = entries.filter(entry => {
          const pnId = entry.pnIdentifier;
          const creatorId = entry.metadata.creator?.identifier?.value || entry.metadata.creator?.["@id"];
          const authorDid = entry.metadata.author?.did;
          
          return pnId === filters.authorDid || 
                 creatorId === filters.authorDid || 
                 authorDid === filters.authorDid;
        });
      }

      console.log(`📤 [getPublicMetadata] Returning ${entries.length} files (limit=${limit}, offset=${offset}, hasMore=${hasMore}, total=${total})`);
      
      return { files: entries, total, hasMore };
    } catch (error) {
      console.error('❌ Failed to get public metadata:', error);
      throw error;
    }
  }

  /**
   * Get all NSFW metadata with optional filters
   * 
   * Returns only files with `isPublic = 'true'` AND `isNSFW = 'true'`
   * This is the NSFW index endpoint for users over 18
   */
  async getNSFWMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const db = getDatabasePool();

    try {
      // Query all three tables in parallel for NSFW content
      const allTables = this.getAllContentTypeTables();
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;
      
      const queryPromises = allTables.map(table => {
      let query = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
          FROM ${table} am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND am.metadata->>'isNSFW' = 'true'
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Apply filters
      if (filters?.fileType) {
        query += ` AND am.metadata->>'fileType' = $${paramIndex}`;
        params.push(filters.fileType);
        paramIndex++;
      }

      if (filters?.indexerId) {
        const idxParam = `$${paramIndex}`;
        query += ` AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
            AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? ${idxParam})
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
        )`;
        params.push(filters.indexerId);
        paramIndex++;
      }

        query += ` GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier`;
      query += ` ORDER BY am.updated_at DESC`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit * 3); // Fetch more for merging
        params.push(0);

        return { query, params, table };
      });
      
      const countPromises = allTables.map(table => {
        let countQuery = `
        SELECT COUNT(*) as count
          FROM ${table} am
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND am.metadata->>'isNSFW' = 'true'
        `;
        const params: any[] = [];
        let paramIndex = 1;
        
        if (filters?.fileType) {
          countQuery += ` AND am.metadata->>'fileType' = $${paramIndex}`;
          params.push(filters.fileType);
          paramIndex++;
        }
        
        if (filters?.indexerId) {
          const idxParam = `$${paramIndex}`;
          countQuery += ` AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
              AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
              AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? ${idxParam})
              AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? ${idxParam})
            )
          )`;
          params.push(filters.indexerId);
          paramIndex++;
        }
        
        return { countQuery, params };
      });

      // Execute queries in parallel
      const [queryResults, countResults] = await Promise.all([
        Promise.all(queryPromises.map(({ query, params }) => db.query(query, params))),
        Promise.all(countPromises.map(({ countQuery, params }) => db.query(countQuery, params)))
      ]);

      // Merge results from all tables
      let allFiles: any[] = [];
      let total = 0;
      
      for (let i = 0; i < queryResults.length; i++) {
        allFiles.push(...queryResults[i].rows);
        total += parseInt(countResults[i].rows[0]?.count || '0', 10);
      }

      // Remove duplicates and sort
      const uniqueFiles = new Map<string, any>();
      for (const file of allFiles) {
        if (!uniqueFiles.has(file.file_id)) {
          uniqueFiles.set(file.file_id, file);
        }
      }
      allFiles = Array.from(uniqueFiles.values());

      // Sort by updated_at descending
      allFiles.sort((a, b) => {
        const aTime = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
        const bTime = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
        return bTime - aTime;
      });

      // Apply pagination after merging
      const paginatedFiles = allFiles.slice(offset, offset + limit);
      const hasMore = allFiles.length > offset + limit;
      
      let entries: CentralIndexEntry[] = paginatedFiles.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        // Add feedIds to metadata if they exist
        if (row.feed_ids && row.feed_ids.length > 0) {
          metadata.feedIds = row.feed_ids.map((id: string) => id.toString());
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier
        };
      });

      // Filter by tags (PostgreSQL JSONB array contains is complex, so filter in JS)
      if (filters?.tags && filters.tags.length > 0) {
        entries = entries.filter(entry => {
          const keywords = entry.metadata.keywords || [];
          return keywords.some((tag: string) => filters.tags!.includes(tag));
        });
      }

      // Filter by authorDid (same pattern as tags - filter in JS to avoid SQL type issues)
      if (filters?.authorDid) {
        entries = entries.filter(entry => {
          const pnId = entry.pnIdentifier;
          const creatorId = entry.metadata.creator?.identifier?.value || entry.metadata.creator?.["@id"];
          const authorDid = entry.metadata.author?.did;
          
          return pnId === filters.authorDid || 
                 creatorId === filters.authorDid || 
                 authorDid === filters.authorDid;
        });
      }

      console.log(`📤 [getNSFWMetadata] Returning ${entries.length} NSFW files from database (isPublic = true AND isNSFW = true, limit=${limit}, offset=${offset}, hasMore=${hasMore})`);
      
      return { files: entries, total, hasMore };
    } catch (error) {
      console.error('❌ Failed to get NSFW metadata:', error);
      throw error;
    }
  }

  /**
   * Get metadata for specific file
   */
  async getFileMetadata(fileId: string): Promise<CentralIndexEntry | null> {
    const db = getDatabasePool();

    try {
      // Query all three tables to find the file
      const allTables = this.getAllContentTypeTables();
      
      for (const table of allTables) {
      const result = await db.query(
          `SELECT file_id, metadata, submitted_at, pn_identifier FROM ${table} WHERE file_id = $1`,
        [fileId]
      );

        if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        fileId: row.file_id,
        metadata: row.metadata as PublicMetadata,
        submittedAt: row.submitted_at.toISOString(),
        pnIdentifier: row.pn_identifier
      };
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Failed to get metadata for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Get ALL files (public + private) for a specific user
   * Used for authenticated users viewing their own content
   */
  async getAllFilesForUser(pnIdentifier: string, filters?: {
    tags?: string[];
    fileType?: string;
  }): Promise<CentralIndexEntry[]> {
    const db = getDatabasePool();

    try {
      // Query all three tables in parallel
      const allTables = this.getAllContentTypeTables();
      const queryPromises = allTables.map(table => 
        db.query(
          `SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
            am.updated_at
          FROM ${table} am
          WHERE am.pn_identifier = $1`,
          [pnIdentifier]
        )
      );

      const results = await Promise.all(queryPromises);
      
      // Merge results from all tables
      let allRows: any[] = [];
      for (const result of results) {
        allRows.push(...result.rows);
      }
      
      // Sort by updated_at descending
      allRows.sort((a, b) => {
        const aTime = new Date(a.updated_at || a.submitted_at).getTime();
        const bTime = new Date(b.updated_at || b.submitted_at).getTime();
        return bTime - aTime;
      });
      
      // Get feed_ids for each file
      const fileIds = allRows.map((row: any) => row.file_id);
      const feedIdsMap = new Map<string, string[]>();
      
      if (fileIds.length > 0) {
        const feedIdsResult = await db.query(
          `SELECT file_id, feed_id FROM feed_posts WHERE file_id = ANY($1)`,
          [fileIds]
        );
        
        for (const row of feedIdsResult.rows) {
          if (!feedIdsMap.has(row.file_id)) {
            feedIdsMap.set(row.file_id, []);
          }
          feedIdsMap.get(row.file_id)!.push(row.feed_id.toString());
        }
      }
      let entries: CentralIndexEntry[] = allRows.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        // Add feedIds to metadata if they exist
        const feedIds = feedIdsMap.get(row.file_id) || [];
        if (feedIds.length > 0) {
          metadata.feedIds = feedIds;
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier
        };
      });

      // Apply filters
      if (filters?.fileType) {
        entries = entries.filter(entry => entry.metadata.fileType === filters.fileType);
      }

      // Filter by tags (PostgreSQL JSONB array contains is complex, so filter in JS)
      if (filters?.tags && filters.tags.length > 0) {
        entries = entries.filter(entry => {
          const keywords = entry.metadata.keywords || [];
          return keywords.some((tag: string) => filters.tags!.includes(tag));
        });
      }

      console.log(`📤 [getAllFilesForUser] Returning ${entries.length} files (public + private) for user ${pnIdentifier}`);
      
      // Verify files exist in Google Drive before returning (filter out deleted files)
      const verifiedEntries = await this.verifyGoogleDriveFilesExist(entries);
      
      if (verifiedEntries.length !== entries.length) {
        console.log(`✅ [getAllFilesForUser] Filtered out ${entries.length - verifiedEntries.length} deleted file(s)`);
      }
      
      return verifiedEntries;
    } catch (error) {
      console.error('❌ Failed to get all files for user:', error);
      throw error;
    }
  }

  /**
   * Get index stats
   */
  async getStats(): Promise<{ totalFiles: number; lastUpdated: string }> {
    const db = getDatabasePool();

    try {
      // Query all three tables
      const allTables = this.getAllContentTypeTables();
      const queryPromises = allTables.map(table =>
        db.query(`
        SELECT 
          COUNT(*) as total_files,
          MAX(updated_at) as last_updated
          FROM ${table}
        WHERE metadata->>'isPublic' = 'true'
        `)
      );

      const results = await Promise.all(queryPromises);
      
      // Sum totals and find max last_updated
      let totalFiles = 0;
      let lastUpdated: Date | null = null;
      
      for (const result of results) {
      const row = result.rows[0];
        totalFiles += parseInt(row.total_files, 10);
        const rowLastUpdated = row.last_updated ? new Date(row.last_updated) : null;
        if (rowLastUpdated && (!lastUpdated || rowLastUpdated > lastUpdated)) {
          lastUpdated = rowLastUpdated;
        }
      }

      return {
        totalFiles,
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Search metadata by query string
   */
  async searchMetadata(query: string, options?: {
    sortBy?: 'relevance' | 'date' | 'popularity';
    limit?: number;
    offset?: number;
    fileType?: string;
    tags?: string[];
    authorDid?: string;
    feedId?: string;
    feedCategory?: string;
    dateFrom?: string;
    dateTo?: string;
    maxRating?: string;
  }): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const db = getDatabasePool();
    const searchQuery = query.toLowerCase().trim();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    try {
      // Query all three tables in parallel
      const allTables = this.getAllContentTypeTables();
      const baseQueryTemplate = (table: string) => `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
        FROM ${table} am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR am.metadata->>'isPublic' IS NULL
          OR (am.metadata->>'isPublic' = 'false' AND am.metadata->>'publicToken' IS NOT NULL)
        )
      `;
      
      const queryPromises = allTables.map(table => {
        let sqlQuery = baseQueryTemplate(table);
      const params: any[] = [];
      let paramIndex = 1;

      // Add search conditions
      if (searchQuery) {
        sqlQuery += ` AND (
          LOWER(am.metadata->>'name') LIKE $${paramIndex}
          OR LOWER(am.metadata->>'title') LIKE $${paramIndex}
          OR LOWER(am.metadata->>'description') LIKE $${paramIndex}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(am.metadata->'keywords', am.metadata->'tags', '[]'::jsonb)) AS keyword
            WHERE LOWER(keyword) LIKE $${paramIndex}
          )
          OR LOWER(am.metadata->>'category') LIKE $${paramIndex}
        )`;
        params.push(`%${searchQuery}%`);
        paramIndex++;
      }

      // Apply filters
      if (options?.fileType) {
        sqlQuery += ` AND am.metadata->>'fileType' = $${paramIndex}`;
        params.push(options.fileType);
        paramIndex++;
      }

      if (options?.feedId) {
        sqlQuery += ` AND EXISTS (
          SELECT 1 FROM feed_posts fp2 
          WHERE fp2.file_id = am.file_id 
          AND fp2.feed_id::text = $${paramIndex}
        )`;
        params.push(options.feedId);
        paramIndex++;
      }

      if (options?.feedCategory) {
        sqlQuery += ` AND EXISTS (
          SELECT 1 FROM feed_posts fp3
          JOIN feeds f ON fp3.feed_id = f.feed_id
          WHERE fp3.file_id = am.file_id
          AND LOWER(f.feed_category) = LOWER($${paramIndex})
        )`;
        params.push(options.feedCategory);
        paramIndex++;
      }

      if (options?.dateFrom) {
        sqlQuery += ` AND am.metadata->>'uploadDate' >= $${paramIndex}`;
        params.push(options.dateFrom);
        paramIndex++;
      }

      if (options?.dateTo) {
        sqlQuery += ` AND am.metadata->>'uploadDate' <= $${paramIndex}`;
        params.push(options.dateTo);
        paramIndex++;
      }

      // Group by for feed_ids aggregation
      sqlQuery += ` GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier`;

      // Sorting
      if (options?.sortBy === 'date') {
        sqlQuery += ` ORDER BY am.metadata->>'uploadDate' DESC NULLS LAST, am.updated_at DESC`;
      } else if (options?.sortBy === 'popularity') {
        sqlQuery += ` ORDER BY 
          COALESCE((am.metadata->'engagement'->>'likes')::int, 0) DESC,
          COALESCE((am.metadata->'engagement'->>'views')::int, 0) DESC,
          am.updated_at DESC`;
      } else {
        // Relevance: prioritize exact matches, then partial matches
        if (searchQuery) {
          sqlQuery += ` ORDER BY 
            CASE 
              WHEN LOWER(am.metadata->>'name') = $${paramIndex} THEN 1
              WHEN LOWER(am.metadata->>'name') LIKE $${paramIndex + 1} THEN 2
              WHEN LOWER(am.metadata->>'description') LIKE $${paramIndex + 1} THEN 3
              ELSE 4
            END,
            am.updated_at DESC`;
          params.push(searchQuery);
          params.push(`${searchQuery}%`);
          paramIndex += 2;
        } else {
          sqlQuery += ` ORDER BY am.updated_at DESC`;
        }
      }

        // Pagination - fetch more than needed for merging
      sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit * 3); // Fetch more for merging
        params.push(0);
        
        return { query: sqlQuery, params, table };
      });

      // Execute queries in parallel
      const queryResults = await Promise.all(
        queryPromises.map(({ query, params }) => db.query(query, params))
      );

      // Merge results from all tables
      let allFiles: any[] = [];
      for (const result of queryResults) {
        allFiles.push(...result.rows);
      }

      // Remove duplicates
      const uniqueFiles = new Map<string, any>();
      for (const file of allFiles) {
        if (!uniqueFiles.has(file.file_id)) {
          uniqueFiles.set(file.file_id, file);
        }
      }
      allFiles = Array.from(uniqueFiles.values());

      // Apply sorting
      if (options?.sortBy === 'date') {
        allFiles.sort((a, b) => {
          const aDate = new Date(a.metadata?.uploadDate || a.submitted_at).getTime();
          const bDate = new Date(b.metadata?.uploadDate || b.submitted_at).getTime();
          return bDate - aDate;
        });
      } else if (options?.sortBy === 'popularity') {
        allFiles.sort((a, b) => {
          const aLikes = parseInt(a.metadata?.engagement?.likes || '0', 10);
          const bLikes = parseInt(b.metadata?.engagement?.likes || '0', 10);
          if (aLikes !== bLikes) return bLikes - aLikes;
          const aViews = parseInt(a.metadata?.engagement?.views || '0', 10);
          const bViews = parseInt(b.metadata?.engagement?.views || '0', 10);
          if (aViews !== bViews) return bViews - aViews;
          const aTime = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
          const bTime = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
          return bTime - aTime;
        });
      } else {
        // Relevance sorting
        if (searchQuery) {
          allFiles.sort((a, b) => {
            const aName = (a.metadata?.name || '').toLowerCase();
            const bName = (b.metadata?.name || '').toLowerCase();
            const queryLower = searchQuery.toLowerCase();
            
            let aScore = 4;
            let bScore = 4;
            
            if (aName === queryLower) aScore = 1;
            else if (aName.startsWith(queryLower)) aScore = 2;
            else if ((a.metadata?.description || '').toLowerCase().includes(queryLower)) aScore = 3;
            
            if (bName === queryLower) bScore = 1;
            else if (bName.startsWith(queryLower)) bScore = 2;
            else if ((b.metadata?.description || '').toLowerCase().includes(queryLower)) bScore = 3;
            
            if (aScore !== bScore) return aScore - bScore;
            
            const aTime = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
            const bTime = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
            return bTime - aTime;
          });
        } else {
          allFiles.sort((a, b) => {
            const aTime = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
            const bTime = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
            return bTime - aTime;
          });
        }
      }

      // Apply pagination after merging and sorting
      const paginatedFiles = allFiles.slice(offset, offset + limit);
      const hasMore = allFiles.length > offset + limit;
      
      let files = paginatedFiles.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        if (row.feed_ids && row.feed_ids.length > 0) {
          metadata.feedIds = row.feed_ids.map((id: string) => id.toString());
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier
        };
      });

      // Apply additional filters that need to be done in JavaScript
      let filteredFiles = files;

      if (options?.tags && options.tags.length > 0) {
        filteredFiles = filteredFiles.filter(entry => {
          const keywords = entry.metadata.keywords || entry.metadata.tags || [];
          return keywords.some((tag: string) => options.tags!.includes(tag));
        });
      }

      if (options?.authorDid) {
        filteredFiles = filteredFiles.filter(entry => {
          const pnId = entry.pnIdentifier;
          const creatorId = entry.metadata.creator?.identifier?.value || entry.metadata.creator?.["@id"];
          const authorDid = entry.metadata.author?.did;
          
          return pnId === options.authorDid || 
                 creatorId === options.authorDid || 
                 authorDid === options.authorDid;
        });
      }

      // Get total count from merged results (approximate - actual count would require separate queries)
      const total = allFiles.length;

      return {
        files: filteredFiles,
        total,
        hasMore
      };
    } catch (error) {
      console.error('❌ Failed to search metadata:', error);
      throw error;
    }
  }

  /**
   * Filter results to only include files that exist in Google Drive
   * This ensures we only show files with active URLs
   * 
   * Filtering strategy:
   * - Files marked as public (isPublic = true) are always kept (trust database)
   * - Files with publicToken are always kept (accessible through token system)
   * - Only filter files confirmed deleted (404 or trashed status)
   * - Always keep files when verification fails (graceful degradation)
   * 
   * This prevents false positives where valid files are filtered out due to
   * service account access limitations.
   */
  private async filterActiveFiles(result: { files: CentralIndexEntry[]; total: number; hasMore: boolean }): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const activeFiles: CentralIndexEntry[] = [];
    const batchSize = 10; // Process in batches to avoid rate limits
    
    for (let i = 0; i < result.files.length; i += batchSize) {
      const batch = result.files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        const backend = file.metadata.backend || 'google_drive';
        
        if (!backend || !backend.startsWith('google_drive')) {
          return file;
        }
        
        const isPublic = file.metadata.isPublic === true;
        if (isPublic) {
          return file;
        }
        
        const publicToken = file.metadata.publicToken;
        if (publicToken) {
          return file;
        }
        
        const backendFileId = (file.metadata as any).googleDriveFileId || file.metadata.backendFileId;
        if (!backendFileId) {
          console.log(`⚠️ [filterActiveFiles] No backendFileId for file ${file.fileId} - keeping (cannot verify)`);
          return file;
        }
        
        try {
          const dead = await isDriveFileUrlDead(backendFileId);
          if (dead) {
            console.log(`🗑️ [filterActiveFiles] File ${backendFileId} is dead (deleted/not found) - filtering out: ${file.metadata.name || file.fileId}`);
            return null;
          }
          return file;
        } catch (error) {
          console.warn(`⚠️ [filterActiveFiles] Error verifying file ${backendFileId} - keeping: ${file.metadata.name || file.fileId}`, error);
          return file;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      // Filter out null values (files that were filtered out)
      const validFiles = batchResults.filter((file): file is CentralIndexEntry => file !== null);
      activeFiles.push(...validFiles);
    }
    
    // Calculate new total and hasMore based on filtered results
    // Adjust total proportionally (conservative estimate)
    const filteredCount = result.files.length - activeFiles.length;
    const filteredTotal = Math.max(0, result.total - filteredCount);
    
    // If we filtered out files, hasMore might need adjustment
    // Keep hasMore false if we have fewer files than the limit
    const hasMore = activeFiles.length === result.files.length 
      ? result.hasMore 
      : activeFiles.length > 0; // Only set hasMore if we still have files
    
    return {
      files: activeFiles,
      total: filteredTotal,
      hasMore
    };
  }

  /**
   * Get full index response
   * Filters results to only show files with active URLs (files that exist in Google Drive)
   */
  async getIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    contentClass?: 'media' | 'thought' | 'collection';
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<CentralIndexResponse & { total: number; hasMore: boolean }> {
    // Check cache first
    try {
      const { getCachedIndex } = await import('../utils/cache');
      const cached = await getCachedIndex(filters);
      if (cached) {
        console.log(`✅ [getIndexResponse] Cache hit for filters:`, filters);
        // Filter cached results to ensure only active files are returned
        // Extract the fields needed for filtering (cached may have additional fields like updatedAt)
        const filteredResult = await this.filterActiveFiles({
          files: cached.files || [],
          total: cached.total || cached.totalFiles || 0,
          hasMore: cached.hasMore || false
        });
        if (filteredResult.files.length !== (cached.files || []).length) {
          console.log(`🔍 [getIndexResponse] Filtered ${(cached.files || []).length - filteredResult.files.length} inactive file(s) from cache`);
        }
        // Return with same structure as cached (preserve updatedAt, etc.)
        return {
          ...cached,
          files: filteredResult.files,
          total: filteredResult.total,
          totalFiles: filteredResult.total,
          hasMore: filteredResult.hasMore
        };
      }
    } catch (error) {
      console.warn('⚠️ [getIndexResponse] Cache check failed (non-critical):', error);
      // Continue to database query if cache fails
    }
    
    // Query database for fresh data
    const result = await this.getPublicMetadata(filters);
    
    // Filter to only show files with active URLs (files that exist in Google Drive)
    const filteredResult = await this.filterActiveFiles({
      files: result.files,
      total: result.total,
      hasMore: result.hasMore
    });
    
    if (filteredResult.files.length !== result.files.length) {
      console.log(`🔍 [getIndexResponse] Filtered ${result.files.length - filteredResult.files.length} inactive file(s) (${filteredResult.files.length} active files remaining)`);
    }
    
    const stats = await this.getStats();

    const response = {
      files: filteredResult.files,
      updatedAt: stats.lastUpdated,
      totalFiles: filteredResult.total,  // Total matching files after filtering
      total: filteredResult.total,        // Alias for consistency
      hasMore: filteredResult.hasMore     // Whether more pages exist
    };
    
    // SCALABILITY: Cache the filtered response (5 minutes TTL)
    try {
      const { setCachedIndex } = await import('../utils/cache');
      await setCachedIndex(filters, response, 300); // 5 minutes
      console.log(`💾 [getIndexResponse] Cached filtered response for filters:`, filters);
    } catch (error) {
      console.warn('⚠️ [getIndexResponse] Cache set failed (non-critical):', error);
      // Continue even if cache fails
    }

    return response;
  }

  /**
   * Get full NSFW index response
   * Returns NSFW content only (isPublic = true AND isNSFW = true)
   */
  async getNSFWIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<CentralIndexResponse & { total: number; hasMore: boolean }> {
    console.log(`🔍 [getNSFWIndexResponse] Fetching NSFW files...`);
    
    const result = await this.getNSFWMetadata(filters);
    console.log(`📤 [getNSFWIndexResponse] Returning ${result.files.length} NSFW file(s)`);
    
    const stats = await this.getStats();

    return {
      files: result.files,
      updatedAt: stats.lastUpdated,
      totalFiles: result.total,  // Total matching files
      total: result.total,        // Alias for consistency
      hasMore: result.hasMore     // Whether more pages exist
    };
  }

  /**
   * Verify Google Drive files still exist
   * Uses authenticated Google Drive API with service account
   * Google Drive is the source of truth - deleted files are removed from database
   */
  private async verifyGoogleDriveFilesExist(files: CentralIndexEntry[]): Promise<CentralIndexEntry[]> {
    console.log(`🔍 [verifyGoogleDriveFilesExist] Verifying ${files.length} files from Google Drive...`);
    
    const verifiedFiles: CentralIndexEntry[] = [];
    const filesToRemove: string[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        if (file.metadata.backend !== 'google_drive') {
          return file;
        }
        
        const googleDriveFileId = (file.metadata as any).googleDriveFileId || file.metadata.backendFileId || file.fileId;
        if (!googleDriveFileId) {
          return file;
        }
        
        try {
          const dead = await isDriveFileUrlDead(googleDriveFileId);
          if (dead) {
            console.log(`🗑️ [verifyGoogleDriveFilesExist] File ${googleDriveFileId} is dead (deleted/not found): ${file.metadata.name || 'unknown'}`);
            filesToRemove.push(file.fileId);
            return null;
          }
          return file;
        } catch (error) {
          console.warn(`⚠️ [verifyGoogleDriveFilesExist] Error verifying ${googleDriveFileId}:`, error);
          return file;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validFiles = batchResults.filter((file): file is CentralIndexEntry => file !== null);
      verifiedFiles.push(...validFiles);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Remove deleted files from database (all three tables)
    if (filesToRemove.length > 0) {
      try {
        const db = getDatabasePool();
        const allTables = this.getAllContentTypeTables();
        for (const table of allTables) {
        await db.query(
            `DELETE FROM ${table} WHERE file_id = ANY($1::text[])`,
          [filesToRemove]
        );
        }
        console.log(`✅ [verifyGoogleDriveFilesExist] Removed ${filesToRemove.length} deleted file(s) from database: ${filesToRemove.join(', ')}`);
      } catch (error) {
        console.error('❌ [verifyGoogleDriveFilesExist] Failed to remove deleted files from database:', error);
      }
    } else {
      console.log(`✅ [verifyGoogleDriveFilesExist] All ${files.length} files verified - no deletions needed`);
    }
    
    return verifiedFiles;
  }


  /**
   * Update engagement metrics for a file
   */
  async updateEngagement(
    fileId: string,
    engagementType: 'like' | 'view' | 'share' | 'comment',
    userPnIdentifier?: string
  ): Promise<PublicMetadata | null> {
    const db = getDatabasePool();

    try {
      // Get current metadata
      const current = await this.getFileMetadata(fileId);
      if (!current) {
        return null;
      }

      const metadata = current.metadata;
      const engagement = metadata.engagement || {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        lastUpdated: metadata.uploadDate || new Date().toISOString(),
        engagementHistory: []
      };

      // Update engagement count
      switch (engagementType) {
        case 'like':
          engagement.likes = (engagement.likes || 0) + 1;
          break;
        case 'view':
          engagement.views = (engagement.views || 0) + 1;
          break;
        case 'share':
          engagement.shares = (engagement.shares || 0) + 1;
          break;
        case 'comment':
          engagement.comments = (engagement.comments || 0) + 1;
          break;
      }

      // Add to engagement history
      if (!engagement.engagementHistory) {
        engagement.engagementHistory = [];
      }
      engagement.engagementHistory.push({
        type: engagementType,
        pn_identifier: userPnIdentifier,
        timestamp: new Date().toISOString()
      });

      engagement.lastUpdated = new Date().toISOString();

      // Update metadata
      const updatedMetadata: PublicMetadata = {
        ...metadata,
        engagement
      };

      // Find which table the file is in and update
      const allTables = this.getAllContentTypeTables();
      let targetTable: string | null = null;
      
      for (const table of allTables) {
        const checkResult = await db.query(`SELECT file_id FROM ${table} WHERE file_id = $1`, [fileId]);
        if (checkResult.rows.length > 0) {
          targetTable = table;
          break;
        }
      }

      if (!targetTable) {
        throw new Error(`File ${fileId} not found in any table`);
      }

      // Save to database
      await db.query(
        `UPDATE ${targetTable} 
         SET metadata = $1, updated_at = NOW()
         WHERE file_id = $2`,
        [JSON.stringify(updatedMetadata), fileId]
      );

      console.log(`✅ Updated ${engagementType} for file: ${fileId}`);
      return updatedMetadata;
    } catch (error) {
      console.error(`❌ Failed to update engagement for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Update metadata fields (title, description, tags, etc.)
   */
  async updateMetadata(
    fileId: string,
    updates: {
      name?: string;
      title?: string;
      description?: string;
      keywords?: string[];
      tags?: string[];
      genre?: string[];
      category?: string;
      locationCreated?: any;
      license?: string;
      inLanguage?: string | string[];
      fileType?: string;
      textPost?: any;
      thought?: any;
      collection?: any; // Collection data with collectionFileIds
      isNSFW?: boolean;
      isPublic?: boolean;
      publicToken?: string | null; // null = delete, string = set, undefined = preserve
      subjects?: string[];
      feedCategories?: string[];
      thumbnailFileId?: string;
      isThoughtThumbnail?: boolean; // Thumbnails inherit classification from source
      isPartOfCollection?: boolean; // Collection files inherit collection classification
      mainFileId?: string; // Reference to source file for thumbnails
      isEncrypted?: boolean; // True if main file is encrypted; false for raw uploads over tier limit
    }
  ): Promise<PublicMetadata | null> {
    const db = getDatabasePool();

    try {
      // Get current metadata
      const current = await this.getFileMetadata(fileId);
      if (!current) {
        return null;
      }

      const metadata = current.metadata;

      // Preserve existing schema metadata (static/auto-extracted fields)
      const existingSchema = (metadata as any).schema || {};

      // Preserve textPost/thought/collection from existing metadata if not explicitly updated
      // These fields are critical for rendering and should never be lost
      const existingTextPost = (metadata as any).textPost;
      const existingThought = (metadata as any).thought;
      const existingCollection = (metadata as any).collection;
      
      // Extract publicToken from metadata so we can handle it explicitly
      const { publicToken: existingPublicToken, ...metadataWithoutToken } = metadata as any;
      
      // Apply updates
      const updatedMetadata: PublicMetadata = {
        ...metadataWithoutToken,
        ...(updates.name && { name: updates.name }),
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.keywords && { keywords: updates.keywords }),
        // Keep legacy tags for backward compatibility
        ...(updates.tags && { tags: updates.tags, keywords: updates.tags }),
        ...(updates.fileType && { fileType: updates.fileType }),
        // Always preserve textPost/thought/collection - use update if provided, otherwise keep existing (if it exists)
        ...(updates.textPost !== undefined ? { textPost: updates.textPost } : (existingTextPost !== undefined ? { textPost: existingTextPost } : {})),
        ...(updates.thought !== undefined ? { thought: updates.thought } : (existingThought !== undefined ? { thought: existingThought } : {})),
        ...(updates.collection !== undefined ? { collection: updates.collection } : (existingCollection !== undefined ? { collection: existingCollection } : {})),
        // Always update isNSFW if provided (even if false, to ensure it's saved)
        ...(updates.isNSFW !== undefined && { isNSFW: Boolean(updates.isNSFW) }),
        // CRITICAL: Only update isPublic if explicitly provided
        // If not provided, preserve existing value (don't accidentally make public files private)
        ...(updates.isPublic !== undefined && { isPublic: updates.isPublic === true }),
        // Update schema.org fields (merge with existing schema)
        schema: {
          ...existingSchema,
          ...(updates.genre && { genre: updates.genre }),
          ...(updates.category && { category: updates.category }),
          ...(updates.locationCreated && { locationCreated: updates.locationCreated }),
          ...(updates.license && { license: updates.license }),
          ...(updates.inLanguage && { inLanguage: updates.inLanguage })
        },
        // Also update top-level fields for backward compatibility and easier access
        ...(updates.genre && { genre: updates.genre }),
        ...(updates.category && { category: updates.category }),
        ...(updates.locationCreated && { locationCreated: updates.locationCreated }),
        ...(updates.license && { license: updates.license }),
        ...(updates.inLanguage && { inLanguage: updates.inLanguage }),
        // Update subjects and feedCategories
        ...(updates.subjects !== undefined && { subjects: updates.subjects }),
        ...(updates.feedCategories !== undefined && { feedCategories: updates.feedCategories }),
        // Update thumbnail file ID
        ...(updates.thumbnailFileId !== undefined && { thumbnailFileId: updates.thumbnailFileId }),
        // Update classification flags - thumbnails inherit classification from source
        ...(updates.isThoughtThumbnail !== undefined && { isThoughtThumbnail: updates.isThoughtThumbnail }),
        ...(updates.isPartOfCollection !== undefined && { isPartOfCollection: updates.isPartOfCollection }),
        ...(updates.mainFileId !== undefined && { mainFileId: updates.mainFileId }),
        ...(updates.isEncrypted !== undefined && { isEncrypted: updates.isEncrypted }),
        // Handle publicToken: null = delete, string = set, undefined = preserve
        ...(updates.publicToken !== undefined ? (
          updates.publicToken === null 
            ? {} // Delete publicToken (don't include it in spread)
            : { publicToken: updates.publicToken } // Set publicToken
        ) : (
          existingPublicToken ? { publicToken: existingPublicToken } : {} // Preserve existing
        ))
      };

      // Ensure keywords and tags are in sync
      if (updatedMetadata.keywords && !updatedMetadata.tags) {
        updatedMetadata.tags = updatedMetadata.keywords;
      }
      if (updatedMetadata.tags && !updatedMetadata.keywords) {
        updatedMetadata.keywords = updatedMetadata.tags;
      }

      // Recalculate contentClass if classification flags changed or if it's missing
      const oldContentClass = (updatedMetadata as any).contentClass;
      if (updates.isThoughtThumbnail !== undefined || 
          updates.isPartOfCollection !== undefined || 
          updates.collection !== undefined ||
          updates.textPost !== undefined ||
          updates.thought !== undefined ||
          !(updatedMetadata as any).contentClass) {
        const { determineContentClass } = await import('../utils/fileTypeUtils');
        const recalculatedContentClass = determineContentClass({
          fileType: updatedMetadata.fileType,
          collection: (updatedMetadata as any).collection,
          textPost: (updatedMetadata as any).textPost,
          thought: (updatedMetadata as any).thought,
          isThoughtThumbnail: (updatedMetadata as any).isThoughtThumbnail,
          isPartOfCollection: (updatedMetadata as any).isPartOfCollection
        });
        (updatedMetadata as any).contentClass = recalculatedContentClass;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AggregatorMetadataServiceDB] Recalculated contentClass '${recalculatedContentClass}' for file ${fileId}`);
        }
      }

      // Find which table the file is currently in
      const allTables = this.getAllContentTypeTables();
      let currentTable: string | null = null;
      
      for (const table of allTables) {
        const checkResult = await db.query(`SELECT file_id FROM ${table} WHERE file_id = $1`, [fileId]);
        if (checkResult.rows.length > 0) {
          currentTable = table;
          break;
        }
      }

      if (!currentTable) {
        throw new Error(`File ${fileId} not found in any table`);
      }

      // Determine target table based on new contentClass
      const newContentClass = (updatedMetadata as any).contentClass as 'media' | 'thought' | 'collection';
      const targetTable = this.getTableNameForContentClass(newContentClass);

      // If contentClass changed, move row to new table
      if (currentTable !== targetTable) {
        // Get current row data
        const currentRow = await db.query(
          `SELECT metadata, pn_identifier, submitted_at, created_at FROM ${currentTable} WHERE file_id = $1`,
          [fileId]
        );
        
        if (currentRow.rows.length > 0) {
          const row = currentRow.rows[0];
          // Insert into new table
      await db.query(
            `INSERT INTO ${targetTable} (file_id, metadata, pn_identifier, submitted_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [fileId, JSON.stringify(updatedMetadata), row.pn_identifier, row.submitted_at, row.created_at]
          );
          // Delete from old table
          await db.query(`DELETE FROM ${currentTable} WHERE file_id = $1`, [fileId]);
          console.log(`[AggregatorMetadataServiceDB] Moved file ${fileId} from ${currentTable} to ${targetTable} (contentClass changed)`);
        }
      } else {
        // Update in current table
        await db.query(
          `UPDATE ${targetTable} 
         SET metadata = $1, updated_at = NOW()
         WHERE file_id = $2`,
        [JSON.stringify(updatedMetadata), fileId]
      );
      }

      console.log(`✅ Updated metadata for file: ${fileId}`);
      
      // Invalidate cache when metadata is updated
      try {
        const { invalidateIndexCache } = await import('../utils/cache');
        await invalidateIndexCache();
        console.log(`🗑️ [updateMetadata] Invalidated index cache after metadata update`);
      } catch (cacheError) {
        console.warn('⚠️ [updateMetadata] Cache invalidation failed (non-critical):', cacheError);
        // Continue even if cache invalidation fails
      }
      
      return updatedMetadata;
    } catch (error) {
      console.error(`❌ Failed to update metadata for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Update third-party indexing permissions for a file
   */
  async updateIndexingPermissions(
    fileId: string,
    indexingPermissions?: PublicMetadata['indexingPermissions']
  ): Promise<PublicMetadata | null> {
    const db = getDatabasePool();

    try {
      const current = await this.getFileMetadata(fileId);
      if (!current) {
        return null;
      }

      const updatedMetadata: PublicMetadata = {
        ...current.metadata,
        indexingPermissions: indexingPermissions || undefined
      };

      // Find which table the file is in
      const allTables = this.getAllContentTypeTables();
      let targetTable: string | null = null;
      
      for (const table of allTables) {
        const checkResult = await db.query(`SELECT file_id FROM ${table} WHERE file_id = $1`, [fileId]);
        if (checkResult.rows.length > 0) {
          targetTable = table;
          break;
        }
      }

      if (!targetTable) {
        throw new Error(`File ${fileId} not found in any table`);
      }

      await db.query(
        `UPDATE ${targetTable}
           SET metadata = $1,
               updated_at = NOW()
         WHERE file_id = $2`,
        [JSON.stringify(updatedMetadata), fileId]
      );

      await this.syncFileVisibilityOverrides(fileId, indexingPermissions);
      console.log(`✅ Updated indexing permissions for file: ${fileId}`);

      return updatedMetadata;
    } catch (error) {
      console.error(`❌ Failed to update indexing permissions for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Synchronize relational overrides table with indexing permissions
   */
  private async syncFileVisibilityOverrides(
    fileId: string,
    indexingPermissions?: PublicMetadata['indexingPermissions']
  ): Promise<void> {
    const db = getDatabasePool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM file_index_visibility WHERE file_id = $1', [fileId]);

      if (indexingPermissions) {
        const records: Array<[string, boolean]> = [];
        const mode = indexingPermissions.mode || 'all';

        if (mode === 'custom') {
          (indexingPermissions.allowed || []).forEach((id) => {
            records.push([id, true]);
          });
          (indexingPermissions.blocked || []).forEach((id) => {
            records.push([id, false]);
          });
        } else if (mode === 'all') {
          (indexingPermissions.blocked || []).forEach((id) => {
            records.push([id, false]);
          });
        } else if (mode === 'none') {
          // When mode is none, no indexers are allowed. Leaving table empty signals full restriction.
        }

        for (const [thirdPartyId, isAllowed] of records) {
          await client.query(
            `INSERT INTO file_index_visibility (file_id, third_party_id, is_allowed, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (file_id, third_party_id) DO UPDATE SET
               is_allowed = EXCLUDED.is_allowed,
               updated_at = NOW()`,
            [fileId, thirdPartyId, isAllowed]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Failed to sync file visibility overrides for file ${fileId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get curated feed for a specific DID (all files where isPartOf matches the DID)
   */
  async getCuratedFeed(did: string): Promise<CentralIndexEntry[]> {
    const db = getDatabasePool();

    try {
      // Query all three tables in parallel
      const allTables = this.getAllContentTypeTables();
      const queryPromises = allTables.map(table =>
        db.query(
          `SELECT file_id, metadata, submitted_at, pn_identifier, updated_at
           FROM ${table}
         WHERE metadata->>'isPublic' = 'true'
         AND (
           metadata->>'isPartOf' = $1 OR
           metadata->'creator'->>'@id' = $1 OR
           metadata->'creator'->'identifier'->>'value' = $1 OR
           metadata->'author'->>'did' = $1
         )
         ORDER BY updated_at DESC`,
        [did]
        )
      );

      const results = await Promise.all(queryPromises);
      
      // Merge results from all tables
      let allRows: any[] = [];
      for (const result of results) {
        allRows.push(...result.rows);
      }

      // Sort by updated_at descending
      allRows.sort((a, b) => {
        const aTime = new Date(a.updated_at || a.submitted_at).getTime();
        const bTime = new Date(b.updated_at || b.submitted_at).getTime();
        return bTime - aTime;
      });

      return allRows.map(row => ({
        fileId: row.file_id,
        metadata: row.metadata as PublicMetadata,
        submittedAt: row.submitted_at.toISOString(),
        pnIdentifier: row.pn_identifier
      }));
    } catch (error) {
      console.error(`❌ Failed to get curated feed for DID ${did}:`, error);
      throw error;
    }
  }

  /**
   * Bulk insert/update metadata (for sync operations)
   */
  async bulkUpsertMetadata(entries: { metadata: PublicMetadata; pnIdentifier?: string }[]): Promise<void> {
    const db = getDatabasePool();

    try {
      // Use a transaction for bulk operations
      await db.query('BEGIN');

      for (const { metadata, pnIdentifier } of entries) {
        if (!metadata.fileId) continue;

        // Determine contentClass
        let contentClass = (metadata as any).contentClass;
        if (!contentClass) {
          const { determineContentClass } = await import('../utils/fileTypeUtils');
          contentClass = determineContentClass({
            fileType: metadata.fileType,
            collection: (metadata as any).collection,
            textPost: (metadata as any).textPost,
            thought: (metadata as any).thought,
            isThoughtThumbnail: (metadata as any).isThoughtThumbnail,
            isPartOfCollection: (metadata as any).isPartOfCollection
          });
        }

        // Check all three tables for existing metadata
        const allTables = this.getAllContentTypeTables();
        let existingRow: any = null;
        let existingTable: string | null = null;
        
        for (const table of allTables) {
        const existing = await db.query(
            `SELECT metadata FROM ${table} WHERE file_id = $1`,
          [metadata.fileId]
        );
          if (existing.rows.length > 0) {
            existingRow = existing.rows[0];
            existingTable = table;
            break;
          }
        }

        const existingMetadata = existingRow?.metadata;
        const existingIsPublic = existingMetadata?.isPublic;

        // PRESERVE isPublic - NEVER change it in bulk operations
        // Only sync other metadata fields
        const preservedIsPublic = existingIsPublic !== undefined 
          ? (existingIsPublic === true || existingIsPublic === 'true')
          : metadata.isPublic;

        const validatedMetadata: PublicMetadata = {
          ...metadata,
          // CRITICAL: Preserve existing isPublic, never override in bulk operations
          isPublic: preservedIsPublic,
          backend: metadata.backend || 'google_drive',
          backendFileId: metadata.backendFileId || metadata.fileId,
          name: metadata.name || metadata.title || metadata.fileId,
          uploadDate: metadata.uploadDate || new Date().toISOString(),
          fileType: metadata.fileType || 'other',
          contentClass: contentClass as 'media' | 'thought' | 'collection'
        };

        const targetTable = this.getTableNameForContentClass(contentClass as 'media' | 'thought' | 'collection');

        if (existingRow && existingTable) {
          // If contentClass changed, move to new table
          if (existingTable !== targetTable) {
            // Get full row data
            const fullRow = await db.query(
              `SELECT metadata, pn_identifier, submitted_at, created_at FROM ${existingTable} WHERE file_id = $1`,
              [metadata.fileId]
            );
            
            if (fullRow.rows.length > 0) {
              const row = fullRow.rows[0];
              // Insert into new table
              await db.query(
                `INSERT INTO ${targetTable} (file_id, metadata, pn_identifier, submitted_at, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [metadata.fileId, JSON.stringify(validatedMetadata), row.pn_identifier, row.submitted_at, row.created_at]
              );
              // Delete from old table
              await db.query(`DELETE FROM ${existingTable} WHERE file_id = $1`, [metadata.fileId]);
            }
          } else {
          // UPDATE: Use jsonb_set to update only non-isPublic fields, explicitly preserving isPublic
          await db.query(
              `UPDATE ${targetTable} 
             SET metadata = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       COALESCE(metadata, '{}'::jsonb),
                       '{name}', $1::jsonb, true
                     ),
                     '{description}', $2::jsonb, true
                   ),
                   '{backendFileId}', $3::jsonb, true
                 ),
                 '{fileType}', $4::jsonb, true
               ),
               '{isPublic}',
               COALESCE((metadata->>'isPublic')::jsonb, 'true'::jsonb),
               false
             ),
             pn_identifier = COALESCE($5, pn_identifier),
             updated_at = NOW()
             WHERE file_id = $6`,
            [
              JSON.stringify(validatedMetadata.name),
              JSON.stringify(validatedMetadata.description || null),
              JSON.stringify(validatedMetadata.backendFileId),
              JSON.stringify(validatedMetadata.fileType),
              pnIdentifier,
              validatedMetadata.fileId
            ]
          );
          }
        } else {
          // INSERT: New file
          await db.query(
            `INSERT INTO ${targetTable} (file_id, metadata, pn_identifier, updated_at)
             VALUES ($1, $2, $3, NOW())`,
            [validatedMetadata.fileId, JSON.stringify(validatedMetadata), pnIdentifier]
          );
        }
      }

      await db.query('COMMIT');
      console.log(`✅ Bulk upserted ${entries.length} metadata entries (isPublic preserved)`);
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('❌ Failed to bulk upsert metadata:', error);
      throw error;
    }
  }
}

