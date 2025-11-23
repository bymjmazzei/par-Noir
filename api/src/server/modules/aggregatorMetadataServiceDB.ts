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
      console.log(`✅ Added public metadata for file: ${validatedMetadata.fileId} (${displayTitle}) by ${authorDisplay}`);

      await this.syncFileVisibilityOverrides(validatedMetadata.fileId, validatedMetadata.indexingPermissions);
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
        WHERE am.metadata->>'isPublic' = 'true'
        AND (am.metadata->>'isNSFW' IS NULL OR am.metadata->>'isNSFW' = 'false')
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
      console.log(`📤 [getPublicMetadata] Returning ${entries.length} files from database (isPublic = true)`);
      
      return entries;
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
        WHERE am.metadata->>'isPublic' = 'true'
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

      console.log(`📤 [getNSFWMetadata] Returning ${entries.length} NSFW files from database (isPublic = true AND isNSFW = true)`);
      
      return entries;
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
   * Get full index response
   * Automatically cleans up deleted files using public index files as source of truth
   */
  async getIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
  }): Promise<CentralIndexResponse> {
    // AUTOMATIC CLEANUP: Use public index files as source of truth
    // Remove any files from database that aren't in the public index files
    console.log(`🔍 [getIndexResponse] Starting cleanup before returning files...`);
    try {
      await this.cleanupOrphanedFilesFromIndex();
    } catch (error) {
      console.error('❌ [getIndexResponse] Cleanup failed (non-critical, continuing):', error);
      // Continue even if cleanup fails - still return results
    }
    
    let files = await this.getPublicMetadata(filters);
    console.log(`📤 [getIndexResponse] Returning ${files.length} file(s) after cleanup`);
    
    const stats = await this.getStats();

    return {
      files,
      updatedAt: stats.lastUpdated,
      totalFiles: files.length
    };
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
  }): Promise<CentralIndexResponse> {
    console.log(`🔍 [getNSFWIndexResponse] Fetching NSFW files...`);
    
    let files = await this.getNSFWMetadata(filters);
    console.log(`📤 [getNSFWIndexResponse] Returning ${files.length} NSFW file(s)`);
    
    const stats = await this.getStats();

    return {
      files,
      updatedAt: stats.lastUpdated,
      totalFiles: files.length
    };
  }

  /**
   * Clean up orphaned files by comparing database with public index files
   * Each user has their own public index file - if it doesn't exist or is empty, remove all their files
   * Public index files in Google Drive are the source of truth per user
   * 
   * @public - Made public for manual cleanup endpoint
   */
  async cleanupOrphanedFilesFromIndex(): Promise<void> {
    console.log(`🔍 [cleanupOrphanedFilesFromIndex] Starting cleanup process...`);
    try {
      const { GoogleDriveSyncService } = await import('./googleDriveSyncService');
      const syncService = GoogleDriveSyncService.getInstance();
      console.log(`🔍 [cleanupOrphanedFilesFromIndex] Getting access token...`);
      const accessToken = await syncService.getAccessToken();
      console.log(`✅ [cleanupOrphanedFilesFromIndex] Got access token`);
      
      // Map of pnIdentifier -> Set of valid file IDs from that user's public index
      const validFileIdsByUser = new Map<string, Set<string>>();
      
      // Also track which users have public index files (even if empty)
      const usersWithIndexFiles = new Set<string>();
      
      // NEW APPROACH: Use pN identifiers from database to directly access public index files
      // This is more reliable than searching for folders (which service account might not see)
      const db = getDatabasePool();
      const pnIdentifiersResult = await db.query(
        `SELECT DISTINCT pn_identifier FROM aggregator_metadata WHERE metadata->>'isPublic' = 'true' AND pn_identifier IS NOT NULL`
      );
      
      const pnIdentifiers = pnIdentifiersResult.rows.map(row => row.pn_identifier as string).filter(Boolean);
      console.log(`🔍 [cleanupOrphanedFilesFromIndex] Found ${pnIdentifiers.length} unique pN identifier(s) in database`);
      
      // For each pN identifier, try to read the public index file directly
      // Path structure: "par Noir - {pnIdentifier}" / "_metadata" / "public-file-index.json"
      for (const pnIdentifier of pnIdentifiers) {
        try {
          // Try to find the pN folder by name
          const folderName = `par Noir - ${pnIdentifier}`;
          const pnFoldersQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const foldersResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFoldersQuery)}&fields=files(id,name)&pageSize=1`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!foldersResponse.ok) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Failed to search for folder "${folderName}" (${foldersResponse.status}) - service account may not have access`);
            // Continue to next identifier - can't access this user's folders
            continue;
          }

          const foldersData = await foldersResponse.json() as { files?: Array<{ id: string; name: string }> };
          const pnFolders = foldersData.files || [];
          
          if (pnFolders.length === 0) {
            console.log(`ℹ️ [cleanupOrphanedFilesFromIndex] Folder "${folderName}" not found - service account may not have access to ${pnIdentifier}`);
            // Continue to next identifier - can't access this user's folders
            continue;
          }

          const pnFolder = pnFolders[0];
          // Mark that this user has a pN folder (they might have an index file)
          usersWithIndexFiles.add(pnIdentifier);

          // Find _metadata folder
          const metadataFolderQuery = `name='_metadata' and '${pnFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const metadataFolderResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!metadataFolderResponse.ok) continue;
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          const metadataFolders = metadataFolderData.files || [];
          if (metadataFolders.length === 0) continue;

          const metadataFolderId = metadataFolders[0].id;
          
          // Find public-file-index.json
          const indexFileQuery = `name='public-file-index.json' and '${metadataFolderId}' in parents and trashed=false`;
          const indexFileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!indexFileResponse.ok) continue;
          const indexFileData = await indexFileResponse.json() as { files?: Array<{ id: string }> };
          const indexFiles = indexFileData.files || [];
          if (indexFiles.length === 0) {
            // User has no public index file - this is OK, just means no public files
            console.log(`ℹ️ [cleanupOrphanedFilesFromIndex] No public index file for ${pnFolder.name} (${pnIdentifier}) - user has no public files`);
            // Initialize empty set for this user - all their files will be removed
            validFileIdsByUser.set(pnIdentifier, new Set<string>());
            continue;
          }

          const indexFileId = indexFiles[0].id;
          
          // Download and parse the public index file
          const indexContentResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );

          if (!indexContentResponse.ok) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Failed to download public index file for ${pnFolder.name} (${pnIdentifier}): ${indexContentResponse.status}`);
            // If we can't read the index file, remove all files for this user
            validFileIdsByUser.set(pnIdentifier, new Set<string>());
            continue;
          }
          
          const indexContent = await indexContentResponse.json() as { files?: Array<{ fileId?: string; googleDriveFileId?: string; backendFileId?: string }> };
          
          // Initialize file ID set for this user
          const userValidFileIds = new Set<string>();
          
          // Collect all file IDs from this index, but also verify they exist
          if (indexContent.files && indexContent.files.length > 0) {
            console.log(`🔍 [cleanupOrphanedFilesFromIndex] Found ${indexContent.files.length} file(s) in public index for ${pnFolder.name} (${pnIdentifier})`);
            for (const file of indexContent.files) {
              const googleDriveFileId = file.googleDriveFileId || file.backendFileId || file.fileId;
              
              // Verify file actually exists in Google Drive before adding to valid set
              if (googleDriveFileId) {
                try {
                  const verifyResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${googleDriveFileId}?fields=id,trashed`,
                    {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`
                      }
                    }
                  );
                  
                  if (verifyResponse.ok) {
                    const fileData = await verifyResponse.json() as { id?: string; trashed?: boolean };
                    if (!fileData.trashed) {
                      // File exists and is not trashed - add to valid set
                      if (file.fileId) userValidFileIds.add(file.fileId);
                      if (file.googleDriveFileId) userValidFileIds.add(file.googleDriveFileId);
                      if (file.backendFileId) userValidFileIds.add(file.backendFileId);
                      console.log(`✅ [cleanupOrphanedFilesFromIndex] File ${googleDriveFileId} verified in Google Drive for ${pnIdentifier}`);
                    } else {
                      console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${googleDriveFileId} is trashed - skipping`);
                    }
                  } else if (verifyResponse.status === 404) {
                    console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${googleDriveFileId} not found (404) - was in index but doesn't exist for ${pnIdentifier}`);
                  } else {
                    console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Could not verify file ${googleDriveFileId} for ${pnIdentifier}: ${verifyResponse.status}`);
                    // On error, assume file exists (add to valid set to avoid false positives)
                    if (file.fileId) userValidFileIds.add(file.fileId);
                    if (file.googleDriveFileId) userValidFileIds.add(file.googleDriveFileId);
                    if (file.backendFileId) userValidFileIds.add(file.backendFileId);
                  }
                } catch (error) {
                  console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error verifying file ${googleDriveFileId} for ${pnIdentifier}:`, error);
                  // On error, assume file exists
                  if (file.fileId) userValidFileIds.add(file.fileId);
                  if (file.googleDriveFileId) userValidFileIds.add(file.googleDriveFileId);
                  if (file.backendFileId) userValidFileIds.add(file.backendFileId);
                }
              }
            }
          } else {
            console.log(`ℹ️ [cleanupOrphanedFilesFromIndex] Public index file for ${pnFolder.name} (${pnIdentifier}) is empty - user has no public files`);
          }
          
          // Store valid file IDs for this user
          validFileIdsByUser.set(pnIdentifier, userValidFileIds);
          console.log(`✅ [cleanupOrphanedFilesFromIndex] User ${pnIdentifier} has ${userValidFileIds.size} valid public file(s)`);
        } catch (error) {
          console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error processing pN identifier ${pnIdentifier}:`, error);
        }
      }

      // Create combined set of all valid file IDs (across all users) for logging
      const allValidFileIds = new Set<string>();
      for (const fileIds of validFileIdsByUser.values()) {
        for (const fileId of fileIds) {
          allValidFileIds.add(fileId);
        }
      }
      
      console.log(`✅ [cleanupOrphanedFilesFromIndex] Found ${allValidFileIds.size} valid file ID(s) across ${validFileIdsByUser.size} user(s) with accessible public index files`);
      
      // If we couldn't access any index files (service account has no access), 
      // we'll still verify files directly by checking if they exist in Google Drive
      // This ensures deleted files are removed even if we can't access the folder structure
      if (usersWithIndexFiles.size === 0 && pnIdentifiers.length > 0) {
        console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Service account cannot access any public index files - will verify files directly instead`);
      }

      // Remove files from database that aren't in the valid set
      // Also remove files from users who don't have a public index file
      
      // Get ALL public files (same query as getPublicMetadata uses)
      // Use the same query structure to ensure we get the same files
      // Include updated_at to check if file was recently added (grace period)
      const allFilesResult = await db.query(
        `SELECT file_id, metadata, pn_identifier, updated_at FROM aggregator_metadata WHERE metadata->>'isPublic' = 'true'`
      );

      console.log(`🔍 [cleanupOrphanedFilesFromIndex] Checking ${allFilesResult.rows.length} file(s) in database (all public files)`);

      const orphanedFileIds: string[] = [];
      for (const row of allFilesResult.rows) {
        const fileId = row.file_id;
        const metadata = row.metadata as PublicMetadata & { googleDriveFileId?: string };
        const fileName = metadata.name || metadata.title || 'unknown';
        const metadataFileId = metadata.fileId;
        // Try multiple possible fields for Google Drive file ID
        const backendFileId = (metadata as any).googleDriveFileId || metadata.backendFileId;
        const backend = metadata.backend || 'google_drive';
        const pnIdentifier = row.pn_identifier;
        
        // Only check Google Drive files (other backends might not have index files)
        // Backend format is "google_drive::account-..." so check if it starts with "google_drive"
        if (!backend || !backend.startsWith('google_drive')) {
          console.log(`ℹ️ [cleanupOrphanedFilesFromIndex] Skipping non-Google Drive file: ${fileId} (${fileName}) - backend: ${backend}`);
          continue;
        }
        
        // If we couldn't access any index files (service account has no access),
        // we should NOT remove files - we can't verify what's valid
        // This check is already done at the top level, but keep this as a safety check
        if (usersWithIndexFiles.size === 0 && pnIdentifiers.length > 0) {
          // EXTENDED GRACE PERIOD: Don't remove files that were added recently (within last 24 hours)
          // This gives time for files to be properly shared with the service account
          // If service account can't see folders, we can't verify files reliably
          const updatedAt = row.updated_at as Date;
          const now = new Date();
          const ageMinutes = updatedAt ? (now.getTime() - updatedAt.getTime()) / (1000 * 60) : Infinity;
          const EXTENDED_GRACE_PERIOD_HOURS = 24; // 24 hours when service account can't see folders
          
          if (ageMinutes < (EXTENDED_GRACE_PERIOD_HOURS * 60)) {
            console.log(`⏳ [cleanupOrphanedFilesFromIndex] File ${fileId} (${fileName}) was added ${(ageMinutes / 60).toFixed(1)} hours ago - extended grace period active (service account can't see folders), skipping verification`);
            continue;
          }
          
          console.log(`⚠️ [cleanupOrphanedFilesFromIndex] No pN folders found - service account may not have access. Verifying file exists before removing (file is ${(ageMinutes / 60).toFixed(1)} hours old): ${fileId} (${fileName})`);
          console.log(`🔍 [cleanupOrphanedFilesFromIndex] Available IDs: fileId=${fileId}, backendFileId=${backendFileId}, metadataFileId=${metadataFileId}, googleDriveFileId=${(metadata as any).googleDriveFileId}`);
          
          // If we don't have a backendFileId, we can't verify the file exists in Google Drive
          // In this case, don't remove it - it might be a valid file that just doesn't have the ID set
          if (!backendFileId) {
            console.log(`⚠️ [cleanupOrphanedFilesFromIndex] No backendFileId available - cannot verify file exists. Keeping in database: ${fileId} (${fileName})`);
            continue;
          }
          
          // Verify file exists in Google Drive - if it doesn't exist, remove it
          // Use backendFileId (actual Google Drive file ID)
          // NOTE: 404 might mean file doesn't exist OR service account doesn't have access
          // So we only remove if file is old (past grace period) AND returns 404
          const fileToVerify = backendFileId;
          console.log(`🔍 [cleanupOrphanedFilesFromIndex] Verifying Google Drive file: ${fileToVerify}`);
          try {
            const verifyResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileToVerify}?fields=id,trashed`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );
            
            if (verifyResponse.status === 404) {
              // 404 means file doesn't exist in Google Drive - remove it from database
              // Even if service account can't see folders, if we can query the file directly and get 404,
              // it means the file was deleted (service account can still query files by ID if they exist)
              console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} not found (404) - removing from database: ${fileId} (${fileName})`);
                orphanedFileIds.push(fileId);
            } else if (verifyResponse.status === 403 || verifyResponse.status === 401) {
              // Permission denied - service account doesn't have access to this file
              // This could mean the file is private or was deleted and permissions were revoked
              // For now, keep it in database (might be a permission issue)
              console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Permission denied for ${fileToVerify} (${verifyResponse.status}) - keeping in database (might be permission issue): ${fileId} (${fileName})`);
            } else if (!verifyResponse.ok) {
              console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Could not verify file ${fileToVerify} (${verifyResponse.status}) - keeping in database: ${fileId} (${fileName})`);
              // Don't remove if we can't verify (might be permission issue)
            } else {
              const fileData = await verifyResponse.json() as { id?: string; trashed?: boolean };
              if (fileData.trashed) {
                console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} is trashed - removing from database: ${fileId} (${fileName})`);
                orphanedFileIds.push(fileId);
              } else {
                console.log(`✅ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} exists and is not trashed - keeping: ${fileId} (${fileName})`);
              }
            }
          } catch (verifyError) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error verifying file ${fileToVerify} - keeping in database: ${fileId} (${fileName})`, verifyError);
            // Don't remove on error - might be temporary issue
          }
          continue;
        }
        
        // If user doesn't have a public index file, verify file exists before removing
        if (pnIdentifier && !usersWithIndexFiles.has(pnIdentifier)) {
          // GRACE PERIOD: Don't remove files that were just added (within last 10 minutes)
          const updatedAt = row.updated_at as Date;
          const now = new Date();
          const ageMinutes = updatedAt ? (now.getTime() - updatedAt.getTime()) / (1000 * 60) : Infinity;
          const GRACE_PERIOD_MINUTES = 10;
          
          if (ageMinutes < GRACE_PERIOD_MINUTES) {
            console.log(`⏳ [cleanupOrphanedFilesFromIndex] File ${fileId} (${fileName}) was added ${ageMinutes.toFixed(1)} minutes ago - grace period active, skipping verification`);
            continue;
          }
          
          console.log(`⚠️ [cleanupOrphanedFilesFromIndex] User ${pnIdentifier} has no public index file - verifying file exists: ${fileId} (${fileName})`);
          
          // If we don't have a backendFileId, we can't verify the file exists in Google Drive
          // In this case, don't remove it - it might be a valid file that just doesn't have the ID set
          if (!backendFileId) {
            console.log(`⚠️ [cleanupOrphanedFilesFromIndex] No backendFileId available - cannot verify file exists. Keeping in database: ${fileId} (${fileName})`);
            continue;
          }
          
          // Verify file exists in Google Drive - if it doesn't exist, remove it
          // Use backendFileId (actual Google Drive file ID)
          const fileToVerify = backendFileId;
          try {
            const verifyResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileToVerify}?fields=id,trashed`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );
            
            if (verifyResponse.status === 404) {
              console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} not found (404) - removing from database: ${fileId} (${fileName})`);
              orphanedFileIds.push(fileId);
            } else if (!verifyResponse.ok) {
              console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Could not verify file ${fileToVerify} (${verifyResponse.status}) - keeping in database: ${fileId} (${fileName})`);
              // Don't remove if we can't verify (might be permission issue)
            } else {
              const fileData = await verifyResponse.json() as { id?: string; trashed?: boolean };
              if (fileData.trashed) {
                console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} is trashed - removing from database: ${fileId} (${fileName})`);
                orphanedFileIds.push(fileId);
              } else {
                console.log(`✅ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} exists and is not trashed - keeping: ${fileId} (${fileName})`);
              }
            }
          } catch (verifyError) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error verifying file ${fileToVerify} - keeping in database: ${fileId} (${fileName})`, verifyError);
            // Don't remove on error - might be temporary issue
          }
          continue;
        }
        
        // Get valid file IDs for this user
        const userValidFileIds = pnIdentifier ? validFileIdsByUser.get(pnIdentifier) : null;
        
        // If user has no valid files (empty index), verify file exists before removing
        if (pnIdentifier && userValidFileIds && userValidFileIds.size === 0) {
          // GRACE PERIOD: Don't remove files that were just added (within last 10 minutes)
          const updatedAt = row.updated_at as Date;
          const now = new Date();
          const ageMinutes = updatedAt ? (now.getTime() - updatedAt.getTime()) / (1000 * 60) : Infinity;
          const GRACE_PERIOD_MINUTES = 10;
          
          if (ageMinutes < GRACE_PERIOD_MINUTES) {
            console.log(`⏳ [cleanupOrphanedFilesFromIndex] File ${fileId} (${fileName}) was added ${ageMinutes.toFixed(1)} minutes ago - grace period active, skipping verification`);
            continue;
          }
          
          console.log(`⚠️ [cleanupOrphanedFilesFromIndex] User ${pnIdentifier} has empty public index - verifying file exists: ${fileId} (${fileName})`);
          
          // If we don't have a backendFileId, we can't verify the file exists in Google Drive
          // In this case, don't remove it - it might be a valid file that just doesn't have the ID set
          if (!backendFileId) {
            console.log(`⚠️ [cleanupOrphanedFilesFromIndex] No backendFileId available - cannot verify file exists. Keeping in database: ${fileId} (${fileName})`);
            continue;
          }
          
          // Verify file exists in Google Drive - if it doesn't exist, remove it
          // Use backendFileId (actual Google Drive file ID)
          const fileToVerify = backendFileId;
          try {
            const verifyResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileToVerify}?fields=id,trashed`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );
            
            if (verifyResponse.status === 404) {
              console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} not found (404) - removing from database: ${fileId} (${fileName})`);
              orphanedFileIds.push(fileId);
            } else if (!verifyResponse.ok) {
              console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Could not verify file ${fileToVerify} (${verifyResponse.status}) - keeping in database: ${fileId} (${fileName})`);
              // Don't remove if we can't verify (might be permission issue)
            } else {
              const fileData = await verifyResponse.json() as { id?: string; trashed?: boolean };
              if (fileData.trashed) {
                console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} is trashed - removing from database: ${fileId} (${fileName})`);
                orphanedFileIds.push(fileId);
              } else {
                console.log(`✅ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} exists and is not trashed - keeping: ${fileId} (${fileName})`);
              }
            }
          } catch (verifyError) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error verifying file ${fileToVerify} - keeping in database: ${fileId} (${fileName})`, verifyError);
            // Don't remove on error - might be temporary issue
          }
          continue;
        }
        
        // Check if this file ID (or any of its aliases) is in the user's valid set
        const isInIndex = userValidFileIds && (
          userValidFileIds.has(fileId) || 
          (metadataFileId && userValidFileIds.has(metadataFileId)) ||
          (backendFileId && userValidFileIds.has(backendFileId))
        );
        
        if (!isInIndex) {
          // GRACE PERIOD: Don't remove files that were just added (within last 10 minutes)
          const updatedAt = row.updated_at as Date;
          const now = new Date();
          const ageMinutes = updatedAt ? (now.getTime() - updatedAt.getTime()) / (1000 * 60) : Infinity;
          const GRACE_PERIOD_MINUTES = 10;
          
          if (ageMinutes < GRACE_PERIOD_MINUTES) {
            console.log(`⏳ [cleanupOrphanedFilesFromIndex] File ${fileId} (${fileName}) was added ${ageMinutes.toFixed(1)} minutes ago - grace period active, skipping verification`);
            continue;
          }
          
          // File is not in the public index - verify it doesn't exist before removing
          console.log(`⚠️ [cleanupOrphanedFilesFromIndex] File NOT in index - verifying file exists: ${fileId} (${fileName})`);
          
          // If we don't have a backendFileId, we can't verify the file exists in Google Drive
          // In this case, don't remove it - it might be a valid file that just doesn't have the ID set
          if (!backendFileId) {
            console.log(`⚠️ [cleanupOrphanedFilesFromIndex] No backendFileId available - cannot verify file exists. Keeping in database: ${fileId} (${fileName})`);
            continue;
          }
          
          // Verify file exists in Google Drive - if it doesn't exist, remove it
          // Use backendFileId (actual Google Drive file ID)
          const fileToVerify = backendFileId;
          try {
            const verifyResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileToVerify}?fields=id,trashed`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );
            
            if (verifyResponse.status === 404) {
              console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} not found (404) - removing from database: ${fileId} (${fileName})`);
              orphanedFileIds.push(fileId);
            } else if (!verifyResponse.ok) {
              console.log(`⚠️ [cleanupOrphanedFilesFromIndex] Could not verify file ${fileToVerify} (${verifyResponse.status}) - keeping in database: ${fileId} (${fileName})`);
              // Don't remove if we can't verify (might be permission issue or file is private)
            } else {
              const fileData = await verifyResponse.json() as { id?: string; trashed?: boolean };
              if (fileData.trashed) {
                console.log(`🗑️ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} is trashed - removing from database: ${fileId} (${fileName})`);
                orphanedFileIds.push(fileId);
              } else {
                console.log(`✅ [cleanupOrphanedFilesFromIndex] File ${fileToVerify} exists and is not trashed - keeping (might be private): ${fileId} (${fileName})`);
                // File exists but not in public index - might be private, keep it
              }
            }
          } catch (verifyError) {
            console.warn(`⚠️ [cleanupOrphanedFilesFromIndex] Error verifying file ${fileToVerify} - keeping in database: ${fileId} (${fileName})`, verifyError);
            // Don't remove on error - might be temporary issue
          }
        } else {
          console.log(`✅ [cleanupOrphanedFilesFromIndex] File in index: ${fileId} (${fileName}) - keeping`);
        }
      }

      if (orphanedFileIds.length > 0) {
        await db.query(
          `DELETE FROM aggregator_metadata WHERE file_id = ANY($1::text[])`,
          [orphanedFileIds]
        );
        console.log(`🗑️ [cleanupOrphanedFilesFromIndex] Removed ${orphanedFileIds.length} orphaned file(s) from database: ${orphanedFileIds.join(', ')}`);
      } else {
        console.log(`✅ [cleanupOrphanedFilesFromIndex] No orphaned files found - database is clean`);
      }
    } catch (error) {
      console.error('❌ [cleanupOrphanedFilesFromIndex] Failed to cleanup orphaned files:', error);
    }
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
   * Remove orphaned files from database (files that no longer exist in Google Drive)
   * Returns the number of files removed
   */
  async removeOrphanedFiles(validFileIds: Set<string>): Promise<number> {
    const db = getDatabasePool();

    try {
      // Get all file IDs from database (both fileId and backendFileId for Google Drive files)
      const result = await db.query(
        `SELECT file_id, metadata->>'fileId' as file_id_from_metadata, metadata->>'backendFileId' as backend_file_id
         FROM aggregator_metadata 
         WHERE metadata->>'backend' = $1`,
        ['google_drive']
      );

      const orphanedFileIds: string[] = [];
      
      for (const row of result.rows) {
        const dbFileId = row.file_id;
        const metadataFileId = row.file_id_from_metadata;
        const backendFileId = row.backend_file_id;
        
        // Check if any of the IDs (file_id, fileId, or backendFileId) match valid files
        // If none match, this file is orphaned
        const isOrphaned = !validFileIds.has(dbFileId) && 
                           !validFileIds.has(metadataFileId) && 
                           !(backendFileId && validFileIds.has(backendFileId));
        
        if (isOrphaned) {
          orphanedFileIds.push(dbFileId);
        }
      }

      if (orphanedFileIds.length === 0) {
        return 0;
      }

      // Delete orphaned files
      await db.query(
        `DELETE FROM aggregator_metadata WHERE file_id = ANY($1::text[])`,
        [orphanedFileIds]
      );

      console.log(`🗑️ Removed ${orphanedFileIds.length} orphaned file(s): ${orphanedFileIds.slice(0, 5).join(', ')}${orphanedFileIds.length > 5 ? '...' : ''}`);
      return orphanedFileIds.length;
    } catch (error) {
      console.error('❌ Failed to remove orphaned files:', error);
      throw error;
    }
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
      isNSFW?: boolean;
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

      // Apply updates
      const updatedMetadata: PublicMetadata = {
        ...metadata,
        ...(updates.name && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.keywords && { keywords: updates.keywords }),
        // Keep legacy tags for backward compatibility
        ...(updates.tags && { tags: updates.tags, keywords: updates.tags }),
        ...(updates.fileType && { fileType: updates.fileType }),
        ...(updates.textPost && { textPost: updates.textPost }),
        ...(updates.thought && { thought: updates.thought }),
        ...(updates.isNSFW !== undefined && { isNSFW: updates.isNSFW === true }),
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
        ...(updates.inLanguage && { inLanguage: updates.inLanguage })
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

