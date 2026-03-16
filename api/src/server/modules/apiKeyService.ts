/**
 * API Key Service (Server-side)
 * Validates API keys and manages API access
 */

import { getDatabasePool } from '../utils/database';

const DEFAULT_REQUESTS_PER_MINUTE = 60;
const DEFAULT_REQUESTS_PER_DAY = 10000;

/** In-memory rate limit state per API key (minute and day windows). */
const rateLimitState = new Map<string, { minuteCount: number; minuteStart: number; dayCount: number; dayStart: number }>();

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
   * Check rate limit for an API key (in-memory sliding window).
   * Uses per-key limits from apiKeyData or defaults.
   */
  static async checkRateLimit(
    apiKeyId: string,
    limits?: { requestsPerMinute: number; requestsPerDay: number }
  ): Promise<{
    allowed: boolean;
    remaining?: number;
    resetAt?: number;
  }> {
    const now = Date.now();
    const perMinute = limits?.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
    const perDay = limits?.requestsPerDay ?? DEFAULT_REQUESTS_PER_DAY;
    const oneMinuteMs = 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    let state = rateLimitState.get(apiKeyId);
    if (!state) {
      state = { minuteCount: 0, minuteStart: now, dayCount: 0, dayStart: now };
      rateLimitState.set(apiKeyId, state);
    }

    if (now - state.minuteStart >= oneMinuteMs) {
      state.minuteCount = 0;
      state.minuteStart = now;
    }
    if (now - state.dayStart >= oneDayMs) {
      state.dayCount = 0;
      state.dayStart = now;
    }

    state.minuteCount += 1;
    state.dayCount += 1;

    const overMinute = state.minuteCount > perMinute;
    const overDay = state.dayCount > perDay;
    const allowed = !overMinute && !overDay;

    const resetAt = overMinute
      ? state.minuteStart + oneMinuteMs
      : overDay
        ? state.dayStart + oneDayMs
        : state.minuteStart + oneMinuteMs;

    const remaining = allowed
      ? Math.min(perMinute - state.minuteCount, perDay - state.dayCount)
      : 0;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetAt
    };
  }
}

