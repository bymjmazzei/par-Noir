/**
 * PWA File Storage System
 * Manages ID files as actual files in the PWA directory
 * Filename = nickname for easy identification
 */

export interface PWAIdentityFile {
  filename: string;
  nickname: string;
  publicKey: string;
  encryptedData: any;
  createdAt: string;
  lastAccessed: string;
}

export interface PWAFileMetadata {
  nickname: string;
  publicKey: string;
  createdAt: string;
  lastAccessed: string;
  version: number;
}

export class PWAFileStorage {
  private static instance: PWAFileStorage;
  private readonly ID_FILES_DIR = 'id-files';
  private readonly METADATA_DIR = 'metadata';
  private rootHandle: FileSystemDirectoryHandle | null = null;

  private constructor() {}

  static getInstance(): PWAFileStorage {
    if (!PWAFileStorage.instance) {
      PWAFileStorage.instance = new PWAFileStorage();
    }
    return PWAFileStorage.instance;
  }

  /**
   * Initialize PWA file storage
   */
  async initialize(): Promise<void> {
    try {
      // Request permission to access the PWA directory
      this.rootHandle = await navigator.storage.getDirectory();
      
      // Create directories if they don't exist
      await this.ensureDirectoryExists(this.ID_FILES_DIR);
      await this.ensureDirectoryExists(this.METADATA_DIR);
      
      // PWA file storage initialized
    } catch (error) {
      console.error('Failed to initialize PWA file storage:', error);
      throw new Error('PWA file storage not available');
    }
  }

  /**
   * Ensure a directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(dirName: string): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      await this.rootHandle.getDirectoryHandle(dirName, { create: true });
    } catch (error) {
      console.error(`Failed to create directory ${dirName}:`, error);
      throw error;
    }
  }

  /**
   * Store an ID file with nickname as filename
   */
  async storeIDFile(encryptedIdentity: any, nickname: string): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const idFilesDir = await this.rootHandle.getDirectoryHandle(this.ID_FILES_DIR, { create: true });
      
      // Create filename from nickname (sanitized)
      const filename = this.sanitizeFilename(nickname);
      const fileHandle = await idFilesDir.getFileHandle(`${filename}.id`, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Write the encrypted identity data
      await writable.write(JSON.stringify(encryptedIdentity));
      await writable.close();
      
      // Store metadata
      await this.storeMetadata(filename, {
        nickname,
        publicKey: encryptedIdentity.publicKey,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        version: 1
      });
    } catch (error) {
      console.error('Failed to store ID file:', error);
      throw error;
    }
  }

  /**
   * Load all ID files from the PWA directory
   */
  async loadIDFiles(): Promise<PWAIdentityFile[]> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const idFilesDir = await this.rootHandle.getDirectoryHandle(this.ID_FILES_DIR, { create: true });
      const files: PWAIdentityFile[] = [];
      
      // Scan directory for .id files
      for await (const [filename, handle] of idFilesDir as any) {
        if (filename.endsWith('.id') && handle.kind === 'file') {
          try {
            const fileHandle = handle as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            const encryptedIdentity = JSON.parse(content);
            
            // Get metadata
            const baseFilename = filename.replace('.id', '');
            const metadata = await this.getMetadata(baseFilename);
            
            files.push({
              filename: baseFilename,
              nickname: metadata?.nickname || baseFilename,
              publicKey: encryptedIdentity.publicKey,
              encryptedData: encryptedIdentity,
              createdAt: metadata?.createdAt || new Date().toISOString(),
              lastAccessed: metadata?.lastAccessed || new Date().toISOString()
            });
          } catch (error) {
            console.error(`Failed to load ID file ${filename}:`, error);
          }
        }
      }
      
      return files;
    } catch (error) {
      console.error('Failed to load ID files:', error);
      return [];
    }
  }

  /**
   * Update nickname (renames the file)
   */
  async updateNickname(oldNickname: string, newNickname: string): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const idFilesDir = await this.rootHandle.getDirectoryHandle(this.ID_FILES_DIR, { create: true });
      
      const oldFilename = this.sanitizeFilename(oldNickname);
      const newFilename = this.sanitizeFilename(newNickname);
      
      // Get the old file
      const oldFileHandle = await idFilesDir.getFileHandle(`${oldFilename}.id`);
      const oldFile = await oldFileHandle.getFile();
      const content = await oldFile.text();
      // Parse content to validate JSON format
      JSON.parse(content);
      
      // Create new file with new filename
      const newFileHandle = await idFilesDir.getFileHandle(`${newFilename}.id`, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      
      // Delete old file
      await idFilesDir.removeEntry(`${oldFilename}.id`);
      
      // Update metadata
      const oldMetadata = await this.getMetadata(oldFilename);
      if (oldMetadata) {
        await this.storeMetadata(newFilename, {
          ...oldMetadata,
          nickname: newNickname,
          lastAccessed: new Date().toISOString()
        });
        await this.deleteMetadata(oldFilename);
      }
    } catch (error) {
      console.error('Failed to update nickname:', error);
      throw error;
    }
  }

  /**
   * Get ID file by nickname
   */
  async getIDFile(nickname: string): Promise<PWAIdentityFile | null> {
    const files = await this.loadIDFiles();
    return files.find(file => file.nickname === nickname) || null;
  }

  /**
   * Delete ID file
   */
  async deleteIDFile(nickname: string): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const idFilesDir = await this.rootHandle.getDirectoryHandle(this.ID_FILES_DIR, { create: true });
      const filename = this.sanitizeFilename(nickname);
      
      // Delete the ID file
      await idFilesDir.removeEntry(`${filename}.id`);
      
      // Delete metadata
      await this.deleteMetadata(filename);
    } catch (error) {
      console.error('Failed to delete ID file:', error);
      throw error;
    }
  }

  /**
   * Store metadata for an ID file
   */
  private async storeMetadata(filename: string, metadata: PWAFileMetadata): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const metadataDir = await this.rootHandle.getDirectoryHandle(this.METADATA_DIR, { create: true });
      const fileHandle = await metadataDir.getFileHandle(`${filename}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      
      await writable.write(JSON.stringify(metadata));
      await writable.close();
    } catch (error) {
      console.error('Failed to store metadata:', error);
      throw error;
    }
  }

  /**
   * Get metadata for an ID file
   */
  private async getMetadata(filename: string): Promise<PWAFileMetadata | null> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const metadataDir = await this.rootHandle.getDirectoryHandle(this.METADATA_DIR, { create: true });
      const fileHandle = await metadataDir.getFileHandle(`${filename}.json`);
      const file = await fileHandle.getFile();
      const content = await file.text();
      
      return JSON.parse(content);
    } catch (error) {
      // Metadata file doesn't exist or is invalid
      return null;
    }
  }

  /**
   * Delete metadata for an ID file
   */
  private async deleteMetadata(filename: string): Promise<void> {
    if (!this.rootHandle) throw new Error('PWA storage not initialized');
    
    try {
      const metadataDir = await this.rootHandle.getDirectoryHandle(this.METADATA_DIR, { create: true });
      await metadataDir.removeEntry(`${filename}.json`);
    } catch (error) {
      // Metadata file doesn't exist, ignore
    }
  }

  /**
   * Sanitize filename from nickname
   */
  private sanitizeFilename(nickname: string): string {
    return nickname
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Replace multiple dashes with single dash
      .trim()
      .substring(0, 50); // Limit length
  }

  /**
   * Check if PWA file storage is available
   */
  static isAvailable(): boolean {
    const hasStorage = 'storage' in navigator;
    const hasGetDirectory = hasStorage && 'getDirectory' in navigator.storage;
    const isSecureContext = window.isSecureContext;
    const isHTTPS = window.location.protocol === 'https:';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // PWA File Storage check
    
    // File System Access API requires secure context (HTTPS or localhost)
    return hasStorage && hasGetDirectory && (isSecureContext || isLocalhost);
  }
}

export default PWAFileStorage;
