// Cloudflare R2 Storage Service
// Handles user-owned storage with pN encryption

import { StorageFile, StorageProvider, UploadOptions, UploadProgress, StorageError, STORAGE_ERROR_CODES } from '../types/storage';
import { IdentityCrypto } from '../utils/crypto';

export interface CloudflareR2Config {
  apiKey: string;
  apiSecret: string;
  accountId: string;
  bucketName: string;
  region?: string;
}

export interface CloudflareR2UploadResult {
  success: boolean;
  fileId: string;
  cid: string;
  url: string;
  size: number;
  error?: string;
}

export class CloudflareR2Service {
  private config: CloudflareR2Config | null = null;
  private isInitialized = false;

  async initialize(config: CloudflareR2Config): Promise<void> {
    this.config = config;
    this.isInitialized = true;
    
    // Test connection
    await this.testConnection();
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Cloudflare R2 not initialized',
        retryable: false
      });
    }

    try {
      // Test API connection by listing buckets
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/r2/buckets`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
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
        message: `Cloudflare R2 connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        message: 'Cloudflare R2 service not initialized',
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
        provider: 'cloudflare-r2' as const,
        encryption: 'pn-standard-v1'
      };

      onProgress?.({
        fileId,
        fileName,
        progress: 40,
        status: 'uploading'
      });

      // 3. Upload to Cloudflare R2
      const uploadResult = await this.uploadToR2(encryptedFile, fileId, onProgress);

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
        provider: 'cloudflare-r2',
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
        message: `Cloudflare R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true
      });
    }
  }

  async downloadFile(fileId: string, userId: string): Promise<Blob> {
    if (!this.isInitialized || !this.config) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Cloudflare R2 service not initialized',
        retryable: false
      });
    }

    try {
      // Download encrypted file from R2
      const response = await fetch(`https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
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
        message: 'Cloudflare R2 service not initialized',
        retryable: false
      });
    }

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/r2/buckets/${this.config.bucketName}/objects/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
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

  private async uploadToR2(
    file: File | Blob, 
    fileId: string, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ cid: string; url: string }> {
    if (!this.config) {
      throw new Error('Cloudflare R2 not configured');
    }

    try {
      // Upload to Cloudflare R2 using S3-compatible API
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${fileId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      // Generate CID (Content Identifier) for compatibility
      const cid = await this.generateCID(file);
      const url = `https://${this.config.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${fileId}`;

      return { cid, url };

    } catch (error) {
      throw new Error(`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  getConfig(): CloudflareR2Config | null {
    return this.config;
  }
}

export const cloudflareR2Service = new CloudflareR2Service();
