/**
 * Commercial license checks against the platform registry in Postgres.
 */

import { getDatabasePool } from '../utils/database';
import { isFirstPartyClient } from './integratorStoragePaths';

function isLicenseCurrentlyActive(status: string, expiresAt?: string): boolean {
  if (status !== 'active') return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export class PlatformCommercialLicenseService {
  static readonly FREE_TIER_RPM = 60;
  static readonly FREE_TIER_RPD = 10000;

  static readonly COMMERCIAL_SCOPES = new Set([
    'cloud:app',
    'cloud:read',
    'api_bulk_verification',
    'api_enterprise_endpoints'
  ]);

  static scopesRequireCommercial(scopes: string[]): boolean {
    return scopes.some((s) => {
      if (this.COMMERCIAL_SCOPES.has(s)) return true;
      if (s.startsWith('zkp:') || s.startsWith('data_point:')) return true;
      return false;
    });
  }

  static limitsRequireCommercial(requestsPerMinute?: number, requestsPerDay?: number): boolean {
    const rpm = requestsPerMinute ?? this.FREE_TIER_RPM;
    const rpd = requestsPerDay ?? this.FREE_TIER_RPD;
    return rpm > this.FREE_TIER_RPM || rpd > this.FREE_TIER_RPD;
  }

  static async hasActiveLicenseForPn(granteePnId: string): Promise<boolean> {
    const pool = getDatabasePool();
    const normalized = granteePnId.startsWith('pn-') ? granteePnId : `pn-${granteePnId}`;
    const result = await pool.query(
      `SELECT status, expires_at FROM platform_commercial_licenses
       WHERE grantee_pn_id = $1 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 5`,
      [normalized]
    );
    return result.rows.some((row) =>
      isLicenseCurrentlyActive(String(row.status), row.expires_at ? String(row.expires_at) : undefined)
    );
  }

  static async getActiveLicenseForPn(granteePnId: string) {
    const normalized = granteePnId.startsWith('pn-') ? granteePnId : `pn-${granteePnId}`;
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT * FROM platform_commercial_licenses
       WHERE grantee_pn_id = $1 AND status = 'active'
       ORDER BY updated_at DESC`,
      [normalized]
    );
    for (const row of result.rows) {
      if (isLicenseCurrentlyActive(String(row.status), row.expires_at ? String(row.expires_at) : undefined)) {
        return row;
      }
    }
    return null;
  }

  static async getClientVerified(clientId: string): Promise<boolean> {
    if (isFirstPartyClient(clientId)) {
      return true;
    }
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT verified FROM oauth_clients WHERE client_id = $1`,
      [clientId]
    );
    if (result.rows.length === 0) return false;
    return Boolean(result.rows[0].verified);
  }
}
