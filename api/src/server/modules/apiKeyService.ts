/**
 * API Key Service (Server-side)
 * Validates API keys and manages API access
 */

import { getDatabasePool } from '../utils/database';

export interface ApiKeyRecord {
  id: string;
  pnId: string;
  keyHash: string; // Hashed API key (never store plaintext)
  isActive: boolean;
  createdAt: string;
  activatedAt?: string;
  lastUsedAt?: string;
  verificationId?: string;
  scopes: string[];
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

export class ApiKeyService {
  /**
   * Validate API key
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    apiKeyData?: ApiKeyRecord;
    error?: string;
  }> {
    try {
      // Hash the API key for lookup
      const crypto = await import('crypto');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM api_keys WHERE key_hash = $1`,
        [keyHash]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'API key not found' };
      }

      const apiKeyData = result.rows[0] as ApiKeyRecord;

      if (!apiKeyData.isActive) {
        return { valid: false, error: 'API key is not active' };
      }

      // Update last used timestamp
      await pool.query(
        `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
        [apiKeyData.id]
      );

      return { valid: true, apiKeyData };
    } catch (error) {
      console.error('[ApiKeyService] Validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Check if API key has required scope
   */
  static hasScope(apiKeyData: ApiKeyRecord, scope: string): boolean {
    return apiKeyData.scopes.includes(scope) || apiKeyData.scopes.includes('*');
  }

  /**
   * Check rate limit
   */
  static async checkRateLimit(apiKeyId: string): Promise<{
    allowed: boolean;
    remaining?: number;
    resetAt?: number;
  }> {
    // TODO: Implement rate limiting logic
    // For now, allow all requests
    return { allowed: true };
  }
}

