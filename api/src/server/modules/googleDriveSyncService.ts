/**
 * Google Drive Sync Service
 * 
 * Syncs from Google Drive (source of truth) → Database (performance cache)
 * 
 * Architecture:
 * - Google Drive (`public-file-index.xlsx`) is the SOURCE OF TRUTH (decentralized, user-owned)
 * - Database is a PERFORMANCE CACHE for fast queries
 * - This service keeps the cache fresh by periodically syncing from Google Drive
 * - Handles cleanup of orphaned files (files in cache but not in Google Drive)
 * 
 * Sync Process:
 * 1. Scans Google Drive for all pN folders
 * 2. Reads `public-file-index.xlsx` from each user's `_metadata` folder
 * 3. Upserts metadata to database (updates existing, inserts new)
 * 4. Cleans up orphaned files (in DB but not in Google Drive)
 * 
 * Can be triggered manually via API or runs periodically (default: every 10 minutes)
 */

import { GoogleAuth } from 'google-auth-library';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { PublicMetadata } from './aggregatorMetadataService';
import { getFileTypeFromMime } from '../utils/fileTypeUtils';

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
   * Verify if a file exists in Google Drive
   * @param accessToken Service account access token
   * @param googleDriveFileId Google Drive file ID to verify
   * @returns true if file exists and is not trashed, false if not found, true if permission denied (assume exists)
   */
  private async verifyFileExists(accessToken: string, googleDriveFileId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${googleDriveFileId}?fields=id,trashed`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 404) {
        // File doesn't exist
        console.log(`🗑️ [verifyFileExists] File ${googleDriveFileId} not found (404)`);
        return false;
      }

      if (response.status === 403 || response.status === 401) {
        // Permission denied - file might be private or service account doesn't have access
        // For now, assume it exists (service account should have access to pN folders)
        console.warn(`⚠️ [verifyFileExists] Permission denied for ${googleDriveFileId} (${response.status}) - assuming exists`);
        return true;
      }

      if (!response.ok) {
        // Other error - assume file exists to avoid false positives
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn(`⚠️ [verifyFileExists] Error ${response.status} for ${googleDriveFileId}: ${errorText.substring(0, 100)} - assuming exists`);
        return true;
      }

      const fileData = await response.json() as { id?: string; trashed?: boolean };
      // File exists and is not trashed
      const exists = !fileData.trashed;
      if (!exists) {
        console.log(`🗑️ [verifyFileExists] File ${googleDriveFileId} is trashed`);
      }
      return exists;
    } catch (error) {
      // On error (network, etc.), assume file exists to avoid false positives
      console.warn(`⚠️ [verifyFileExists] Error verifying ${googleDriveFileId}:`, error instanceof Error ? error.message : error, '- assuming exists');
      return true;
    }
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
          console.log(`🔍 [DEBUG] Searching for folder: "${folderName}" for pN identifier: ${pnIdentifier}`);
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
          
          console.log(`🔍 [DEBUG] Folder search response for ${pnIdentifier}:`, { status: folderResponse.status, statusText: folderResponse.statusText });
          
          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
            console.log(`🔍 [DEBUG] Folder search result for ${pnIdentifier}:`, { filesFound: folderData.files?.length || 0, files: folderData.files });
            if (folderData.files && folderData.files.length > 0) {
              pnFolders.push(folderData.files[0]);
              console.log(`✅ Found folder for known pN identifier: ${pnIdentifier}`);
            } else {
              console.log(`⚠️ [DEBUG] No folder found for ${pnIdentifier} - folder name "${folderName}" not found in Google Drive`);
            }
          } else {
            const errorText = await folderResponse.text().catch(() => 'Unknown error');
            console.error(`❌ [DEBUG] Failed to search for folder "${folderName}" (${pnIdentifier}): ${folderResponse.status} ${folderResponse.statusText}`, errorText);
          }
        }
      }
      
      console.log(`🔍 Total pN folder(s) to scan: ${pnFolders.length}`);

      // If no folders found, we still need to run cleanup to remove orphaned files
      // (in case folders were deleted from Google Drive)

      // Step 2: For each pN folder, look for _metadata folder and public-file-index.xlsx
      const allMetadata: { metadata: PublicMetadata; pnIdentifier?: string }[] = [];
      let hasErrors = false;
      let successfullyScannedFolders = 0;
      // Track users whose index was successfully READ (even if empty) - needed for cleanup
      const successfullyReadIndexUsers = new Set<string>();

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
            // Expected: Some users may not have a _metadata folder yet
            console.warn(`⚠️ [Sync] Could not access _metadata folder for pN ${pnFolder.name} (status: ${metadataFolderResponse.status}) - skipping`);
            continue;
          }

          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          const metadataFolders = metadataFolderData.files || [];

          if (metadataFolders.length === 0) {
            // Expected: No _metadata folder - this is normal for new users, just skip
            continue;
          }

          const metadataFolderId = metadataFolders[0].id;
          
          // Step 3: Look for public-file-index.xlsx (Sheets only)
          const sheetsIndexQuery = `name='public-file-index.xlsx' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
          const sheetsIndexResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sheetsIndexQuery)}&fields=files(id,name)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!sheetsIndexResponse.ok) {
            // Expected: Index file may not exist if user has no public files yet
            console.warn(`⚠️ [Sync] Could not access public-file-index.xlsx for pN ${pnFolder.name} (status: ${sheetsIndexResponse.status}) - skipping`);
            continue;
          }

          const sheetsIndexData = await sheetsIndexResponse.json() as { files?: Array<{ id: string; name: string }> };
          const sheetsIndexFiles = sheetsIndexData.files || [];

          if (sheetsIndexFiles.length === 0) {
            // Expected: No public-file-index.xlsx - this is normal if user has no public files
            // Mark as successfully read (empty index) so cleanup knows this user has no public files
            if (pnIdentifier) {
              successfullyReadIndexUsers.add(pnIdentifier);
              console.log(`ℹ️ [Sync] No public-file-index.xlsx for pN ${pnFolder.name} (empty index - no public files)`);
            }
            continue;
          }

          // Read from Sheets
          let indexData: any = null;
          try {
            const { IndexSheetsService } = await import('./indexSheetsService');
            // Build token object from accessToken
            const token: { access_token: string } = { access_token: accessToken };
            // pnIdentifier is extracted from folder name above
            const { files } = await IndexSheetsService.getFiles(token, sheetsIndexFiles[0].id, pnIdentifier || '', undefined, {
              visibility: 'public'
            });
            indexData = {
              identifier: pnIdentifier,
              files,
              updatedAt: new Date().toISOString()
            };
            // Mark as successfully read (even if files array is empty)
            if (pnIdentifier) {
              successfullyReadIndexUsers.add(pnIdentifier);
            }
          } catch (sheetsError) {
            // Error reading index file - might be permission issue or corrupted file
            console.warn(`⚠️ [Sync] Failed to read public-file-index.xlsx for pN ${pnFolder.name}:`, sheetsError instanceof Error ? sheetsError.message : sheetsError);
            // Don't mark as successfully read - skip cleanup for this user (might be temporary issue)
            continue;
          }

          // Step 4: Process the index data
          try {
            // public-file-index structure: { identifier: string, files: [...], updatedAt: string }
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
                    const fileType = getFileTypeFromMime(file.mimeType);
                    const schemaType = fileType === 'image' ? 'ImageObject' :
                                      fileType === 'video' ? 'VideoObject' :
                                      fileType === 'audio' ? 'AudioObject' :
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
                        fileType: getFileTypeFromMime(file.mimeType),
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
              // Unexpected: Index file exists but has invalid format
              console.warn(`⚠️ [Sync] Invalid index format in pN ${pnFolder.name}: expected files array - skipping`);
              hasErrors = true;
            }
          } catch (parseError) {
            // Error parsing index data - might be corrupted
            console.warn(`⚠️ [Sync] Failed to parse index from pN ${pnFolder.name}:`, parseError instanceof Error ? parseError.message : parseError);
            hasErrors = true;
          }
        } catch (pnError) {
          // Error accessing folder - might be permission issue or temporary outage
          console.warn(`⚠️ [Sync] Failed to scan pN folder ${pnFolder.name}:`, pnError instanceof Error ? pnError.message : pnError);
          // Don't mark as error - might be temporary, skip this user for now
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

      // Step 6: Smart cleanup - remove orphaned files (in DB but not in Google Drive)
      // Reuse db from earlier in the function

      // Track which users we successfully scanned (have metadata in allMetadata)
      const successfullyScannedUsers = new Set(
        allMetadata.map(m => m.pnIdentifier).filter(Boolean)
      );

      // Track which pnIdentifiers we found folders for (even if we couldn't read their index)
      const foldersFound = new Set(
        pnFolders.map(f => {
          const match = f.name.match(/pn-([a-zA-Z0-9]+)/);
          return match ? `pn-${match[1]}` : null;
        }).filter(Boolean) as string[]
      );

      // Get all pnIdentifiers that have files in database
      const allDbUsers = await db.query(
        `SELECT DISTINCT pn_identifier FROM aggregator_media WHERE pn_identifier IS NOT NULL
         UNION SELECT DISTINCT pn_identifier FROM aggregator_thoughts WHERE pn_identifier IS NOT NULL
         UNION SELECT DISTINCT pn_identifier FROM aggregator_collections WHERE pn_identifier IS NOT NULL`
      );
      const dbUsers = new Set(allDbUsers.rows.map((r: any) => r.pn_identifier));
      
      // Use successfullyReadIndexUsers for cleanup - includes users with empty indexes
      console.log(`🔍 [Cleanup] Starting cleanup process...`);
      console.log(`🔍 [Cleanup] Users with successfully read index: ${successfullyReadIndexUsers.size}`);
      console.log(`🔍 [Cleanup] Users with files in allMetadata: ${successfullyScannedUsers.size}`);
      console.log(`🔍 [Cleanup] Total folders found: ${foldersFound.size}`);
      console.log(`🔍 [Cleanup] Total users in database: ${dbUsers.size}`);

      // Case 1: Users whose index exists - keep ALL files
      // SIMPLE: If index exists, all files are valid (no individual file checking needed)
      let case1Users = 0;
      for (const pnIdentifier of successfullyReadIndexUsers) {
        case1Users++;
        // Get count of files for logging
        const dbFiles = await db.query(
          `SELECT COUNT(*) as count FROM aggregator_media WHERE pn_identifier = $1
           UNION ALL SELECT COUNT(*) FROM aggregator_thoughts WHERE pn_identifier = $1
           UNION ALL SELECT COUNT(*) FROM aggregator_collections WHERE pn_identifier = $1`,
          [pnIdentifier]
        );
        const totalFiles = dbFiles.rows.reduce((sum: number, row: any) => sum + parseInt(row.count || '0', 10), 0);
        console.log(`✅ [Cleanup] User ${pnIdentifier}: Index exists - keeping all ${totalFiles} file(s)`);
      }

      // Case 2: Users whose index doesn't exist - remove ALL files
      // SIMPLE: If index doesn't exist, user deleted their folder - remove all files
      let case2Processed = 0;
      let case2Removed = 0;
      for (const pnIdentifier of dbUsers) {
        if (successfullyReadIndexUsers.has(pnIdentifier)) {
          continue; // Already handled in Case 1 (index exists)
        }
        
        // Index doesn't exist - user's folder was deleted - remove all files
        case2Processed++;
        console.log(`🗑️ [Cleanup] User ${pnIdentifier}: Index not found - removing all files (folder deleted)`);
        const removed = await metadataService.removeAllMetadataForUser(pnIdentifier);
        if (removed > 0) {
          case2Removed += removed;
          console.log(`✅ [Cleanup] Removed ${removed} file(s) for ${pnIdentifier} (index/folder deleted)`);
        }
      }
      
      console.log(`✅ [Cleanup] Complete - Case 1: ${case1Users} users (indexes exist, kept all files), Case 2: ${case2Processed} users processed (${case2Removed} files removed)`);

    } catch (error) {
      console.error('❌ Google Drive sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
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

