// Universal Storage Service - Shared across all tools
import { 
  StorageFile, 
  StorageProvider, 
  StorageProviderType, 
  UploadOptions, 
  UploadProgress, 
  StorageStats,
  StorageError,
  STORAGE_ERROR_CODES,
  FileMetadata,
  ProvenanceChain,
  OwnershipRecord
} from '../types/storage';

export class UniversalStorageService {
  private static instance: UniversalStorageService;
  private providers: Map<StorageProviderType, StorageProvider> = new Map();
  private files: Map<string, StorageFile> = new Map();
  private uploadProgress: Map<string, UploadProgress> = new Map();

  private constructor() {
    this.initializeDefaultProviders();
  }

  public static getInstance(): UniversalStorageService {
    if (!UniversalStorageService.instance) {
      UniversalStorageService.instance = new UniversalStorageService();
    }
    return UniversalStorageService.instance;
  }

  private initializeDefaultProviders(): void {
    // Initialize with free IPFS provider
    this.providers.set('ipfs', {
      id: 'ipfs-free',
      name: 'Free IPFS',
      type: 'ipfs',
      status: 'active',
      storageUsed: 0,
      storageLimit: 5 * 1024 * 1024 * 1024, // 5GB
      isFree: true,
      settings: {
        autoOptimize: true,
        compressionLevel: 'medium',
        redundancy: 3,
        pinning: false,
        backup: false
      }
    });
  }

  // Provider Management
  async addProvider(provider: StorageProvider): Promise<void> {
    try {
      // Test provider connection
      await this.testProviderConnection(provider);
      
      this.providers.set(provider.type, provider);
      await this.saveProviders();
    } catch (error) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: `Failed to add provider: ${error.message}`,
        retryable: true
      });
    }
  }

  async removeProvider(providerType: StorageProviderType): Promise<void> {
    this.providers.delete(providerType);
    await this.saveProviders();
  }

  getProviders(): StorageProvider[] {
    return Array.from(this.providers.values());
  }

  getActiveProvider(): StorageProvider | null {
    const activeProviders = Array.from(this.providers.values())
      .filter(p => p.status === 'active');
    
    // Prefer free providers first
    const freeProvider = activeProviders.find(p => p.isFree);
    return freeProvider || activeProviders[0] || null;
  }

  private async testProviderConnection(provider: StorageProvider): Promise<boolean> {
    // Test connection based on provider type
    switch (provider.type) {
      case 'ipfs':
        return this.testIPFSConnection(provider);
      case 'arweave':
        return this.testArweaveConnection(provider);
      case 'storj':
        return this.testStorjConnection(provider);
      default:
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }
  }

  private async testIPFSConnection(provider: StorageProvider): Promise<boolean> {
    try {
      // Test IPFS connection
      const response = await fetch('https://ipfs.io/api/v0/version');
      return response.ok;
    } catch {
      return false;
    }
  }

  private async testArweaveConnection(provider: StorageProvider): Promise<boolean> {
    try {
      // Test Arweave connection
      const response = await fetch('https://arweave.net/info');
      return response.ok;
    } catch {
      return false;
    }
  }

  private async testStorjConnection(provider: StorageProvider): Promise<boolean> {
    try {
      // Test Storj connection
      const response = await fetch('https://api.storj.io/api/v0/auth/verify');
      return response.ok;
    } catch {
      return false;
    }
  }

  // File Upload
  async uploadFile(
    file: File, 
    options: UploadOptions,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<StorageFile> {
    const fileId = this.generateFileId();
    const progress: UploadProgress = {
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'pending'
    };

    this.uploadProgress.set(fileId, progress);
    onProgress?.(progress);

    try {
      // Validate file
      await this.validateFile(file, options);

      // Get provider
      const provider = this.providers.get(options.provider);
      if (!provider || provider.status !== 'active') {
        throw new Error(`Provider ${options.provider} is not available`);
      }

      // Update progress
      progress.status = 'uploading';
      progress.progress = 10;
      onProgress?.(progress);

      // Extract metadata
      const metadata = await this.extractFileMetadata(file);

      // Upload to provider
      const uploadResult = await this.uploadToProvider(file, provider, options, (uploadProgress) => {
        progress.progress = 10 + (uploadProgress * 0.8); // 10-90%
        onProgress?.(progress);
      });

      // Update progress
      progress.status = 'processing';
      progress.progress = 90;
      onProgress?.(progress);

      // Create provenance chain
      const provenance = await this.createProvenanceChain(fileId, file.name);

      // Create storage file record
      const storageFile: StorageFile = {
        id: fileId,
        name: file.name,
        type: this.getFileType(file),
        size: file.size,
        cid: uploadResult.cid,
        url: uploadResult.url,
        visibility: options.visibility,
        uploadedAt: new Date().toISOString(),
        owner: await this.getCurrentUserDID(),
        provider: options.provider,
        metadata,
        provenance
      };

      // Save file record
      this.files.set(fileId, storageFile);
      await this.saveFiles();

      // Update progress
      progress.status = 'completed';
      progress.progress = 100;
      progress.cid = uploadResult.cid;
      progress.url = uploadResult.url;
      onProgress?.(progress);

      return storageFile;

    } catch (error) {
      progress.status = 'error';
      progress.error = error.message;
      onProgress?.(progress);
      throw error;
    }
  }

  private async validateFile(file: File, options: UploadOptions): Promise<void> {
    // Check file size
    const maxSize = 100 * 1024 * 1024; // 100MB default
    if (file.size > maxSize) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.FILE_TOO_LARGE,
        message: `File size ${file.size} exceeds maximum ${maxSize}`,
        retryable: false
      });
    }

    // Check file type
    const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];
    const isAllowed = allowedTypes.some(type => file.type.startsWith(type));
    if (!isAllowed) {
      throw new StorageError({
        code: STORAGE_ERROR_CODES.INVALID_FILE_TYPE,
        message: `File type ${file.type} is not allowed`,
        retryable: false
      });
    }
  }

  private async extractFileMetadata(file: File): Promise<FileMetadata> {
    const metadata: FileMetadata = {
      mimeType: file.type,
      checksum: await this.calculateChecksum(file)
    };

    // Extract type-specific metadata
    if (file.type.startsWith('image/')) {
      const imageMetadata = await this.extractImageMetadata(file);
      Object.assign(metadata, imageMetadata);
    } else if (file.type.startsWith('video/')) {
      const videoMetadata = await this.extractVideoMetadata(file);
      Object.assign(metadata, videoMetadata);
    } else if (file.type.startsWith('audio/')) {
      const audioMetadata = await this.extractAudioMetadata(file);
      Object.assign(metadata, audioMetadata);
    }

    return metadata;
  }

  private async extractImageMetadata(file: File): Promise<Partial<FileMetadata>> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          format: file.type.split('/')[1]
        });
      };
      img.onerror = () => resolve({});
      img.src = URL.createObjectURL(file);
    });
  }

  private async extractVideoMetadata(file: File): Promise<Partial<FileMetadata>> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          format: file.type.split('/')[1]
        });
      };
      video.onerror = () => resolve({});
      video.src = URL.createObjectURL(file);
    });
  }

  private async extractAudioMetadata(file: File): Promise<Partial<FileMetadata>> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        resolve({
          duration: audio.duration,
          format: file.type.split('/')[1]
        });
      };
      audio.onerror = () => resolve({});
      audio.src = URL.createObjectURL(file);
    });
  }

  private async calculateChecksum(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private getFileType(file: File): StorageFile['type'] {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type === 'application/pdf' || file.type.startsWith('text/')) return 'document';
    return 'other';
  }

  private async uploadToProvider(
    file: File, 
    provider: StorageProvider, 
    options: UploadOptions,
    onProgress?: (progress: number) => void
  ): Promise<{ cid: string; url: string }> {
    switch (provider.type) {
      case 'ipfs':
        return this.uploadToIPFS(file, provider, options, onProgress);
      case 'arweave':
        return this.uploadToArweave(file, provider, options, onProgress);
      case 'storj':
        return this.uploadToStorj(file, provider, options, onProgress);
      default:
        throw new Error(`Unsupported provider: ${provider.type}`);
    }
  }

  private async uploadToIPFS(
    file: File, 
    provider: StorageProvider, 
    options: UploadOptions,
    onProgress?: (progress: number) => void
  ): Promise<{ cid: string; url: string }> {
    // Use existing IPFS service
    const { IPFSService } = await import('../utils/ipfsService');
    const ipfsService = new IPFSService();
    
    // Initialize with provider credentials if available
    if (provider.credentials) {
      await ipfsService.initialize({
        apiKey: provider.credentials.apiKey || '',
        secretKey: provider.credentials.apiSecret || '',
        gatewayUrl: provider.credentials.endpoint || 'https://ipfs.io/ipfs/'
      });
    }

    const result = await ipfsService.uploadFile(file, file.name);
    
    return {
      cid: result.cid,
      url: result.url
    };
  }

  private async uploadToArweave(
    file: File, 
    provider: StorageProvider, 
    options: UploadOptions,
    onProgress?: (progress: number) => void
  ): Promise<{ cid: string; url: string }> {
    // TODO: Implement Arweave upload
    throw new Error('Arweave upload not yet implemented');
  }

  private async uploadToStorj(
    file: File, 
    provider: StorageProvider, 
    options: UploadOptions,
    onProgress?: (progress: number) => void
  ): Promise<{ cid: string; url: string }> {
    // TODO: Implement Storj upload
    throw new Error('Storj upload not yet implemented');
  }

  private async createProvenanceChain(fileId: string, fileName: string): Promise<ProvenanceChain> {
    const currentUser = await this.getCurrentUserDID();
    const now = new Date().toISOString();

    const ownershipRecord: OwnershipRecord = {
      owner: currentUser,
      acquiredAt: now,
      method: 'created',
      signature: await this.signData(`${fileId}:${currentUser}:${now}`)
    };

    return {
      originalCreator: currentUser,
      ownershipHistory: [ownershipRecord],
      modificationHistory: [],
      accessLog: [],
      verificationStatus: 'verified',
      createdAt: now,
      lastModified: now
    };
  }

  private async getCurrentUserDID(): Promise<string> {
    // Get current user's DID from identity system
    // This would integrate with your existing identity management
    return 'did:pN:current-user'; // Placeholder
  }

  private async signData(data: string): Promise<string> {
    // Sign data with user's private key
    // This would integrate with your existing crypto system
    return `signature:${data}`; // Placeholder
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // File Management
  async getFiles(): Promise<StorageFile[]> {
    return Array.from(this.files.values());
  }

  async getFile(fileId: string): Promise<StorageFile | null> {
    return this.files.get(fileId) || null;
  }

  async deleteFile(fileId: string): Promise<void> {
    this.files.delete(fileId);
    await this.saveFiles();
  }

  async updateFileVisibility(fileId: string, visibility: StorageFile['visibility']): Promise<void> {
    const file = this.files.get(fileId);
    if (file) {
      file.visibility = visibility;
      await this.saveFiles();
    }
  }

  // Statistics
  async getStorageStats(): Promise<StorageStats> {
    const files = Array.from(this.files.values());
    
    const stats: StorageStats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      byType: {
        image: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        document: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        other: { count: 0, size: 0 }
      },
      byProvider: {
        ipfs: { count: 0, size: 0 },
        arweave: { count: 0, size: 0 },
        storj: { count: 0, size: 0 },
        filecoin: { count: 0, size: 0 }
      },
      byVisibility: {
        private: { count: 0, size: 0 },
        public: { count: 0, size: 0 },
        friends: { count: 0, size: 0 }
      }
    };

    files.forEach(file => {
      // By type
      stats.byType[file.type].count++;
      stats.byType[file.type].size += file.size;

      // By provider
      stats.byProvider[file.provider].count++;
      stats.byProvider[file.provider].size += file.size;

      // By visibility
      stats.byVisibility[file.visibility].count++;
      stats.byVisibility[file.visibility].size += file.size;
    });

    return stats;
  }

  // Persistence
  private async saveFiles(): Promise<void> {
    const filesData = Array.from(this.files.entries());
    localStorage.setItem('universal-storage-files', JSON.stringify(filesData));
  }

  private async saveProviders(): Promise<void> {
    const providersData = Array.from(this.providers.entries());
    localStorage.setItem('universal-storage-providers', JSON.stringify(providersData));
  }

  private async loadFiles(): Promise<void> {
    const filesData = localStorage.getItem('universal-storage-files');
    if (filesData) {
      const entries = JSON.parse(filesData);
      this.files = new Map(entries);
    }
  }

  private async loadProviders(): Promise<void> {
    const providersData = localStorage.getItem('universal-storage-providers');
    if (providersData) {
      const entries = JSON.parse(providersData);
      this.providers = new Map(entries);
    }
  }

  // Initialize service
  async initialize(): Promise<void> {
    await Promise.all([
      this.loadFiles(),
      this.loadProviders()
    ]);
  }
}

// Export singleton instance
export const universalStorageService = UniversalStorageService.getInstance();
