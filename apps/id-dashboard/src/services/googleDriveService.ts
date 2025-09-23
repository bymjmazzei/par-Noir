// Google Drive Service - Fresh Implementation
// Handles OAuth 2.0 authentication and file operations

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  discoveryDocs: string[];
  scopes: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  description?: string;
}

export interface GoogleDriveAuthState {
  isSignedIn: boolean;
  accessToken?: string;
  user?: {
    email: string;
    name: string;
    picture?: string;
  };
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

class GoogleDriveService {
  private gapi: any = null;
  private config: GoogleDriveConfig | null = null;
  private authState: GoogleDriveAuthState = { isSignedIn: false };
  private authListeners: ((state: GoogleDriveAuthState) => void)[] = [];

  constructor() {
    this.loadGoogleAPI();
  }

  /**
   * Initialize the Google Drive service
   */
  async initialize(config: GoogleDriveConfig): Promise<void> {
    this.config = config;
    
    try {
      await this.loadGoogleAPI();
      await this.initializeGAPI();
      this.setupAuthListeners();
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error);
      throw new Error(`Google Drive initialization failed: ${error.message}`);
    }
  }

  /**
   * Load Google API script
   */
  private async loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize GAPI
   */
  private async initializeGAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config) {
        reject(new Error('Configuration not provided'));
        return;
      }

      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: this.config.apiKey,
            clientId: this.config.clientId,
            discoveryDocs: this.config.discoveryDocs,
            scope: this.config.scopes
          });

          this.gapi = window.gapi;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Setup authentication listeners
   */
  private setupAuthListeners(): void {
    if (!this.gapi) return;

    this.gapi.auth2.getAuthInstance().isSignedIn.listen((isSignedIn: boolean) => {
      this.updateAuthState();
    });

    this.gapi.auth2.getAuthInstance().currentUser.listen(() => {
      this.updateAuthState();
    });
  }

  /**
   * Update authentication state
   */
  private updateAuthState(): void {
    if (!this.gapi) return;

    const authInstance = this.gapi.auth2.getAuthInstance();
    const isSignedIn = authInstance.isSignedIn.get();
    const currentUser = authInstance.currentUser.get();

    this.authState = {
      isSignedIn,
      accessToken: isSignedIn ? currentUser.getAuthResponse().access_token : undefined,
      user: isSignedIn ? {
        email: currentUser.getBasicProfile().getEmail(),
        name: currentUser.getBasicProfile().getName(),
        picture: currentUser.getBasicProfile().getImageUrl()
      } : undefined
    };

    this.notifyAuthListeners();
  }

  /**
   * Notify authentication listeners
   */
  private notifyAuthListeners(): void {
    this.authListeners.forEach(listener => listener(this.authState));
  }

  /**
   * Add authentication state listener
   */
  onAuthStateChange(listener: (state: GoogleDriveAuthState) => void): () => void {
    this.authListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.authListeners.indexOf(listener);
      if (index > -1) {
        this.authListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current authentication state
   */
  getAuthState(): GoogleDriveAuthState {
    return { ...this.authState };
  }

  /**
   * Sign in to Google Drive
   */
  async signIn(): Promise<void> {
    if (!this.gapi) {
      throw new Error('Google API not initialized');
    }

    try {
      const authInstance = this.gapi.auth2.getAuthInstance();
      await authInstance.signIn();
    } catch (error) {
      console.error('Sign in failed:', error);
      throw new Error(`Sign in failed: ${error.message}`);
    }
  }

  /**
   * Sign out from Google Drive
   */
  async signOut(): Promise<void> {
    if (!this.gapi) {
      throw new Error('Google API not initialized');
    }

    try {
      const authInstance = this.gapi.auth2.getAuthInstance();
      await authInstance.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  /**
   * List files from Google Drive
   */
  async listFiles(query?: string, pageSize: number = 50): Promise<GoogleDriveFile[]> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await this.gapi.client.drive.files.list({
        pageSize,
        fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, description)',
        q: query || undefined,
        orderBy: 'modifiedTime desc'
      });

      return response.result.files || [];
    } catch (error) {
      console.error('Failed to list files:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Upload file to Google Drive
   */
  async uploadFile(
    file: File, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<GoogleDriveFile> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const metadata = {
        name: file.name,
        parents: ['appDataFolder'] // Store in app-specific folder
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      const progress: UploadProgress = {
        fileId: '',
        fileName: file.name,
        progress: 0,
        status: 'uploading'
      };

      onProgress?.(progress);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authState.accessToken}`
        },
        body: form
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      progress.status = 'completed';
      progress.progress = 100;
      progress.fileId = result.id;
      onProgress?.(progress);

      return {
        id: result.id,
        name: result.name,
        mimeType: result.mimeType,
        size: result.size,
        createdTime: result.createdTime,
        modifiedTime: result.modifiedTime,
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink,
        parents: result.parents,
        description: result.description
      };
    } catch (error) {
      console.error('Upload failed:', error);
      const progress: UploadProgress = {
        fileId: '',
        fileName: file.name,
        progress: 0,
        status: 'error',
        error: error.message
      };
      onProgress?.(progress);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from Google Drive
   */
  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.authState.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Download failed:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  /**
   * Delete file from Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      await this.gapi.client.drive.files.delete({
        fileId: fileId
      });
    } catch (error) {
      console.error('Delete failed:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await this.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, description'
      });

      return response.result;
    } catch (error) {
      console.error('Failed to get file metadata:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Create a folder
   */
  async createFolder(name: string, parentId?: string): Promise<GoogleDriveFile> {
    if (!this.gapi || !this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const metadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : ['appDataFolder']
      };

      const response = await this.gapi.client.drive.files.create({
        resource: metadata,
        fields: 'id, name, mimeType, createdTime, modifiedTime, webViewLink, parents'
      });

      return response.result;
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();

// Default configuration
export const defaultGoogleDriveConfig: GoogleDriveConfig = {
  clientId: process.env.REACT_APP_GOOGLE_DRIVE_CLIENT_ID || '',
  apiKey: process.env.REACT_APP_GOOGLE_API_KEY || '',
  discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  scopes: 'https://www.googleapis.com/auth/drive.file' // Limited scope for better security
};
