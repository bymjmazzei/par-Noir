/**
 * Google Drive User Files Service
 * Loads user's own files directly from Google Drive by scanning for companion metadata files
 * Shows all files with metadata, including archived (previously public, now private)
 */

import { IndexedFile } from '../types/aggregator';

interface CompanionMetadata {
  fileId: string;
  googleDriveFileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  visibility: 'private' | 'public' | 'friends';
  uploadedAt: string;
  owner: {
    did?: string;
    identifier: string;
  };
  tags?: string[];
  description?: string;
  publicToken?: any;
  thumbnail?: string;
  engagement?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  schema?: any;
  [key: string]: any;
}

/**
 * Load user's files from Google Drive by scanning for companion metadata files
 */
export async function loadUserFilesFromGoogleDrive(
  accessToken: string,
  pnIdentifier: string
): Promise<IndexedFile[]> {
  try {
    console.log('🔍 Loading user files from Google Drive for:', pnIdentifier);

    // Step 1: Find user's pN folder: "par Noir - pn-{identifier}"
    // Ensure pnIdentifier has the pn- prefix (it might already have it)
    const normalizedIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const pnFolderName = `par Noir - ${normalizedIdentifier}`;
    const folderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    const foldersResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!foldersResponse.ok) {
      throw new Error(`Failed to find pN folder: ${foldersResponse.status}`);
    }

    const foldersData = await foldersResponse.json();
    const pnFolder = foldersData.files?.[0];
    
    if (!pnFolder) {
      console.log('📁 No pN folder found');
      return [];
    }

    console.log('✅ Found pN folder:', pnFolder.id);

    // Step 2: Find _metadata folder inside pN folder
    const metadataFolderQuery = `name='_metadata' and '${pnFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    const metadataFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!metadataFolderResponse.ok) {
      throw new Error(`Failed to find metadata folder: ${metadataFolderResponse.status}`);
    }

    const metadataFolderData = await metadataFolderResponse.json();
    const metadataFolder = metadataFolderData.files?.[0];
    
    if (!metadataFolder) {
      console.log('📁 No _metadata folder found');
      return [];
    }

    console.log('✅ Found _metadata folder:', metadataFolder.id);

    // Step 3: Try loading from content class-specific owner indices first (new structure)
    const contentTypes = ['media', 'thoughts', 'collections'];
    const indexedFiles: IndexedFile[] = [];
    let loadedFromContentClassIndices = false;
    
    for (const contentType of contentTypes) {
      // Look for content class folder
      const subfolderQuery = `name='${contentType}' and '${metadataFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const subfolderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id,name)&pageSize=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (subfolderResponse.ok) {
        const subfolderData = await subfolderResponse.json();
        if (subfolderData.files && subfolderData.files.length > 0) {
          const subfolderId = subfolderData.files[0].id;
          
          // Look for owner-file-index.json inside this content class folder
          const indexFileQuery = `name='owner-file-index.json' and '${subfolderId}' in parents and trashed=false`;
          const indexFileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(indexFileQuery)}&fields=files(id)`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );
          
          if (indexFileResponse.ok) {
            const indexFileData = await indexFileResponse.json();
            const indexFiles = indexFileData.files || [];
            
            if (indexFiles.length > 0) {
              loadedFromContentClassIndices = true;
              const indexFileId = indexFiles[0].id;
              console.log(`📄 Found ${contentType}/owner-file-index.json (ID: ${indexFileId})`);
              
              // Download and parse the content class-specific owner index
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
                  
                  if (indexData && Array.isArray(indexData.files)) {
                    // Convert each file entry to IndexedFile format
                    for (const fileEntry of indexData.files) {
                      // Determine contentClass from fileEntry metadata or folder name
                      let determinedContentClass = fileEntry.contentClass;
                      if (!determinedContentClass) {
                        // Check metadata flags
                        if (fileEntry.collection?.collectionFileIds?.length) {
                          determinedContentClass = 'collection';
                        } else if (fileEntry.isThoughtThumbnail || fileEntry.thought || fileEntry.textPost) {
                          determinedContentClass = 'thought';
                        } else {
                          // Use folder name as fallback
                          determinedContentClass = contentType === 'thoughts' ? 'thought' : contentType;
                        }
                      }
                      
                      const publicMetadata: any = {
                        fileId: fileEntry.fileId || fileEntry.googleDriveFileId,
                        name: fileEntry.originalName || fileEntry.fileName,
                        title: fileEntry.originalName || fileEntry.fileName,
                        fileType: getFileTypeFromMime(fileEntry.mimeType),
                        size: fileEntry.size,
                        uploadDate: fileEntry.uploadedAt,
                        isPublic: fileEntry.visibility === 'public',
                        visibility: fileEntry.visibility,
                        isNSFW: fileEntry.isNSFW || false,
                        keywords: fileEntry.tags || [],
                        description: fileEntry.description,
                        backend: 'google_drive',
                        backendFileId: fileEntry.googleDriveFileId,
                        creator: {
                          identifier: {
                            value: fileEntry.owner?.identifier || pnIdentifier
                          }
                        },
                        author: {
                          did: fileEntry.owner?.identifier || pnIdentifier
                        },
                        publicToken: fileEntry.publicToken,
                        thumbnail: fileEntry.thumbnail,
                        engagement: fileEntry.engagement ? {
                          views: fileEntry.engagement.views || 0,
                          likes: fileEntry.engagement.likes || 0,
                          comments: fileEntry.engagement.comments || 0,
                          shares: fileEntry.engagement.shares || 0
                        } : undefined,
                        isArchived: fileEntry.visibility !== 'public',
                        contentClass: determinedContentClass,
                        // Preserve thought metadata flags
                        isThoughtThumbnail: fileEntry.isThoughtThumbnail,
                        thought: fileEntry.thought,
                        textPost: fileEntry.textPost
                      };

                      indexedFiles.push({
                        metadata: publicMetadata,
                        thumbnail: fileEntry.thumbnail
                      });
                    }
                    console.log(`✅ Loaded ${indexData.files.length} ${contentType} file(s) from owner index`);
                  }
                } catch (parseError) {
                  console.error(`❌ Failed to parse ${contentType} owner index:`, parseError);
                }
              }
            }
          }
        }
      }
    }
    
    // Fallback to root owner-file-index.json if content class indices don't exist
    if (!loadedFromContentClassIndices) {
      console.log('📁 No content class-specific owner indices found, trying root owner index');
      const rootIndexQuery = `name='owner-file-index.json' and '${metadataFolder.id}' in parents and trashed=false`;
      const rootIndexResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootIndexQuery)}&fields=files(id)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (rootIndexResponse.ok) {
        const rootIndexData = await rootIndexResponse.json();
        const rootIndexFiles = rootIndexData.files || [];
        
        if (rootIndexFiles.length > 0) {
          const rootIndexFileId = rootIndexFiles[0].id;
          console.log(`📄 Found root owner-file-index.json (ID: ${rootIndexFileId})`);
          
          const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${rootIndexFileId}?alt=media`,
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
              
              if (indexData && Array.isArray(indexData.files)) {
                for (const fileEntry of indexData.files) {
                  // Determine contentClass from fileEntry metadata
                  let determinedContentClass = fileEntry.contentClass;
                  if (!determinedContentClass) {
                    // Check metadata flags
                    if (fileEntry.collection?.collectionFileIds?.length) {
                      determinedContentClass = 'collection';
                    } else if (fileEntry.isThoughtThumbnail || fileEntry.thought || fileEntry.textPost) {
                      determinedContentClass = 'thought';
                    } else {
                      determinedContentClass = 'media';
                    }
                  }
                  
                  const publicMetadata: any = {
                    fileId: fileEntry.fileId || fileEntry.googleDriveFileId,
                    name: fileEntry.originalName || fileEntry.fileName,
                    title: fileEntry.originalName || fileEntry.fileName,
                    fileType: getFileTypeFromMime(fileEntry.mimeType),
                    size: fileEntry.size,
                    uploadDate: fileEntry.uploadedAt,
                    isPublic: fileEntry.visibility === 'public',
                    visibility: fileEntry.visibility,
                    isNSFW: fileEntry.isNSFW || false,
                    keywords: fileEntry.tags || [],
                    description: fileEntry.description,
                    backend: 'google_drive',
                    backendFileId: fileEntry.googleDriveFileId,
                    creator: {
                      identifier: {
                        value: fileEntry.owner?.identifier || pnIdentifier
                      }
                    },
                    author: {
                      did: fileEntry.owner?.identifier || pnIdentifier
                    },
                    publicToken: fileEntry.publicToken,
                    thumbnail: fileEntry.thumbnail,
                    engagement: fileEntry.engagement ? {
                      views: fileEntry.engagement.views || 0,
                      likes: fileEntry.engagement.likes || 0,
                      comments: fileEntry.engagement.comments || 0,
                      shares: fileEntry.engagement.shares || 0
                    } : undefined,
                    isArchived: fileEntry.visibility !== 'public',
                    contentClass: determinedContentClass,
                    // Preserve thought metadata flags
                    isThoughtThumbnail: fileEntry.isThoughtThumbnail,
                    thought: fileEntry.thought,
                    textPost: fileEntry.textPost
                  };

                  indexedFiles.push({
                    metadata: publicMetadata,
                    thumbnail: fileEntry.thumbnail
                  });
                }
                console.log(`✅ Loaded ${indexData.files.length} file(s) from root owner index`);
              }
            } catch (parseError) {
              console.error(`❌ Failed to parse root owner index:`, parseError);
            }
          }
        } else {
          // Final fallback: scan .metadata.json files (old behavior)
          console.log('📁 No owner indices found, falling back to scanning metadata files');
          await loadFromMetadataFiles(accessToken, metadataFolder.id, indexedFiles);
        }
      } else {
        // Final fallback: scan .metadata.json files (old behavior)
        console.log('📁 Failed to load root owner index, falling back to scanning metadata files');
        await loadFromMetadataFiles(accessToken, metadataFolder.id, indexedFiles);
      }
    }

    console.log(`✅ Loaded ${indexedFiles.length} files from Google Drive (${indexedFiles.filter(f => f.metadata.isArchived).length} archived)`);
    return indexedFiles;
  } catch (error) {
    console.error('❌ Failed to load files from Google Drive:', error);
    throw error;
  }
}

/**
 * Fallback: Load files by scanning .metadata.json files (old behavior)
 */
async function loadFromMetadataFiles(
    accessToken: string,
    metadataFolderId: string,
    indexedFiles: IndexedFile[]
  ): Promise<void> {
    const contentTypes = ['media', 'thoughts', 'collections'];
    let allMetadataFiles: any[] = [];
    
    // Try new structure first (subfolders)
    let foundSubfolders = false;
    for (const contentType of contentTypes) {
      const subfolderQuery = `name='${contentType}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const subfolderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id,name)&pageSize=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (subfolderResponse.ok) {
        const subfolderData = await subfolderResponse.json();
        if (subfolderData.files && subfolderData.files.length > 0) {
          foundSubfolders = true;
          const subfolderId = subfolderData.files[0].id;
          
          // List files in this subfolder
          const metadataFilesQuery = `'${subfolderId}' in parents and name contains '.metadata.json' and trashed=false`;
          let nextPageToken: string | undefined;
          
          do {
            let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFilesQuery)}&fields=nextPageToken,files(id,name)&pageSize=1000`;
            if (nextPageToken) {
              url += `&pageToken=${nextPageToken}`;
            }
            
            const metadataFilesResponse = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });

            if (metadataFilesResponse.ok) {
              const metadataFilesData = await metadataFilesResponse.json();
              allMetadataFiles.push(...(metadataFilesData.files || []));
              nextPageToken = metadataFilesData.nextPageToken;
            } else {
              break;
            }
          } while (nextPageToken);
        }
      }
    }

    // Fallback to old structure (flat) if no subfolders found
    if (!foundSubfolders) {
      const metadataFilesQuery = `'${metadataFolderId}' in parents and name contains '.metadata.json' and trashed=false`;
      let nextPageToken: string | undefined;
      
      do {
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFilesQuery)}&fields=nextPageToken,files(id,name)&pageSize=1000`;
        if (nextPageToken) {
          url += `&pageToken=${nextPageToken}`;
        }
        
        const metadataFilesResponse = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!metadataFilesResponse.ok) {
          throw new Error(`Failed to list metadata files: ${metadataFilesResponse.status}`);
        }

        const metadataFilesData = await metadataFilesResponse.json();
        allMetadataFiles.push(...(metadataFilesData.files || []));
        nextPageToken = metadataFilesData.nextPageToken;
      } while (nextPageToken);
    }

    console.log(`📄 Found ${allMetadataFiles.length} metadata files`);

    // Download and parse each metadata file
    for (const metadataFile of allMetadataFiles) {
      try {
        const metadataContentResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${metadataFile.id}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!metadataContentResponse.ok) {
          console.warn(`⚠️ Failed to download metadata file ${metadataFile.id}`);
          continue;
        }

        const metadataContent = await metadataContentResponse.json() as CompanionMetadata;
        
        // Determine contentClass from metadata
        let determinedContentClass = metadataContent.contentClass;
        if (!determinedContentClass) {
          const metadataAny = metadataContent as any;
          // Collection takes precedence
          if (metadataAny.collection?.collectionFileIds?.length) {
            determinedContentClass = 'collection';
          }
          // Thought (including thumbnails) - CRITICAL: isThoughtThumbnail must be checked
          else if (metadataAny.isThoughtThumbnail || metadataAny.thought || metadataAny.textPost) {
            determinedContentClass = 'thought';
          }
          // Default to media for everything else
          else {
            determinedContentClass = 'media';
          }
        }
        
        // Convert CompanionMetadata to PublicMetadata format (IndexedFile)
        const publicMetadata: any = {
          fileId: metadataContent.fileId || metadataContent.googleDriveFileId,
          name: metadataContent.originalName || metadataContent.fileName,
          title: metadataContent.originalName || metadataContent.fileName,
          fileType: getFileTypeFromMime(metadataContent.mimeType),
          size: metadataContent.size,
          uploadDate: metadataContent.uploadedAt,
          isPublic: metadataContent.visibility === 'public',
          visibility: metadataContent.visibility,
          isNSFW: metadataContent.isNSFW || false,
          keywords: metadataContent.tags || [],
          description: metadataContent.description,
          backend: 'google_drive',
          backendFileId: metadataContent.googleDriveFileId,
          creator: {
            identifier: {
              value: metadataContent.owner.identifier
            }
          },
          author: {
            did: metadataContent.owner.identifier
          },
          publicToken: metadataContent.publicToken,
          thumbnail: metadataContent.thumbnail,
          engagement: metadataContent.engagement ? {
            views: metadataContent.engagement.views || 0,
            likes: metadataContent.engagement.likes || 0,
            comments: metadataContent.engagement.comments || 0,
            shares: metadataContent.engagement.shares || 0
          } : undefined,
          // Mark as archived if it has metadata but is not public
          isArchived: metadataContent.visibility !== 'public',
          contentClass: determinedContentClass,
          // Preserve thought metadata flags
          isThoughtThumbnail: (metadataContent as any).isThoughtThumbnail,
          thought: (metadataContent as any).thought,
          textPost: (metadataContent as any).textPost,
          // Include schema.org metadata if available
          ...(metadataContent.schema && { schema: metadataContent.schema })
        };

        indexedFiles.push({
          metadata: publicMetadata,
          thumbnail: metadataContent.thumbnail
        });
      } catch (error) {
        console.warn(`⚠️ Failed to parse metadata file ${metadataFile.id}:`, error);
        continue;
      }
    }
}

/**
 * Helper function to determine file type from MIME type
 * Matches backend logic for consistency
 */
function getFileTypeFromMime(mimeType: string): string {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('text')) return 'text'; // Text MIME types map to 'text' fileType
  return 'other';
}

