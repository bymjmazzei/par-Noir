/**
 * Aggregator Metadata Service (Database-Backed)
 * Maintains centralized index of all public file metadata from all pNs
 * Uses PostgreSQL for persistent storage
 */

import { getDatabasePool } from '../utils/database';
import { PublicMetadata, CentralIndexEntry, CentralIndexResponse } from './aggregatorMetadataService';

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

    // Ensure isPublic is true
    const validatedMetadata: PublicMetadata = {
      ...metadata,
      isPublic: true, // Always true when submitted to public index
      backend: metadata.backend || 'google_drive',
      backendFileId: metadata.backendFileId || metadata.fileId,
      name: metadata.name || metadata.title || metadata.fileId,
      uploadDate: metadata.uploadDate || new Date().toISOString(),
      fileType: metadata.fileType || 'other'
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
   */
  async getPublicMetadata(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
  }): Promise<CentralIndexEntry[]> {
    const db = getDatabasePool();

    try {
      let query = `
        SELECT file_id, metadata, submitted_at, pn_identifier
        FROM aggregator_metadata
        WHERE metadata->>'isPublic' = 'true'
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Apply filters
      if (filters?.fileType) {
        query += ` AND metadata->>'fileType' = $${paramIndex}`;
        params.push(filters.fileType);
        paramIndex++;
      }

      if (filters?.authorDid) {
        query += ` AND (
          metadata->'creator'->'identifier'->>'value' = $${paramIndex} OR
          metadata->'creator'->>'@id' = $${paramIndex} OR
          metadata->'author'->>'did' = $${paramIndex}
        )`;
        params.push(filters.authorDid);
        paramIndex++;
      }

      query += ` ORDER BY updated_at DESC`;

      const result = await db.query(query, params);
      let entries: CentralIndexEntry[] = result.rows.map(row => ({
        fileId: row.file_id,
        metadata: row.metadata as PublicMetadata,
        submittedAt: row.submitted_at.toISOString(),
        pnIdentifier: row.pn_identifier
      }));

      // Filter by tags (PostgreSQL JSONB array contains is complex, so filter in JS)
      if (filters?.tags && filters.tags.length > 0) {
        entries = entries.filter(entry => {
          const keywords = entry.metadata.keywords || [];
          return keywords.some((tag: string) => filters.tags!.includes(tag));
        });
      }

      return entries;
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
   * Get full index response
   */
  async getIndexResponse(filters?: {
    tags?: string[];
    fileType?: string;
    authorDid?: string;
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
      // Get all file IDs from database
      const result = await db.query(
        'SELECT file_id FROM aggregator_metadata WHERE metadata->>\'backend\' = $1',
        ['google_drive']
      );

      const dbFileIds = result.rows.map(row => row.file_id);
      const orphanedFileIds = dbFileIds.filter(fileId => !validFileIds.has(fileId));

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

