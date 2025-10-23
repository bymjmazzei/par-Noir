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
  fileData?: string; // Base64 encoded file data for previews
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

// Demo files - automatically detected from public/demo-files folder
const DEMO_FILES: GoogleDriveFile[] = [
  {
    id: 'demo-image-1',
    name: 'IMG_5431.JPG',
    mimeType: 'image/jpeg',
    size: '2048000', // 2MB
    createdTime: '2024-01-15T10:30:00.000Z',
    modifiedTime: '2024-01-15T10:30:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo-image-1/view',
    description: 'AES-256-GCM encrypted image - only user with their DID can decrypt this file'
  },
  {
    id: 'demo-video-1',
    name: 'IMG_1116.MOV',
    mimeType: 'video/quicktime',
    size: '15728640', // 15MB
    createdTime: '2024-01-14T14:20:00.000Z',
    modifiedTime: '2024-01-16T09:15:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo-video-1/view',
    description: 'AES-256-GCM encrypted video - decentralized identity protocol, zero-knowledge'
  },
  {
    id: 'demo-spreadsheet-1',
    name: '2024 Wrap Sheet.csv',
    mimeType: 'text/csv',
    size: '8192000', // 8MB
    createdTime: '2024-01-13T16:45:00.000Z',
    modifiedTime: '2024-01-15T11:30:00.000Z',
    webViewLink: 'https://docs.google.com/spreadsheets/d/demo-spreadsheet-1/edit',
    description: 'AES-256-GCM encrypted CSV file - only user with their DID can decrypt'
  },
  {
    id: 'demo-pdf-1',
    name: 'Halloween Harvest Haunt 2024 Deck (3).pdf',
    mimeType: 'application/pdf',
    size: '12582912', // 12MB
    createdTime: '2024-01-12T08:00:00.000Z',
    modifiedTime: '2024-01-16T12:00:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo-pdf-1/view',
    description: 'AES-256-GCM encrypted PDF - all files encrypted with decentralized identity protocol'
  },
  {
    id: 'demo-doc-1',
    name: 'Sample Document.txt',
    mimeType: 'text/plain',
    size: '2048', // 2KB
    createdTime: '2024-01-11T13:30:00.000Z',
    modifiedTime: '2024-01-14T15:45:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo-doc-1/view',
    description: 'AES-256-GCM encrypted document - zero-knowledge file sharing with DID-based access'
  },
  {
    id: 'demo-config-1',
    name: 'Configuration.json',
    mimeType: 'application/json',
    size: '1536', // 1.5KB
    createdTime: '2024-01-10T08:00:00.000Z',
    modifiedTime: '2024-01-13T12:00:00.000Z',
    webViewLink: 'https://drive.google.com/file/d/demo-config-1/view',
    description: 'AES-256-GCM encrypted configuration - decentralized identity protocol'
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
    console.log('Demo service signIn called');
    
    // Check if we have stored auth data from OAuth flow
    const token = localStorage.getItem('google_drive_token');
    const email = localStorage.getItem('google_drive_email');
    const name = localStorage.getItem('google_drive_name');
    const picture = localStorage.getItem('google_drive_picture');

    console.log('Stored auth data:', { token: !!token, email, name, picture: !!picture });

    if (token && email) {
      // Use stored OAuth data
      this.authState = {
        isSignedIn: true,
        accessToken: token,
        user: {
          email: email,
          name: name || 'Demo User',
          picture: picture || 'https://via.placeholder.com/64x64/4F46E5/FFFFFF?text=PN'
        }
      };
      console.log('Using stored OAuth data, auth state:', this.authState);
    } else {
      // Fallback to demo mode
      console.log('No stored OAuth data, using fallback demo mode');
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
      console.log('Using fallback demo mode, auth state:', this.authState);
    }

    console.log('Notifying auth listeners...');
    this.notifyAuthListeners();
  }

  /**
   * Simulate sign out from Google Drive
   */
  async signOut(): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Clear stored OAuth data
    localStorage.removeItem('google_drive_token');
    localStorage.removeItem('google_drive_email');
    localStorage.removeItem('google_drive_name');
    localStorage.removeItem('google_drive_picture');

    this.authState = { isSignedIn: false };
    this.notifyAuthListeners();
  }

  /**
   * List files from Google Drive (demo)
   */
  async listFiles(query?: string, pageSize: number = 50): Promise<GoogleDriveFile[]> {
    console.log('Demo service listFiles called, auth state:', this.authState);
    
    if (!this.authState.isSignedIn) {
      console.error('Demo service: Not authenticated, auth state:', this.authState);
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

    console.log('Demo service returning files:', filteredFiles.length, 'files:', filteredFiles.map(f => f.name));
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

    // Store the actual file data for preview generation
    const fileData = await this.storeFileData(file, fileId);

    // Create new file entry
    const newFile: GoogleDriveFile = {
      id: fileId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size.toString(),
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      description: `Uploaded file: ${file.name} - AES-256-GCM encrypted with decentralized identity protocol`,
      fileData: fileData // Store actual file data for previews
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

    // If file has actual data, return it
    if (file.fileData) {
      // Convert base64 data URL back to blob
      const response = await fetch(file.fileData);
      return await response.blob();
    }

    // Map demo files to actual files in public directory
    const demoFileMap: { [key: string]: string } = {
      'demo-image-1': '/demo-files/IMG_5431.JPG',
      'demo-video-1': '/demo-files/IMG_1116.MOV',
      'demo-spreadsheet-1': '/demo-files/2024 Wrap Sheet.xlsx',
      'demo-pdf-1': '/demo-files/Halloween Harvest Haunt 2024 Deck (3).pdf',
      'demo-doc-1': '/demo-files/sample-document.txt',
      'demo-config-1': '/demo-files/config.json'
    };

    const filePath = demoFileMap[fileId];
    if (filePath) {
      try {
        // Try to fetch the actual demo file
        const response = await fetch(filePath);
        if (response.ok) {
          const blob = await response.blob();
          
          // For text-based files, add metadata header
          if (file.mimeType.includes('text') || file.mimeType.includes('json') || file.mimeType.includes('markdown')) {
            let content = await blob.text();
            
            // Add user metadata header to text-based files
            const metadataHeader = `=== FILE OWNERSHIP & METADATA ===
Owner: John Smith
Email: john.smith@example.com
DID: did:parnoir:john-smith-abc123
Downloaded: ${new Date().toISOString()}
Encryption: AES-256-GCM
Identity Protocol: Decentralized Identity (DID)
File ID: ${fileId}
Original File: ${file.name}

=== PROVENANCE TRACKING ===
Original Source: Local workstation (john.smith@example.com)
Upload Timestamp: ${file.createdTime}
Encryption Timestamp: ${file.createdTime}
File Hash: sha256:${Math.random().toString(16).substring(2, 18)}...
Last Modified: ${file.modifiedTime}
Access Count: ${Math.floor(Math.random() * 10) + 1}
Previous Versions: ${Math.floor(Math.random() * 3)}

=== FILE CONTENT ===

`;
            
            // Add metadata header to the content
            content = metadataHeader + content;
            
            return new Blob([content], { type: blob.type });
          } else {
            // For binary files (images, videos, etc.), return as-is but with metadata in filename
            return blob;
          }
        }
      } catch (error) {
        console.log('Could not fetch demo file, falling back to mock content');
      }
    }

    // Fallback to mock content if demo file not found
    let content = '';
    
    if (file.mimeType.includes('image')) {
      // For images, create a simple SVG preview
      content = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="300" fill="#f0f0f0"/>
        <rect x="50" y="50" width="300" height="200" fill="#e0e0e0" stroke="#ccc" stroke-width="2"/>
        <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">
          Encrypted Image Preview
        </text>
        <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#999">
          ${file.name}
        </text>
        <text x="200" y="180" text-anchor="middle" font-family="Arial" font-size="10" fill="#999">
          AES-256-GCM Encrypted
        </text>
        <circle cx="200" cy="200" r="20" fill="#4f46e5"/>
        <text x="200" y="205" text-anchor="middle" font-family="Arial" font-size="12" fill="white">🔒</text>
      </svg>`;
    } else if (file.mimeType.includes('video')) {
      // For videos, create a simple HTML preview
      content = `<html>
        <body style="margin:0; padding:20px; background:#1a1a1a; color:white; font-family:Arial;">
          <div style="text-align:center; margin-top:50px;">
            <div style="width:300px; height:200px; background:#333; border:2px solid #555; margin:0 auto; display:flex; align-items:center; justify-content:center; border-radius:8px;">
              <div style="text-align:center;">
                <div style="font-size:48px; margin-bottom:10px;">🎥</div>
                <div style="font-size:14px; color:#999;">Encrypted Video Preview</div>
                <div style="font-size:12px; color:#666; margin-top:5px;">${file.name}</div>
                <div style="font-size:10px; color:#4f46e5; margin-top:10px;">AES-256-GCM Encrypted</div>
              </div>
            </div>
          </div>
        </body>
      </html>`;
    } else if (file.mimeType.includes('audio')) {
      // For audio, create a simple HTML preview
      content = `<html>
        <body style="margin:0; padding:20px; background:#1a1a1a; color:white; font-family:Arial;">
          <div style="text-align:center; margin-top:50px;">
            <div style="width:300px; height:150px; background:#333; border:2px solid #555; margin:0 auto; display:flex; align-items:center; justify-content:center; border-radius:8px;">
              <div style="text-align:center;">
                <div style="font-size:48px; margin-bottom:10px;">🎵</div>
                <div style="font-size:14px; color:#999;">Encrypted Audio Preview</div>
                <div style="font-size:12px; color:#666; margin-top:5px;">${file.name}</div>
                <div style="font-size:10px; color:#4f46e5; margin-top:10px;">AES-256-GCM Encrypted</div>
              </div>
            </div>
          </div>
        </body>
      </html>`;
    } else if (file.mimeType.includes('pdf') || file.mimeType.includes('document')) {
      // For documents, create a simple HTML preview
      content = `<html>
        <body style="margin:0; padding:20px; background:#1a1a1a; color:white; font-family:Arial;">
          <div style="text-align:center; margin-top:50px;">
            <div style="width:400px; height:500px; background:#333; border:2px solid #555; margin:0 auto; border-radius:8px; padding:20px;">
              <div style="font-size:48px; margin-bottom:20px;">📄</div>
              <h2 style="color:#4f46e5; margin-bottom:20px;">Encrypted Document Preview</h2>
              <div style="text-align:left; margin:20px 0;">
                <h3 style="color:#999; margin-bottom:10px;">Document: ${file.name}</h3>
                <p style="color:#ccc; line-height:1.5;">This is a preview of an encrypted document. The actual content is protected with AES-256-GCM encryption and can only be decrypted by the user with their decentralized identity (DID).</p>
                <p style="color:#ccc; line-height:1.5; margin-top:15px;">Key Features:</p>
                <ul style="color:#ccc; margin-left:20px;">
                  <li>End-to-end encryption</li>
                  <li>Zero-knowledge architecture</li>
                  <li>Client-side decryption only</li>
                  <li>Google Drive integration</li>
                </ul>
              </div>
              <div style="position:absolute; bottom:20px; right:20px; background:#4f46e5; padding:5px 10px; border-radius:4px; font-size:12px;">
                🔒 AES-256-GCM
              </div>
            </div>
          </div>
        </body>
      </html>`;
    } else {
      // Default text content for other file types
      content = `AES-256-GCM Encrypted File: ${file.name}\n\nThis demonstrates par Noir's secure file integration with Google Drive using decentralized identity protocol.\n\n=== Encryption Details ===\nFile ID: ${file.id}\nEncryption: AES-256-GCM\nIdentity: Decentralized Identity (DID)\nUser: demo@parnoir.com\nSize: ${file.size} bytes\nType: ${file.mimeType}\nCreated: ${file.createdTime}\nModified: ${file.modifiedTime}\n\n=== Security Features ===\n- File encrypted with AES-256-GCM before upload to Google Drive\n- Decentralized identity (DID) based encryption\n- Client-side decryption only - no server access\n- Zero-knowledge architecture\n- Only user with their DID can decrypt files\n- Google Drive only sees encrypted content\n\n=== Google Drive Integration ===\n- OAuth 2.0 authentication\n- Follows all API guidelines\n- Secure token handling\n- Standard file operations\n- Enhances Google Drive with decentralized identity security\n\nThis is a demo version showcasing AES-256-GCM encrypted file capabilities with decentralized identity protocol.`;
    }
    
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
      description: `Demo folder: ${name} - AES-256-GCM encrypted folder with decentralized identity protocol`
    };

    this.files.unshift(newFolder);
    return newFolder;
  }

  /**
   * Store file data for preview generation
   */
  private async storeFileData(file: File, fileId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generate thumbnail for uploaded file
   */
  generateFileThumbnail(file: GoogleDriveFile): string {
    if (!file.fileData) {
      return this.generateDefaultThumbnail(file);
    }

    const mimeType = file.mimeType.toLowerCase();
    
    if (mimeType.includes('image')) {
      return file.fileData; // Return actual image data
    } else if (mimeType.includes('video')) {
      return this.generateVideoThumbnailFromData(file);
    } else if (mimeType.includes('pdf')) {
      return this.generatePDFThumbnailFromData(file);
    } else if (mimeType.includes('text') || mimeType.includes('markdown')) {
      return this.generateTextThumbnailFromData(file);
    } else if (mimeType.includes('json')) {
      return this.generateJSONThumbnailFromData(file);
    } else {
      return this.generateDefaultThumbnail(file);
    }
  }

  private generateDefaultThumbnail(file: GoogleDriveFile): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f9fafb"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#6b7280" stroke-width="2"/>
        <rect x="70" y="50" width="60" height="40" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#374151">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateVideoThumbnailFromData(file: GoogleDriveFile): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#1f2937"/>
        <rect x="20" y="20" width="160" height="110" fill="#374151" stroke="#4b5563" stroke-width="2"/>
        <polygon points="80,60 80,90 110,75" fill="#ffffff"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#d1d5db">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generatePDFThumbnailFromData(file: GoogleDriveFile): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#fef2f2"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#f87171" stroke-width="2"/>
        <rect x="30" y="30" width="140" height="20" fill="#fca5a5"/>
        <rect x="30" y="55" width="140" height="5" fill="#fecaca"/>
        <rect x="30" y="65" width="100" height="5" fill="#fecaca"/>
        <rect x="30" y="75" width="120" height="5" fill="#fecaca"/>
        <rect x="30" y="85" width="80" height="5" fill="#fecaca"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#dc2626">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateTextThumbnailFromData(file: GoogleDriveFile): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f0f9ff"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#0ea5e9" stroke-width="2"/>
        <rect x="30" y="30" width="140" height="3" fill="#0ea5e9"/>
        <rect x="30" y="40" width="120" height="3" fill="#0ea5e9"/>
        <rect x="30" y="50" width="100" height="3" fill="#0ea5e9"/>
        <rect x="30" y="60" width="110" height="3" fill="#0ea5e9"/>
        <rect x="30" y="70" width="90" height="3" fill="#0ea5e9"/>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#0369a1">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
  }

  private generateJSONThumbnailFromData(file: GoogleDriveFile): string {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="150" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="150" fill="#f0fdf4"/>
        <rect x="20" y="20" width="160" height="110" fill="#ffffff" stroke="#22c55e" stroke-width="2"/>
        <text x="30" y="40" font-family="monospace" font-size="10" fill="#16a34a">{</text>
        <text x="40" y="55" font-family="monospace" font-size="10" fill="#16a34a">"key": "value"</text>
        <text x="40" y="70" font-family="monospace" font-size="10" fill="#16a34a">"data": [...]</text>
        <text x="30" y="85" font-family="monospace" font-size="10" fill="#16a34a">}</text>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" fill="#15803d">
          ${file.name}
        </text>
        <circle cx="100" cy="130" r="12" fill="#4f46e5"/>
        <text x="100" y="135" text-anchor="middle" font-family="Arial" font-size="10" fill="white">🔒</text>
      </svg>
    `)}`;
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
