/**
 * Google Drive Storage Backend Implementation
 * Extracts Google Drive logic from the UI component into a reusable backend
 */
import { AbstractStorageBackend } from './StorageBackend';
import {
  StorageFile,
  StorageQuota,
  StorageUserInfo,
  StorageBackendConfig
} from '../../types/aggregator';

export class GoogleDriveBackend extends AbstractStorageBackend {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private userEmail: string | null = null;
  private parNoirFolderId: string | null = null;
  private pnFolderCache: Map<string, string> = new Map(); // Cache pN-specific folders
  
  // Load folder cache from localStorage on init
  private loadFolderCache(): void {
    try {
      const cached = localStorage.getItem('google_drive_folder_cache');
      if (cached) {
        const cacheData = JSON.parse(cached);
        let validEntries = 0;
        Object.entries(cacheData).forEach(([key, value]) => {
          // Cache will be validated when used, but we can load it
          this.pnFolderCache.set(key, value as string);
          validEntries++;
        });
        console.log(`✅ Loaded ${validEntries} folder ID(s) from cache (will validate on use)`);
      }
    } catch (e) {
      console.warn('Failed to load folder cache:', e);
    }
  }
  
  /**
   * Clear folder cache for a specific pN (used when wrong folder detected)
   */
  public clearFolderCache(pnIdentifier: string): void {
    this.pnFolderCache.delete(pnIdentifier);
    this.saveFolderCache();
    console.log(`🗑️ [GoogleDriveBackend] Cleared folder cache for pN ${pnIdentifier.substring(0, 8)}...`);
  }
  
  // Save folder cache to localStorage
  private saveFolderCache(): void {
    try {
      const cacheData: Record<string, string> = {};
      this.pnFolderCache.forEach((value, key) => {
        cacheData[key] = value;
      });
      localStorage.setItem('google_drive_folder_cache', JSON.stringify(cacheData));
      
      // ALSO store the last used folder ID directly (doesn't require pN identifier)
      // This allows us to find the folder even if we can't generate the pN identifier
      if (this.pnFolderCache.size > 0) {
        // Get the most recently set folder ID (or any one)
        const lastFolderId = Array.from(this.pnFolderCache.values())[0];
        localStorage.setItem('google_drive_last_folder_id', lastFolderId);
        console.log(`💾 [saveFolderCache] Stored last folder ID: ${lastFolderId.substring(0, 12)}...`);
      }
    } catch (e) {
      console.warn('Failed to save folder cache:', e);
    }
  }

  constructor(config?: Partial<StorageBackendConfig>) {
    super({
      id: 'google_drive',
      name: 'Google Drive',
      type: 'google_drive',
      ...config
    });
    
    // Load stored token if available
    try {
      this.token = localStorage.getItem('google_drive_token');
      this.userEmail = localStorage.getItem('google_drive_email');
      
      // Load folder cache from localStorage
      this.loadFolderCache();
      
      // ALSO load the last used folder ID (works even without pN identifier)
      try {
        const lastFolderId = localStorage.getItem('google_drive_last_folder_id');
        if (lastFolderId) {
          this.parNoirFolderId = lastFolderId;
          console.log(`📂 [constructor] Loaded last folder ID from localStorage: ${lastFolderId.substring(0, 12)}...`);
        }
      } catch (e) {
        // localStorage might not be available
      }
    } catch (e) {
      // localStorage might not be available
    }
  }

  async connect(credentials: { token: string; email?: string; refreshToken?: string }): Promise<void> {
    this.token = credentials.token;
    this.refreshToken = credentials.refreshToken || null;
    this.userEmail = credentials.email || null;
    
    try {
      localStorage.setItem('google_drive_token', credentials.token);
      if (credentials.email) {
        localStorage.setItem('google_drive_email', credentials.email);
      }
      if (this.refreshToken) {
        localStorage.setItem('google_drive_refresh_token', this.refreshToken);
      }
    } catch (e) {
      // localStorage might not be available
    }
    
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    this.userEmail = null;
    this.parNoirFolderId = null;
    
    try {
      localStorage.removeItem('google_drive_token');
      localStorage.removeItem('google_drive_email');
      localStorage.removeItem('google_drive_refresh_token');
    } catch (e) {
      // localStorage might not be available
    }
    
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && !!this.token;
  }

  /**
   * Check if response indicates token is expired/invalid
   */
  private async handleTokenError(response: Response): Promise<boolean> {
    if (response.status === 401) {
      console.error('❌ [GoogleDriveBackend] Token expired or invalid (401)');
      
      // Try to refresh token if we have a refreshToken stored
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        console.log('🔄 [GoogleDriveBackend] Attempting to refresh token...');
        try {
          const newToken = await this.refreshAccessToken(refreshToken);
          if (newToken) {
            this.token = newToken;
            // Save new token
            localStorage.setItem('google_drive_token', newToken);
            console.log('✅ [GoogleDriveBackend] Token refreshed successfully');
            return false; // Token was refreshed, retry the request
          }
        } catch (refreshError) {
          console.error('❌ [GoogleDriveBackend] Token refresh failed:', refreshError);
        }
      }
      
      // If refresh failed or no refreshToken, clear token and force re-authentication
      this.disconnect();
      // Trigger re-connect UI
      window.dispatchEvent(new CustomEvent('google-drive-token-expired', {
        detail: { message: 'Google Drive token expired. Please reconnect.' }
      }));
      return true; // Indicates token error was handled
    }
    return false;
  }

  /**
   * Get refresh token from storage (if available)
   */
  private getRefreshToken(): string | null {
    // Return in-memory refresh token first
    if (this.refreshToken) {
      return this.refreshToken;
    }
    
    try {
      // Check localStorage as fallback
      const token = localStorage.getItem('google_drive_refresh_token');
      if (token) {
        this.refreshToken = token; // Cache it
        return token;
      }
      
      // TODO: Check encrypted metadata (would need auth context)
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || 
        '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      return data.access_token || null;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  /**
   * Make authenticated request to Google Drive API
   * Handles token expiration automatically with retry after refresh
   */
  private async makeRequest(url: string, options: RequestInit = {}, retryCount = 0): Promise<Response> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    // Check for token expiration
    if (response.status === 401) {
      const wasHandled = await this.handleTokenError(response);
      
      // If token was refreshed (wasHandled = false), retry the request once
      if (!wasHandled && retryCount === 0 && this.token) {
        console.log('🔄 [GoogleDriveBackend] Retrying request after token refresh...');
        return this.makeRequest(url, options, retryCount + 1);
      }
      
      // If refresh failed or no refresh token, throw error
      throw new Error('Google Drive authentication expired. Please reconnect.');
    }

    return response;
  }

  /**
   * Get or create a folder. If pnIdentifier is provided, creates pN-specific folders.
   * Format: "par Noir" (base folder) or "par Noir - {pnIdentifier}" (pN-specific)
   *
   * If parentFolderId is provided, creates the folder inside that parent folder.
   *
   * NOTE: Avoid creating base "par Noir" folder when pnIdentifier is available.
   * Always prefer pN-specific folders.
   * 
   * CRITICAL: This should NOT be called during unlock if Google Drive isn't connected.
   * Unlock should proceed independently of Google Drive.
   */
  async getOrCreateFolder(name: string, pnIdentifier?: string, parentFolderId?: string): Promise<string> {
    if (!this.token) {
      // Don't throw error - just log and return a dummy ID that won't be used
      // This prevents breaking unlock flow
      console.warn('⚠️ [getOrCreateFolder] Google Drive not connected - returning placeholder');
      return 'NOT_CONNECTED';
    }

    // IMPORTANT: If pnIdentifier is provided, ALWAYS use pN-specific folder
    // Don't create base "par Noir" folder if we have a pN identifier
    const folderName = pnIdentifier 
      ? `${name} - ${pnIdentifier}`
      : name;

    // Check cache first - but validate it's actually a pN folder, not metadata
    if (pnIdentifier && this.pnFolderCache.has(pnIdentifier)) {
      const cachedFolderId = this.pnFolderCache.get(pnIdentifier)!;
      console.log(`🔍 [getOrCreateFolder] Found cached folder ID for pN ${pnIdentifier.substring(0, 8)}...: ${cachedFolderId.substring(0, 12)}...`);
      
      // CRITICAL: Validate the cached folder is actually a pN folder, not metadata folder
      // BUT: If validation fails or token unavailable, skip validation and use cache anyway
      // We'll validate it properly when listing files
      try {
        if (!this.token) {
          // No token - can't validate, but also can't use Google Drive
          console.warn(`⚠️ [getOrCreateFolder] No Google Drive token - cannot validate cache, but unlock can proceed`);
          // Don't return cached folder if no token - unlock shouldn't need Google Drive
          this.pnFolderCache.delete(pnIdentifier);
          this.saveFolderCache();
          // Continue to search below
        } else {
          const validateResponse = await this.makeRequest(
            `https://www.googleapis.com/drive/v3/files/${cachedFolderId}?fields=id,name,mimeType,parents`
          );
          
          if (validateResponse.ok) {
            const folderInfo = await validateResponse.json();
            
            // Validate: Must be named like "par Noir - pn-XXX" and NOT "_metadata"
            const isMetadataFolder = folderInfo.name === '_metadata' || folderInfo.name.includes('_metadata');
            const isPNFolder = folderInfo.name.includes('par Noir') && folderInfo.name.includes(pnIdentifier.substring(0, 8));
            
            if (isMetadataFolder || !isPNFolder) {
              console.error(`❌ [getOrCreateFolder] Cached folder is WRONG! Name: "${folderInfo.name}" - Clearing cache and re-searching`);
              this.pnFolderCache.delete(pnIdentifier);
              this.saveFolderCache();
              // Continue to search below
            } else {
              console.log(`✅ [getOrCreateFolder] Cached folder validated: "${folderInfo.name}"`);
              return cachedFolderId;
            }
          } else {
            // Validation failed - cache might be invalid, but don't block unlock
            console.warn(`⚠️ [getOrCreateFolder] Could not validate cached folder (${validateResponse.status}), clearing cache`);
            this.pnFolderCache.delete(pnIdentifier);
            this.saveFolderCache();
            // Continue to search below
          }
        }
      } catch (validateError) {
        // Validation error - don't block, just clear cache and continue
        console.warn(`⚠️ [getOrCreateFolder] Error validating cached folder, clearing cache:`, validateError);
        this.pnFolderCache.delete(pnIdentifier);
        this.saveFolderCache();
        // Continue to search below
      }
    }

    // Search for existing folder - be more specific if pnIdentifier provided
    // IMPORTANT: For pN folders, search for exact match and exclude subfolders (no parent restriction)
    // For metadata folders (name='_metadata'), parentFolderId will filter correctly
    let searchQuery: string;
    if (pnIdentifier) {
      // For pN folders: search for EXACT name match
      // CRITICAL: folderName is already "par Noir - pn-XXX", search for EXACT match
      // MUST NOT match "_metadata" folder - exclude it explicitly
      const exactName = encodeURIComponent(folderName);
      searchQuery = `name='${exactName}' and name!='_metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      // CRITICAL: pN folders are at ROOT level, so if it has a parent, it's wrong
      // We can't easily check "no parent" in Google Drive API, so we'll validate the results
      // If parentFolderId is specified (shouldn't happen for pN folders), add parent filter
      if (parentFolderId) {
        searchQuery += ` and '${parentFolderId}' in parents`;
      }
    } else if (parentFolderId) {
      // For metadata folders: search inside parent folder
      searchQuery = `name='${encodeURIComponent(folderName)}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    } else {
      // For base folders: search at root level
      searchQuery = `name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    }
    
    const searchResponse = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name)`
    );

    if (!searchResponse.ok) {
      throw new Error('Failed to search for folder');
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      // CRITICAL: Filter out invalid folders
      // ALLOW _metadata folders ONLY if they're nested (have parentFolderId) - these are valid subfolders
      const validFolders = searchData.files.filter((f: any) => {
        // If we're looking for an _metadata folder (folderName === '_metadata'), allow it only if nested
        if (folderName === '_metadata') {
          // Allow _metadata folder if it has a parent (is nested inside pN folder)
          if (parentFolderId) {
            console.log(`   ✅ Accepting metadata folder: "${f.name}" (nested in pN folder)`);
            return true;
          } else {
            // Reject root-level _metadata folders
            console.warn(`   ❌ Rejecting folder: "${f.name}" - _metadata folders must be nested`);
            return false;
          }
        }
        
        // For pN folders: REJECT _metadata folders at root level
        if (f.name === '_metadata' && !parentFolderId) {
          console.warn(`   ❌ Rejecting folder: "${f.name}" - is root-level metadata folder`);
          return false;
        }
        
        // If pN identifier provided, folder name MUST include it (unless it's an _metadata subfolder)
        if (pnIdentifier && folderName !== '_metadata' && !f.name.includes(pnIdentifier.substring(0, 8))) {
          console.warn(`   ❌ Rejecting folder: "${f.name}" - doesn't include pN identifier`);
          return false;
        }
        
        // MUST be named like "par Noir" (or "par Noir - pn-XXX" for pN folders)
        // OR be "_metadata" if we're looking for it
        if (folderName === '_metadata' && f.name === '_metadata') {
          console.log(`   ✅ Accepting folder: "${f.name}"`);
          return true;
        }
        
        if (!f.name.includes('par Noir') && f.name !== '_metadata') {
          console.warn(`   ❌ Rejecting folder: "${f.name}" - doesn't include "par Noir"`);
          return false;
        }
        
        // For pN folders, name MUST be exactly "par Noir - {pnIdentifier}"
        if (pnIdentifier && folderName !== '_metadata') {
          const expectedName = `par Noir - ${pnIdentifier}`;
          if (f.name !== expectedName) {
            console.warn(`   ❌ Rejecting folder: "${f.name}" - expected "${expectedName}"`);
            return false;
          }
        }
        
        console.log(`   ✅ Accepting folder: "${f.name}"`);
        return true;
      });
      
      if (validFolders.length === 0) {
        console.error(`❌ [getOrCreateFolder] No valid pN folders found! Search returned ${searchData.files.length} folder(s) but all were invalid.`);
        console.error(`   Search query: ${searchQuery}`);
        console.error(`   All results:`, searchData.files.map((f: any) => ({ id: f.id.substring(0, 12) + '...', name: f.name })));
        // Continue to create new folder below
      } else {
        // Use the first valid folder
        let folderId = validFolders[0].id;
        const folderInfo = validFolders[0];
        
        // FINAL VALIDATION: Check name matches (allow _metadata if we're looking for it)
        const isMetadataFolder = folderInfo.name === '_metadata';
        const hasCorrectName = 
          folderName === '_metadata' ? isMetadataFolder :
          pnIdentifier ? folderInfo.name === `par Noir - ${pnIdentifier}` : 
          folderInfo.name === 'par Noir';
        
        // Allow _metadata folders if we're explicitly looking for them AND they're nested
        if (folderName === '_metadata') {
          if (isMetadataFolder && parentFolderId) {
            console.log(`✅ [getOrCreateFolder] Found VALID metadata folder: "${folderInfo.name}" (nested)`);
            // Don't cache metadata folders - they're subfolders
            return folderId;
          } else {
            console.error(`❌ [getOrCreateFolder] Metadata folder found but not nested or wrong context`);
            // Continue to create new folder below
          }
        } else if (isMetadataFolder && !parentFolderId) {
          // Reject root-level metadata folders when looking for pN folders
          console.error(`❌ [getOrCreateFolder] CRITICAL ERROR: Validated folder is root-level metadata: "${folderInfo.name}"`);
          // Continue to create new folder below
        } else if (!hasCorrectName) {
          console.error(`❌ [getOrCreateFolder] CRITICAL ERROR: Folder name doesn't match: "${folderInfo.name}"`);
          // Continue to create new folder below
        } else {
          console.log(`✅ [getOrCreateFolder] Found VALID pN folder: "${folderInfo.name}" (ID: ${folderId.substring(0, 12)}...)`);
          
          // IMPORTANT: Only cache pN-specific folders (not metadata folders)
          if (pnIdentifier && !parentFolderId) {
            // This is a valid pN folder - cache it
            this.pnFolderCache.set(pnIdentifier, folderId);
            this.parNoirFolderId = folderId; // ALSO store as last folder ID (doesn't require pN identifier to retrieve)
            this.saveFolderCache(); // Persist to localStorage
            console.log(`✅ [getOrCreateFolder] Cached pN folder ID for ${pnIdentifier.substring(0, 8)}...`);
          } else if (!pnIdentifier && !parentFolderId) {
            // Legacy: store base folder ID (but avoid creating these if possible)
            this.parNoirFolderId = folderId;
            // Save to localStorage as last folder ID
            try {
              localStorage.setItem('google_drive_last_folder_id', folderId);
            } catch (e) {
              console.warn('Failed to save last folder ID:', e);
            }
          }
          
          return folderId;
        }
      }
    }

    // Create folder if it doesn't exist
    console.log(`📁 Creating new folder: ${folderName}${parentFolderId ? ' inside parent folder' : ''}`);
    const createBody: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    
    // If parent folder ID provided, nest the folder inside it
    if (parentFolderId) {
      createBody.parents = [parentFolderId];
    }
    
    const createResponse = await this.makeRequest(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        body: JSON.stringify(createBody)
      }
    );

    if (!createResponse.ok) {
      throw new Error('Failed to create folder');
    }

    const folderData = await createResponse.json();
    const folderId = folderData.id;
    
      console.log(`✅ Created folder: ${pnIdentifier ? `${folderName} - ${pnIdentifier.substring(0, 8)}...` : folderName} (ID: ${folderId.substring(0, 12)}...)`);
      
      // IMPORTANT: Only cache pN-specific folders (not metadata folders)
      // Metadata folders have name='_metadata' and parentFolderId, so pnIdentifier would be undefined
      if (pnIdentifier && !parentFolderId) {
        // This is a pN folder - cache it
        this.pnFolderCache.set(pnIdentifier, folderId);
        this.parNoirFolderId = folderId; // ALSO store as last folder ID (doesn't require pN identifier to retrieve)
        this.saveFolderCache(); // Persist to localStorage
      } else if (!pnIdentifier && !parentFolderId) {
        // Legacy: store base folder ID
        this.parNoirFolderId = folderId;
        // Save to localStorage as last folder ID
        try {
          localStorage.setItem('google_drive_last_folder_id', folderId);
        } catch (e) {
          console.warn('Failed to save last folder ID:', e);
        }
      }
      // Don't cache metadata folders (they have parentFolderId)
      
      return folderId;
  }

  /**
   * List files. If pnIdentifier provided, only lists files from that pN's folder.
   * Otherwise lists from the base "par Noir" folder (legacy behavior).
   */
  async listFiles(folderId?: string, pnIdentifier?: string): Promise<StorageFile[]> {
    if (!this.token) {
      console.warn('⚠️ [listFiles] Google Drive not connected - returning empty list');
      return [];
    }
    
    if (folderId === 'NOT_CONNECTED') {
      return [];
    }

    // PRIORITY 1: If pnIdentifier provided, ALWAYS use getOrCreateFolder (same as upload)
    // This is the ONLY way to guarantee we get the same folder
    if (pnIdentifier && !folderId) {
      console.log(`📁 [listFiles] Using getOrCreateFolder with pN identifier: ${pnIdentifier.substring(0, 8)}...`);
      try {
        folderId = await this.getOrCreateFolder('par Noir', pnIdentifier);
        console.log(`✅ [listFiles] Got folder ID: ${folderId?.substring(0, 12)}...`);
      } catch (err) {
        console.error('❌ [listFiles] Failed to get/create folder:', err);
        folderId = undefined;
      }
    }
    
    // PRIORITY 2: If no folderId yet, search for "par Noir" folders directly
    if (!folderId) {
      console.log('🔍 [listFiles] Searching Google Drive for "par Noir" folders...');
      try {
        // Search for folders matching "par Noir - pn-*" pattern (excluding metadata folders)
        const folderSearchQuery = `name contains 'par Noir' and mimeType='application/vnd.google-apps.folder' and trashed=false and name!='_metadata'`;
        const folderSearchResponse = await this.makeRequest(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`
        );
        
        if (folderSearchResponse.ok) {
          const folderData = await folderSearchResponse.json();
          if (folderData.files && folderData.files.length > 0) {
            // Prefer folders matching "par Noir - pn-*" pattern
            const pnFolders = folderData.files.filter((f: any) => 
              f.name.includes('par Noir') && 
              f.name.includes('pn-') && 
              !f.name.includes('_metadata')
            );
            
            if (pnFolders.length > 0) {
              folderId = pnFolders[0].id;
              console.log(`✅ [listFiles] Found folder: "${pnFolders[0].name}" (${folderId.substring(0, 12)}...)`);
            } else if (folderData.files.length > 0) {
              // Fallback: Use first "par Noir" folder
              folderId = folderData.files[0].id;
              console.log(`✅ [listFiles] Using fallback folder: "${folderData.files[0].name}" (${folderId.substring(0, 12)}...)`);
            }
          }
        }
      } catch (e) {
        console.error('❌ [listFiles] Error searching for folders:', e);
      }
    }

    // If still no folderId, return empty (don't break unlock)
    if (!folderId) {
      console.warn('⚠️ [listFiles] No folder found - returning empty list');
      return [];
    }
    
    console.log(`📁 [listFiles] Listing files from folder ID: ${folderId.substring(0, 12)}...`);

    // IMPORTANT: Exclude folders and metadata items - only list actual files
    const response = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'&fields=files(id,name,modifiedTime,size,mimeType)&pageSize=100&orderBy=modifiedTime desc`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [listFiles] Failed to fetch files from folder ${folderId.substring(0, 12)}...:`, errorText);
      throw new Error(`Failed to fetch files: ${errorText}`);
    }

    const data = await response.json();
    const fileList = data.files || [];
    console.log(`📋 [listFiles] Google Drive returned ${fileList.length} item(s) from folder ${folderId.substring(0, 12)}...`);

    // Filter out metadata files and any remaining folders (safety check)
    const filteredFileList = fileList.filter((f: any) => {
      // Exclude metadata index file
      if (f.name === 'public-file-index.json') {
        return false;
      }
      // Exclude folders (shouldn't happen due to query, but safety check)
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        return false;
      }
      return true;
    });

    if (filteredFileList.length !== fileList.length) {
      console.log(`📋 [listFiles] Filtered out ${fileList.length - filteredFileList.length} metadata/folder item(s) - showing ${filteredFileList.length} file(s)`);
    }

    return filteredFileList.map((f: any) => ({
      id: f.id,
      name: f.name,
      size: parseInt(f.size || '0', 10),
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      encrypted: f.name.endsWith('.encrypted'),
      originalName: f.name.endsWith('.encrypted') ? f.name.replace('.encrypted', '') : f.name,
      backend: this.id
    }));
  }

  async uploadFile(file: File, folderId?: string, metadata?: any): Promise<StorageFile> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    // Extract pN identifier from metadata if provided
    const pnIdentifier = metadata?.pnIdentifier;

    const targetFolderId = folderId || (pnIdentifier ? this.pnFolderCache.get(pnIdentifier) : this.parNoirFolderId);
    
    if (!targetFolderId) {
      const newFolderId = await this.getOrCreateFolder('par Noir', pnIdentifier);
      return this.uploadFile(file, newFolderId, metadata);
    }

    // Use resumable upload for large files and CORS compatibility
    const fileName = metadata?.fileName || file.name;
    
    // Step 1: Initialize resumable upload session
    const initResponse = await this.makeRequest(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          name: fileName,
          parents: [targetFolderId]
        })
      }
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`Failed to initialize upload: ${errorText}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('No upload URL received');
    }

    // Step 2: Upload file data
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Failed to upload file: ${errorText}`);
    }

    const uploadedFile = await uploadResponse.json();

    const result = {
      id: uploadedFile.id,
      name: uploadedFile.name,
      size: parseInt(uploadedFile.size || '0', 10),
      mimeType: uploadedFile.mimeType,
      modifiedTime: uploadedFile.modifiedTime,
      encrypted: fileName.endsWith('.encrypted'),
      originalName: fileName.endsWith('.encrypted') ? fileName.replace('.encrypted', '') : fileName,
      backend: this.id
    };

    // Create companion metadata file after successful upload
    if (metadata?.pnIdentifier && this.token) {
      try {
        console.log('📝 [uploadFile] Creating companion metadata file...');
        console.log('📝 [uploadFile] pnIdentifier:', metadata.pnIdentifier);
        console.log('📝 [uploadFile] Uploaded file ID:', uploadedFile.id);
        console.log('📝 [uploadFile] File name:', fileName);
        const { GoogleDriveMetadataService } = await import('./GoogleDriveMetadataService');
        
        // Get owner DID from metadata if available
        const authenticatedUserStr = localStorage.getItem('authenticated_user');
        let ownerDid = null;
        if (authenticatedUserStr) {
          try {
            const authenticatedUser = JSON.parse(authenticatedUserStr);
            ownerDid = authenticatedUser.id || authenticatedUser.did || null;
          } catch (e) {
            console.warn('Could not parse authenticated user for metadata');
          }
        }

        // Extract original filename from encrypted filename
        const originalFileName = fileName.endsWith('.encrypted') 
          ? fileName.replace('.encrypted', '') 
          : fileName;

        // Generate thumbnail for image files
        let thumbnail: string | undefined = undefined;
        const mimeType = uploadedFile.mimeType || file.type || 'application/octet-stream';
        if (mimeType.startsWith('image/')) {
          // Generate actual thumbnail from the image file
          try {
            thumbnail = await this.generateImageThumbnail(file);
          } catch (thumbError) {
            console.warn('Failed to generate thumbnail, skipping:', thumbError);
          }
        }

        const companionMetadata = {
          fileId: metadata.fileId || uploadedFile.id,
          googleDriveFileId: uploadedFile.id,
          fileName: fileName,
          originalName: originalFileName,
          mimeType: mimeType,
          size: parseInt(uploadedFile.size || file.size.toString() || '0', 10),
          visibility: metadata.visibility || 'private',
          uploadedAt: new Date().toISOString(),
          owner: {
            did: ownerDid || undefined,
            identifier: metadata.pnIdentifier
          },
          tags: [],
          description: undefined,
          metadata: {},
          publicToken: metadata.publicToken || undefined, // Include share token if provided
          thumbnail: thumbnail // Include thumbnail for images
        };

        await GoogleDriveMetadataService.createCompanionMetadataFile(
          this.token,
          metadata.pnIdentifier,
          companionMetadata
        );
        console.log('✅ [uploadFile] Companion metadata file created successfully');

        // Always call updatePublicFileIndex - it will add if public, remove if not
        // This ensures the index stays in sync with file visibility
        try {
          await GoogleDriveMetadataService.updatePublicFileIndex(
            this.token,
            metadata.pnIdentifier,
            companionMetadata
          );
          if (companionMetadata.visibility === 'public') {
            console.log('✅ [uploadFile] Public file index updated successfully');
          } else {
            console.log('✅ [uploadFile] File removed from public index (not public)');
          }
        } catch (indexError) {
          console.error('❌ [uploadFile] Failed to update public file index:', indexError);
        }
      } catch (metadataError) {
        console.error('❌ [uploadFile] Failed to create companion metadata file:', metadataError);
        if (metadataError instanceof Error) {
          console.error('❌ [uploadFile] Error message:', metadataError.message);
          console.error('❌ [uploadFile] Error stack:', metadataError.stack);
        }
        // Don't fail the upload if metadata creation fails - file was uploaded successfully
        // But log it clearly so user knows
        console.warn('⚠️ [uploadFile] Upload completed but metadata creation failed - file may not be indexed');
      }
    } else {
      if (!metadata?.pnIdentifier) {
        console.warn('⚠️ [uploadFile] Skipping metadata creation - missing pnIdentifier in metadata:', metadata);
      }
      if (!this.token) {
        console.warn('⚠️ [uploadFile] Skipping metadata creation - no access token available');
      }
    }

    return result;
  }

  /**
   * Generate a thumbnail from an image file
   * Creates a resized version of the image as a base64 data URL
   */
  private async generateImageThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas for thumbnail
          const canvas = document.createElement('canvas');
          const maxWidth = 300;
          const maxHeight = 300;
          
          // Calculate dimensions to maintain aspect ratio
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw resized image
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to data URL
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(thumbnailDataUrl);
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
        
        if (e.target?.result) {
          img.src = e.target.result as string;
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    return await response.blob();
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE'
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
  }

  async getStorageQuota(): Promise<StorageQuota> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.makeRequest(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user'
    );

    if (!response.ok) {
      throw new Error('Failed to fetch storage quota');
    }

    const data = await response.json();
    const quota = data.storageQuota || {};

    return {
      limit: parseInt(quota.limit || '0', 10),
      usage: parseInt(quota.usage || '0', 10),
      usageInDrive: parseInt(quota.usageInDrive || '0', 10),
      usageInDriveTrash: parseInt(quota.usageInDriveTrash || '0', 10)
    };
  }

  async getUserInfo(): Promise<StorageUserInfo> {
    if (!this.token) {
      throw new Error('Not connected to Google Drive');
    }

    // Try to get user info from drive/v3/about first
    try {
      const response = await this.makeRequest(
        'https://www.googleapis.com/drive/v3/about?fields=user'
      );

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          return {
            email: data.user.emailAddress,
            name: data.user.displayName,
            picture: data.user.photoLink
          };
        }
      }
    } catch (e) {
      // Fall through to oauth2 endpoint
    }

    // Fallback to oauth2/userinfo
    try {
      const response = await this.makeRequest(
        'https://www.googleapis.com/oauth2/v2/userinfo'
      );

      if (response.ok) {
        const data = await response.json();
        return {
          email: data.email,
          name: data.name,
          picture: data.picture
        };
      }
    } catch (e) {
      // Use stored email as fallback
    }

    // Final fallback
    return {
      email: this.userEmail || 'unknown@example.com',
      name: undefined,
      picture: undefined
    };
  }
}

