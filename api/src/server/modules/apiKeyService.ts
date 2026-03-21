/**
 * API Key Service (Server-side)
 * Validates API keys and manages API access
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';
import { appendAuditEvent } from './auditService';
import { isPnRevokedForNetwork } from './identitySuccessionService';

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
  ownerType?: string;
  rootPnId?: string;
  ownedAssetId?: string;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

function mapApiKeyRow(row: Record<string, unknown>): ApiKeyRecord {
  return {
    id: String(row.id),
    pnId: String(row.pn_id),
    keyHash: String(row.key_hash),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
    activatedAt: row.activated_at ? new Date(String(row.activated_at)).toISOString() : undefined,
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : undefined,
    verificationId: row.verification_id ? String(row.verification_id) : undefined,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    ownerType: row.owner_type ? String(row.owner_type) : 'pn_user',
    rootPnId: row.root_pn_id ? String(row.root_pn_id) : undefined,
    ownedAssetId: row.owned_asset_id ? String(row.owned_asset_id) : undefined,
    rateLimit: {
      requestsPerMinute: Number(row.requests_per_minute) || DEFAULT_REQUESTS_PER_MINUTE,
      requestsPerDay: Number(row.requests_per_day) || DEFAULT_REQUESTS_PER_DAY
    }
  };
}

export class ApiKeyService {
  /**
   * Create a new API key; returns plaintext once (store nowhere after response).
   */
  static async createApiKey(params: {
    pnId: string;
    ownerType?: string;
    scopes?: string[];
    isActive?: boolean;
    requestsPerMinute?: number;
    requestsPerDay?: number;
    /** audit_events.actor_hint — default `admin` */
    auditActorHint?: string;
  }): Promise<{ record: ApiKeyRecord; plaintextKey: string }> {
    const rawBytes = crypto.randomBytes(32);
    const plaintextKey = `pn_${rawBytes.toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');

    const pool = getDatabasePool();
    const scopes = params.scopes?.length ? params.scopes : ['oauth', 'data_points', 'content'];
    const client = await pool.connect();
    let record: ApiKeyRecord;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO api_keys (
        pn_id, owner_type, key_hash, is_active, scopes, requests_per_minute, requests_per_day
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
        [
          params.pnId,
          params.ownerType ?? 'pn_user',
          keyHash,
          params.isActive !== false,
          scopes,
          params.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
          params.requestsPerDay ?? DEFAULT_REQUESTS_PER_DAY
        ]
      );
      record = mapApiKeyRow(result.rows[0] as Record<string, unknown>);
      const { OwnedAssetService } = await import('./ownedAssetService');
      await OwnedAssetService.registerApiKeyAssetWithClient(client, {
        apiKeyId: record.id,
        pnId: params.pnId,
        ownerType: params.ownerType
      });
      const refreshed = await client.query(`SELECT * FROM api_keys WHERE id = $1`, [record.id]);
      record = mapApiKeyRow(refreshed.rows[0] as Record<string, unknown>);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await appendAuditEvent({
      eventType: 'api_key.created',
      actorHint: params.auditActorHint ?? 'admin',
      subjectPnIdentifier: params.pnId,
      metadata: { keyId: record.id }
    });

    return {
      record,
      plaintextKey
    };
  }

  /** Non-secret metadata for keys owned by a pN (developer self-service listing). */
  static async listKeysByPnId(pnId: string): Promise<
    Array<{
      id: string;
      pnId: string;
      scopes: string[];
      isActive: boolean;
      createdAt: string;
      lastUsedAt?: string;
      ownerType?: string;
    }>
  > {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, pn_id, scopes, is_active, created_at, last_used_at, owner_type
       FROM api_keys WHERE pn_id = $1 OR root_pn_id = $1 ORDER BY created_at DESC`,
      [pnId.trim()]
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      pnId: String(row.pn_id),
      scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
      lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : undefined,
      ownerType: row.owner_type ? String(row.owner_type) : undefined
    }));
  }

  /**
   * Validate API key
   */
  static async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    apiKeyData?: ApiKeyRecord;
    error?: string;
  }> {
    try {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT * FROM api_keys WHERE key_hash = $1`,
        [keyHash]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'API key not found' };
      }

      const apiKeyData = mapApiKeyRow(result.rows[0] as Record<string, unknown>);

      if (!apiKeyData.isActive) {
        return { valid: false, error: 'API key is not active' };
      }

      if (isPnRevokedForNetwork(apiKeyData.pnId)) {
        return { valid: false, error: 'API key identity is superseded on the par Noir network' };
      }

      const { OwnedAssetService } = await import('./ownedAssetService');
      const reg = await OwnedAssetService.assertApiKeyRegistryAllows(apiKeyData.id);
      if (!reg.ok) {
        return { valid: false, error: reg.error };
      }

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
