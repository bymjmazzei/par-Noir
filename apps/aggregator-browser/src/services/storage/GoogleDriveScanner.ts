/**
 * Google Drive Scanner for Aggregator Browser
 * Scans all pN folders in Google Drive to discover public metadata
 * 
 * FUTURE: Will use par Noir's licensed aggregator OAuth token
 */

export interface PNMetadataIndex {
  pnIdentifier: string;
  folderId: string;
  metadataFileId?: string;
  files: any[];
}

export class GoogleDriveScanner {
  private token: string | null = null;

  constructor(token?: string) {
    this.token = token || null;
  }

  /**
   * Set Google Drive OAuth token (from licensed aggregator authentication)
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Scan all pN folders and aggregate public metadata from all of them
   * Returns aggregated metadata from all pNs
   */
  async scanAllPNFolders(): Promise<any[]> {
    if (!this.token) {
      console.warn('⚠️ No Google Drive token - using localStorage cache');
      return [];
    }

    try {
      // Step 1: Find all folders matching "par Noir - pn-*"
      const pnFoldersQuery = `name contains 'par Noir - pn-' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      
      const foldersResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFoldersQuery)}&fields=files(id,name)&pageSize=100`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!foldersResponse.ok) {
        throw new Error('Failed to search for pN folders');
      }

      const foldersData = await foldersResponse.json();
      const pnFolders = foldersData.files || [];
      
      console.log(`🔍 Found ${pnFolders.length} pN folder(s) to scan`);

      if (pnFolders.length === 0) {
        return [];
      }

      // Step 2: For each pN folder, look for _metadata folder inside it
      const allMetadata: any[] = [];

      for (const pnFolder of pnFolders) {
        try {
          // Search for _metadata folder inside this pN folder
          const metadataFolderQuery = `name='_metadata' and '${pnFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          
          const metadataFolderResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id,name)`,
            {
              headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (metadataFolderResponse.ok) {
            const metadataFolderData = await metadataFolderResponse.json();
            const metadataFolders = metadataFolderData.files || [];

            if (metadataFolders.length > 0) {
              const metadataFolderId = metadataFolders[0].id;
              
              // Step 3: Look for public-file-index.json inside the _metadata folder
              const indexFileQuery = `name='public-file-index.json' and '${metadataFolderId}' in parents and trashed=false`;
              
              const indexFileResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)`,
                {
                  headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (indexFileResponse.ok) {
                const indexFileData = await indexFileResponse.json();
                const indexFiles = indexFileData.files || [];

                if (indexFiles.length > 0) {
                  const indexFileId = indexFiles[0].id;
                  
                  // Step 4: Download and parse the metadata index
                  const downloadResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`,
                    {
                      headers: {
                        'Authorization': `Bearer ${this.token}`
                      }
                    }
                  );

                  if (downloadResponse.ok) {
                    const indexText = await downloadResponse.text();
                    const indexData = JSON.parse(indexText);

                    if (Array.isArray(indexData.files)) {
                      // Add all public files from this pN's metadata
                      allMetadata.push(...indexData.files);
                      console.log(`✅ Loaded ${indexData.files.length} public file(s) from pN ${pnFolder.name}`);
                    }
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

      console.log(`✅ Aggregated ${allMetadata.length} total public file(s) from ${pnFolders.length} pN folder(s)`);
      return allMetadata;
    } catch (error) {
      console.error('Failed to scan Google Drive for pN folders:', error);
      return [];
    }
  }
}

