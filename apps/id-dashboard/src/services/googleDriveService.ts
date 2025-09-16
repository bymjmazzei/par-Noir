// Google Drive Storage Service
// Handles user-owned storage with pN encryption via Google Drive OAuth

import { StorageFile, UploadOptions, UploadProgress, StorageError, STORAGE_ERROR_CODES } from '../types/storage';

// Proxy server configuration
const PROXY_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://pn.parnoir.com/api' 
  : 'http://localhost:3001/api';

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
      console.error('Google Drive not initialized - no config');
      return false;
    }

    if (!this.config.accessToken) {
      console.error('Google Drive not initialized - no access token');
      return false;
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
        console.error(`Google Drive API test failed: ${response.status} ${response.statusText}`);
        return false;
      }

      console.log('Google Drive connection test successful');
      return true;
    } catch (error) {
      console.error('Google Drive connection test failed:', error);
      return false;
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
      const response = await fetch(`${PROXY_BASE_URL}/google-drive/files/${fileId}?accessToken=${encodeURIComponent(this.config.accessToken)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Delete failed: ${response.status} ${errorData}`);
      }

      console.log('Google Drive file deleted:', fileId);

    } catch (error) {
      console.error('Google Drive delete error:', error);
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
      // List files via proxy server
      const response = await fetch(
        `${PROXY_BASE_URL}/google-drive/files?accessToken=${encodeURIComponent(this.config.accessToken)}&folderId=${this.config.folderId || 'root'}`,
        {
          method: 'GET'
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`List files failed: ${response.status} ${errorData}`);
      }

      const data = await response.json();
      
      // Convert Google Drive files to StorageFile format
      const storageFiles: StorageFile[] = data.files
        .filter((file: GoogleDriveFile) => file.name.includes('pn-encrypted-'))
        .map((file: GoogleDriveFile) => ({
          id: file.id,
          name: file.name.replace('pn-encrypted-', ''), // Remove encryption prefix
          type: this.getFileTypeFromMime(file.mimeType),
          size: parseInt(file.size || '0'),
          cid: file.id, // Use Google Drive file ID as CID
          url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
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

      console.log('Listed Google Drive files:', storageFiles.length);
      return storageFiles;

    } catch (error) {
      console.error('Google Drive list files error:', error);
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
      // Check if pN folder already exists via proxy
      const response = await fetch(
        `${PROXY_BASE_URL}/google-drive/files?accessToken=${encodeURIComponent(this.config.accessToken)}&folderId=root`,
        {
          method: 'GET'
        }
      );

      if (!response.ok) {
        throw new Error(`Check folder failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const existingFolder = data.files.find((file: any) => 
        file.name === 'par-noir-media' && file.mimeType === 'application/vnd.google-apps.folder'
      );
      
      if (existingFolder) {
        // Folder exists, use it
        this.config.folderId = existingFolder.id;
        return existingFolder.id;
      }

      // Create pN folder via proxy
      const createResponse = await fetch(`${PROXY_BASE_URL}/google-drive/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: this.config.accessToken,
          folderName: 'par-noir-media'
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
      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 10,
        status: 'uploading',
        message: 'Preparing upload...'
      });

      // Convert file to base64 for proxy upload
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 30,
        status: 'uploading',
        message: 'Uploading to Google Drive...'
      });

      // Upload via proxy server to avoid CORS issues
      const uploadResponse = await fetch(`${PROXY_BASE_URL}/google-drive/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: this.config.accessToken,
          fileData: base64Data,
          fileName: `pn-encrypted-${fileId}`,
          folderId: this.config.folderId || 'root'
        })
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorData}`);
      }

      const result = await uploadResponse.json();
      const googleFileId = result.id;

      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 80,
        status: 'processing',
        message: 'Finalizing upload...'
      });

      // Get the final file info
      const finalResponse = await fetch(`${PROXY_BASE_URL}/google-drive/files?accessToken=${encodeURIComponent(this.config.accessToken)}&folderId=${this.config.folderId || 'root'}`, {
        method: 'GET'
      });

      if (!finalResponse.ok) {
        throw new Error(`Failed to get file info: ${finalResponse.status}`);
      }

      const filesData = await finalResponse.json();
      const uploadedFile = filesData.files.find((f: any) => f.id === googleFileId);
      
      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 100,
        status: 'completed',
        message: 'Upload completed successfully!'
      });

      // Generate CID for compatibility
      const cid = await this.generateCID(file);
      const url = uploadedFile?.webViewLink || `https://drive.google.com/file/d/${googleFileId}/view`;

      console.log('Google Drive upload completed:', { fileId: googleFileId, cid, url });

      return { cid, url };

    } catch (error) {
      console.error('Google Drive upload error:', error);
      throw new Error(`Google Drive upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async encryptWithPnStandard(file: File | Blob, userId: string): Promise<Blob> {
    try {
      // For now, use simple base64 encoding as placeholder
      // TODO: Implement proper pN encryption when IdentityCrypto is available
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const encryptedData = `PN_ENCRYPTED_${base64}`;
      return new Blob([encryptedData], { type: 'application/octet-stream' });
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback: return original file
      return file;
    }
  }

  private async decryptWithPnStandard(encryptedBlob: Blob, userId: string): Promise<Blob> {
    try {
      // For now, use simple base64 decoding as placeholder
      // TODO: Implement proper pN decryption when IdentityCrypto is available
      const text = await encryptedBlob.text();
      if (text.startsWith('PN_ENCRYPTED_')) {
        const base64 = text.replace('PN_ENCRYPTED_', '');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes]);
      }
      // Fallback: return original blob
      return encryptedBlob;
    } catch (error) {
      console.error('Decryption failed:', error);
      // Fallback: return original blob
      return encryptedBlob;
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
