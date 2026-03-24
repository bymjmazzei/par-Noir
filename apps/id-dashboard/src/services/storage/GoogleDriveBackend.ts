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
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';

export class GoogleDriveBackend extends AbstractStorageBackend {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private userEmail: string | null = null;
  private parNoirFolderId: string | null = null;
  private pnFolderCache: Map<string, string> = new Map(); // Cache pN-specific folders
  private keyPrefix: string;
  private connected = false;
  private apiEndpoint: string | null = null;
  private backendId: string;
  private refreshPromise: Promise<string | null> | null = null;
  
  // Load folder cache from localStorage on init
  private loadFolderCache(): void {
    try {
      const cached = localStorage.getItem(`${this.keyPrefix}_folder_cache`);
      if (cached) {
        const cacheData = JSON.parse(cached);
        let validEntries = 0;
        Object.entries(cacheData).forEach(([key, value]) => {
          // Cache will be validated when used - if it's an old identifier, it will be cleared
          // Only cache entries with standardized format (pn-{12-char-hex}) are kept
          if (key.match(/^pn-[a-f0-9]{12}$/)) {
          this.pnFolderCache.set(key, value as string);
          validEntries++;
          } else {
            console.log(`🗑️ [loadFolderCache] Removing old cache entry with non-standard identifier: ${key.substring(0, 20)}...`);
          }
        });
        if (validEntries > 0) {
        console.log(`✅ Loaded ${validEntries} folder ID(s) from cache (will validate on use)`);
        }
        // Save cleaned cache back
        if (validEntries !== Object.keys(cacheData).length) {
          this.saveFolderCache();
        }
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
      localStorage.setItem(`${this.keyPrefix}_folder_cache`, JSON.stringify(cacheData));
      
      // ALSO store the last used folder ID directly (doesn't require pN identifier)
      // This allows us to find the folder even if we can't generate the pN identifier
      if (this.pnFolderCache.size > 0) {
        // Get the most recently set folder ID (or any one)
        const lastFolderId = Array.from(this.pnFolderCache.values())[0];
        localStorage.setItem(`${this.keyPrefix}_last_folder_id`, lastFolderId);
        console.log(`💾 [saveFolderCache] Stored last folder ID: ${lastFolderId.substring(0, 12)}...`);
      }
    } catch (e) {
      console.warn('Failed to save folder cache:', e);
    }
  }

  constructor(config?: Partial<StorageBackendConfig> & { storageKeyPrefix?: string }) {
    const prefix = config?.storageKeyPrefix || 'google_drive';
    super({
      id: config?.id || prefix,
      name: config?.name || 'Google Drive',
      type: 'google_drive',
      ...config
    });
    this.keyPrefix = prefix;
    this.apiEndpoint = config?.apiEndpoint || null;
    this.backendId = config?.id || prefix;
    
    // SECURITY: Do not load tokens from plaintext localStorage
    // Tokens should only be loaded from encrypted storage via loadEncryptedCredentials()
    // when user is authenticated
    try {
      // Do not load from localStorage - prevents exposure of plaintext credentials
      // this.token = localStorage.getItem(`${this.keyPrefix}_token`); // REMOVED - security risk
      // this.userEmail = localStorage.getItem(`${this.keyPrefix}_email`); // REMOVED - security risk
      
      // Load folder cache from localStorage
      this.loadFolderCache();
      
      // ALSO load the last used folder ID (works even without pN identifier)
      try {
        const lastFolderId = localStorage.getItem(`${this.keyPrefix}_last_folder_id`);
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

  async connect(credentials: { token: string; email?: string; refreshToken?: string; sessionId?: string }): Promise<void> {
    this.token = credentials.token;
    this.refreshToken = credentials.refreshToken || null;
    this.userEmail = credentials.email || null;
    
    // SECURITY: Store credentials encrypted, not in plaintext localStorage
    if (credentials.sessionId) {
      try {
        await IntegrationCredentialManager.storeCredentials(
          this.backendId,
          {
            accessToken: credentials.token,
            refreshToken: credentials.refreshToken || undefined,
            email: credentials.email,
            expiresAt: Date.now() + (3600 * 1000) // Default 1 hour expiry
          },
          credentials.sessionId
        );
      } catch (error) {
        console.error('[GoogleDriveBackend] Failed to store encrypted credentials:', error);
        // Fallback: still allow connection but warn
        console.warn('[GoogleDriveBackend] Storing credentials in memory only - will be lost on refresh');
      }
    }
    
    // SECURITY: Remove any existing plaintext credentials
    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
    } catch (e) {
      // Ignore errors
    }
    
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    this.userEmail = null;
    this.parNoirFolderId = null;
    
    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
    } catch (e) {
      // localStorage might not be available
    }
    
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && !!this.token;
  }

  getAccessToken(): string | null {
    return this.token;
  }

  /**
   * Load credentials from encrypted storage (requires authenticated session)
   */
  async loadEncryptedCredentials(sessionId: string): Promise<boolean> {
    try {
      const credentials = await IntegrationCredentialManager.getCredentials(
        this.backendId,
        sessionId
      );
      
      if (credentials && credentials.accessToken) {
        this.token = credentials.accessToken;
        this.refreshToken = credentials.refreshToken || null;
        this.userEmail = credentials.email || null;
        this.connected = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('[GoogleDriveBackend] Failed to load encrypted credentials:', error);
      return false;
    }
  }

  getRefreshToken(): string | null {
    if (this.refreshToken) {
      return this.refreshToken;
    }

    // SECURITY: Do not load from plaintext localStorage
    // Credentials should be loaded via loadEncryptedCredentials() when user is authenticated
      return null;
  }

  getStorageKeyPrefix(): string {
    return this.keyPrefix;
  }

  getEmail(): string | null {
    return this.userEmail;
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
            // SECURITY: Save new token to encrypted storage (if session available)
            // Note: This requires sessionId which should be passed from the caller
            // For now, token is in memory - will be saved on next connect()
            console.log('✅ [GoogleDriveBackend] Token refreshed successfully');
            return false; // Token was refreshed, retry the request
          }
        } catch (refreshError) {
          console.error('❌ [GoogleDriveBackend] Token refresh failed:', refreshError);
        }
      }
      
      // Fix 3: Try 401 recovery via rehydration before disconnecting.
      // FileStorageAggregator registers a recovery handler that fetches fresh tokens from API.
      const attemptRecovery = (globalThis as any).__attemptGoogleDrive401Recovery as ((backendId: string) => Promise<boolean>) | undefined;
      if (typeof attemptRecovery === 'function') {
        try {
          const recovered = await Promise.race([
            attemptRecovery(this.backendId),
            new Promise<boolean>((_, reject) =>
              setTimeout(() => reject(new Error('401 recovery timeout')), 5000)
            ),
          ]);
          if (recovered) {
            console.log('✅ [GoogleDriveBackend] 401 recovered via API rehydration');
            return false; // Caller can retry
          }
        } catch (recoveryErr) {
          console.warn('⚠️ [GoogleDriveBackend] 401 recovery failed:', recoveryErr);
        }
      }

      // If refresh and recovery failed, disconnect and force re-authentication
      this.disconnect();
      window.dispatchEvent(new CustomEvent('google-drive-token-expired', {
        detail: { message: 'Google Drive token expired. Please reconnect.' }
      }));
      return true; // Indicates token error was handled
    }
    return false;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      if (import.meta.env.DEV) {
        console.debug('🔁 [GoogleDriveBackend] Refresh access token', this.apiEndpoint ? 'via API endpoint' : 'directly with Google');
      }

      if (this.apiEndpoint) {
        try {
          const response = await fetch(`${this.apiEndpoint}/api/auth/google-oauth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          });

          const responseText = await response.text();

          if (!response.ok) {
            let errorData: any;
            try {
              errorData = JSON.parse(responseText);
            } catch {
              errorData = { error: responseText };
            }
            throw new Error(
              `API refresh failed: ${response.status} ${response.statusText} - ${errorData.error || responseText}`
            );
          }

          let tokenData: {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
            token_type?: string;
          };

          try {
            tokenData = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error(`Failed to parse refresh response: ${(parseError as Error).message}`);
          }

          if (tokenData.refresh_token) {
            this.refreshToken = tokenData.refresh_token;
            // SECURITY: Do not store refresh token in plaintext localStorage
            // Token will be saved to encrypted storage via FileStorageAggregator event handler
            // or on next connect() call with sessionId
          }

          if (tokenData.access_token) {
            window.dispatchEvent(
              new CustomEvent('google-drive-token-refreshed', {
                detail: {
                  backendId: this.backendId,
                  accessToken: tokenData.access_token,
                  refreshToken: this.refreshToken ?? refreshToken,
                  email: this.userEmail,
                },
              })
            );
          }

          return tokenData.access_token || null;
        } catch (apiError) {
          if (import.meta.env.DEV) {
            console.error('⚠️ [GoogleDriveBackend] Failed to refresh token via API endpoint:', apiError);
          }
        }
      }

      console.error('Failed to refresh token via API endpoint only');
      return null;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
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
        if (import.meta.env.DEV) {
          console.log('🔄 [GoogleDriveBackend] Retrying request after token refresh...');
        }
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

    // Check cache first - but validate it's actually a pN folder with the CORRECT identifier
    if (pnIdentifier && this.pnFolderCache.has(pnIdentifier)) {
      const cachedFolderId = this.pnFolderCache.get(pnIdentifier)!;
      console.log(`🔍 [getOrCreateFolder] Found cached folder ID for pN ${pnIdentifier.substring(0, 8)}...: ${cachedFolderId.substring(0, 12)}...`);
      
      // CRITICAL: Validate the cached folder matches the STANDARDIZED pN identifier
      // The folder name MUST be exactly "par Noir - {pnIdentifier}" where pnIdentifier is the standardized one
      try {
        if (!this.token) {
          // No token - can't validate, but also can't use Google Drive
          console.warn(`⚠️ [getOrCreateFolder] No Google Drive token - cannot validate cache, clearing cache`);
          this.pnFolderCache.delete(pnIdentifier);
          this.saveFolderCache();
          // Continue to search below
        } else {
          const validateResponse = await this.makeRequest(
            `https://www.googleapis.com/drive/v3/files/${cachedFolderId}?fields=id,name,mimeType,parents`
          );
          
          if (validateResponse.ok) {
            const folderInfo = await validateResponse.json();
            const expectedFolderName = `par Noir - ${pnIdentifier}`;
            
            // CRITICAL: Validate folder name matches EXACTLY the standardized identifier
            // Validate: Must be named exactly "par Noir - pn-XXX" where XXX matches the standardized identifier
            const isMetadataFolder = folderInfo.name === '_metadata' || folderInfo.name.includes('_metadata');
            const isExactMatch = folderInfo.name === expectedFolderName;
            const isPNFolder = folderInfo.name.includes('par Noir') && folderInfo.name.includes('pn-');
            
            if (isMetadataFolder || !isPNFolder) {
              console.error(`❌ [getOrCreateFolder] Cached folder is WRONG TYPE! Name: "${folderInfo.name}" - Clearing cache`);
              this.pnFolderCache.delete(pnIdentifier);
              this.saveFolderCache();
              // Continue to search below
            } else if (!isExactMatch) {
              // Folder exists but name doesn't match standardized identifier - clear cache
              console.warn(`⚠️ [getOrCreateFolder] Cached folder name mismatch! Expected: "${expectedFolderName}", Found: "${folderInfo.name}" - Clearing cache`);
              console.warn(`⚠️ [getOrCreateFolder] This indicates the pN identifier changed (standardization) - using new identifier`);
              this.pnFolderCache.delete(pnIdentifier);
              this.saveFolderCache();
              // Continue to search below to find/create folder with correct identifier
            } else {
              console.log(`✅ [getOrCreateFolder] Cached folder validated: "${folderInfo.name}" matches standardized identifier`);
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
    const sanitizedFolderName = folderName.replace(/'/g, "\\'");
    if (pnIdentifier) {
      // For pN folders: search for EXACT name match
      // CRITICAL: folderName is already "par Noir - pn-XXX", search for EXACT match
      // MUST NOT match "_metadata" folder - exclude it explicitly
      searchQuery = `name='${sanitizedFolderName}' and name!='_metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      // CRITICAL: pN folders are at ROOT level, so if it has a parent, it's wrong
      // We can't easily check "no parent" in Google Drive API, so we'll validate the results
      // If parentFolderId is specified (shouldn't happen for pN folders), add parent filter
      if (parentFolderId) {
        searchQuery += ` and '${parentFolderId}' in parents`;
      }
    } else if (parentFolderId) {
      // For metadata folders: search inside parent folder
      searchQuery = `name='${sanitizedFolderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    } else {
      // For base folders: search at root level
      searchQuery = `name='${sanitizedFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
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
          console.error(`❌ [getOrCreateFolder] Expected folder name: "par Noir - ${(pnIdentifier || '').substring(0, 8)}..."`);
          console.error(`❌ [getOrCreateFolder] This may indicate a mismatch between old and new pN identifiers. Clearing cache.`);
          // Clear cache for this identifier to force fresh search next time
          if (pnIdentifier) {
            this.pnFolderCache.delete(pnIdentifier);
            this.saveFolderCache();
          }
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
          const expectedFolderName = pnIdentifier ? `par Noir - ${pnIdentifier}` : 'par Noir';
          const isExactMatch = folderInfo.name === expectedFolderName;
          
          if (!isExactMatch && pnIdentifier) {
            console.warn(`⚠️ [getOrCreateFolder] Folder name mismatch! Expected: "${expectedFolderName}", Found: "${folderInfo.name}"`);
            console.warn(`⚠️ [getOrCreateFolder] This folder may be from an old pN identifier. Will create new folder with correct identifier.`);
            // Don't use this folder - continue to create new one below
            folderId = null;
        } else {
          console.log(`✅ [getOrCreateFolder] Found VALID pN folder: "${folderInfo.name}" (ID: ${folderId.substring(0, 12)}...)`);
          }
          
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
              localStorage.setItem(`${this.keyPrefix}_last_folder_id`, folderId);
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
          localStorage.setItem(`${this.keyPrefix}_last_folder_id`, folderId);
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
    let response: Response;
    try {
      response = await this.makeRequest(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'&fields=files(id,name,modifiedTime,size,mimeType)&pageSize=100&orderBy=modifiedTime desc`
      );
    } catch (error) {
      console.warn(`⚠️ [listFiles] Google Drive request failed for folder ${folderId.substring(0, 12)}...`, error);
      return [];
    }

    if (response.status === 404) {
      console.warn(`⚠️ [listFiles] Folder ${folderId.substring(0, 12)}... not found (404) - treating as empty`);
      return [];
    }

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

    // NEW: Pre-upload content moderation check (Gemini AI)
    try {
      const { geminiModerationService } = await import('../../services/ai/GeminiModerationService');
      const moderationCheck = await geminiModerationService.checkGoogleDriveCompliance(file);
      
      if (!moderationCheck.safe) {
        const reason = moderationCheck.reason || 'Content violates Google Drive policies';
        const violations = moderationCheck.violations?.join(', ') || 'Unknown violations';
        throw new Error(`Content policy violation: ${reason}. Violations: ${violations}`);
      }
      
      console.log('✅ [GoogleDriveBackend] Content moderation check passed');
    } catch (error) {
      // If moderation service fails, check if it's a policy violation or service error
      if (error instanceof Error && error.message.includes('Content policy violation')) {
        // Policy violation - block upload
        throw error;
      }
      // Service error - log warning but allow upload (fail open)
      console.warn('⚠️ [GoogleDriveBackend] Moderation check unavailable, allowing upload:', error);
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
        // pN identifier is secret - not logged
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

        // No thumbnail generation - we'll display the actual file at smaller sizes
        // (same approach as browse.parnoir.com)
        const mimeType = uploadedFile.mimeType || file.type || 'application/octet-stream';

        // NEW: Generate AI metadata using Gemini (tags, description, category)
        let aiGeneratedMetadata: {
          tags?: string[];
          geminiTags?: string[];
          description?: string;
          category?: string;
          contentRating?: 'safe' | 'nsfw' | 'x-rated';
          geminiModel?: string;
        } = {};
        
        try {
          const { geminiModerationService } = await import('../../services/ai/GeminiModerationService');
          const metadataResult = await geminiModerationService.generateMetadata(file);
          
          // Only use AI-generated metadata if user hasn't provided their own
          if (metadataResult.tags.length > 0 && (!metadata.tags || metadata.tags.length === 0)) {
            aiGeneratedMetadata.tags = metadataResult.tags;
          }
          // Always store Gemini tags separately for provenance tracking
          if (metadataResult.geminiTags && metadataResult.geminiTags.length > 0) {
            aiGeneratedMetadata.geminiTags = metadataResult.geminiTags;
          }
          if (metadataResult.description && !metadata.description) {
            aiGeneratedMetadata.description = metadataResult.description;
          }
          if (metadataResult.category && !metadata.category) {
            aiGeneratedMetadata.category = metadataResult.category;
          }
          if (metadataResult.suggestedRating) {
            aiGeneratedMetadata.contentRating = metadataResult.suggestedRating;
          }
          if (metadataResult.model) {
            aiGeneratedMetadata.geminiModel = metadataResult.model;
          }
          
          console.log('✅ [uploadFile] AI-generated metadata:', aiGeneratedMetadata);
        } catch (error) {
          console.warn('⚠️ [uploadFile] Failed to generate AI metadata (non-critical):', error);
          // Continue without AI metadata - user can add manually
        }

        // Extract technical metadata from media files (static/auto-extracted fields)
        let extractedMetadata: any = {};
        try {
          const { extractMediaMetadata, formatDuration } = await import('../../utils/mediaMetadataExtractor');
          const mediaMetadata = await extractMediaMetadata(file);
          
          if (mediaMetadata.width || mediaMetadata.height) {
            extractedMetadata.schema = {
              width: mediaMetadata.width,
              height: mediaMetadata.height,
              encodingFormat: mimeType,
              fileSize: parseInt(uploadedFile.size || file.size.toString() || '0', 10),
              ...(mediaMetadata.duration && { duration: formatDuration(mediaMetadata.duration) }),
              ...(mediaMetadata.frameRate && { frameRate: mediaMetadata.frameRate }),
              ...(mediaMetadata.videoQuality && { videoQuality: mediaMetadata.videoQuality }),
              ...(mediaMetadata.audioSampleRate && { audioSampleRate: mediaMetadata.audioSampleRate })
            };
          } else if (mediaMetadata.duration) {
            // Audio or video with duration only
            extractedMetadata.schema = {
              duration: formatDuration(mediaMetadata.duration),
              encodingFormat: mimeType,
              fileSize: parseInt(uploadedFile.size || file.size.toString() || '0', 10),
              ...(mediaMetadata.frameRate && { frameRate: mediaMetadata.frameRate }),
              ...(mediaMetadata.videoQuality && { videoQuality: mediaMetadata.videoQuality }),
              ...(mediaMetadata.videoWidth && { width: mediaMetadata.videoWidth }),
              ...(mediaMetadata.videoHeight && { height: mediaMetadata.videoHeight }),
              ...(mediaMetadata.audioSampleRate && { audioSampleRate: mediaMetadata.audioSampleRate })
            };
          } else {
            // Non-media file or extraction failed - just store basic metadata
            extractedMetadata.schema = {
              encodingFormat: mimeType,
              fileSize: parseInt(uploadedFile.size || file.size.toString() || '0', 10)
            };
          }
          
          console.log('✅ [uploadFile] Extracted media metadata:', extractedMetadata);
        } catch (error) {
          console.warn('⚠️ [uploadFile] Failed to extract media metadata:', error);
          // Continue with basic metadata
          extractedMetadata.schema = {
            encodingFormat: mimeType,
            fileSize: parseInt(uploadedFile.size || file.size.toString() || '0', 10)
          };
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
               // Merge user-provided tags with AI-generated tags (user takes precedence)
               tags: metadata.tags && metadata.tags.length > 0 
                 ? metadata.tags 
                 : (aiGeneratedMetadata.tags || []),
               // Store Gemini tags separately for provenance tracking
               ...(aiGeneratedMetadata.geminiTags && { geminiTags: aiGeneratedMetadata.geminiTags }),
               // Merge user description with AI-generated description (user takes precedence)
               description: metadata.description || aiGeneratedMetadata.description || undefined,
               // Content rating from AI (if generated)
               contentRating: aiGeneratedMetadata.contentRating || metadata.contentRating || 'safe',
               lastModerationCheck: aiGeneratedMetadata.contentRating ? new Date().toISOString() : undefined,
               autoFlagged: aiGeneratedMetadata.contentRating && aiGeneratedMetadata.contentRating !== 'safe',
               metadata: metadata.metadata || {},
               publicToken: metadata.publicToken || undefined, // Share token generated on upload - available for owner viewing and public sharing
               // No thumbnail - we display the actual file at smaller sizes
               
               // Auto-extracted technical metadata (static, not editable)
               schema: {
                 ...extractedMetadata.schema,
                 // User-editable schema fields (can be overridden)
                 // Use AI-generated category if user hasn't provided one
                 ...(metadata.genre && { genre: Array.isArray(metadata.genre) ? metadata.genre : [metadata.genre] }),
                 ...(metadata.category || aiGeneratedMetadata.category ? { category: metadata.category || aiGeneratedMetadata.category } : {}),
                 ...(metadata.locationCreated && { locationCreated: metadata.locationCreated }),
                 ...(metadata.license && { license: metadata.license }),
                 ...(metadata.inLanguage && { inLanguage: metadata.inLanguage }),
                 ...(metadata.accessibilityFeature && { accessibilityFeature: Array.isArray(metadata.accessibilityFeature) ? metadata.accessibilityFeature : [metadata.accessibilityFeature] })
               },
               
               // Content relationships
               inReplyTo: metadata.inReplyTo || undefined,
               repostOf: metadata.repostOf || undefined,
               isPartOf: metadata.isPartOf || ownerDid || undefined, // Default to creator's curated feed
               
               // Initialize engagement metrics
               engagement: {
                 views: 0,
                 likes: 0,
                 comments: 0,
                 shares: 0,
                 lastUpdated: new Date().toISOString(),
                 engagementHistory: []
               }
             };

        // OPTIMIZATION: Run all metadata operations in parallel
        // These operations are independent and can execute simultaneously
        const [companionResult, ownerIndexResult, publicIndexResult] = await Promise.allSettled([
          GoogleDriveMetadataService.createCompanionMetadataFile(
            this.token,
            metadata.pnIdentifier,
            companionMetadata
          ),
          GoogleDriveMetadataService.updateOwnerFileIndex(
            this.token,
            metadata.pnIdentifier,
            companionMetadata
          ).catch(err => {
            console.warn('⚠️ [uploadFile] Failed to update owner index (non-critical):', err);
            throw err; // Re-throw to mark as rejected in Promise.allSettled
          }),
          GoogleDriveMetadataService.updatePublicFileIndex(
            this.token,
            metadata.pnIdentifier,
            companionMetadata
          )
        ]);

        // Log results
        if (companionResult.status === 'fulfilled') {
          console.log('✅ [uploadFile] Companion metadata file created successfully');
        } else {
          console.error('❌ [uploadFile] Failed to create companion metadata file:', companionResult.reason);
        }

        if (ownerIndexResult.status === 'fulfilled') {
          console.log('✅ [uploadFile] Owner file index updated successfully');
        }

        if (publicIndexResult.status === 'fulfilled') {
          if (companionMetadata.visibility === 'public') {
            console.log('✅ [uploadFile] Public file index updated successfully');
          } else {
            console.log('✅ [uploadFile] File removed from public index (not public)');
          }
        } else {
          console.error('❌ [uploadFile] Failed to update public file index:', publicIndexResult.reason);
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

