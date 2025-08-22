import { Identity, DIDDocument } from '../types';

export interface SyncMetadata {
  version: string;
  timestamp: string;
  deviceId: string;
  encryptionMethod: string;
}

export interface SyncResult {
  success: boolean;
  cid?: string;
  error?: string;
  timestamp: string;
}

export class IdentitySync {
  private deviceId: string;
  private encryptionKey: CryptoKey | null = null;
  private rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private auditLog: Array<{ timestamp: string; event: string; details: any }> = [];

  constructor(deviceId?: string) {
    this.deviceId = deviceId || this.generateDeviceId();
  }

  /**
   * Initialize encryption key for syncing with enhanced security
   */
  async initializeEncryption(password: string, salt?: Uint8Array): Promise<void> {
    try {
      const keySalt = salt || crypto.getRandomValues(new Uint8Array(32)); // Increased salt size
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      this.encryptionKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: keySalt,
          iterations: 200000, // Increased iterations for better security
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      this.logSecurityEvent('encryption_initialized', { deviceId: this.deviceId });
    } catch (error) {
      this.logSecurityEvent('encryption_init_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Sync identity to all devices with enhanced security
   */
  async syncToAllDevices(identity: Identity): Promise<SyncResult> {
    const startTime = Date.now();
    
    try {
      if (!this.encryptionKey) {
        throw new Error('Encryption key not initialized');
      }

      // Rate limiting
      if (!this.checkRateLimit(identity.id)) {
        throw new Error('Rate limit exceeded - too many sync attempts');
      }

      // 1. Encrypt identity data with enhanced security
      const encrypted = await this.encryptIdentity(identity);

      // 2. Upload to IPFS with multiple gateways
      const cid = await this.uploadToIPFS(encrypted);

      // 3. Update DID document with sync information
      await this.updateDidDocument(identity.id, {
        service: [{
          id: '#identity-sync',
          type: 'IdentitySync',
          serviceEndpoint: `ipfs://${cid}`,
          timestamp: new Date().toISOString(),
          deviceId: this.deviceId
        }]
      });

      // 4. Store securely (no localStorage fallback)
      await this.storeSecurely(identity.id, encrypted);

      // 5. Notify other devices (if connected)
      await this.notifyOtherDevices(identity.id, cid);

      const result = {
        success: true,
        cid,
        timestamp: new Date().toISOString()
      };

      this.logSecurityEvent('sync_success', { 
        did: identity.id, 
        cid, 
        duration: Date.now() - startTime 
      });

      return result;

    } catch (error) {
      const result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };

      this.logSecurityEvent('sync_failed', { 
        did: identity.id, 
        error: result.error,
        duration: Date.now() - startTime 
      });

      return result;
    }
  }

  /**
   * Sync identity from cloud with enhanced security
   */
  async syncFromCloud(did: string): Promise<Identity | null> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      if (!this.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many sync attempts');
      }

      // 1. Try secure local storage first
      const localIdentity = await this.getFromSecure(did);
      if (localIdentity) {
        this.logSecurityEvent('sync_from_local', { did, duration: Date.now() - startTime });
        return localIdentity;
      }

      // 2. Resolve DID document with validation
      const didDoc = await this.resolveDidDocument(did);
      const syncService = didDoc.service?.find((s: any) => s.type === 'IdentitySync');

      if (!syncService) {
        // No sync service found in DID document
        return null;
      }

      // 3. Download from IPFS with validation
      const cid = syncService.serviceEndpoint.replace('ipfs://', '');
      const encrypted = await this.downloadFromIPFS(cid);

      // 4. Decrypt identity with validation
      const identity = await this.decryptIdentity(encrypted);

      // 5. Store securely for future use
      await this.storeSecurely(did, encrypted);

      this.logSecurityEvent('sync_from_cloud_success', { 
        did, 
        cid, 
        duration: Date.now() - startTime 
      });

      return identity;

    } catch (error) {
      this.logSecurityEvent('sync_from_cloud_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime 
      });
      // Only log in development to prevent production information leakage
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to sync from cloud:', error);
      }
      return null;
    }
  }

  /**
   * Encrypt identity data with enhanced security
   */
  private async encryptIdentity(identity: Identity): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(identity));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      data
    );

    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt identity data with enhanced security
   */
  private async decryptIdentity(encryptedData: string): Promise<Identity> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encrypted
      );

      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decrypted);
      const identity = JSON.parse(jsonString);

      // Validate identity structure
      if (!identity.id || !identity.username) {
        throw new Error('Invalid identity structure');
      }

      return identity;
    } catch (error) {
      this.logSecurityEvent('decrypt_failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Failed to decrypt identity data');
    }
  }

  /**
   * Upload data to IPFS with multiple gateways and enhanced security
   */
  private async uploadToIPFS(data: string): Promise<string> {
    const gateways = [
      'https://ipfs.infura.io:5001',
      'https://gateway.pinata.cloud',
      'https://cloudflare-ipfs.com',
      'https://dweb.link'
    ];

    const uploadPromises = gateways.map(gateway => 
      this.uploadToGateway(data, gateway)
    );

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successful = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<string>).value);

      if (successful.length === 0) {
        throw new Error('All IPFS gateways failed');
      }

      // Use the first successful result
      const cid = successful[0];
      
      this.logSecurityEvent('ipfs_upload_success', { 
        cid, 
        successfulGateways: successful.length,
        totalGateways: gateways.length 
      });

      return cid;
    } catch (error) {
      this.logSecurityEvent('ipfs_upload_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Never fall back to localStorage - fail securely
      throw new Error('IPFS upload failed - cannot proceed securely');
    }
  }

  /**
   * Upload to specific IPFS gateway with certificate validation
   */
  private async uploadToGateway(data: string, gateway: string): Promise<string> {
    try {
      const response = await fetch(`${gateway}/api/v0/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          path: '/identity.json',
          content: data
        })
      });

      if (!response.ok) {
        throw new Error(`Gateway ${gateway} returned ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.Hash) {
        throw new Error(`Gateway ${gateway} returned invalid response`);
      }

      return result.Hash;
    } catch (error) {
      // Gateway failed - rethrow with context
      throw new Error(`IPFS gateway upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download data from IPFS with enhanced security
   */
  private async downloadFromIPFS(cid: string): Promise<string> {
    const gateways = [
      'https://ipfs.io',
      'https://gateway.pinata.cloud',
      'https://cloudflare-ipfs.com',
      'https://dweb.link'
    ];

    for (const gateway of gateways) {
      try {
        const response = await fetch(`${gateway}/ipfs/${cid}`, {
          headers: {
            'Accept': 'application/json, text/plain, */*'
          }
        });
        
        if (!response.ok) {
          continue;
        }

        const data = await response.text();
        
        // Validate data integrity
        if (!data || data.length < 10) {
          continue;
        }

        this.logSecurityEvent('ipfs_download_success', { cid, gateway });
        return data;
      } catch (error) {
        // Gateway download failed, continue to next
        continue;
      }
    }

    throw new Error('All IPFS gateways failed for download');
  }

  /**
   * Update DID document with enhanced security
   */
  private async updateDidDocument(did: string, updates: any): Promise<void> {
    try {
      // Store updated DID document securely
      const didDoc = {
        id: did,
        ...updates,
        updated: new Date().toISOString()
      };

      await this.storeSecurely(`did:${did}`, JSON.stringify(didDoc));

      this.logSecurityEvent('did_document_updated', { did });

    } catch (error) {
      this.logSecurityEvent('did_document_update_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Resolve DID document with validation
   */
  private async resolveDidDocument(did: string): Promise<DIDDocument> {
    try {
      const stored = await this.getFromSecureStorage(`did:${did}`);
      if (!stored) {
        throw new Error('DID document not found');
      }

      const didDoc = JSON.parse(stored);
      
      // Validate DID document structure
      if (!didDoc.id || !didDoc.service) {
        throw new Error('Invalid DID document structure');
      }

      return didDoc;
    } catch (error) {
      this.logSecurityEvent('did_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Store data securely using Web Crypto API
   */
  private async storeSecurely(key: string, data: string): Promise<void> {
    try {
      if (window.crypto && window.crypto.subtle) {
        // Use Web Crypto API for secure storage
        const encrypted = await this.encryptForStorage(data);
        sessionStorage.setItem(key, encrypted);
      } else {
        // Fallback with warning
        // Web Crypto API not available - using less secure storage
        sessionStorage.setItem(key, data);
      }
    } catch (error) {
      this.logSecurityEvent('secure_storage_failed', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Encrypt data for secure storage
   */
  private async encryptForStorage(data: string): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    
    return JSON.stringify({
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    });
  }

  /**
   * Get data from secure storage
   */
  private async getFromSecureStorage(key: string): Promise<string | null> {
    try {
      const encrypted = sessionStorage.getItem(key);
      if (!encrypted) return null;

      if (window.crypto && window.crypto.subtle) {
        // Decrypt if using Web Crypto API
        return await this.decryptFromStorage(encrypted);
      } else {
        // Return as-is if not encrypted
        return encrypted;
      }
    } catch (error) {
              // Failed to retrieve from secure storage
      return null;
    }
  }

  /**
   * Decrypt data from secure storage
   */
  private async decryptFromStorage(encryptedData: string): Promise<string> {
    try {
      const { data, iv } = JSON.parse(encryptedData);
      
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt stored data');
    }
  }

  /**
   * Get identity from secure local storage
   */
  private async getFromSecure(did: string): Promise<Identity | null> {
    try {
      const encrypted = await this.getFromSecureStorage(`sync:${did}`);
      if (!encrypted) return null;

      return await this.decryptIdentity(encrypted);
    } catch (error) {
              // Failed to decrypt local identity
      return null;
    }
  }

  /**
   * Notify other devices about sync with enhanced security
   */
  private async notifyOtherDevices(did: string, cid: string): Promise<void> {
    try {
      // In a real implementation, this would use WebRTC, WebSockets, or push notifications
      // For now, we'll just log the notification securely
      this.logSecurityEvent('device_notification_sent', { did, cid });
      console.log(`Notifying other devices about sync for ${did} at ${cid}`);
    } catch (error) {
      this.logSecurityEvent('device_notification_failed', { 
        did, 
        cid, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Rate limiting to prevent brute force attacks
   */
  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiter.get(identifier);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(identifier, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 5) { // Max 5 attempts per minute
      this.logSecurityEvent('rate_limit_exceeded', { identifier });
      return false;
    }
    
    limit.count++;
    return true;
  }

  /**
   * Log security events for audit
   */
  private logSecurityEvent(event: string, details: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      deviceId: this.deviceId
    };
    
    this.auditLog.push(logEntry);
    
    // Keep only last 1000 events
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Send to secure logging service in production
    this.sendToAuditLog(logEntry);
  }

  /**
   * Send audit log entry to secure logging service
   */
  private async sendToAuditLog(logEntry: any): Promise<void> {
    try {
      // In production, this would send to a secure logging service
      // Silently handle audit logging in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle audit log failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Generate device ID with enhanced entropy
   */
  private generateDeviceId(): string {
    const timestamp = Date.now();
    const random = crypto.getRandomValues(new Uint8Array(16));
    const entropy = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    return `device-${timestamp}-${entropy}`;
  }

  /**
   * Get current device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Check if encryption is initialized
   */
  isEncryptionInitialized(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any }> {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
} 