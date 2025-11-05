/**
 * Google Drive Metadata Service (Client-Side)
 * Creates companion metadata files and public indexing using Google Drive API directly
 */

export interface CompanionMetadata {
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
  metadata?: any;
}

export interface PublicFileIndex {
  identifier: string;
  files: Array<{
    fileId: string;
    googleDriveFileId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
    visibility: string;
    uploadedAt: string;
    owner: {
      did?: string;
      identifier: string;
    };
    tags?: string[];
    description?: string;
    publicToken?: any;
  }>;
  updatedAt: string;
}

export class GoogleDriveMetadataService {
  private static readonly METADATA_FOLDER_NAME = '_metadata';
  private static readonly PUBLIC_INDEX_FILE_NAME = 'public-file-index.json';
  private static readonly PN_FOLDER_PREFIX = 'par Noir - pn-';

  /**
   * Get or create the pN folder structure
   */
  static async getOrCreatePNFolder(
    accessToken: string,
    pnIdentifier: string
  ): Promise<string> {
    const folderName = `${this.PN_FOLDER_PREFIX}${pnIdentifier}`;
    
    // Search for existing folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error('Failed to search for pN folder');
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Create new folder
    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      }
    );

    if (!createResponse.ok) {
      throw new Error('Failed to create pN folder');
    }

    const folderData = await createResponse.json();
    return folderData.id;
  }

  /**
   * Get or create the _metadata folder
   */
  static async getOrCreateMetadataFolder(
    accessToken: string,
    pnFolderId: string
  ): Promise<string> {
    // Search for existing _metadata folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${this.METADATA_FOLDER_NAME}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error('Failed to search for metadata folder');
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Create new _metadata folder
    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: this.METADATA_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [pnFolderId]
        })
      }
    );

    if (!createResponse.ok) {
      throw new Error('Failed to create metadata folder');
    }

    const folderData = await createResponse.json();
    return folderData.id;
  }

  /**
   * Create or update companion metadata file
   */
  static async createCompanionMetadataFile(
    accessToken: string,
    pnIdentifier: string,
    fileMetadata: CompanionMetadata
  ): Promise<void> {
    try {
      console.log('Creating companion metadata file for:', fileMetadata.googleDriveFileId);
      
      // Get or create folder structure
      console.log('Getting/creating pN folder for:', pnIdentifier);
      const pnFolderId = await this.getOrCreatePNFolder(accessToken, pnIdentifier);
      console.log('pN folder ID:', pnFolderId);
      
      console.log('Getting/creating metadata folder');
      const metadataFolderId = await this.getOrCreateMetadataFolder(accessToken, pnFolderId);
      console.log('Metadata folder ID:', metadataFolderId);

      const metadataFileName = `${fileMetadata.googleDriveFileId}.metadata.json`;
      
      // Check if metadata file already exists
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(metadataFileName)}' and '${metadataFolderId}' in parents and trashed=false&fields=files(id)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for existing metadata file');
      }

      const searchData = await searchResponse.json();
      const metadataContent = JSON.stringify(fileMetadata, null, 2);
      const metadataBlob = new Blob([metadataContent], { type: 'application/json' });

      if (searchData.files && searchData.files.length > 0) {
        // Update existing metadata file
        const fileId = searchData.files[0].id;
        
        // Get current metadata to check if we need to update
        try {
          const getResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          );

          if (getResponse.ok) {
            const existingMetadataText = await getResponse.text();
            try {
              const existingMetadata = JSON.parse(existingMetadataText);
              // Merge with new metadata, preserving existing publicToken if it exists
              if (existingMetadata.publicToken) {
                (fileMetadata as any).publicToken = existingMetadata.publicToken;
              }
            } catch (parseError) {
              console.warn('Failed to parse existing metadata, continuing with new metadata');
            }
          }
        } catch (getError) {
          console.warn('Failed to get existing metadata, continuing with new metadata:', getError);
        }

        // Update the file
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify({
          name: metadataFileName
        })], { type: 'application/json' }));
        formData.append('file', metadataBlob);

        const updateResponse = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to update metadata file');
        }
      } else {
        // Create new metadata file
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify({
          name: metadataFileName,
          parents: [metadataFolderId]
        })], { type: 'application/json' }));
        formData.append('file', metadataBlob);

        const createResponse = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!createResponse.ok) {
          throw new Error('Failed to create metadata file');
        }
      }
    } catch (error) {
      console.error('Error creating companion metadata file:', error);
      throw error;
    }
  }

  /**
   * Get or create public file index
   */
  static async getPublicFileIndex(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier: string
  ): Promise<PublicFileIndex | null> {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${this.PUBLIC_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false&fields=files(id)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      return null;
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.files || searchData.files.length === 0) {
      return null;
    }

    // Download existing index
    const fileId = searchData.files[0].id;
    const getResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!getResponse.ok) {
      return null;
    }

    try {
      return await getResponse.json();
    } catch {
      return {
        identifier: pnIdentifier,
        files: [],
        updatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Update public file index
   */
  static async updatePublicFileIndex(
    accessToken: string,
    pnIdentifier: string,
    fileMetadata: CompanionMetadata
  ): Promise<void> {
    try {
      const pnFolderId = await this.getOrCreatePNFolder(accessToken, pnIdentifier);
      const metadataFolderId = await this.getOrCreateMetadataFolder(accessToken, pnFolderId);

      let index = await this.getPublicFileIndex(accessToken, metadataFolderId, pnIdentifier);
      
      if (!index) {
        index = {
          identifier: pnIdentifier,
          files: [],
          updatedAt: new Date().toISOString()
        };
      }

      // Update or add file entry
      const fileIndex = index.files.findIndex(
        f => f.googleDriveFileId === fileMetadata.googleDriveFileId
      );

      const indexEntry: any = {
        fileId: fileMetadata.fileId,
        googleDriveFileId: fileMetadata.googleDriveFileId,
        fileName: fileMetadata.fileName,
        originalName: fileMetadata.originalName,
        mimeType: fileMetadata.mimeType,
        size: fileMetadata.size,
        visibility: fileMetadata.visibility,
        uploadedAt: fileMetadata.uploadedAt,
        owner: fileMetadata.owner,
        tags: fileMetadata.tags,
        description: fileMetadata.description
      };

      if (fileMetadata.visibility === 'public') {
        if (fileIndex >= 0) {
          // Update existing entry, preserve publicToken if it exists
          if (index.files[fileIndex].publicToken) {
            indexEntry.publicToken = index.files[fileIndex].publicToken;
          }
          index.files[fileIndex] = indexEntry;
        } else {
          index.files.push(indexEntry);
        }
      } else {
        // Remove from index if not public
        if (fileIndex >= 0) {
          index.files.splice(fileIndex, 1);
        }
      }

      index.updatedAt = new Date().toISOString();

      // Save index file
      const indexContent = JSON.stringify(index, null, 2);
      const indexBlob = new Blob([indexContent], { type: 'application/json' });

      // Check if index file exists
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${this.PUBLIC_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false&fields=files(id)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for index file');
      }

      const searchData = await searchResponse.json();
      const formData = new FormData();
      
      if (searchData.files && searchData.files.length > 0) {
        // Update existing index
        const fileId = searchData.files[0].id;
        formData.append('metadata', new Blob([JSON.stringify({
          name: this.PUBLIC_INDEX_FILE_NAME
        })], { type: 'application/json' }));
        formData.append('file', indexBlob);

        const updateResponse = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to update index file');
        }

        // Make index file publicly readable
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
              })
            }
          );
        } catch (permError) {
          // Permission might already exist, ignore
          console.warn('Failed to set public permissions:', permError);
        }
      } else {
        // Create new index
        formData.append('metadata', new Blob([JSON.stringify({
          name: this.PUBLIC_INDEX_FILE_NAME,
          parents: [metadataFolderId]
        })], { type: 'application/json' }));
        formData.append('file', indexBlob);

        const createResponse = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!createResponse.ok) {
          throw new Error('Failed to create index file');
        }

        const fileData = await createResponse.json();
        
        // Make index file publicly readable
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
              })
            }
          );
        } catch (permError) {
          console.warn('Failed to set public permissions:', permError);
        }
      }
    } catch (error) {
      console.error('Error updating public file index:', error);
      throw error;
    }
  }
}
