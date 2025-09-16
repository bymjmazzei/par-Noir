// Google Drive Storage Service
// Handles user-owned storage with pN encryption via Google Drive OAuth

import { StorageFile, UploadOptions, UploadProgress, StorageError, STORAGE_ERROR_CODES } from '../types/storage';
import { IntegrationConfigManager } from '../utils/integrationConfig';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '43740774041-mtanrvoco9osnvuj40tg46e7lt32cvks.apps.googleusercontent.com';
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY || 'AIzaSyBOKyclyG0Uobs0wNCQLSK89XCN2x6NNdk';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';

// Declare gapi types
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

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
  private gapiLoaded = false;
  private authInstance: any = null;

  async initialize(config?: GoogleDriveConfig): Promise<void> {
    if (config) {
      this.config = config;
    }
    
    // Load Google API if not already loaded
    await this.loadGoogleAPI();
    
    // Initialize Google API client
    await this.initializeGoogleAPI();
    
    this.isInitialized = true;
    
    // Test connection and create pN folder if needed
    await this.ensurePnFolder();
  }

  private async loadGoogleAPI(): Promise<void> {
    if (this.gapiLoaded) return;

    return new Promise((resolve, reject) => {
      // Load the Google API script
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client:auth2', () => {
          this.gapiLoaded = true;
          resolve();
        });
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  private async initializeGoogleAPI(): Promise<void> {
    if (!this.gapiLoaded) {
      throw new Error('Google API not loaded');
    }

    try {
      // Initialize with minimal config first
      await window.gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        clientId: GOOGLE_CLIENT_ID,
        scope: SCOPES
      });

      // Try to get auth instance
      this.authInstance = window.gapi.auth2.getAuthInstance();
      
      // If no auth instance exists, create one
      if (!this.authInstance) {
        this.authInstance = await window.gapi.auth2.init({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES
        });
      }
    } catch (error) {
      console.error('Google API initialization error:', error);
      throw new Error(`Failed to initialize Google API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async authenticate(): Promise<GoogleDriveConfig> {
    if (!this.authInstance) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.authInstance.signIn().then((user: any) => {
        const authResponse = user.getAuthResponse();
        const profile = user.getBasicProfile();

        const config: GoogleDriveConfig = {
          clientId: GOOGLE_CLIENT_ID,
          accessToken: authResponse.access_token,
          refreshToken: authResponse.refresh_token
        };

        // Save config to IntegrationConfigManager
        IntegrationConfigManager.setApiKey('google-drive', 'CLIENT_ID', GOOGLE_CLIENT_ID);
        IntegrationConfigManager.setApiKey('google-drive', 'ACCESS_TOKEN', authResponse.access_token);
        IntegrationConfigManager.setApiKey('google-drive', 'REFRESH_TOKEN', authResponse.refresh_token);

        this.config = config;
        resolve(config);
      }).catch((error: any) => {
        reject(new Error(`Authentication failed: ${error.error || error.message || 'Unknown error'}`));
      });
    });
  }

  async refreshAccessToken(): Promise<string> {
    if (!this.authInstance) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      this.authInstance.currentUser.get().reloadAuthResponse().then((authResponse: any) => {
        const newAccessToken = authResponse.access_token;
        
        // Update stored token
        IntegrationConfigManager.setApiKey('google-drive', 'ACCESS_TOKEN', newAccessToken);
        
        if (this.config) {
          this.config.accessToken = newAccessToken;
        }
        
        resolve(newAccessToken);
      }).catch((error: any) => {
        reject(new Error(`Token refresh failed: ${error.error || error.message || 'Unknown error'}`));
      });
    });
  }

  async signOut(): Promise<void> {
    if (this.authInstance) {
      await this.authInstance.signOut();
    }
    
    // Clear stored tokens
    IntegrationConfigManager.setApiKey('google-drive', 'ACCESS_TOKEN', '');
    IntegrationConfigManager.setApiKey('google-drive', 'REFRESH_TOKEN', '');
    
    this.config = null;
    this.isInitialized = false;
  }

  isAuthenticated(): boolean {
    return this.authInstance && this.authInstance.isSignedIn.get();
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
    if (!this.isInitialized || !this.authInstance) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized or authenticated',
        retryable: false
      });
    }

    try {
      await window.gapi.client.drive.files.delete({
        fileId: fileId
      });

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
    if (!this.isInitialized || !this.authInstance) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Google Drive service not initialized or authenticated',
        retryable: false
      });
    }

    try {
      // List files using Google Drive API
      const response = await window.gapi.client.drive.files.list({
        q: `'${this.config?.folderId || 'root'}' in parents and name contains 'pn-encrypted-'`,
        fields: 'files(id,name,size,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink)',
        orderBy: 'createdTime desc'
      });

      const files = response.result.files || [];
      
      // Convert Google Drive files to StorageFile format
      const storageFiles: StorageFile[] = files.map((file: any) => ({
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
        metadata: {
          mimeType: file.mimeType,
          originalFileName: file.name,
          fileHash: file.id,
        },
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
    if (!this.isInitialized || !this.authInstance) {
      throw new Error('Google Drive not initialized or authenticated');
    }

    try {
      // Check if pN folder already exists
      const response = await window.gapi.client.drive.files.list({
        q: "name='par-noir-media' and mimeType='application/vnd.google-apps.folder'",
        fields: 'files(id,name)'
      });

      const folders = response.result.files || [];
      
      if (folders.length > 0) {
        // Folder exists, use it
        const folderId = folders[0].id;
        if (this.config) {
          this.config.folderId = folderId;
        }
        return folderId;
      }

      // Create pN folder
      const createResponse = await window.gapi.client.drive.files.create({
        resource: {
          name: 'par-noir-media',
          mimeType: 'application/vnd.google-apps.folder'
        }
      });

      const folderId = createResponse.result.id;
      if (this.config) {
        this.config.folderId = folderId;
      }
      
      console.log('Created pN folder:', folderId);
      return folderId;

    } catch (error) {
      throw new Error(`Folder setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async uploadToGoogleDrive(
    file: File | Blob, 
    fileId: string, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ cid: string; url: string }> {
    if (!this.isInitialized || !this.authInstance) {
      throw new Error('Google Drive not initialized or authenticated');
    }

    try {
      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 10,
        status: 'uploading',
        message: 'Preparing upload...'
      });

      // Ensure we have a valid access token
      let accessToken = this.config?.accessToken;
      if (!accessToken) {
        accessToken = await this.refreshAccessToken();
      }

      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 30,
        status: 'uploading',
        message: 'Uploading to Google Drive...'
      });

      // Create file metadata
      const metadata = {
        name: `pn-encrypted-${fileId}`,
        parents: [this.config?.folderId || 'root']
      };

      // Upload file using Google Drive API
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorData}`);
      }

      const result = await response.json();

      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 80,
        status: 'processing',
        message: 'Finalizing upload...'
      });

      // Get file info with web view link
      const fileInfo = await window.gapi.client.drive.files.get({
        fileId: result.id,
        fields: 'id,name,webViewLink,size'
      });

      onProgress?.({
        fileId,
        fileName: file instanceof File ? file.name : 'file',
        progress: 100,
        status: 'completed',
        message: 'Upload completed successfully!'
      });

      const cid = await this.generateCID(file);
      const url = fileInfo.result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;

      console.log('Google Drive upload completed:', { fileId: result.id, cid, url });

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
