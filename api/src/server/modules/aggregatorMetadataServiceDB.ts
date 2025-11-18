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
   */
  async removeMetadata(fileId: string): Promise<boolean> {
    const db = getDatabasePool();

    try {
      const result = await db.query(
        'DELETE FROM aggregator_metadata WHERE file_id = $1',
        [fileId]
      );

      const removed = (result.rowCount ?? 0) > 0;
      if (removed) {
        console.log(`🗑️ Removed metadata for file: ${fileId}`);
      }
      return removed;
    } catch (error) {
      console.error(`❌ Failed to remove metadata for file ${fileId}:`, error);
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
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::uuid[]) as feed_ids
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE am.metadata->>'isPublic' = 'true'
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

      // CRITICAL: Validate files actually exist before returning them
      // This automatically removes orphaned entries (files deleted from Google Drive)
      const validatedEntries: CentralIndexEntry[] = [];
      const orphanedFileIds: string[] = [];
      
      // Only validate Google Drive files (batch check for performance)
      const googleDriveEntries = entries.filter(e => (e.metadata.backend || 'google_drive') === 'google_drive');
      const otherEntries = entries.filter(e => (e.metadata.backend || 'google_drive') !== 'google_drive');
      
      if (googleDriveEntries.length > 0) {
        try {
          // Use service account to validate files exist
          const { GoogleDriveSyncService } = await import('./googleDriveSyncService');
          const syncService = GoogleDriveSyncService.getInstance();
          
          // Get access token (will initialize auth if needed)
          let accessToken: string | null = null;
          try {
            accessToken = await syncService.getAccessToken();
          } catch (tokenError) {
            console.warn('⚠️ [getPublicMetadata] Could not get service account token for validation:', tokenError);
          }
          
          if (accessToken) {
            // Batch validate files (check up to 20 at a time to avoid rate limits)
            const batchSize = 20;
            for (let i = 0; i < googleDriveEntries.length; i += batchSize) {
              const batch = googleDriveEntries.slice(i, i + batchSize);
              
              await Promise.all(batch.map(async (entry) => {
                const fileId = entry.metadata.backendFileId || entry.fileId;
                if (!fileId) {
                  orphanedFileIds.push(entry.fileId);
                  return;
                }
                
                try {
                  // Check if file exists in Google Drive
                  const checkUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`;
                  const checkResponse = await fetch(checkUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  if (checkResponse.ok) {
                    // File exists - include it
                    validatedEntries.push(entry);
                  } else if (checkResponse.status === 404) {
                    // File doesn't exist - mark as orphaned
                    console.log(`🗑️ [getPublicMetadata] File ${fileId} not found in Google Drive, marking as orphaned`);
                    orphanedFileIds.push(entry.fileId);
                  } else {
                    // Other error (permission, etc.) - include it (might be a permission issue, not deletion)
                    console.warn(`⚠️ [getPublicMetadata] File ${fileId} check returned ${checkResponse.status}, including anyway`);
                    validatedEntries.push(entry);
                  }
                } catch (checkError) {
                  // Network error - include it (don't remove on transient errors)
                  console.warn(`⚠️ [getPublicMetadata] Error checking file ${fileId}:`, checkError);
                  validatedEntries.push(entry);
                }
              }));
              
              // Small delay between batches to avoid rate limits
              if (i + batchSize < googleDriveEntries.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          } else {
            // No service account - can't validate files exist
            // This is a critical issue - we can't verify files exist, so we should return empty
            // OR we need to trust the database (but database can have orphaned entries)
            console.error('❌ [getPublicMetadata] CRITICAL: Service account not configured - cannot validate files exist!');
            console.error('❌ [getPublicMetadata] Orphaned files WILL appear in feed. Configure GOOGLE_SERVICE_ACCOUNT_KEY.');
            console.error('❌ [getPublicMetadata] For now, returning empty feed to prevent showing deleted files.');
            // Return empty array to prevent showing potentially deleted files
            // User must configure service account OR use cleanup endpoint
            validatedEntries.push(...[]); // Empty - don't show potentially deleted files
          }
        } catch (validationError) {
          console.error('❌ [getPublicMetadata] File validation failed:', validationError);
          // On error, return all entries (don't break the feed)
          validatedEntries.push(...googleDriveEntries);
        }
      }
      
      // Add non-Google Drive entries (no validation needed)
      validatedEntries.push(...otherEntries);
      
      // CRITICAL: Remove orphaned files from database BEFORE returning
      // This ensures deleted files don't appear in the feed
      if (orphanedFileIds.length > 0) {
        console.log(`🗑️ [getPublicMetadata] Removing ${orphanedFileIds.length} orphaned file(s) from database...`);
        try {
          // Remove orphaned files (await to ensure they're removed)
          await Promise.all(orphanedFileIds.map(fileId => 
            this.removeMetadata(fileId).catch(err => {
              console.error(`Failed to remove orphaned file ${fileId}:`, err);
              return null; // Continue with other removals even if one fails
            })
          ));
          console.log(`✅ [getPublicMetadata] Removed ${orphanedFileIds.length} orphaned file(s) from database`);
        } catch (err) {
          console.error('❌ [getPublicMetadata] Error removing orphaned files:', err);
          // Continue anyway - don't break the feed
        }
      }
      
      // Log what we're returning
      console.log(`📤 [getPublicMetadata] Returning ${validatedEntries.length} validated files (${orphanedFileIds.length} orphaned files removed)`);
      
      return validatedEntries;
    } catch (error) {
      console.error('❌ Failed to get public metadata:', error);
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
          COALESCE(ARRAY_AGG(DISTINCT fp.feed_id) FILTER (WHERE fp.feed_id IS NOT NULL), ARRAY[]::uuid[]) as feed_ids
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
   */
  async getIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
    indexerId?: string;
  }): Promise<CentralIndexResponse> {
    const files = await this.getPublicMetadata(filters);
    const stats = await this.getStats();

    return {
      files,
      updatedAt: stats.lastUpdated,
      totalFiles: files.length
    };
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

