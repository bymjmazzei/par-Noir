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
  // API key for public file access (read-only, no OAuth needed)
  private static readonly API_KEY = process.env.REACT_APP_GOOGLE_API_KEY || 'AIzaSyBOKyclyG0Uobs0wNCQLSK89XCN2x6NNdk';

  constructor(token?: string) {
    this.token = token || null;
  }

  /**
   * Set Google Drive OAuth token (from licensed aggregator authentication)
   * If no token is provided, will use API key for public file access
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get authorization header - uses token if available, otherwise API key
   */
  private getAuthHeader(): string | null {
    if (this.token) {
      return `Bearer ${this.token}`;
    }
    return null; // Will use API key in URL instead
  }

  /**
   * Scan all pN folders and aggregate public metadata from all of them
   * Returns aggregated metadata from all pNs
   * Uses API key for public file access - no authentication required
   */
  async scanAllPNFolders(): Promise<any[]> {
    // Public aggregator browser uses API key only - no OAuth needed
    // Note: Google Drive API requires OAuth for searching, but we can try with API key
    // If API key doesn't work for searching, files must be truly public and accessible
    const useApiKey = true;
    const authHeader = null; // Public access - no auth header needed
    
    console.log('🔍 Scanning Google Drive for public files using API key...');

    try {
      // Step 1: Find all folders matching "par Noir - pn-*"
      const pnFoldersQuery = `name contains 'par Noir - pn-' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = useApiKey 
        ? `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFoldersQuery)}&fields=files(id,name)&pageSize=100&key=${GoogleDriveScanner.API_KEY}`
        : `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFoldersQuery)}&fields=files(id,name)&pageSize=100`;
      
      const headers: HeadersInit = {
            'Content-Type': 'application/json'
      };
      if (authHeader) {
        headers['Authorization'] = authHeader;
        }
      
      const foldersResponse = await fetch(url, { headers });

      if (!foldersResponse.ok) {
        const errorText = await foldersResponse.text();
        console.error(`❌ Failed to search for pN folders: ${foldersResponse.status} ${foldersResponse.statusText}`);
        console.error('Error response:', errorText);
        
        // Google Drive API requires OAuth for searching - API key alone won't work
        if (foldersResponse.status === 403 || foldersResponse.status === 401) {
          throw new Error('Google Drive API requires OAuth authentication for searching. Files must be accessed through a different method.');
        }
        throw new Error(`Failed to search for pN folders: ${foldersResponse.status}`);
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
          
          const metadataFolderUrl = useApiKey
            ? `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id,name)&key=${GoogleDriveScanner.API_KEY}`
            : `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id,name)`;
          
          const metadataFolderHeaders: HeadersInit = {
                'Content-Type': 'application/json'
          };
          if (authHeader) {
            metadataFolderHeaders['Authorization'] = authHeader;
            }
          
          const metadataFolderResponse = await fetch(metadataFolderUrl, { headers: metadataFolderHeaders });

          if (metadataFolderResponse.ok) {
            const metadataFolderData = await metadataFolderResponse.json();
            const metadataFolders = metadataFolderData.files || [];

            if (metadataFolders.length === 0) {
              console.log(`ℹ️ No _metadata folder found in pN ${pnFolder.name}`);
            }

            if (metadataFolders.length > 0) {
              const metadataFolderId = metadataFolders[0].id;
              console.log(`📁 Found _metadata folder in pN ${pnFolder.name}`);
              
              // Step 3: Try loading from content class-specific indices first (new structure)
              const contentTypes = ['media', 'thoughts', 'collections'];
              let loadedFromContentClassIndices = false;
              
              for (const contentType of contentTypes) {
                // Look for content class folder
                const subfolderQuery = `name='${contentType}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const subfolderUrl = useApiKey
                  ? `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id,name)&key=${GoogleDriveScanner.API_KEY}`
                  : `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id,name)`;
                
                const subfolderHeaders: HeadersInit = {
                      'Content-Type': 'application/json'
                };
                if (authHeader) {
                  subfolderHeaders['Authorization'] = authHeader;
                }
                
                const subfolderResponse = await fetch(subfolderUrl, { headers: subfolderHeaders });
                
                if (subfolderResponse.ok) {
                  const subfolderData = await subfolderResponse.json();
                  const subfolders = subfolderData.files || [];
                  
                  if (subfolders.length > 0) {
                    const subfolderId = subfolders[0].id;
                    
                    // Look for public-file-index.json inside this content class folder
                    const indexFileQuery = `name='public-file-index.json' and '${subfolderId}' in parents and trashed=false`;
                    const indexFileUrl = useApiKey
                      ? `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)&key=${GoogleDriveScanner.API_KEY}`
                      : `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)`;
                    
                    const indexFileResponse = await fetch(indexFileUrl, { headers: subfolderHeaders });
                    
                    if (indexFileResponse.ok) {
                      const indexFileData = await indexFileResponse.json();
                      const indexFiles = indexFileData.files || [];
                      
                      if (indexFiles.length > 0) {
                        loadedFromContentClassIndices = true;
                        const indexFileId = indexFiles[0].id;
                        console.log(`📄 Found ${contentType}/public-file-index.json in pN ${pnFolder.name} (ID: ${indexFileId})`);
                        
                        // Download and parse the content class-specific index
                        const downloadUrl = useApiKey
                          ? `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&key=${GoogleDriveScanner.API_KEY}`
                          : `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`;
                        
                        const downloadHeaders: HeadersInit = {};
                        if (authHeader) {
                          downloadHeaders['Authorization'] = authHeader;
                        }
                        
                        const downloadResponse = await fetch(downloadUrl, { headers: downloadHeaders });
                        
                        if (downloadResponse.ok) {
                          const indexText = await downloadResponse.text();
                          try {
                            const indexData = JSON.parse(indexText);
                            
                            if (indexData && Array.isArray(indexData.files)) {
                              // Filter for public files only
                              const publicFiles = indexData.files.filter((file: any) => file.visibility === 'public');
                              allMetadata.push(...publicFiles);
                              console.log(`✅ Loaded ${publicFiles.length} ${contentType} file(s) from pN ${pnFolder.name}`);
                            }
                          } catch (parseError) {
                            console.error(`❌ Failed to parse ${contentType} index from pN ${pnFolder.name}:`, parseError);
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              // Fallback to root public-file-index.json if content class indices don't exist (backward compatibility)
              if (!loadedFromContentClassIndices) {
                console.log(`ℹ️ No content class-specific indices found, falling back to root index for pN ${pnFolder.name}`);
                const indexFileQuery = `name='public-file-index.json' and '${metadataFolderId}' in parents and trashed=false`;
                
                const indexFileUrl = useApiKey
                  ? `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)&key=${GoogleDriveScanner.API_KEY}`
                  : `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id,name)`;
                
                const indexFileHeaders: HeadersInit = {
                      'Content-Type': 'application/json'
                };
                if (authHeader) {
                  indexFileHeaders['Authorization'] = authHeader;
                }
                
                const indexFileResponse = await fetch(indexFileUrl, { headers: indexFileHeaders });

                if (indexFileResponse.ok) {
                  const indexFileData = await indexFileResponse.json();
                  const indexFiles = indexFileData.files || [];

                  if (indexFiles.length > 0) {
                    const indexFileId = indexFiles[0].id;
                    console.log(`📄 Found root public-file-index.json in pN ${pnFolder.name} (ID: ${indexFileId})`);
                    
                    const downloadUrl = useApiKey
                      ? `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media&key=${GoogleDriveScanner.API_KEY}`
                      : `https://www.googleapis.com/drive/v3/files/${indexFileId}?alt=media`;
                    
                    const downloadHeaders: HeadersInit = {};
                    if (authHeader) {
                      downloadHeaders['Authorization'] = authHeader;
                    }
                    
                    const downloadResponse = await fetch(downloadUrl, { headers: downloadHeaders });

                    if (downloadResponse.ok) {
                      const indexText = await downloadResponse.text();
                      try {
                        const indexData = JSON.parse(indexText);

                        if (indexData && Array.isArray(indexData.files)) {
                          const publicFiles = indexData.files.filter((file: any) => file.visibility === 'public');
                          allMetadata.push(...publicFiles);
                          console.log(`✅ Loaded ${publicFiles.length} public file(s) from root index of pN ${pnFolder.name}`);
                        }
                      } catch (parseError) {
                        console.error(`❌ Failed to parse root index from pN ${pnFolder.name}:`, parseError);
                      }
                    }
                  } else {
                    console.log(`ℹ️ No public-file-index.json found in _metadata folder of pN ${pnFolder.name}`);
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

