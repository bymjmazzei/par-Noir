// Google Drive Demo Service
// Provides mock functionality for demonstration purposes
// This service simulates Google Drive API responses and interactions

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

// Mock demo data
const DEMO_FILES: GoogleDriveFile[] = [
  {
    id: 'demo_file_1',
    name: 'Identity Verification Document.pdf',
    mimeType: 'application/pdf',
    size: '2048576', // 2MB
    createdTime: '2024-01-15T10:30:00.000Z',
    modifiedTime: '2024-01-15T10:30:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo_file_1/view',
    description: 'Personal identity verification document for par Noir account'
  },
  {
    id: 'demo_file_2',
    name: 'Digital Certificate.crt',
    mimeType: 'application/x-x509-ca-cert',
    size: '1024',
    createdTime: '2024-01-14T14:22:00.000Z',
    modifiedTime: '2024-01-14T14:22:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo_file_2/view',
    description: 'Digital certificate for secure authentication'
  },
  {
    id: 'demo_file_3',
    name: 'Backup Keys.txt',
    mimeType: 'text/plain',
    size: '512',
    createdTime: '2024-01-13T09:15:00.000Z',
    modifiedTime: '2024-01-13T09:15:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo_file_3/view',
    description: 'Encrypted backup recovery keys'
  },
  {
    id: 'demo_folder_1',
    name: 'par Noir Documents',
    mimeType: 'application/vnd.google-apps.folder',
    size: undefined,
    createdTime: '2024-01-10T16:45:00.000Z',
    modifiedTime: '2024-01-15T10:30:00.000Z',
    webViewLink: 'https://drive.google.com/drive/folders/demo_folder_1',
    description: 'Main folder for par Noir related documents'
  },
  {
    id: 'demo_file_4',
    name: 'Account Recovery Codes.csv',
    mimeType: 'text/csv',
    size: '256',
    createdTime: '2024-01-12T11:20:00.000Z',
    modifiedTime: '2024-01-12T11:20:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo_file_4/view',
    description: 'Account recovery codes for emergency access'
  }
];

class GoogleDriveDemoService {
  private authState: GoogleDriveAuthState = { isSignedIn: false };
  private authListeners: ((state: GoogleDriveAuthState) => void)[] = [];
  private files: GoogleDriveFile[] = [...DEMO_FILES];
  private uploadProgress: Map<string, UploadProgress> = new Map();

  constructor() {
    // Simulate some initial delay for realistic behavior
    this.initializeDemo();
  }

  private async initializeDemo() {
    // Simulate API initialization delay
    await new Promise(resolve => setTimeout(resolve, 500));
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
   * Simulate sign in to Google Drive
   */
  async signIn(): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    this.authState = {
      isSignedIn: true,
      accessToken: 'demo_access_token_' + Date.now(),
      user: {
        email: 'demo@parnoir.com',
        name: 'par Noir Demo User',
        picture: 'https://via.placeholder.com/64x64/4F46E5/FFFFFF?text=PN'
      }
    };

    this.notifyAuthListeners();
  }

  /**
   * Simulate sign out from Google Drive
   */
  async signOut(): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    this.authState = { isSignedIn: false };
    this.notifyAuthListeners();
  }

  /**
   * List files from Google Drive (demo)
   */
  async listFiles(query?: string, pageSize: number = 50): Promise<GoogleDriveFile[]> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    let filteredFiles = [...this.files];

    if (query) {
      filteredFiles = filteredFiles.filter(file => 
        file.name.toLowerCase().includes(query.toLowerCase()) ||
        file.description?.toLowerCase().includes(query.toLowerCase())
      );
    }

    return filteredFiles.slice(0, pageSize);
  }

  /**
   * Upload file to Google Drive (demo)
   */
  async uploadFile(
    file: File, 
    onProgress?: (progress: UploadProgress) => void
  ): Promise<GoogleDriveFile> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    const fileId = 'demo_upload_' + Date.now();
    const progress: UploadProgress = {
      fileId: fileId,
      fileName: file.name,
      progress: 0,
      status: 'uploading'
    };

    // Simulate upload progress
    const uploadSteps = [0, 25, 50, 75, 90, 100];
    
    for (let i = 0; i < uploadSteps.length; i++) {
      progress.progress = uploadSteps[i];
      onProgress?.(progress);
      
      if (i < uploadSteps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      }
    }

    // Create new file entry
    const newFile: GoogleDriveFile = {
      id: fileId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size.toString(),
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      description: `Uploaded file: ${file.name}`
    };

    // Add to files list
    this.files.unshift(newFile);
    
    progress.status = 'completed';
    progress.progress = 100;
    onProgress?.(progress);

    return newFile;
  }

  /**
   * Download file from Google Drive (demo)
   */
  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const file = this.files.find(f => f.id === fileId);
    if (!file) {
      throw new Error('File not found');
    }

    // Create a mock blob with file content
    const content = `Demo file content for: ${file.name}\n\nThis is a demonstration file for the par Noir Google Drive integration.\n\nFile ID: ${file.id}\nSize: ${file.size} bytes\nType: ${file.mimeType}\nCreated: ${file.createdTime}\nModified: ${file.modifiedTime}\n\nThis is a demo version - no actual file content is available.`;
    
    return new Blob([content], { type: 'text/plain' });
  }

  /**
   * Delete file from Google Drive (demo)
   */
  async deleteFile(fileId: string): Promise<void> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 600));

    const fileIndex = this.files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      throw new Error('File not found');
    }

    this.files.splice(fileIndex, 1);
  }

  /**
   * Get file metadata (demo)
   */
  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 400));

    const file = this.files.find(f => f.id === fileId);
    if (!file) {
      throw new Error('File not found');
    }

    return file;
  }

  /**
   * Create a folder (demo)
   */
  async createFolder(name: string, parentId?: string): Promise<GoogleDriveFile> {
    if (!this.authState.isSignedIn) {
      throw new Error('Not authenticated with Google Drive');
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const folderId = 'demo_folder_' + Date.now();
    const newFolder: GoogleDriveFile = {
      id: folderId,
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      size: undefined,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: `https://drive.google.com/drive/folders/${folderId}`,
      parents: parentId ? [parentId] : undefined,
      description: `Demo folder: ${name}`
    };

    this.files.unshift(newFolder);
    return newFolder;
  }

  /**
   * Notify authentication listeners
   */
  private notifyAuthListeners(): void {
    this.authListeners.forEach(listener => listener(this.authState));
  }

  /**
   * Get demo statistics
   */
  getDemoStats() {
    return {
      totalFiles: this.files.length,
      totalSize: this.files.reduce((sum, file) => sum + parseInt(file.size || '0'), 0),
      folders: this.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length,
      documents: this.files.filter(f => f.mimeType.includes('document') || f.mimeType.includes('pdf')).length
    };
  }

  /**
   * Reset demo data
   */
  resetDemoData() {
    this.files = [...DEMO_FILES];
    this.authState = { isSignedIn: false };
    this.notifyAuthListeners();
  }
}

// Export singleton instance
export const googleDriveDemoService = new GoogleDriveDemoService();
