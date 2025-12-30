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
    const pnFolderName = `par Noir - pn-${pnIdentifier}`;
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

    // Step 3: List all .metadata.json files in the _metadata folder
    const metadataFilesQuery = `'${metadataFolder.id}' in parents and name contains '.metadata.json' and trashed=false`;
    
    let allMetadataFiles: any[] = [];
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

    console.log(`📄 Found ${allMetadataFiles.length} metadata files`);

    // Step 4: Download and parse each metadata file
    const indexedFiles: IndexedFile[] = [];
    
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

    console.log(`✅ Loaded ${indexedFiles.length} files from Google Drive (${indexedFiles.filter(f => f.metadata.isArchived).length} archived)`);
    return indexedFiles;
  } catch (error) {
    console.error('❌ Failed to load files from Google Drive:', error);
    throw error;
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

