/**
 * Google Drive Metadata Service
 * Manages companion metadata files and public indexing for aggregator discovery
 */

class GoogleDriveMetadataService {
  static METADATA_FOLDER_NAME = '_metadata';
  static PUBLIC_INDEX_FILE_NAME = 'public-file-index.json';
  static PN_FOLDER_PREFIX = 'par Noir - pn-';

  /**
   * Get or create the pN folder structure
   * Structure: par Noir - pn-{identifier}/
   */
  static async getOrCreatePNFolder(drive, pnIdentifier) {
    const folderName = `${this.PN_FOLDER_PREFIX}${pnIdentifier}`;
    
    // Search for existing folder
    const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id,name)'
    });

    if (folderResponse.data.files.length > 0) {
      return folderResponse.data.files[0].id;
    }

    // Create new folder
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    return folder.data.id;
  }

  /**
   * Get or create the _metadata folder inside pN folder
   */
  static async getOrCreateMetadataFolder(drive, pnFolderId) {
    // Search for existing _metadata folder
    const metadataFolderQuery = `name='${this.METADATA_FOLDER_NAME}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folderResponse = await drive.files.list({
      q: metadataFolderQuery,
      fields: 'files(id,name)'
    });

    if (folderResponse.data.files.length > 0) {
      return folderResponse.data.files[0].id;
    }

    // Create new _metadata folder
    const folderMetadata = {
      name: this.METADATA_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [pnFolderId]
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    return folder.data.id;
  }

  /**
   * Create or update companion metadata file for a file
   */
  static async createCompanionMetadataFile(drive, pnIdentifier, fileMetadata) {
    // Get or create folder structure
    const pnFolderId = await this.getOrCreatePNFolder(drive, pnIdentifier);
    const metadataFolderId = await this.getOrCreateMetadataFolder(drive, pnFolderId);

    // Create companion metadata file name
    const metadataFileName = `${fileMetadata.googleDriveFileId}.metadata.json`;

    // Check if metadata file already exists
    const existingFileQuery = `name='${metadataFileName}' and '${metadataFolderId}' in parents and trashed=false`;
    const existingResponse = await drive.files.list({
      q: existingFileQuery,
      fields: 'files(id)'
    });

    const metadataContent = JSON.stringify(fileMetadata, null, 2);
    const metadataBlob = Buffer.from(metadataContent, 'utf-8');

    if (existingResponse.data.files.length > 0) {
      // Update existing metadata file
      const fileId = existingResponse.data.files[0].id;
      
      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: 'application/json',
          body: metadataBlob
        },
        fields: 'id'
      });

      return fileId;
    } else {
      // Create new metadata file
      const fileMetadata_resource = {
        name: metadataFileName,
        mimeType: 'application/json',
        parents: [metadataFolderId]
      };

      const file = await drive.files.create({
        resource: fileMetadata_resource,
        media: {
          mimeType: 'application/json',
          body: metadataBlob
        },
        fields: 'id'
      });

      return file.data.id;
    }
  }

  /**
   * Get the public file index
   */
  static async getPublicFileIndex(drive, metadataFolderId, pnIdentifier) {
    // Search for public-file-index.json
    const indexFileQuery = `name='${this.PUBLIC_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
    const indexFileResponse = await drive.files.list({
      q: indexFileQuery,
      fields: 'files(id)'
    });

    if (indexFileResponse.data.files.length === 0) {
      // Create initial index
      return {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        pnIdentifier,
        files: []
      };
    }

    const indexFileId = indexFileResponse.data.files[0].id;
    
    // Download and parse index
    const downloadResponse = await drive.files.get(
      { fileId: indexFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      let data = '';
      downloadResponse.data.on('data', (chunk) => {
        data += chunk.toString();
      });
      downloadResponse.data.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          // If parse fails, return new index
          resolve({
            version: '1.0',
            updatedAt: new Date().toISOString(),
            pnIdentifier,
            files: []
          });
        }
      });
      downloadResponse.data.on('error', reject);
    });
  }

  /**
   * Update the public file index
   */
  static async updatePublicFileIndex(drive, pnIdentifier, fileMetadata) {
    // Get folder structure
    const pnFolderId = await this.getOrCreatePNFolder(drive, pnIdentifier);
    const metadataFolderId = await this.getOrCreateMetadataFolder(drive, pnFolderId);

    // Get current index
    const index = await this.getPublicFileIndex(drive, metadataFolderId, pnIdentifier);
    if (!index) {
      throw new Error('Failed to get public file index');
    }

    // Find existing file in index
    const existingIndex = index.files.findIndex(
      f => f.googleDriveFileId === fileMetadata.googleDriveFileId
    );

    if (fileMetadata.visibility === 'public') {
      // Add or update public file
      if (existingIndex >= 0) {
        index.files[existingIndex] = fileMetadata;
      } else {
        index.files.push(fileMetadata);
      }
    } else {
      // Remove from public index if not public
      if (existingIndex >= 0) {
        index.files.splice(existingIndex, 1);
      }
    }

    // Update timestamp
    index.updatedAt = new Date().toISOString();

    // Save updated index
    const indexContent = JSON.stringify(index, null, 2);
    const indexBlob = Buffer.from(indexContent, 'utf-8');

    // Check if index file exists
    const indexFileQuery = `name='${this.PUBLIC_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
    const indexFileResponse = await drive.files.list({
      q: indexFileQuery,
      fields: 'files(id)'
    });

    if (indexFileResponse.data.files.length > 0) {
      // Update existing index
      const indexFileId = indexFileResponse.data.files[0].id;
      await drive.files.update({
        fileId: indexFileId,
        media: {
          mimeType: 'application/json',
          body: indexBlob
        }
      });

      // Ensure public permissions are set
      try {
        await drive.permissions.create({
          fileId: indexFileId,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
      } catch (permError) {
        // Permission might already exist, ignore
      }
    } else {
      // Create new index
      const indexFileMetadata = {
        name: this.PUBLIC_INDEX_FILE_NAME,
        mimeType: 'application/json',
        parents: [metadataFolderId]
      };

      const file = await drive.files.create({
        resource: indexFileMetadata,
        media: {
          mimeType: 'application/json',
          body: indexBlob
        },
        fields: 'id'
      });

      // Set file permissions to allow public read (for aggregator scanning)
      try {
        await drive.permissions.create({
          fileId: file.data.id,
          requestBody: {
            role: 'reader',
            type: 'anyone'
          }
        });
      } catch (permError) {
        // Permission might already exist or fail, log but don't throw
        console.warn('Failed to set public permissions on index file:', permError.message);
      }
    }
  }

  /**
   * Delete companion metadata file
   */
  static async deleteCompanionMetadataFile(drive, pnIdentifier, googleDriveFileId) {
    const pnFolderId = await this.getOrCreatePNFolder(drive, pnIdentifier);
    const metadataFolderId = await this.getOrCreateMetadataFolder(drive, pnFolderId);

    const metadataFileName = `${googleDriveFileId}.metadata.json`;
    const metadataFileQuery = `name='${metadataFileName}' and '${metadataFolderId}' in parents and trashed=false`;
    const metadataFileResponse = await drive.files.list({
      q: metadataFileQuery,
      fields: 'files(id)'
    });

    if (metadataFileResponse.data.files.length > 0) {
      await drive.files.delete({
        fileId: metadataFileResponse.data.files[0].id
      });
    }

    // Also remove from public index if present
    const index = await this.getPublicFileIndex(drive, metadataFolderId, pnIdentifier);
    if (index) {
      const fileIndex = index.files.findIndex(
        f => f.googleDriveFileId === googleDriveFileId
      );
      if (fileIndex >= 0) {
        index.files.splice(fileIndex, 1);
        index.updatedAt = new Date().toISOString();

        // Update index
        const indexContent = JSON.stringify(index, null, 2);
        const indexBlob = Buffer.from(indexContent, 'utf-8');

        const indexFileQuery = `name='${this.PUBLIC_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
        const indexFileResponse = await drive.files.list({
          q: indexFileQuery,
          fields: 'files(id)'
        });

        if (indexFileResponse.data.files.length > 0) {
          await drive.files.update({
            fileId: indexFileResponse.data.files[0].id,
            media: {
              mimeType: 'application/json',
              body: indexBlob
            }
          });
        }
      }
    }
  }
}

module.exports = { GoogleDriveMetadataService };
