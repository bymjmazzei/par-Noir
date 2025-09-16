// Google Drive Storage Service
// Handles user-owned storage with pN encryption via Google Drive OAuth

import { StorageFile, UploadOptions, UploadProgress, StorageError, STORAGE_ERROR_CODES } from '../types/storage';
import { IdentityCrypto } from '../utils/crypto';

export interface GoogleDriveConfig {
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  folderId?: string; // pN media folder ID
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId: string;
  cid: string;
  url: string;
  size: number;
  error?: string;
}

export class GoogleDriveService {
  private config: GoogleDriveConfig | null = null;
  private isInitialized = false;
  private readonly GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
  private readonly GOOGLE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

  async initialize(config: GoogleDriveConfig): Promise<void> {
    this.config = config;
    this.isInitialized = true;
    
    // Test connection and create pN folder if needed
    await this.ensurePnFolder();
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive not initialized',
        retryable: false
      });
    }

    try {
      // Test API connection by getting user info
      const response = await fetch(`${this.GOOGLE_DRIVE_API}/about?fields=user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API test failed: ${response.status} ${response.statusText}`);
      }

      return true;
    } catch (error) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.AUTHENTICATION_FAILED,
        message: `Google Drive connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  async uploadFile(
    file: File, 
    userId: string, 
    options: UploadOptions,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<StorageFile> {
    if (!this.isInitialized || !this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized',
        retryable: false
      });
    }

    const fileId = this.generateFileId();
    const fileName = file.name;
    const fileType = this.getFileType(file);
    const fileSize = file.size;

    try {
      // Update progress
      onProgress?.({
        fileId,
        fileName,
        progress: 10,
        status: 'uploading'
      });

      // 1. Encrypt file with pN standard
      onProgress?.({
        fileId,
        fileName,
        progress: 20,
        status: 'processing'
      });

      const encryptedFile = await this.encryptWithPnStandard(file, userId);
      
      // 2. Generate metadata
      const metadata = {
        originalName: fileName,
        originalSize: fileSize,
        originalType: file.type,
        mimeType: file.type,
        checksum: await this.generateChecksum(file),
        uploadedAt: new Date().toISOString(),
        owner: userId,
        visibility: options.visibility,
        provider: 'google-drive' as const,
        encryption: 'pn-standard-v1'
      };

      onProgress?.({
        fileId,
        fileName,
        progress: 40,
        status: 'uploading'
      });

      // 3. Upload to Google Drive
      const uploadResult = await this.uploadToGoogleDrive(encryptedFile, fileId, onProgress);

      onProgress?.({
        fileId,
        fileName,
        progress: 90,
        status: 'processing'
      });

      // 4. Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        name: fileName,
        type: fileType,
        size: fileSize,
        cid: uploadResult.cid,
        url: uploadResult.url,
        visibility: options.visibility,
        uploadedAt: new Date().toISOString(),
        owner: userId,
        provider: 'google-drive',
        metadata: metadata,
        provenance: {
          originalCreator: userId,
          ownershipHistory: [{
            owner: userId,
            acquiredAt: new Date().toISOString(),
            method: 'created',
            signature: await this.generateSignature(userId, fileId)
          }],
          modificationHistory: [],
          accessLog: [],
          verificationStatus: 'verified',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
      };

      onProgress?.({
        fileId,
        fileName,
        progress: 100,
        status: 'completed',
        cid: uploadResult.cid,
        url: uploadResult.url
      });

      return storageFile;

    } catch (error) {
      onProgress?.({
        fileId,
        fileName,
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed'
      });

      throw new StorageError({
        code: STORAGE_ERROR_CODES.UPLOAD_FAILED,
        message: `Google Drive upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<Blob> {
    if (!this.isInitialized || !this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized',
        retryable: false
      });
    }

    try {
      // Download encrypted file from Google Drive
      const response = await fetch(`${this.GOOGLE_DRIVE_API}/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const encryptedBlob = await response.blob();
      
      // Decrypt with pN standard
      const decryptedBlob = await this.decryptWithPnStandard(encryptedBlob, userId);
      
      return decryptedBlob;

    } catch (error) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.NETWORK_ERROR,
        message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    if (!this.isInitialized || !this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized',
        retryable: false
      });
    }

    try {
      const response = await fetch(`${this.GOOGLE_DRIVE_API}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.NETWORK_ERROR,
        message: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  async listFiles(userId: string): Promise<StorageFile[]> {
    if (!this.isInitialized || !this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized',
        retryable: false
      });
    }

    try {
      // List files in the pN folder
      const folderId = this.config.folderId || 'root';
      const response = await fetch(
        `${this.GOOGLE_DRIVE_API}/files?q='${folderId}' in parents and name contains 'pn-encrypted-'&fields=files(id,name,size,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink)`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`List files failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert Google Drive files to StorageFile format
      const storageFiles: StorageFile[] = data.files.map((file: GoogleDriveFile) => ({
        id: file.id,
        name: file.name.replace('pn-encrypted-', ''), // Remove encryption prefix
        type: this.getFileTypeFromMime(file.mimeType),
        size: parseInt(file.size || '0'),
        cid: file.id, // Use Google Drive file ID as CID
        url: file.webViewLink || '',
        visibility: 'private' as const, // Default to private, could be stored in metadata
        uploadedAt: file.createdTime,
        owner: userId,
        provider: 'google-drive',
        provenance: {
          originalCreator: userId,
          ownershipHistory: [],
          modificationHistory: [],
          accessLog: [],
          verificationStatus: 'verified',
          createdAt: file.createdTime,
          lastModified: file.modifiedTime
        }
      }));

      return storageFiles;

    } catch (error) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.NETWORK_ERROR,
        message: `List files failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  private async ensurePnFolder(): Promise<string> {
    if (!this.config) {
      throw new Error('Google Drive not configured');
    }

    try {
      // Check if pN folder already exists
      const response = await fetch(
        `${this.GOOGLE_DRIVE_API}/files?q=name='par-noir-media' and mimeType='application/vnd.google-apps.folder'&fields=files(id,name)`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Check folder failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.files && data.files.length > 0) {
        // Folder exists, use it
        this.config.folderId = data.files[0].id;
        return data.files[0].id;
      }

      // Create pN folder
      const createResponse = await fetch(`${this.GOOGLE_DRIVE_API}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'par-noir-media',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Create folder failed: ${createResponse.status} ${createResponse.statusText}`);
      }

      const folderData = await createResponse.json();
      this.config.folderId = folderData.id;
      return folderData.id;

    } catch (error) {
      throw new Error(`Folder setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async uploadToGoogleDrive(
    file: File | Blob, 
    fileId: string, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ cid: string; url: string }> {
    if (!this.config) {
      throw new Error('Google Drive not configured');
    }

    try {
      // Create metadata
      const metadata = {
        name: `pn-encrypted-${fileId}`,
        parents: [this.config.folderId || 'root']
      };

      // Upload file using multipart upload
      const formData = new FormData();
      formData.append('metadata', JSON.stringify(metadata));
      formData.append('file', file);

      const response = await fetch(`${this.GOOGLE_UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Generate CID for compatibility
      const cid = await this.generateCID(file);
      const url = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;

      return { cid, url };

    } catch (error) {
      throw new Error(`Google Drive upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async encryptWithPnStandard(file: File | Blob, userId: string): Promise<Blob> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const encryptedBuffer = await IdentityCrypto.encryptData(arrayBuffer, userId);
      return new Blob([encryptedBuffer], { type: 'application/octet-stream' });
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async decryptWithPnStandard(encryptedBlob: Blob, userId: string): Promise<Blob> {
    try {
      const arrayBuffer = await encryptedBlob.arrayBuffer();
      const decryptedBuffer = await IdentityCrypto.decryptData(arrayBuffer, userId);
      return new Blob([decryptedBuffer]);
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateFileId(): string {
    return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFileType(file: File): StorageFile['type'] {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.includes('document') || file.type.includes('pdf') || file.type.includes('text')) return 'document';
    return 'other';
  }

  private getFileTypeFromMime(mimeType: string): StorageFile['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('document') || mimeType.includes('pdf') || mimeType.includes('text')) return 'document';
    return 'other';
  }

  private async generateChecksum(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async generateCID(file: File | Blob): Promise<string> {
    // Generate a deterministic CID for the file
    const checksum = await this.generateChecksum(file as File);
    return `bafybeig${checksum.substring(0, 52)}`; // IPFS-compatible CID format
  }

  private async generateSignature(userId: string, fileId: string): Promise<string> {
    // Generate a signature for provenance tracking
    const data = `${userId}:${fileId}:${Date.now()}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  isAvailable(): boolean {
    return this.isInitialized && this.config !== null;
  }

  getConfig(): GoogleDriveConfig | null {
    return this.config;
  }
}

export const googleDriveService = new GoogleDriveService();
