/**
 * Google Drive Metadata Service (Client-Side)
 * Creates companion metadata files and public indexing using Google Drive API directly
 */

/**
 * Engagement Metrics (tracked in companion metadata)
 */
export interface EngagementMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  lastUpdated: string;
  engagementHistory?: Array<{
    type: 'like' | 'comment' | 'share' | 'view';
    did?: string; // Optional: who engaged (for analytics, privacy-preserving)
    timestamp: string;
  }>;
}

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
  publicToken?: any; // Share token for public files (ShareToken object)
  thumbnail?: string; // Base64 data URL or URL for thumbnail/preview
  
  // Content Relationships
  inReplyTo?: string; // File ID of parent post/resource
  repostOf?: string; // File ID of original post/resource
  isPartOf?: string; // Curated feed identifier (creator DID)
  
  // Engagement Metrics
  engagement?: EngagementMetrics;
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
    thumbnail?: string; // Base64 data URL or URL for thumbnail/preview
  }>;
  updatedAt: string;
}

export class GoogleDriveMetadataService {
  private static readonly METADATA_FOLDER_NAME = '_metadata';
  private static readonly PUBLIC_INDEX_FILE_NAME = 'public-file-index.json';
  private static readonly OWNER_INDEX_FILE_NAME = 'owner-file-index.json';
  private static readonly PN_FOLDER_PREFIX = 'par Noir - pn-';
  
  /**
   * Standard semantic web contexts
   */
  private static readonly SEMANTIC_CONTEXTS = [
    'https://schema.org/',
    'https://parnoir.com/ns/v1#'
  ];
  
  /**
   * Generate resource URI for a file
   */
  private static generateResourceUri(fileId: string): string {
    return `https://parnoir.com/resource/${fileId}`;
  }
  
  /**
   * Ensure @context is always an array
   */
  private static ensureContextArray(context?: string | string[]): string[] {
    if (!context) {
      return this.SEMANTIC_CONTEXTS;
    }
    if (Array.isArray(context)) {
      return context;
    }
    return [context, ...this.SEMANTIC_CONTEXTS.filter(c => c !== context)];
  }
  
  /**
   * Convert CompanionMetadata to PublicMetadata (semantic web format)
   */
  private static companionToPublicMetadata(
    companion: CompanionMetadata,
    creatorDid?: string
  ): any {
    // Determine schema.org type from mime type
    const mimeCategory = companion.mimeType?.split('/')[0] || 'file';
    const schemaType = 
      mimeCategory === 'image' ? 'ImageObject' :
      mimeCategory === 'video' ? 'VideoObject' :
      mimeCategory === 'audio' ? 'AudioObject' :
      'CreativeWork';
    
    // Generate resource URI
    const resourceUri = this.generateResourceUri(companion.fileId);
    const didUri = creatorDid || companion.owner.did || `did:key:${companion.owner.identifier}`;
    
    // Build public metadata with semantic web structure
    const publicMetadata: any = {
      '@context': this.SEMANTIC_CONTEXTS,
      '@type': schemaType,
      '@id': resourceUri,
      
      // Core identifiers
      fileId: companion.fileId,
      backend: 'google_drive',
      backendFileId: companion.googleDriveFileId,
      
      // Schema.org CreativeWork properties
      name: companion.originalName || companion.fileName,
      description: companion.description || '',
      keywords: companion.tags || [],
      uploadDate: companion.uploadedAt,
      fileType: mimeCategory,
      
      // Creator (schema.org:creator)
      creator: {
        '@type': 'Person',
        '@id': didUri,
        identifier: {
          '@type': 'PropertyValue',
          name: 'DID',
          value: didUri
        }
      },
      
      // Legacy author support (for backward compatibility)
      author: {
        did: didUri
      },
      
      // Media properties
      thumbnail: companion.thumbnail ? {
        '@type': 'ImageObject',
        '@id': `${resourceUri}/thumbnail`
      } : undefined,
      
      // Content relationships
      inReplyTo: companion.inReplyTo ? this.generateResourceUri(companion.inReplyTo) : undefined,
      repostOf: companion.repostOf ? this.generateResourceUri(companion.repostOf) : undefined,
      isPartOf: companion.isPartOf ? `https://parnoir.com/curated/${companion.isPartOf}` : undefined,
      
      // Engagement metrics (always include, initialize if not present)
      engagement: {
        views: companion.engagement?.views || 0,
        likes: companion.engagement?.likes || 0,
        comments: companion.engagement?.comments || 0,
        shares: companion.engagement?.shares || 0,
        lastUpdated: companion.engagement?.lastUpdated || companion.uploadedAt,
        engagementHistory: companion.engagement?.engagementHistory || []
      },
      
      // par Noir specific
      publicToken: companion.publicToken,
      isPublic: companion.visibility === 'public'
    };
    
    // Remove undefined fields
    Object.keys(publicMetadata).forEach(key => {
      if (publicMetadata[key] === undefined) {
        delete publicMetadata[key];
      }
    });
    
    return publicMetadata;
  }
  
  /**
   * Get service account email for sharing folders
   * This allows the API server to scan Google Drive for public files
   */
  private static getServiceAccountEmail(): string | null {
    // Try to get from environment variable (set at build time)
    const serviceAccountKey = import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      try {
        const key = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
        return key.client_email || null;
      } catch {
        // If parsing fails, try direct email env var
        return import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
      }
    }
    // Fallback to direct email env var
    return import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
  }

  /**
   * Share folder with service account (for API server scanning)
   */
  private static async shareFolderWithServiceAccount(
    accessToken: string,
    folderId: string
  ): Promise<void> {
    const serviceAccountEmail = this.getServiceAccountEmail();
    
    if (!serviceAccountEmail) {
      // Service account not configured - this is okay, just skip sharing
      console.log('ℹ️ Service account email not configured - skipping folder sharing');
      return;
    }

    try {
      // Check if permission already exists
      const permissionsResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions?fields=permissions(emailAddress)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json();
        const hasPermission = permissionsData.permissions?.some(
          (p: any) => p.emailAddress === serviceAccountEmail
        );
        
        if (hasPermission) {
          console.log('✅ Folder already shared with service account');
          return;
        }
      }

      // Share folder with service account
      const shareResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'user',
            emailAddress: serviceAccountEmail
          })
        }
      );

      if (shareResponse.ok) {
        console.log(`✅ Shared folder with service account: ${serviceAccountEmail}`);
      } else {
        const errorText = await shareResponse.text();
        console.warn(`⚠️ Failed to share folder with service account: ${shareResponse.status} - ${errorText}`);
        // Don't throw - this is not critical, just log a warning
      }
    } catch (error) {
      console.warn('⚠️ Error sharing folder with service account:', error);
      // Don't throw - this is not critical for the main operation
    }
  }

  /**
   * Get or create the pN folder structure
   */
  static async getOrCreatePNFolder(
    accessToken: string,
    pnIdentifier: string
  ): Promise<string> {
    // Strip 'pn-' prefix if it exists (pnIdentifier might already include it)
    const cleanIdentifier = pnIdentifier.startsWith('pn-') 
      ? pnIdentifier.substring(3) 
      : pnIdentifier;
    const folderName = `${this.PN_FOLDER_PREFIX}${cleanIdentifier}`;
    
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
              const existingMetadata = JSON.parse(existingMetadataText) as CompanionMetadata;
              // Merge with new metadata, preserving existing fields
              if (existingMetadata.publicToken) {
                (fileMetadata as any).publicToken = existingMetadata.publicToken;
              }
              // Preserve engagement metrics if they exist
              if (existingMetadata.engagement) {
                fileMetadata.engagement = existingMetadata.engagement;
              }
              // Preserve relationships if they exist
              if (existingMetadata.inReplyTo) {
                fileMetadata.inReplyTo = existingMetadata.inReplyTo;
              }
              if (existingMetadata.repostOf) {
                fileMetadata.repostOf = existingMetadata.repostOf;
              }
              if (existingMetadata.isPartOf) {
                fileMetadata.isPartOf = existingMetadata.isPartOf;
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
          const errorText = await createResponse.text();
          console.error('Failed to create metadata file. Status:', createResponse.status, 'StatusText:', createResponse.statusText);
          console.error('Error response:', errorText);
          throw new Error(`Failed to create metadata file: ${createResponse.status} ${createResponse.statusText}. ${errorText}`);
        }
        
        console.log('✅ Metadata file created successfully');
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
   * Get owner file index (contains all files owned by the user)
   */
  static async getOwnerFileIndex(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier: string
  ): Promise<PublicFileIndex | null> {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${this.OWNER_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false&fields=files(id)`,
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
   * Update owner file index (includes ALL files, regardless of visibility)
   */
  static async updateOwnerFileIndex(
    accessToken: string,
    pnIdentifier: string,
    fileMetadata: CompanionMetadata
  ): Promise<void> {
    try {
      const pnFolderId = await this.getOrCreatePNFolder(accessToken, pnIdentifier);
      const metadataFolderId = await this.getOrCreateMetadataFolder(accessToken, pnFolderId);

      let index = await this.getOwnerFileIndex(accessToken, metadataFolderId, pnIdentifier);
      
      if (!index) {
        index = {
          identifier: pnIdentifier,
          files: [],
          updatedAt: new Date().toISOString()
        };
      }

      // Convert companion metadata to index entry format (includes thumbnails)
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
        tags: fileMetadata.tags || [],
        description: fileMetadata.description,
        thumbnail: fileMetadata.thumbnail, // Include thumbnail for owner access
        publicToken: fileMetadata.publicToken,
        engagement: fileMetadata.engagement,
        inReplyTo: fileMetadata.inReplyTo,
        repostOf: fileMetadata.repostOf,
        isPartOf: fileMetadata.isPartOf
      };

      // Update or add file entry (all files go in owner index)
      const fileIndex = index.files.findIndex(
        f => f.googleDriveFileId === fileMetadata.googleDriveFileId
      );

      if (fileIndex >= 0) {
        // Update existing entry
        const existingEntry = index.files[fileIndex] as any;
        
        // Preserve publicToken if new one not provided
        if (!indexEntry.publicToken && existingEntry.publicToken) {
          indexEntry.publicToken = existingEntry.publicToken;
        }
        
        // Merge engagement metrics
        if (existingEntry.engagement) {
          indexEntry.engagement = {
            views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
            likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
            comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
            shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
            lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt,
            engagementHistory: [
              ...(existingEntry.engagement.engagementHistory || []),
              ...(indexEntry.engagement?.engagementHistory || [])
            ]
          };
        }
        
        index.files[fileIndex] = indexEntry;
      } else {
        // Add new file to owner index
        index.files.push(indexEntry);
      }

      index.updatedAt = new Date().toISOString();

      // Save owner index file
      const indexContent = JSON.stringify(index, null, 2);
      const indexBlob = new Blob([indexContent], { type: 'application/json' });

      // Check if index file exists
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${this.OWNER_INDEX_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false&fields=files(id)`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for owner index file');
      }

      const searchData = await searchResponse.json();
      const formData = new FormData();
      
      if (searchData.files && searchData.files.length > 0) {
        // Update existing index
        const fileId = searchData.files[0].id;
        formData.append('metadata', new Blob([JSON.stringify({
          name: this.OWNER_INDEX_FILE_NAME
        })], { type: 'application/json' }));
        formData.append('file', indexBlob);

        const updateResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?uploadType=multipart`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!updateResponse.ok) {
          throw new Error('Failed to update owner index file');
        }
      } else {
        // Create new owner index file
        formData.append('metadata', new Blob([JSON.stringify({
          name: this.OWNER_INDEX_FILE_NAME,
          parents: [metadataFolderId]
        })], { type: 'application/json' }));
        formData.append('file', indexBlob);

        const createResponse = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: formData
          }
        );

        if (!createResponse.ok) {
          throw new Error('Failed to create owner index file');
        }
      }

      console.log(`✅ Updated owner file index for ${pnIdentifier}`);
    } catch (error) {
      console.error('Error updating owner file index:', error);
      throw error;
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

      if (fileMetadata.visibility === 'public') {
        // Convert companion metadata to public metadata (semantic web format)
        const publicMetadata = this.companionToPublicMetadata(
          fileMetadata,
          fileMetadata.owner.did
        );
        
        // Create index entry with full semantic metadata
        const indexEntry: any = {
          ...publicMetadata,
          // Keep legacy fields for compatibility with existing index structure
          fileId: fileMetadata.fileId,
          googleDriveFileId: fileMetadata.googleDriveFileId,
          fileName: fileMetadata.fileName,
          originalName: fileMetadata.originalName,
          mimeType: fileMetadata.mimeType,
          size: fileMetadata.size,
          visibility: fileMetadata.visibility,
          uploadedAt: fileMetadata.uploadedAt,
          owner: fileMetadata.owner,
          tags: fileMetadata.tags || [],
          description: fileMetadata.description,
          thumbnail: fileMetadata.thumbnail,
          publicToken: fileMetadata.publicToken
        };

        const isNewPublicFile = fileIndex < 0;
        
        if (fileIndex >= 0) {
          // Update existing entry, preserve fields if new ones not provided
          const existingEntry = index.files[fileIndex] as any;
          
          // Preserve publicToken if new one not provided
          if (!indexEntry.publicToken && existingEntry.publicToken) {
            indexEntry.publicToken = existingEntry.publicToken;
          }
          
          // Merge engagement metrics (preserve existing engagement data)
          if (existingEntry.engagement) {
            // Merge: use existing engagement values, but allow new ones to override if provided
            indexEntry.engagement = {
              views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
              likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
              comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
              shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
              lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt,
              // Preserve engagement history (append new events if any)
              engagementHistory: [
                ...(existingEntry.engagement.engagementHistory || []),
                ...(indexEntry.engagement?.engagementHistory || [])
              ]
            };
          }
          // If no existing engagement, use the new one (already set from companionToPublicMetadata)
          
          index.files[fileIndex] = indexEntry;
        } else {
          // Only add to index if public
          index.files.push(indexEntry);
        }

        // Share folder with service account when file becomes public (first time only)
        if (isNewPublicFile) {
          await this.shareFolderWithServiceAccount(accessToken, pnFolderId);
        }
      } else {
        // Remove from index if not public (should not be in index, but clean up just in case)
        if (fileIndex >= 0) {
          console.log(`Removing file ${fileMetadata.googleDriveFileId} from public index (visibility: ${fileMetadata.visibility})`);
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
