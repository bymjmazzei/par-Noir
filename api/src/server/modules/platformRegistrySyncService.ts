/**
 * Sync platform registry (operator social cloud SoT) → Postgres enforcement cache.
 */

import { getDatabasePool } from '../utils/database';
import { PlatformRegistryStorage } from './platformRegistryStorage';
import { isPlatformRegistryConfigured } from './platformOperatorService';
import { isFirstPartyClient } from './integratorStoragePaths';
import type { PlatformRegistrySyncResult } from './platformRegistryTypes';

const SEEDED_CLIENT_IDS = new Set([
  'browser-app',
  'messaging-app',
  'prism-app',
  'developer-portal',
  'licensing-portal'
]);

let lastSyncResult: PlatformRegistrySyncResult | null = null;
let syncInterval: NodeJS.Timeout | null = null;

export function getLastPlatformRegistrySyncResult(): PlatformRegistrySyncResult | null {
  return lastSyncResult;
}

function isLicenseCurrentlyActive(status: string, expiresAt?: string): boolean {
  if (status !== 'active') return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export class PlatformRegistrySyncService {
  static async syncFromDrive(): Promise<PlatformRegistrySyncResult | null> {
    if (!isPlatformRegistryConfigured()) {
      return null;
    }

    const oauthRows = await PlatformRegistryStorage.listOAuthClients();
    const licenseRows = await PlatformRegistryStorage.listCommercialLicenses();

    const pool = getDatabasePool();
    let oauthClientsUpserted = 0;
    let licensesUpserted = 0;
    let oauthClientsDeactivated = 0;

    for (const row of oauthRows) {
      const isActive = row.status === 'active';
      await pool.query(
        `INSERT INTO oauth_clients (
          client_id, name, description, redirect_uris, scopes, is_active, owner_pn_id,
          verified, commercial_license_id, registry_source, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, 'registry', NOW())
        ON CONFLICT (client_id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          redirect_uris = EXCLUDED.redirect_uris,
          scopes = EXCLUDED.scopes,
          is_active = CASE
            WHEN oauth_clients.registry_source = 'seed' THEN oauth_clients.is_active
            ELSE EXCLUDED.is_active
          END,
          owner_pn_id = EXCLUDED.owner_pn_id,
          verified = EXCLUDED.verified,
          commercial_license_id = EXCLUDED.commercial_license_id,
          registry_source = CASE
            WHEN oauth_clients.registry_source = 'seed' THEN 'seed'
            ELSE 'registry'
          END,
          updated_at = NOW()`,
        [
          row.clientId,
          row.name,
          row.description ?? null,
          JSON.stringify(row.redirectUris),
          JSON.stringify(row.scopes),
          isActive,
          row.ownerPnId || null,
          row.verified,
          row.commercialLicenseId ?? null
        ]
      );
      oauthClientsUpserted += 1;
      if (!isActive && !SEEDED_CLIENT_IDS.has(row.clientId)) {
        oauthClientsDeactivated += 1;
      }
    }

    const registryClientIds = oauthRows.map((r) => r.clientId);
    if (registryClientIds.length > 0) {
      await pool.query(
        `UPDATE oauth_clients SET is_active = false, updated_at = NOW()
         WHERE registry_source = 'registry'
           AND NOT (client_id = ANY($1::text[]))
           AND client_id <> ALL($2::text[])`,
        [registryClientIds, Array.from(SEEDED_CLIENT_IDS)]
      );
    }

    for (const lic of licenseRows) {
      await pool.query(
        `INSERT INTO platform_commercial_licenses (
          license_id, grantee_pn_id, grantee_client_id, tier, license_type, scopes,
          requests_per_minute, requests_per_day, status, issued_at, expires_at, notes, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (license_id) DO UPDATE SET
          grantee_pn_id = EXCLUDED.grantee_pn_id,
          grantee_client_id = EXCLUDED.grantee_client_id,
          tier = EXCLUDED.tier,
          license_type = EXCLUDED.license_type,
          scopes = EXCLUDED.scopes,
          requests_per_minute = EXCLUDED.requests_per_minute,
          requests_per_day = EXCLUDED.requests_per_day,
          status = EXCLUDED.status,
          issued_at = EXCLUDED.issued_at,
          expires_at = EXCLUDED.expires_at,
          notes = EXCLUDED.notes,
          updated_at = EXCLUDED.updated_at`,
        [
          lic.licenseId,
          lic.granteePnId,
          lic.granteeClientId ?? null,
          lic.tier,
          lic.type,
          JSON.stringify(lic.scopes),
          lic.rateLimits.requestsPerMinute,
          lic.rateLimits.requestsPerDay,
          lic.status,
          lic.issuedAt || new Date().toISOString(),
          lic.expiresAt ?? null,
          lic.notes ?? null,
          lic.updatedAt || new Date().toISOString()
        ]
      );
      licensesUpserted += 1;
    }

    const syncedAt = new Date().toISOString();
    const result: PlatformRegistrySyncResult = {
      syncedAt,
      oauthClientsUpserted,
      licensesUpserted,
      oauthClientsDeactivated
    };
    lastSyncResult = result;

    await pool.query(
      `INSERT INTO platform_registry_sync_meta (id, last_sync_at, oauth_clients_upserted, licenses_upserted)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         last_sync_at = EXCLUDED.last_sync_at,
         oauth_clients_upserted = EXCLUDED.oauth_clients_upserted,
         licenses_upserted = EXCLUDED.licenses_upserted`,
      [syncedAt, oauthClientsUpserted, licensesUpserted]
    );

    return result;
  }

  static startPeriodicSync(intervalMs = 5 * 60 * 1000): void {
    if (syncInterval || !isPlatformRegistryConfigured()) return;
    void this.syncFromDrive().catch((err) => {
      console.error('[platformRegistrySync] initial sync failed:', err);
    });
    syncInterval = setInterval(() => {
      void this.syncFromDrive().catch((err) => {
        console.error('[platformRegistrySync] periodic sync failed:', err);
      });
    }, intervalMs);
  }

  static stopPeriodicSync(): void {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }
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
