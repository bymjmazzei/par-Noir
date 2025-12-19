/**
 * Aggregator Metadata Service (Database-Backed)
 * Maintains centralized index of all public file metadata from all pNs
 * Uses PostgreSQL for persistent storage
 */

import { getDatabasePool } from '../utils/database';
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
   * Submit public metadata to central index
   * Validates structure before adding
   */
  async submitMetadata(metadata: PublicMetadata, pnIdentifier?: string): Promise<void> {
    // Only require fileId - other fields can have defaults
    if (!metadata.fileId) {
      throw new Error('Invalid metadata: missing required field: fileId');
    }

    const db = getDatabasePool();

    // Enhance metadata structure - preserve isPublic value from metadata
    const validatedMetadata: PublicMetadata = {
      ...metadata,
      isPublic: metadata.isPublic === true, // Default to false (private) if not explicitly true
      backend: metadata.backend || 'google_drive',
      backendFileId: metadata.backendFileId || metadata.fileId,
      name: metadata.name || metadata.title || metadata.fileId,
      uploadDate: metadata.uploadDate || new Date().toISOString(),
      fileType: metadata.fileType || 'other',
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
      // Upsert metadata (insert or update if exists)
      await db.query(
        `INSERT INTO aggregator_metadata (file_id, metadata, pn_identifier, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (file_id) 
         DO UPDATE SET 
           metadata = $2,
           pn_identifier = $3,
           updated_at = NOW()`,
        [validatedMetadata.fileId, JSON.stringify(validatedMetadata), pnIdentifier]
      );

      const displayTitle = validatedMetadata.name || validatedMetadata.title || 'Untitled';
      const authorDid = validatedMetadata.creator?.identifier?.value || validatedMetadata.creator?.["@id"] || validatedMetadata.author?.did;
      const authorDisplay = authorDid ? authorDid.substring(0, 12) + '...' : 'Unknown';
      const hasTextPost = !!(validatedMetadata as any).textPost;
      const hasThought = !!(validatedMetadata as any).thought;
      const fileType = validatedMetadata.fileType;
      console.log(`✅ Added public metadata for file: ${validatedMetadata.fileId} (${displayTitle}) by ${authorDisplay}`, {
        fileType,
        hasTextPost,
        hasThought,
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
        await db.query('DELETE FROM feed_posts WHERE file_id = $1', [fileIdOrBackendFileId]);
        
        // Also try deleting by backendFileId if it's different
        const findResult = await db.query(
          `SELECT file_id FROM aggregator_metadata 
           WHERE metadata->>'backendFileId' = $1 
              OR metadata->>'fileId' = $1
           LIMIT 1`,
          [fileIdOrBackendFileId]
        );
        
        if (findResult.rows.length > 0) {
          const actualFileId = findResult.rows[0].file_id;
          if (actualFileId !== fileIdOrBackendFileId) {
            await db.query('DELETE FROM feed_posts WHERE file_id = $1', [actualFileId]);
          }
        }
        
        console.log(`🗑️ [removeMetadata] Attempted to remove file ${fileIdOrBackendFileId} from feed_posts`);
      } catch (feedPostsError: any) {
        // Table might not exist or have different structure - that's okay
        console.warn(`⚠️ [removeMetadata] Could not delete from feed_posts (non-critical):`, feedPostsError?.message || feedPostsError);
      }
      
      // Try to remove by file_id first (most common case)
      let result = await db.query(
        'DELETE FROM aggregator_metadata WHERE file_id = $1',
        [fileIdOrBackendFileId]
      );

      let removed = (result.rowCount ?? 0) > 0;

      // If not found by file_id, try to find by backendFileId in metadata JSON
      if (!removed) {
        result = await db.query(
          `DELETE FROM aggregator_metadata 
           WHERE metadata->>'backendFileId' = $1 
              OR metadata->>'fileId' = $1`,
          [fileIdOrBackendFileId]
        );
        removed = (result.rowCount ?? 0) > 0;
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
   * Get all public metadata with optional filters
   * 
   * IMPORTANT: This is the SOURCE OF TRUTH for the public feed.
   * The public feed reads directly from the database - NOT from Google Drive files.
   * Google Drive `public-file-index.json` files are NOT used by the API.
   * 
   * Only files with `isPublic = 'true'` in the database will appear in the public feed.
   */
  async getPublicMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
    feedId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
    const db = getDatabasePool();

    try {
      // If filtering by feedId, use INNER JOIN to only get files in that feed
      // Otherwise use LEFT JOIN to get all files with their feedIds
      const joinType = filters?.feedId ? 'INNER' : 'LEFT';
      
      let query = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
        FROM aggregator_metadata am
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
        -- SIMPLIFIED: Public feed should only filter by isPublic/publicToken and isNSFW
        -- Files with publicToken are considered public even if isPublic is false
      `;
      const params: any[] = [];
      let paramIndex = 1;
      
      // Add feedId filter if provided
      if (filters?.feedId) {
        query += ` AND fp.feed_id = $${paramIndex}`;
        params.push(filters.feedId);
        paramIndex++;
      }

      // Apply fileType filter before GROUP BY
      if (filters?.fileType) {
        query += ` AND am.metadata->>'fileType' = $${paramIndex}`;
        params.push(filters.fileType);
        paramIndex++;
      }
      
      query += ` GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier`;

      // Note: authorDid filter is applied in JavaScript (same pattern as tags)
      // This avoids SQL type issues with NULL comparisons

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

      query += ` ORDER BY am.updated_at DESC`;

      // SCALABILITY: Add pagination support
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;
      
      // Get total count before pagination (for pagination info)
      // Note: This count doesn't include JS filters (tags, authorDid) for performance
      const countJoinType = filters?.feedId ? 'INNER' : 'LEFT';
      const countQuery = `
        SELECT COUNT(DISTINCT am.file_id) as count
        FROM aggregator_metadata am
        ${countJoinType} JOIN feed_posts fp ON am.file_id = fp.file_id
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
        -- SIMPLIFIED: Public feed should only filter by isPublic/publicToken and isNSFW
        -- Files with publicToken are considered public even if isPublic is false
        ${filters?.fileType ? `AND am.metadata->>'fileType' = $1` : ''}
        ${filters?.feedId ? `AND fp.feed_id = $${filters?.fileType ? '2' : '1'}` : ''}
        ${filters?.indexerId ? `AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? $${filters?.fileType && filters?.feedId ? '3' : filters?.fileType || filters?.feedId ? '2' : '1'})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
            AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? $${filters?.fileType && filters?.feedId ? '3' : filters?.fileType || filters?.feedId ? '2' : '1'})
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? $${filters?.fileType && filters?.feedId ? '3' : filters?.fileType || filters?.feedId ? '2' : '1'})
          )
        )` : ''}
      `;
      const countParams: any[] = [];
      if (filters?.fileType) countParams.push(filters.fileType);
      if (filters?.feedId) countParams.push(filters.feedId);
      if (filters?.indexerId) countParams.push(filters.indexerId);
      
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      // Add pagination to main query (fetch limit+1 to check hasMore)
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit + 1); // Fetch one extra to check hasMore
      params.push(offset);
      paramIndex += 2;

      // CRITICAL DEBUG: Log query details
      console.log(`🔍 [getPublicMetadata] Executing query with filters:`, {
        fileType: filters?.fileType,
        feedId: filters?.feedId,
        limit,
        offset,
        queryLength: query.length
      });
      
      // First, check how many files are in the database total
      const totalFilesCheck = await db.query(`SELECT COUNT(*) as count FROM aggregator_metadata`);
      const totalFilesInDB = parseInt(totalFilesCheck.rows[0].count, 10);
      
      // Get ALL files to see what their isPublic values actually are
      const allFilesCheck = await db.query(`
        SELECT file_id, 
               metadata->>'isPublic' as is_public, 
               metadata->'isPublic' as is_public_jsonb,
               (metadata->>'isPublic')::boolean as is_public_boolean,
               metadata->>'name' as name, 
               metadata->>'fileType' as file_type, 
               metadata->>'publicToken' as public_token,
               metadata as full_metadata
        FROM aggregator_metadata 
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      
      // Check how many are public
      const publicFilesCheck = await db.query(`
        SELECT COUNT(*) as count 
        FROM aggregator_metadata 
        WHERE (
          metadata->>'isPublic' = 'true' 
          OR (metadata->>'isPublic')::boolean = true
          OR metadata->'isPublic' = 'true'::jsonb
        )
      `);
      const publicFilesInDB = parseInt(publicFilesCheck.rows[0].count, 10);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aggregatorMetadataServiceDB.ts:396',message:'All files in database',data:{allFiles:allFilesCheck.rows.map((r:any)=>({fileId:r.file_id,isPublic:r.is_public,name:r.name,fileType:r.file_type,hasPublicToken:!!r.public_token}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // Check how many pass NSFW filter
      const publicNonNSFWCheck = await db.query(`
        SELECT COUNT(*) as count 
        FROM aggregator_metadata 
        WHERE (
          metadata->>'isPublic' = 'true' 
          OR (metadata->>'isPublic')::boolean = true
          OR metadata->'isPublic' = 'true'::jsonb
        )
        AND (
          metadata->>'isNSFW' IS NULL 
          OR metadata->>'isNSFW' = 'false'
          OR metadata->>'isNSFW' = 'False'
          OR metadata->>'isNSFW' = 'FALSE'
          OR (metadata->>'isNSFW')::text = 'false'
        )
        AND NOT (
          metadata->>'isNSFW' = 'true'
          OR metadata->>'isNSFW' = 'True'
          OR metadata->>'isNSFW' = 'TRUE'
          OR (metadata->>'isNSFW')::text = 'true'
          OR (metadata->'isNSFW')::boolean = true
        )
      `);
      const publicNonNSFWInDB = parseInt(publicNonNSFWCheck.rows[0].count, 10);
      
      // Get sample of public files to see what they look like
      const sampleFilesCheck = await db.query(`
        SELECT file_id, metadata->>'name' as name, metadata->>'fileType' as file_type, 
               metadata->>'isPublic' as is_public, metadata->>'thumbnailFileId' as thumbnail_file_id,
               metadata->'textPost' IS NOT NULL as has_text_post,
               metadata->'thought' IS NOT NULL as has_thought
        FROM aggregator_metadata 
        WHERE (
          metadata->>'isPublic' = 'true' 
          OR (metadata->>'isPublic')::boolean = true
          OR metadata->'isPublic' = 'true'::jsonb
        )
        ORDER BY updated_at DESC
        LIMIT 10
      `);
      
      console.log(`🔍 [getPublicMetadata] Database state:`, {
        totalFilesInDB,
        publicFilesInDB,
        publicNonNSFWInDB,
        allFiles: allFilesCheck.rows.map((r: any) => ({
          fileId: r.file_id,
          name: r.name,
          fileType: r.file_type,
          isPublic_string: r.is_public,
          isPublic_jsonb: r.is_public_jsonb,
          isPublic_boolean: r.is_public_boolean,
          hasPublicToken: !!r.public_token,
          fullMetadata: r.full_metadata
        })),
        sampleFiles: sampleFilesCheck.rows.map((r: any) => ({
          fileId: r.file_id,
          name: r.name,
          fileType: r.file_type,
          isPublic: r.is_public,
          hasThumbnailFileId: !!r.thumbnail_file_id,
          hasTextPost: r.has_text_post,
          hasThought: r.has_thought
        }))
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aggregatorMetadataServiceDB.ts:468',message:'Executing public metadata query',data:{query:query.substring(0,200),params:params,filters:filters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const result = await db.query(query, params);
      const hasMore = result.rows.length > limit;
      const rowsToProcess = result.rows.slice(0, limit); // Only process the requested amount
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aggregatorMetadataServiceDB.ts:472',message:'Query result received',data:{rowsReturned:result.rows.length,rowsToProcess:rowsToProcess.length,hasMore,firstRow:rowsToProcess[0]?{fileId:rowsToProcess[0].file_id,fileType:rowsToProcess[0].metadata?.fileType||null,name:rowsToProcess[0].metadata?.name||null}:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log(`🔍 [getPublicMetadata] Query result:`, {
        rowsReturned: result.rows.length,
        rowsToProcess: rowsToProcess.length,
        hasMore
      });
      
      // Check if any NSFW files slipped through the query (should never happen)
      rowsToProcess.forEach((row: any) => {
        const metadata = row.metadata || {};
        const isNSFW = metadata.isNSFW;
        const isNSFWString = String(isNSFW || '').toLowerCase();
        const isNSFWValue = isNSFW === true || isNSFWString === 'true';
        
        if (isNSFWValue) {
          console.error(`❌ [getPublicMetadata] NSFW FILE FOUND IN PUBLIC INDEX! File: ${row.file_id} (${metadata.name || 'unnamed'})`);
        }
      });
      
      let entries: CentralIndexEntry[] = rowsToProcess.map(row => {
        const metadata = row.metadata as PublicMetadata & { feedIds?: string[] };
        // Add feedIds to metadata if they exist
        if (row.feed_ids && row.feed_ids.length > 0) {
          metadata.feedIds = row.feed_ids.map((id: string) => id.toString());
        }
        
        // Debug logging for text files to verify textPost/thought are in the response
        if (metadata.fileType === 'text' || metadata.fileType === 'thought') {
          const hasTextPost = !!(metadata as any).textPost;
          const hasThought = !!(metadata as any).thought;
          if (!hasTextPost && !hasThought) {
            console.warn(`⚠️ [getPublicMetadata] Text file ${row.file_id} missing textPost/thought fields:`, {
              fileId: row.file_id,
              fileType: metadata.fileType,
              metadataKeys: Object.keys(metadata),
              hasTextPost,
              hasThought,
              description: metadata.description?.substring(0, 50)
            });
          }
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

      // SIMPLE: Trust the database - if isPublic = true, return it
      // Files are removed from database when:
      // 1. User makes file private (PUT updates isPublic = false)
      // 2. User deletes file (DELETE endpoint removes from database)
      // 3. User disconnects cloud (handled by disconnect logic)
      // No need for complex validation - database is source of truth
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aggregatorMetadataServiceDB.ts:554',message:'Returning public metadata entries',data:{entriesCount:entries.length,total,hasMore,limit,offset,sampleEntries:entries.slice(0,3).map(e=>({fileId:e.fileId,fileType:e.metadata?.fileType,name:e.metadata?.name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log(`📤 [getPublicMetadata] Returning ${entries.length} files from database (isPublic = true, limit=${limit}, offset=${offset}, hasMore=${hasMore})`);
      
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
      let query = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND am.metadata->>'isNSFW' = 'true'
        GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier
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

      query += ` ORDER BY am.updated_at DESC`;

      // SCALABILITY: Add pagination support
      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;
      
      // Get total count before pagination
      const countQuery = `
        SELECT COUNT(*) as count
        FROM aggregator_metadata am
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR (am.metadata->>'isPublic')::boolean = true
          OR am.metadata->'isPublic' = 'true'::jsonb
        )
        AND am.metadata->>'isNSFW' = 'true'
        ${filters?.fileType ? `AND am.metadata->>'fileType' = $1` : ''}
        ${filters?.indexerId ? `AND (
          am.metadata->'indexingPermissions' IS NULL
          OR am.metadata->'indexingPermissions'->>'mode' IS NULL
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'all'
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? $${filters?.fileType ? '2' : '1'})
          )
          OR (
            am.metadata->'indexingPermissions'->>'mode' = 'custom'
            AND (COALESCE(am.metadata->'indexingPermissions'->'allowed', '[]'::jsonb) ? $${filters?.fileType ? '2' : '1'})
            AND NOT (COALESCE(am.metadata->'indexingPermissions'->'blocked', '[]'::jsonb) ? $${filters?.fileType ? '2' : '1'})
          )
        )` : ''}
      `;
      const countParams: any[] = [];
      if (filters?.fileType) countParams.push(filters.fileType);
      if (filters?.indexerId) countParams.push(filters.indexerId);
      
      const countResult = await db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      // Add pagination to main query (fetch limit+1 to check hasMore)
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit + 1); // Fetch one extra to check hasMore
      params.push(offset);
      paramIndex += 2;

      const result = await db.query(query, params);
      const hasMore = result.rows.length > limit;
      const rowsToProcess = result.rows.slice(0, limit); // Only process the requested amount
      
      let entries: CentralIndexEntry[] = rowsToProcess.map(row => {
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
      const result = await db.query(
        'SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_metadata WHERE file_id = $1',
        [fileId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        fileId: row.file_id,
        metadata: row.metadata as PublicMetadata,
        submittedAt: row.submitted_at.toISOString(),
        pnIdentifier: row.pn_identifier
      };
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
      let query = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE am.pn_identifier = $1
        GROUP BY am.file_id, am.metadata, am.submitted_at, am.pn_identifier
      `;
      const params: any[] = [pnIdentifier];
      let paramIndex = 2;

      // Apply filters
      if (filters?.fileType) {
        query += ` AND am.metadata->>'fileType' = $${paramIndex}`;
        params.push(filters.fileType);
        paramIndex++;
      }

      query += ` ORDER BY am.updated_at DESC`;

      const result = await db.query(query, params);
      let entries: CentralIndexEntry[] = result.rows.map(row => {
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
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_files,
          MAX(updated_at) as last_updated
        FROM aggregator_metadata
        WHERE metadata->>'isPublic' = 'true'
      `);

      const row = result.rows[0];
      return {
        totalFiles: parseInt(row.total_files, 10),
        lastUpdated: row.last_updated ? new Date(row.last_updated).toISOString() : new Date().toISOString()
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
      // Build base query
      let sqlQuery = `
        SELECT 
          am.file_id, 
          am.metadata, 
          am.submitted_at, 
          am.pn_identifier,
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id::text) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::text[]) as feed_ids
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR am.metadata->>'isPublic' IS NULL
          OR (am.metadata->>'isPublic' = 'false' AND am.metadata->>'publicToken' IS NOT NULL)
        )
      `;
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

      // Pagination
      sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit + 1); // Fetch one extra to check if there are more
      params.push(offset);
      paramIndex += 2;

      const result = await db.query(sqlQuery, params);
      
      // Check if there are more results
      const hasMore = result.rows.length > limit;
      const files = result.rows.slice(0, limit).map(row => {
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

      // Get total count (simplified - could be optimized)
      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM aggregator_metadata am
        WHERE (
          am.metadata->>'isPublic' = 'true' 
          OR am.metadata->>'isPublic' IS NULL
          OR (am.metadata->>'isPublic' = 'false' AND am.metadata->>'publicToken' IS NOT NULL)
        )
        ${searchQuery ? `AND (
          LOWER(am.metadata->>'name') LIKE $1
          OR LOWER(am.metadata->>'title') LIKE $1
          OR LOWER(am.metadata->>'description') LIKE $1
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(am.metadata->'keywords', am.metadata->'tags', '[]'::jsonb)) AS keyword
            WHERE LOWER(keyword) LIKE $1
          )
          OR LOWER(am.metadata->>'category') LIKE $1
        )` : ''}
      `, searchQuery ? [`%${searchQuery}%`] : []);
      
      const total = parseInt(countResult.rows[0].total, 10);

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
    // Get service account token for verification
    let accessToken: string | null = null;
    try {
      const { GoogleDriveSyncService } = await import('./googleDriveSyncService');
      const syncService = GoogleDriveSyncService.getInstance();
      accessToken = await syncService.getAccessToken();
    } catch (error) {
      // If we can't get token, return all files (graceful degradation)
      console.warn('⚠️ [filterActiveFiles] Cannot get access token - returning all files (cannot verify)');
      return result;
    }
    
    if (!accessToken) {
      console.warn('⚠️ [filterActiveFiles] No access token available - returning all files (cannot verify)');
      return result; // Can't verify without token
    }
    
    const activeFiles: CentralIndexEntry[] = [];
    const batchSize = 10; // Process in batches to avoid rate limits
    
    // Process files in batches
    for (let i = 0; i < result.files.length; i += batchSize) {
      const batch = result.files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        const backend = file.metadata.backend || 'google_drive';
        
        // Skip non-Google Drive files (no way to verify them)
        if (!backend || !backend.startsWith('google_drive')) {
          return file; // Keep non-Google Drive files
        }
        
        // If file is marked as public, trust that it's accessible and keep it
        // This prevents filtering out valid public files that the service account can't access
        const isPublic = file.metadata.isPublic === true;
        if (isPublic) {
          // File is marked public - trust the database and keep it
          // Even if service account can't verify, if it's in the database as public, it's accessible
          return file;
        }
        
        // For non-public files, check if they have publicToken (accessible through token system)
        const publicToken = file.metadata.publicToken;
        if (publicToken) {
          // File has publicToken, so it's accessible through token system - keep it
          return file;
        }
        
        // Get Google Drive file ID
        const backendFileId = (file.metadata as any).googleDriveFileId || file.metadata.backendFileId;
        
        // If no backendFileId, we can't verify but keep it (might be from other backends or valid)
        if (!backendFileId) {
          console.log(`⚠️ [filterActiveFiles] No backendFileId for file ${file.fileId} - keeping (cannot verify)`);
          return file; // Keep files we can't verify
        }
        
        // Verify file exists in Google Drive (only for files that aren't clearly public)
        try {
          const verifyResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${backendFileId}?fields=id,trashed`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );
          
          if (verifyResponse.status === 404) {
            // File doesn't exist - filter it out (confirmed deletion)
            console.log(`🗑️ [filterActiveFiles] File ${backendFileId} not found (404) - filtering out: ${file.metadata.name || file.fileId}`);
            return null;
          }
          
          if (verifyResponse.ok) {
            const fileData = await verifyResponse.json() as { trashed?: boolean };
            if (fileData.trashed) {
              // File is trashed - filter it out (confirmed deletion)
              console.log(`🗑️ [filterActiveFiles] File ${backendFileId} is trashed - filtering out: ${file.metadata.name || file.fileId}`);
              return null;
            }
            
            // File exists and is not trashed - include it
            return file;
          } else if (verifyResponse.status === 403 || verifyResponse.status === 401) {
            // Permission error - service account doesn't have access
            // BUT: If file is marked public (isPublic = true), trust that it's accessible and keep it
            // The file might be shared publicly even if service account can't see it
            const isPublic = file.metadata.isPublic === true;
            if (isPublic) {
              console.log(`✅ [filterActiveFiles] File ${backendFileId} is public but service account can't verify (${verifyResponse.status}) - keeping: ${file.metadata.name || file.fileId}`);
              return file; // Trust that public files are accessible
            } else {
              // Not public and can't verify - keep it anyway (better to show than hide)
              console.log(`⚠️ [filterActiveFiles] File ${backendFileId} can't be verified (${verifyResponse.status}) - keeping: ${file.metadata.name || file.fileId}`);
              return file;
            }
          } else {
            // Other error (network, etc.) - include file (don't filter on error)
            console.log(`⚠️ [filterActiveFiles] Could not verify file ${backendFileId} (status: ${verifyResponse.status}) - keeping: ${file.metadata.name || file.fileId}`);
            return file;
          }
        } catch (error) {
          // Network error or other exception - include file (don't filter on error)
          // This prevents removing valid files due to temporary network issues
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
    
    // Get service account access token for authenticated requests
    let accessToken: string | null = null;
    try {
      const { GoogleDriveSyncService } = await import('./googleDriveSyncService');
      const syncService = GoogleDriveSyncService.getInstance();
      accessToken = await syncService.getAccessToken();
      console.log(`✅ [verifyGoogleDriveFilesExist] Got service account access token`);
    } catch (error) {
      console.warn(`⚠️ [verifyGoogleDriveFilesExist] Failed to get service account token, using unauthenticated requests:`, error);
      // Continue without auth - will only work for public files
    }
    
    const verifiedFiles: CentralIndexEntry[] = [];
    const filesToRemove: string[] = [];
    
    // Verify files in batches (rate limiting)
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(async (file) => {
        // Only verify Google Drive files
        if (file.metadata.backend !== 'google_drive') {
          return file; // Keep non-Google Drive files
        }
        
        const googleDriveFileId = (file.metadata as any).googleDriveFileId || file.metadata.backendFileId || file.fileId;
        if (!googleDriveFileId) {
          return file; // Keep if no ID to verify
        }
        
        try {
          // Verify file exists using Google Drive API with service account auth
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
          }
          
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${googleDriveFileId}?fields=id,trashed`,
            {
              method: 'GET',
              headers,
            }
          );

          if (response.status === 404) {
            // File doesn't exist - mark for removal
            console.log(`🗑️ [verifyGoogleDriveFilesExist] File ${googleDriveFileId} not found (404): ${file.metadata.name || 'unknown'}`);
            filesToRemove.push(file.fileId);
            return null;
          }

          if (response.status === 403 || response.status === 401) {
            // Permission denied - file might be private or service account doesn't have access
            // For now, assume it exists (service account should have access to pN folders)
            console.warn(`⚠️ [verifyGoogleDriveFilesExist] Permission denied for ${googleDriveFileId} (${response.status}): ${file.metadata.name || 'unknown'}`);
            return file;
          }

          if (!response.ok) {
            // Other error - log and assume file exists to avoid false positives
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn(`⚠️ [verifyGoogleDriveFilesExist] Error ${response.status} for ${googleDriveFileId}: ${errorText.substring(0, 100)}`);
            return file;
          }

          const fileData = await response.json() as { id?: string; trashed?: boolean };
          // File exists and is not trashed
          if (fileData.trashed) {
            console.log(`🗑️ [verifyGoogleDriveFilesExist] File ${googleDriveFileId} is trashed: ${file.metadata.name || 'unknown'}`);
            filesToRemove.push(file.fileId);
            return null;
          }
          
          return file; // File exists
        } catch (error) {
          // On error (network, etc.), log and assume file exists to avoid false positives
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
    
    // Remove deleted files from database
    if (filesToRemove.length > 0) {
      try {
        const db = getDatabasePool();
        await db.query(
          `DELETE FROM aggregator_metadata WHERE file_id = ANY($1::text[])`,
          [filesToRemove]
        );
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
    userDid?: string
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
        did: userDid,
        timestamp: new Date().toISOString()
      });

      engagement.lastUpdated = new Date().toISOString();

      // Update metadata
      const updatedMetadata: PublicMetadata = {
        ...metadata,
        engagement
      };

      // Save to database
      await db.query(
        `UPDATE aggregator_metadata 
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
      subjects?: string[];
      feedCategories?: string[];
      thumbnailFileId?: string;
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
      
      // Apply updates
      const updatedMetadata: PublicMetadata = {
        ...metadata,
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
        ...(updates.thumbnailFileId !== undefined && { thumbnailFileId: updates.thumbnailFileId })
      };

      // Ensure keywords and tags are in sync
      if (updatedMetadata.keywords && !updatedMetadata.tags) {
        updatedMetadata.tags = updatedMetadata.keywords;
      }
      if (updatedMetadata.tags && !updatedMetadata.keywords) {
        updatedMetadata.keywords = updatedMetadata.tags;
      }

      // Save to database
      await db.query(
        `UPDATE aggregator_metadata 
         SET metadata = $1, updated_at = NOW()
         WHERE file_id = $2`,
        [JSON.stringify(updatedMetadata), fileId]
      );

      console.log(`✅ Updated metadata for file: ${fileId}`);
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

      await db.query(
        `UPDATE aggregator_metadata
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
      // Query for files where isPartOf matches the DID or creator matches the DID
      const result = await db.query(
        `SELECT file_id, metadata, submitted_at, pn_identifier
         FROM aggregator_metadata
         WHERE metadata->>'isPublic' = 'true'
         AND (
           metadata->>'isPartOf' = $1 OR
           metadata->'creator'->>'@id' = $1 OR
           metadata->'creator'->'identifier'->>'value' = $1 OR
           metadata->'author'->>'did' = $1
         )
         ORDER BY updated_at DESC`,
        [did]
      );

      return result.rows.map(row => ({
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

        const validatedMetadata: PublicMetadata = {
          ...metadata,
          isPublic: true,
          backend: metadata.backend || 'google_drive',
          backendFileId: metadata.backendFileId || metadata.fileId,
          name: metadata.name || metadata.title || metadata.fileId,
          uploadDate: metadata.uploadDate || new Date().toISOString(),
          fileType: metadata.fileType || 'other'
        };

        await db.query(
          `INSERT INTO aggregator_metadata (file_id, metadata, pn_identifier, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (file_id) 
           DO UPDATE SET 
             metadata = $2,
             pn_identifier = $3,
             updated_at = NOW()`,
          [validatedMetadata.fileId, JSON.stringify(validatedMetadata), pnIdentifier]
        );
      }

      await db.query('COMMIT');
      console.log(`✅ Bulk upserted ${entries.length} metadata entries`);
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('❌ Failed to bulk upsert metadata:', error);
      throw error;
    }
  }
}

