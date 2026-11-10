/**
 * Platform registry: developer applications, OAuth clients and commercial
 * licenses. Server-owned records, kept in Postgres.
 */

import { normalizePermissionManifest } from '@par-noir/standard-data-points';
import { getDatabasePool } from '../utils/database';
import { isFirstPartyClient } from './integratorStoragePaths';
import { getThirdPartyIndexersService } from './thirdPartyIndexersService';
import type {
  OAuthClientRegistryStatus,
  PlatformApplication,
  PlatformCommercialLicense,
  PlatformOAuthClientRow
} from './platformRegistryTypes';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function clientFromRow(row: Record<string, any>): PlatformOAuthClientRow {
  const status: OAuthClientRegistryStatus =
    row.registry_status === 'suspended' || row.registry_status === 'revoked'
      ? row.registry_status
      : row.is_active
        ? 'active'
        : 'suspended';
  return {
    clientId: row.client_id,
    name: row.name,
    description: row.description ?? undefined,
    redirectUris: jsonArray(row.redirect_uris),
    scopes: jsonArray(row.scopes),
    permissionManifest: row.permission_manifest ?? undefined,
    ownerPnId: row.owner_pn_id ?? '',
    status,
    verified: Boolean(row.verified),
    commercialLicenseId: row.commercial_license_id ?? undefined,
    approvedAt: iso(row.approved_at),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    notes: row.registry_notes ?? undefined
  };
}

function licenseFromRow(row: Record<string, any>): PlatformCommercialLicense {
  return {
    licenseId: row.license_id,
    granteePnId: row.grantee_pn_id,
    granteeClientId: row.grantee_client_id ?? undefined,
    tier: row.tier === 'free' ? 'free' : 'commercial',
    type: row.license_type === 'perpetual' ? 'perpetual' : 'annual',
    scopes: jsonArray(row.scopes),
    rateLimits: { requestsPerMinute: Number(row.requests_per_minute), requestsPerDay: Number(row.requests_per_day) },
    status: row.status,
    issuedAt: iso(row.issued_at) ?? new Date().toISOString(),
    expiresAt: iso(row.expires_at),
    notes: row.notes ?? undefined,
    updatedAt: iso(row.updated_at) ?? new Date().toISOString()
  };
}

async function saveApplication(application: PlatformApplication): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO platform_applications (application_id, client_id, owner_pn_id, status, application, submitted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (application_id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       owner_pn_id = EXCLUDED.owner_pn_id,
       status = EXCLUDED.status,
       application = EXCLUDED.application,
       updated_at = NOW()`,
    [
      application.applicationId,
      application.clientId,
      normalizePn(application.ownerPnId),
      application.status,
      JSON.stringify(application),
      application.submittedAt || new Date().toISOString()
    ]
  );
}

export class PlatformRegistryStorage {
  static async listApplications(filter?: { ownerPnId?: string }): Promise<PlatformApplication[]> {
    const pool = getDatabasePool();
    const result = filter?.ownerPnId
      ? await pool.query(
          `SELECT application FROM platform_applications WHERE owner_pn_id = $1 ORDER BY submitted_at DESC`,
          [normalizePn(filter.ownerPnId)]
        )
      : await pool.query(`SELECT application FROM platform_applications ORDER BY submitted_at DESC`);
    return result.rows.map((r) => r.application as PlatformApplication);
  }

  static async appendApplication(application: PlatformApplication): Promise<void> {
    await saveApplication(application);
  }

  static async updateApplication(applicationId: string, patch: Partial<PlatformApplication>): Promise<void> {
    const existing = await this.getApplicationById(applicationId);
    if (!existing) throw new Error('Application not found');
    await saveApplication({ ...existing, ...patch, applicationId });
  }

  static async getApplicationById(applicationId: string): Promise<PlatformApplication | null> {
    const result = await getDatabasePool().query(
      `SELECT application FROM platform_applications WHERE application_id = $1`,
      [applicationId]
    );
    return (result.rows[0]?.application as PlatformApplication | undefined) ?? null;
  }

  static async clientIdTaken(clientId: string): Promise<boolean> {
    const result = await getDatabasePool().query(
      `SELECT 1 FROM oauth_clients WHERE client_id = $1
       UNION ALL SELECT 1 FROM platform_applications WHERE client_id = $1
       LIMIT 1`,
      [clientId]
    );
    return result.rows.length > 0;
  }

  /** Clients the operator approved; seeded first-party clients are not listed. */
  static async listOAuthClients(): Promise<PlatformOAuthClientRow[]> {
    const result = await getDatabasePool().query(
      `SELECT * FROM oauth_clients WHERE registry_source = 'registry' ORDER BY updated_at DESC`
    );
    return result.rows.map(clientFromRow);
  }

  static async upsertOAuthClient(row: PlatformOAuthClientRow): Promise<void> {
    const isActive = row.status === 'active';
    const permissionManifest = normalizePermissionManifest(row.permissionManifest, row.scopes);
    await getDatabasePool().query(
      `INSERT INTO oauth_clients (
        client_id, name, description, redirect_uris, scopes, permission_manifest, is_active, owner_pn_id,
        verified, commercial_license_id, registry_source, registry_status, approved_at, registry_notes, updated_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, 'registry', $11, $12, $13, NOW())
      ON CONFLICT (client_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        redirect_uris = EXCLUDED.redirect_uris,
        scopes = EXCLUDED.scopes,
        permission_manifest = EXCLUDED.permission_manifest,
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
        registry_status = EXCLUDED.registry_status,
        approved_at = COALESCE(EXCLUDED.approved_at, oauth_clients.approved_at),
        registry_notes = EXCLUDED.registry_notes,
        updated_at = NOW()`,
      [
        row.clientId,
        row.name,
        row.description ?? null,
        JSON.stringify(row.redirectUris),
        JSON.stringify(row.scopes),
        JSON.stringify(permissionManifest),
        isActive,
        row.ownerPnId || null,
        row.verified,
        row.commercialLicenseId ?? null,
        row.status,
        row.approvedAt ?? null,
        row.notes ?? null
      ]
    );
    if (isActive && !isFirstPartyClient(row.clientId)) {
      await getThirdPartyIndexersService().upsertIndexerFromOAuthClient({
        clientId: row.clientId,
        name: row.name,
        description: row.description,
        status: 'active'
      });
    }
  }

  static async listCommercialLicenses(): Promise<PlatformCommercialLicense[]> {
    const result = await getDatabasePool().query(
      `SELECT * FROM platform_commercial_licenses ORDER BY updated_at DESC`
    );
    return result.rows.map(licenseFromRow);
  }

  static async upsertCommercialLicense(lic: PlatformCommercialLicense): Promise<void> {
    await getDatabasePool().query(
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
  }
}
