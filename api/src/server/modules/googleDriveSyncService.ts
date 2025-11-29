/**
 * Google Drive Sync Service
 * Periodically scans Google Drive for public-file-index.json files
 * and syncs them to the database
 */

import { GoogleAuth } from 'google-auth-library';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { PublicMetadata } from './aggregatorMetadataService';

export class GoogleDriveSyncService {
  private static instance: GoogleDriveSyncService;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private auth: GoogleAuth | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): GoogleDriveSyncService {
    if (!GoogleDriveSyncService.instance) {
      GoogleDriveSyncService.instance = new GoogleDriveSyncService();
    }
    return GoogleDriveSyncService.instance;
  }

  /**
   * Initialize Google Auth with service account
   */
  private async initializeAuth(): Promise<void> {
    if (this.auth) {
      return; // Already initialized
    }

    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT_KEY not set - Google Drive sync will be disabled');
      return;
    }

    try {
      const credentials = JSON.parse(serviceAccountKey);
      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });
      console.log('✅ Google Drive service account authenticated');
    } catch (error) {
      console.error('❌ Failed to initialize Google Auth:', error);
      throw error;
    }
  }

  /**
   * Get access token for Google Drive API
   * Made public so it can be used by other services for validation
   */
  async getAccessToken(): Promise<string> {
    if (!this.auth) {
      await this.initializeAuth();
    }

    if (!this.auth) {
      throw new Error('Google Auth not initialized');
    }

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }

    return accessToken.token;
  }

  /**
   * Scan Google Drive for all pN folders and aggregate public metadata
   */
  async syncFromGoogleDrive(): Promise<void> {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    console.log('🔄 Starting Google Drive sync...');

    try {
      // Check if service account is configured
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        console.log('ℹ️ Google Drive sync skipped - service account not configured');
        return;
      }

      const accessToken = await this.getAccessToken();
      const metadataService = AggregatorMetadataServiceDB.getInstance();

      // Step 1: Try to find folders by scanning, but also use pN identifiers from database as fallback
      // This allows us to sync known users even if service account can't discover new folders
      // CRITICAL: Get pn identifiers from storage_credentials table (where credentials are stored)
      // These are the actual pn identifiers (pn-{hash}) used by users
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();
      const pnIdentifiersResult = await db.query(
        `SELECT DISTINCT identity_id FROM storage_credentials WHERE identity_id LIKE 'pn-%'`
      );
      const knownPnIdentifiers = pnIdentifiersResult.rows.map((row: { identity_id: string }) => row.identity_id as string).filter(Boolean);
      console.log(`🔍 Found ${knownPnIdentifiers.length} known pN identifier(s) in database (from storage_credentials)`);
      
      // Try to find folders by scanning (for discovering new users)
      const pnFoldersQuery = `name contains 'par Noir - pn-' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const foldersResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFoldersQuery)}&fields=files(id,name)&pageSize=100`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let pnFolders: Array<{ id: string; name: string }> = [];
      if (foldersResponse.ok) {
        const foldersData = await foldersResponse.json() as { files?: Array<{ id: string; name: string }> };
        pnFolders = foldersData.files || [];
        console.log(`🔍 Found ${pnFolders.length} pN folder(s) by scanning Google Drive`);
      } else {
        console.warn(`⚠️ Failed to search for pN folders: ${foldersResponse.status} - will try using known pN identifiers from database`);
      }
      
      // If we found folders by scanning, use those. Otherwise, try to access folders using known pN identifiers
      if (pnFolders.length === 0 && knownPnIdentifiers.length > 0) {
        console.log(`🔍 No folders found by scanning - trying to access folders using ${knownPnIdentifiers.length} known pN identifier(s) from database`);
        for (const pnIdentifier of knownPnIdentifiers) {
          // CRITICAL: pnIdentifier from storage_credentials already includes 'pn-' prefix
          // Folder name format: "par Noir - pn-{hash}"
          const folderName = `par Noir - ${pnIdentifier}`;
          const folderQuery = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&pageSize=1`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
            if (folderData.files && folderData.files.length > 0) {
              pnFolders.push(folderData.files[0]);
              console.log(`✅ Found folder for known pN identifier: ${pnIdentifier}`);
            }
          }
        }
      }
      
      console.log(`🔍 Total pN folder(s) to scan: ${pnFolders.length}`);

      // If no folders found, we still need to run cleanup to remove orphaned files
      // (in case folders were deleted from Google Drive)

      // Step 2: For each pN folder, look for _metadata folder and public-file-index.json
      const allMetadata: { metadata: PublicMetadata; pnIdentifier?: string }[] = [];
      let hasErrors = false;
      let successfullyScannedFolders = 0;

      for (const pnFolder of pnFolders) {
        let folderScannedSuccessfully = false;
        try {
          // Extract pnIdentifier from folder name (e.g., "par Noir - pn-83c1db813607" -> "83c1db813607")
          const pnIdentifierMatch = pnFolder.name.match(/pn-([a-zA-Z0-9]+)/);
          const pnIdentifier = pnIdentifierMatch ? pnIdentifierMatch[1] : undefined;

          // Search for _metadata folder inside this pN folder
          const metadataFolderQuery = `name='_metadata' and '${pnFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          
          const metadataFolderResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id,name)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!metadataFolderResponse.ok) {
            console.warn(`⚠️ Failed to find _metadata folder for pN ${pnFolder.name}: ${metadataFolderResponse.status}`);
            hasErrors = true;
            continue;
          }

          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          const metadataFolders = metadataFolderData.files || [];

          if (metadataFolders.length === 0) {
            // No _metadata folder - this is normal, just skip
            continue;
          }

          const metadataFolderId = metadataFolders[0].id;
          
          // Step 3: Look for public-file-index.json inside the _metadata folder
          const indexFileQuery = `name='public-file-index.json' and '${metadataFolderId}' in parents and trashed=false`;
          
          const indexFileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!indexFileResponse.ok) {
            console.warn(`⚠️ Failed to find public-file-index.json for pN ${pnFolder.name}: ${indexFileResponse.status}`);
            hasErrors = true;
            continue;
          }

          const indexFileData = await indexFileResponse.json() as { files?: Array<{ id: string; name: string }> };
          const indexFiles = indexFileData.files || [];

          if (indexFiles.length === 0) {
            // No public-file-index.json - this is normal if no public files, just skip
            continue;
          }

          const indexFileId = indexFiles[0].id;
          
          // Step 4: Download and parse the metadata index
          const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );

          if (!downloadResponse.ok) {
            console.error(`❌ Failed to download index from pN ${pnFolder.name}: ${downloadResponse.status}`);
            hasErrors = true;
            continue;
          }

          const indexText = await downloadResponse.text();
          try {
            const indexData = JSON.parse(indexText);

            // public-file-index.json structure: { identifier: string, files: [...], updatedAt: string }
            if (indexData && Array.isArray(indexData.files)) {
              // Filter for public files only and transform to PublicMetadata format
              // New metadata structure includes @context, @type, @id, engagement, relationships
              const publicFiles = indexData.files
                .filter((file: any) => file.visibility === 'public')
                .map((file: any) => {
                  // If file already has semantic web structure (@context, @type, @id), use it
                  // Otherwise, construct it from legacy fields
                  const hasSemanticStructure = file['@context'] && file['@type'] && file['@id'];
                  
                  if (hasSemanticStructure) {
                    // Use existing semantic metadata structure
                    return {
                      metadata: file as PublicMetadata,
                      pnIdentifier: pnIdentifier || indexData.identifier
                    };
                  } else {
                    // Legacy format - construct semantic metadata
                    const creatorDid = file.owner?.did || file.owner?.identifier;
                    const resourceUri = `https://parnoir.com/resource/${file.fileId}`;
                    const schemaType = this.getFileTypeFromMime(file.mimeType) === 'image' ? 'ImageObject' :
                                      this.getFileTypeFromMime(file.mimeType) === 'video' ? 'VideoObject' :
                                      this.getFileTypeFromMime(file.mimeType) === 'audio' ? 'AudioObject' :
                                      'CreativeWork';
                    
                    return {
                      metadata: {
                        '@context': ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
                        '@type': schemaType,
                        '@id': resourceUri,
                        fileId: file.fileId,
                        backend: 'google_drive',
                        backendFileId: file.googleDriveFileId || file.fileId,
                        name: file.originalName || file.fileName,
                        title: file.originalName || file.fileName, // Legacy support
                        description: file.description,
                        keywords: file.tags || [],
                        tags: file.tags || [], // Legacy support
                        uploadDate: file.uploadedAt,
                        fileType: this.getFileTypeFromMime(file.mimeType),
                        creator: file.owner?.did ? {
                          '@type': 'Person',
                          '@id': file.owner.did,
                          identifier: {
                            '@type': 'PropertyValue',
                            name: 'DID',
                            value: file.owner.did
                          }
                        } : undefined,
                        author: file.owner ? { did: creatorDid } : undefined, // Legacy support
                        isPublic: true,
                        publicToken: file.publicToken,
                        thumbnail: file.thumbnail,
                        // Include engagement metrics if present
                        engagement: file.engagement || {
                          views: 0,
                          likes: 0,
                          comments: 0,
                          shares: 0,
                          lastUpdated: file.uploadedAt
                        },
                        // Include relationships if present
                        inReplyTo: file.inReplyTo,
                        repostOf: file.repostOf,
                        isPartOf: file.isPartOf
                      } as PublicMetadata,
                      pnIdentifier: pnIdentifier || indexData.identifier
                    };
                  }
                });

              allMetadata.push(...publicFiles);
              console.log(`✅ Loaded ${publicFiles.length} public file(s) from pN ${pnFolder.name}`);
              folderScannedSuccessfully = true;
            } else {
              console.warn(`⚠️ Invalid index format in pN ${pnFolder.name}: expected files array`);
              hasErrors = true;
            }
          } catch (parseError) {
            console.error(`❌ Failed to parse index from pN ${pnFolder.name}:`, parseError);
            hasErrors = true;
          }
        } catch (pnError) {
          console.warn(`⚠️ Failed to scan pN folder ${pnFolder.name}:`, pnError);
          hasErrors = true;
        }
        
        if (folderScannedSuccessfully) {
          successfullyScannedFolders++;
        }
      }

      // Step 5: Bulk upsert all metadata to database
      if (allMetadata.length > 0) {
        await metadataService.bulkUpsertMetadata(allMetadata);
        console.log(`✅ Synced ${allMetadata.length} public file(s) from ${pnFolders.length} pN folder(s)`);
      } else {
        if (pnFolders.length === 0) {
          console.log('ℹ️ No pN folders found in Google Drive');
        } else {
          console.log('ℹ️ No public files found in pN folders');
        }
      }

      // Step 6: Remove orphaned files from database (files that no longer exist in Google Drive)
      // CRITICAL: Only run cleanup if we successfully scanned ALL folders without errors
      // If any folder had errors reading its public-file-index.json, we can't trust that files are orphaned
      // Files are properly managed through the API (added on public, removed on private/delete/disconnect)
      // Cleanup should only handle cases where folders/files were manually deleted from Google Drive
      // and we successfully confirmed they're missing
      if (!hasErrors && successfullyScannedFolders > 0) {
        try {
          // CRITICAL: Collect ALL possible file ID variants to match against database
          // Database uses Google Drive file IDs, so we need to collect:
          // - fileId (from index file)
          // - backendFileId (Google Drive file ID)
          // - googleDriveFileId (legacy field, if present)
          const currentFileIds = new Set<string>();
          allMetadata.forEach(entry => {
            const meta = entry.metadata;
            // Add all possible ID fields to ensure we match database entries
            if (meta.fileId) currentFileIds.add(meta.fileId);
            if (meta.backendFileId) currentFileIds.add(meta.backendFileId);
            // Also check for googleDriveFileId in case it's stored separately
            if ((meta as any).googleDriveFileId) currentFileIds.add((meta as any).googleDriveFileId);
          });
          console.log(`🔍 Checking for orphaned files. Found ${currentFileIds.size} valid file ID(s) (including variants) from Google Drive, successfully scanned ${successfullyScannedFolders}/${pnFolders.length} pN folder(s)`);
          const removedCount = await metadataService.removeOrphanedFiles(currentFileIds);
          if (removedCount > 0) {
            console.log(`🗑️ Removed ${removedCount} orphaned file(s) from database (deleted from Google Drive)`);
          } else {
            console.log('✅ No orphaned files to clean up - database is in sync with Google Drive');
          }
        } catch (cleanupError) {
          console.error('❌ Failed to cleanup orphaned files:', cleanupError);
          // Don't fail the sync if cleanup fails, but log it as an error
        }
      } else if (hasErrors) {
        console.warn('⚠️ Skipping cleanup - sync had errors. Files may still exist in Google Drive but failed to read. Cleanup will run on next successful sync.');
      } else {
        console.log('ℹ️ No folders with public files found - skipping cleanup');
      }

    } catch (error) {
      console.error('❌ Google Drive sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Helper to get file type from MIME type
   */
  private getFileTypeFromMime(mimeType?: string): string {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'other';
  }

  /**
   * Start periodic sync (every 10 minutes)
   */
  startPeriodicSync(intervalMinutes: number = 10): void {
    if (this.syncInterval) {
      console.log('⚠️ Sync already started');
      return;
    }

    // Do initial sync immediately
    this.syncFromGoogleDrive().catch(console.error);

    // Then sync periodically
    const intervalMs = intervalMinutes * 60 * 1000;
    this.syncInterval = setInterval(() => {
      this.syncFromGoogleDrive().catch(console.error);
    }, intervalMs);

    console.log(`✅ Started periodic Google Drive sync (every ${intervalMinutes} minutes)`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('✅ Stopped periodic Google Drive sync');
    }
  }
}

