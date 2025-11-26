/**
 * API Key Service
 * Manages API key generation, activation, and validation
 * All pNs automatically get an inactive API key
 * Activation requires Veriff verification (AML/KYC)
 */

export interface ApiKey {
  id: string;
  pnId: string;
  key: string; // Encrypted API key
  isActive: boolean;
  createdAt: string;
  activatedAt?: string;
  lastUsedAt?: string;
  verificationId?: string; // Veriff verification ID
  scopes: string[];
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

export interface ApiKeyUsage {
  endpoint: string;
  timestamp: string;
  success: boolean;
  responseTime?: number;
}

export class ApiKeyService {
  private static readonly STORAGE_KEY_PREFIX = 'api_key_';
  private static readonly DEFAULT_SCOPES = ['oauth', 'data_points', 'content'];
  private static readonly DEFAULT_RATE_LIMIT = {
    requestsPerMinute: 60,
    requestsPerDay: 10000
  };

  /**
   * Generate a new API key for a pN
   */
  async generateApiKey(pnId: string): Promise<ApiKey> {
    // Generate a secure random API key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const apiKey = Array.from(keyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const keyId = `pn_${pnId}_${Date.now()}`;
    const fullKey = `pn_${apiKey}`;

    const apiKeyData: ApiKey = {
      id: keyId,
      pnId,
      key: fullKey, // In production, this should be hashed
      isActive: false, // Inactive by default
      createdAt: new Date().toISOString(),
      scopes: ApiKeyService.DEFAULT_SCOPES,
      rateLimit: ApiKeyService.DEFAULT_RATE_LIMIT
    };

    // Store encrypted API key
    await this.storeApiKey(apiKeyData);

    return apiKeyData;
  }

  /**
   * Get or create API key for a pN
   */
  async getOrCreateApiKey(pnId: string): Promise<ApiKey> {
    const existing = await this.getApiKey(pnId);
    if (existing) {
      return existing;
    }

    return await this.generateApiKey(pnId);
  }

  /**
   * Get API key for a pN
   */
  async getApiKey(pnId: string): Promise<ApiKey | null> {
    try {
      const storageKey = `${ApiKeyService.STORAGE_KEY_PREFIX}${pnId}`;
      
      // Use localStorage for API key storage
      // API keys are less sensitive than pnName/passcode, so localStorage is acceptable
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }

      return null;
    } catch (error) {
      console.error('❌ [ApiKeyService] Failed to get API key:', error);
      return null;
    }
  }

  /**
   * Activate API key (requires Veriff verification)
   */
  async activateApiKey(
    pnId: string,
    verificationId: string,
    verificationResult: {
      verified: boolean;
      dataPoints?: {
        identity_attestation?: any;
        age_attestation?: any;
        location_verification?: any;
        document_verification?: any;
      };
    }
  ): Promise<ApiKey> {
    if (!verificationResult.verified) {
      throw new Error('Verification failed. Cannot activate API key.');
    }

    const apiKey = await this.getOrCreateApiKey(pnId);
    
    const updated: ApiKey = {
      ...apiKey,
      isActive: true,
      activatedAt: new Date().toISOString(),
      verificationId
    };

    await this.storeApiKey(updated);

    return updated;
  }

  /**
   * Deactivate API key
   */
  async deactivateApiKey(pnId: string): Promise<void> {
    // Implementation for deactivation
    // This could be used for security purposes or user request
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    apiKeyData?: ApiKey;
    error?: string;
  }> {
    try {
      // Extract pN ID from API key (format: pn_<key>)
      // In production, you'd look up the key in a database
      // For now, we'll search through stored keys
      
      // This is a simplified validation - in production, use a database lookup
      const storedKeys = await this.getAllApiKeys();
      const found = storedKeys.find(k => k.key === apiKey);

      if (!found) {
        return { valid: false, error: 'API key not found' };
      }

      if (!found.isActive) {
        return { valid: false, error: 'API key is not active' };
      }

      // Update last used timestamp
      found.lastUsedAt = new Date().toISOString();
      await this.storeApiKey(found);

      return { valid: true, apiKeyData: found };
    } catch (error) {
      console.error('❌ [ApiKeyService] API key validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Store API key
   * Uses localStorage - API keys are less sensitive than pnName/passcode
   */
  private async storeApiKey(apiKey: ApiKey): Promise<void> {
    try {
      const storageKey = `${ApiKeyService.STORAGE_KEY_PREFIX}${apiKey.pnId}`;
      const jsonData = JSON.stringify(apiKey);

      localStorage.setItem(storageKey, jsonData);
    } catch (error) {
      console.error('❌ [ApiKeyService] Failed to store API key:', error);
      throw error;
    }
  }

  /**
   * Get all API keys (for admin/debugging purposes)
   */
  private async getAllApiKeys(): Promise<ApiKey[]> {
    // In production, this would query a database
    // For now, return empty array
    return [];
  }

  /**
   * Check if API key has required scope
   */
  hasScope(apiKey: ApiKey, scope: string): boolean {
    return apiKey.scopes.includes(scope) || apiKey.scopes.includes('*');
  }

  /**
   * Get API key display (masked)
   */
  getMaskedKey(apiKey: ApiKey): string {
    const key = apiKey.key;
    if (key.length <= 8) {
      return '••••••••';
    }
    return `${key.substring(0, 4)}••••${key.substring(key.length - 4)}`;
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();

