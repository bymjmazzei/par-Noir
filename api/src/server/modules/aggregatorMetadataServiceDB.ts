/**
 * Aggregator Metadata Service (Database-Backed)
 * 
 * IMPORTANT: This service maintains a PERFORMANCE CACHE, not the source of truth.
 * 
 * Architecture:
 * - Owner public-file-index (Drive Sheets or portable index) is membership truth for public content
 * - This database is a PERFORMANCE CACHE for fast queries (PostgreSQL)
 * - aggregatorReconcileService keeps the cache aligned with each owner's public index
 * - API write paths (submit/delete) update cache and index together
 */

import { getDatabasePool } from '../utils/database';
import { PublicMetadata, CentralIndexEntry, CentralIndexResponse } from './aggregatorMetadataService';
import { hashIdentifier, isDevVerbose, safeLogger } from '../../utils/logger';
import { EngagementService, type EngagementMetrics } from './engagementService';
import { computePublicRankFromMetrics } from './discoveryRank';

/**
 * Sort merged index rows by public discovery score (verified-weighted engagement + recency).
 * Mutates rows with `_publicRankScore` for mapping into `CentralIndexEntry`.
 */
async function sortRowsByPublicRank(allFiles: any[]): Promise<void> {
  if (allFiles.length === 0) return;
  const ids = allFiles.map((r) => String(r.file_id));
  const metricsByFile = await EngagementService.getEngagementMetricsBatch(ids);
  const emptyMetrics = (): EngagementMetrics => ({
    total: { likes: 0, comments: 0, shares: 0, saves: 0 },
    verified: { likes: 0, comments: 0, shares: 0, saves: 0 },
    unverified: { likes: 0, comments: 0, shares: 0, saves: 0 },
    recommendationScore: 0
  });

  for (const row of allFiles) {
    const id = String(row.file_id);
    const m = metricsByFile.get(id) ?? emptyMetrics();
    const rawUpload = row.metadata?.uploadDate
      ? new Date(row.metadata.uploadDate).getTime()
      : new Date(row.submitted_at).getTime();
    const uploadMs = Number.isFinite(rawUpload) ? rawUpload : Date.now();
    const { score } = computePublicRankFromMetrics(m, uploadMs, {});
    row._publicRankScore = score;
  }

  allFiles.sort((a, b) => {
    const sb = Number(b._publicRankScore ?? 0);
    const sa = Number(a._publicRankScore ?? 0);
    if (sb !== sa) return sb - sa;
    const tb = new Date(b.metadata?.updated_at || b.submitted_at).getTime();
    const ta = new Date(a.metadata?.updated_at || a.submitted_at).getTime();
    if (tb !== ta) return tb - ta;
    return String(b.file_id).localeCompare(String(a.file_id));
  });
}

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
      if (process.env.LOG_LEVEL === 'debug') {
        console.warn(`[AggregatorMetadataServiceDB] Text/thought data present but fileType is '${validatedFileType}', auto-setting to 'text': ${metadata.fileId}`);
      }
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
      safeLogger.info('Added public metadata', {
        fileIdHash: hashIdentifier(validatedMetadata.fileId),
        fileType,
        contentClass,
        hasTextPost,
        hasThought,
        isThoughtThumbnail: !!(validatedMetadata as any).isThoughtThumbnail,
        textPostKeysCount: hasTextPost ? Object.keys((validatedMetadata as any).textPost || {}).length : 0,
        thoughtKeysCount: hasThought ? Object.keys((validatedMetadata as any).thought || {}).length : 0
      });

      await this.syncFileVisibilityOverrides(validatedMetadata.fileId, validatedMetadata.indexingPermissions);
      
      // SCALABILITY: Invalidate cache when metadata is added/updated
      try {
        const { invalidateIndexCache } = await import('../utils/cache');
        await invalidateIndexCache();
        console.log(`🗑️ [submitMetadata] Invalidated index cache after metadata update`);
      } catch (error) {
        safeLogger.warn('[submitMetadata] Cache invalidation failed (non-critical)', { error: error as Error });
        // Continue even if cache invalidation fails
      }
    } catch (error) {
      safeLogger.error('Failed to submit metadata', { fileIdHash: hashIdentifier(validatedMetadata.fileId), error: error as Error });
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

      safeLogger.info('[removeAllMetadataForUser] Removed files for user', { removed: totalRemoved, pnHash: hashIdentifier(pnIdentifier) });
      return totalRemoved;
    } catch (error) {
      safeLogger.error('Failed to remove all metadata for user', { pnHash: hashIdentifier(pnIdentifier), error: error as Error });
      throw error;
    }
  }

  /**
   * Remove public rows that lack a usable publicContentRef.
   * These cannot be repaired (companion metadata never stored the ref).
   */
  async purgePublicRowsMissingContentRef(): Promise<number> {
    const db = getDatabasePool();
    const tables = this.getAllContentTypeTables();
    let removed = 0;

    for (const table of tables) {
      const result = await db.query(
        `DELETE FROM ${table}
         WHERE (metadata->>'isPublic')::text = 'true'
           AND (
             metadata->'publicContentRef' IS NULL
             OR COALESCE(metadata->'publicContentRef'->>'objectId', '') = ''
             OR COALESCE(metadata->'publicContentRef'->>'publicUrl', '') = ''
             OR COALESCE(metadata->'publicContentRef'->>'backend', '') = ''
           )
         RETURNING file_id`
      );
      removed += result.rowCount || 0;
    }

    if (removed > 0) {
      try {
        const { invalidateIndexCache } = await import('../utils/cache');
        await invalidateIndexCache();
      } catch (cacheError) {
        console.warn('[purgePublicRowsMissingContentRef] Cache invalidation failed:', cacheError);
      }
      safeLogger.info('[AggregatorMetadata] Purged public rows missing publicContentRef', {
        removed,
      });
    }

    return removed;
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
   * Serves the public feed from the aggregator cache (PostgreSQL).
   * Membership truth lives in each owner's public-file-index; reconcilePublicAggregator
   * removes cache rows that are no longer listed there.
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

      await sortRowsByPublicRank(allFiles);

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
        const pr = typeof row._publicRankScore === 'number' ? row._publicRankScore : undefined;
        if (pr !== undefined) {
          metadata.publicRankScore = pr;
        }

        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier,
          publicRankScore: pr
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

      if (isDevVerbose()) {
        console.log(`📤 [getPublicMetadata] Returning ${entries.length} files (limit=${limit}, offset=${offset}, hasMore=${hasMore}, total=${total})`);
      }
      
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

      await sortRowsByPublicRank(allFiles);

      // Apply pagination after merging
      const paginatedFiles = allFiles.slice(offset, offset + limit);
      const hasMore = allFiles.length > offset + limit;
      
      let entries: CentralIndexEntry[] = paginatedFiles.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        // Add feedIds to metadata if they exist
        if (row.feed_ids && row.feed_ids.length > 0) {
          metadata.feedIds = row.feed_ids.map((id: string) => id.toString());
        }
        const pr = typeof row._publicRankScore === 'number' ? row._publicRankScore : undefined;
        if (pr !== undefined) {
          metadata.publicRankScore = pr;
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier,
          publicRankScore: pr
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

  /** SQL predicate matching public feed rows (isPublic = true). */
  private static readonly PUBLIC_METADATA_WHERE = `(
    metadata->>'isPublic' = 'true'
    OR (metadata->>'isPublic')::boolean = true
    OR metadata->'isPublic' = 'true'::jsonb
  )`;

  /**
   * pn_identifiers that have at least one public row in aggregator cache tables.
   */
  async listPnIdentifiersWithPublicFiles(): Promise<string[]> {
    const db = getDatabasePool();
    const where = AggregatorMetadataServiceDB.PUBLIC_METADATA_WHERE;
    const result = await db.query(`
      SELECT DISTINCT pn_identifier FROM aggregator_media
        WHERE pn_identifier IS NOT NULL AND ${where}
      UNION
      SELECT DISTINCT pn_identifier FROM aggregator_thoughts
        WHERE pn_identifier IS NOT NULL AND ${where}
      UNION
      SELECT DISTINCT pn_identifier FROM aggregator_collections
        WHERE pn_identifier IS NOT NULL AND ${where}
    `);
    return result.rows
      .map((row: { pn_identifier: string }) => row.pn_identifier)
      .filter(Boolean);
  }

  /**
   * Public file_ids for one user across all aggregator cache tables.
   */
  async listPublicFileIdsForUser(pnIdentifier: string): Promise<string[]> {
    const submissions = await this.listPublicFileSubmissionsForUser(pnIdentifier);
    return submissions.map((s) => s.fileId);
  }

  /** Public file ids with submitted_at — used by reconcile grace window. */
  async listPublicFileSubmissionsForUser(
    pnIdentifier: string
  ): Promise<Array<{ fileId: string; submittedAt: Date }>> {
    const db = getDatabasePool();
    const where = AggregatorMetadataServiceDB.PUBLIC_METADATA_WHERE;
    const tables = this.getAllContentTypeTables();
    const out: Array<{ fileId: string; submittedAt: Date }> = [];
    for (const table of tables) {
      const result = await db.query(
        `SELECT file_id, submitted_at FROM ${table} WHERE pn_identifier = $1 AND ${where}`,
        [pnIdentifier]
      );
      for (const row of result.rows) {
        if (row.file_id) {
          out.push({
            fileId: row.file_id,
            submittedAt:
              row.submitted_at instanceof Date ? row.submitted_at : new Date(row.submitted_at),
          });
        }
      }
    }
    return out;
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

      await sortRowsByPublicRank(allRows);
      
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
        const pr = typeof row._publicRankScore === 'number' ? row._publicRankScore : undefined;
        if (pr !== undefined) {
          metadata.publicRankScore = pr;
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier,
          publicRankScore: pr
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

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `📤 [getAllFilesForUser] Returning ${entries.length} files (public + private) for user (redacted)`
        );
      }

      return entries;
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
        await sortRowsByPublicRank(allFiles);
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
        const pr = typeof row._publicRankScore === 'number' ? row._publicRankScore : undefined;
        if (pr !== undefined) {
          metadata.publicRankScore = pr;
        }
        return {
          fileId: row.file_id,
          metadata,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier,
          publicRankScore: pr
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
   * Get full index response for the public feed (cache-backed; kept fresh by reconcile job).
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
        if (isDevVerbose()) {
          console.log(`✅ [getIndexResponse] Cache hit for filters:`, filters);
        }
        return {
          ...cached,
          files: cached.files || [],
          total: cached.total || cached.totalFiles || 0,
          totalFiles: cached.total || cached.totalFiles || 0,
          hasMore: cached.hasMore || false,
        };
      }
    } catch (error) {
      console.warn('⚠️ [getIndexResponse] Cache check failed (non-critical):', error);
    }

    const result = await this.getPublicMetadata(filters);
    const stats = await this.getStats();

    const response = {
      files: result.files,
      updatedAt: stats.lastUpdated,
      totalFiles: result.total,
      total: result.total,
      hasMore: result.hasMore,
    };

    try {
      const { setCachedIndex } = await import('../utils/cache');
      await setCachedIndex(filters, response, 300);
      if (isDevVerbose()) {
        console.log(`💾 [getIndexResponse] Cached response for filters:`, filters);
      }
    } catch (error) {
      console.warn('⚠️ [getIndexResponse] Cache set failed (non-critical):', error);
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
   * Sync engagement counts from the engagement table into file metadata (correct content table).
   */
  async syncEngagementStats(fileId: string): Promise<PublicMetadata | null> {
    const db = getDatabasePool();

    try {
      const current = await this.getFileMetadata(fileId);
      if (!current) {
        return null;
      }

      const engagementStats = await EngagementService.getEngagementStats(fileId);
      const metadata = current.metadata;
      const existingEngagement = metadata.engagement || {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        lastUpdated: metadata.uploadDate || new Date().toISOString(),
        engagementHistory: []
      };

      const updatedMetadata: PublicMetadata = {
        ...metadata,
        engagement: {
          views: existingEngagement.views || 0,
          likes: engagementStats.likes || 0,
          comments: engagementStats.comments || 0,
          shares: engagementStats.shares || 0,
          saves: engagementStats.saves || 0,
          lastUpdated: new Date().toISOString(),
          engagementHistory: existingEngagement.engagementHistory || []
        }
      };

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
         SET metadata = $1, updated_at = NOW()
         WHERE file_id = $2`,
        [JSON.stringify(updatedMetadata), fileId]
      );

      return updatedMetadata;
    } catch (error) {
      console.error(`❌ Failed to sync engagement stats for file ${fileId}:`, error);
      throw error;
    }
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
      publicContentRef?: unknown | null; // null = delete, object = set, undefined = preserve
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
      
      // Extract share fields so we can handle them explicitly (null = delete)
      const {
        publicToken: existingPublicToken,
        publicContentRef: existingPublicContentRef,
        ...metadataWithoutShareFields
      } = metadata as any;
      
      // Apply updates
      const updatedMetadata: PublicMetadata = {
        ...metadataWithoutShareFields,
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
        )),
        // Handle publicContentRef: null = delete, object = set, undefined = preserve
        ...(updates.publicContentRef !== undefined ? (
          updates.publicContentRef === null
            ? {}
            : { publicContentRef: updates.publicContentRef }
        ) : (
          existingPublicContentRef ? { publicContentRef: existingPublicContentRef } : {}
        ))
      };

      // Ensure keywords and tags are in sync
      if (updatedMetadata.keywords && !updatedMetadata.tags) {
        updatedMetadata.tags = updatedMetadata.keywords;
      }
      if (updatedMetadata.tags && !updatedMetadata.keywords) {
        updatedMetadata.keywords = updatedMetadata.tags;
      }

      {
        const { assertPublicRowShareFields } = await import('./publicRowGuard');
        assertPublicRowShareFields({
          isPublic: (updatedMetadata as any).isPublic === true,
          publicToken: (updatedMetadata as any).publicToken,
          publicContentRef: (updatedMetadata as any).publicContentRef,
        });
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

      await sortRowsByPublicRank(allRows);

      return allRows.map(row => {
        const metadata = row.metadata as PublicMetadata;
        const pr = typeof row._publicRankScore === 'number' ? row._publicRankScore : undefined;
        const metaOut =
          pr !== undefined ? { ...metadata, publicRankScore: pr } : { ...metadata };
        return {
          fileId: row.file_id,
          metadata: metaOut,
          submittedAt: row.submitted_at.toISOString(),
          pnIdentifier: row.pn_identifier,
          publicRankScore: pr
        };
      });
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
               COALESCE((metadata->>'isPublic')::jsonb, 'false'::jsonb),
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

