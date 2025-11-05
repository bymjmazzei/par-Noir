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
   */
  private async getAccessToken(): Promise<string> {
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

      // Step 1: Find all folders matching "par Noir - pn-*"
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

      if (!foldersResponse.ok) {
        throw new Error(`Failed to search for pN folders: ${foldersResponse.status}`);
      }

      const foldersData = await foldersResponse.json() as { files?: Array<{ id: string; name: string }> };
      const pnFolders = foldersData.files || [];
      
      console.log(`🔍 Found ${pnFolders.length} pN folder(s) to scan`);

      if (pnFolders.length === 0) {
        console.log('ℹ️ No pN folders found');
        return;
      }

      // Step 2: For each pN folder, look for _metadata folder and public-file-index.json
      const allMetadata: { metadata: PublicMetadata; pnIdentifier?: string }[] = [];

      for (const pnFolder of pnFolders) {
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

          if (metadataFolderResponse.ok) {
            const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
            const metadataFolders = metadataFolderData.files || [];

            if (metadataFolders.length > 0) {
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

              if (indexFileResponse.ok) {
                const indexFileData = await indexFileResponse.json() as { files?: Array<{ id: string; name: string }> };
                const indexFiles = indexFileData.files || [];

                if (indexFiles.length > 0) {
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

                  if (downloadResponse.ok) {
                    const indexText = await downloadResponse.text();
                    try {
                      const indexData = JSON.parse(indexText);

                      // public-file-index.json structure: { identifier: string, files: [...], updatedAt: string }
                      if (indexData && Array.isArray(indexData.files)) {
                        // Filter for public files only and transform to PublicMetadata format
                        const publicFiles = indexData.files
                          .filter((file: any) => file.visibility === 'public')
                          .map((file: any) => ({
                            metadata: {
                              fileId: file.fileId,
                              backend: 'google_drive',
                              backendFileId: file.googleDriveFileId || file.fileId,
                              name: file.originalName || file.fileName,
                              title: file.originalName || file.fileName,
                              description: file.description,
                              keywords: file.tags || [],
                              uploadDate: file.uploadedAt,
                              fileType: this.getFileTypeFromMime(file.mimeType),
                              creator: file.owner,
                              isPublic: true,
                              publicToken: file.publicToken,
                              thumbnail: file.thumbnail
                            } as PublicMetadata,
                            pnIdentifier: pnIdentifier || indexData.identifier
                          }));

                        allMetadata.push(...publicFiles);
                        console.log(`✅ Loaded ${publicFiles.length} public file(s) from pN ${pnFolder.name}`);
                      } else {
                        console.warn(`⚠️ Invalid index format in pN ${pnFolder.name}: expected files array`);
                      }
                    } catch (parseError) {
                      console.error(`❌ Failed to parse index from pN ${pnFolder.name}:`, parseError);
                    }
                  } else {
                    console.error(`❌ Failed to download index from pN ${pnFolder.name}: ${downloadResponse.status}`);
                  }
                }
              }
            }
          }
        } catch (pnError) {
          console.warn(`⚠️ Failed to scan pN folder ${pnFolder.name}:`, pnError);
          // Continue scanning other folders
        }
      }

      // Step 5: Bulk upsert all metadata to database
      if (allMetadata.length > 0) {
        await metadataService.bulkUpsertMetadata(allMetadata);
        console.log(`✅ Synced ${allMetadata.length} public file(s) from ${pnFolders.length} pN folder(s)`);
      } else {
        console.log('ℹ️ No public files found to sync');
      }

      // Step 6: Remove orphaned files from database (files that no longer exist in Google Drive)
      // This handles deletions - if a folder/file was deleted from Google Drive, remove it from the database
      // IMPORTANT: Run cleanup even if no files were found (allMetadata is empty)
      // This ensures deleted folders/files are removed from the database
      try {
        const currentFileIds = new Set(allMetadata.map(entry => entry.metadata.fileId));
        console.log(`🔍 Checking for orphaned files. Found ${currentFileIds.size} valid file(s) in Google Drive`);
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

