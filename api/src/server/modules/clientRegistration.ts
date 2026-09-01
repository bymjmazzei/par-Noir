/**
 * OAuth Client Registration Service
 * Persists registered OAuth clients in PostgreSQL (see migrations/add_oauth_clients_api_keys.sql).
 */

import bcrypt from 'bcryptjs';
import {
  BROWSER_APP_CLIENT_ID,
  CLIENT_CONTRACTS,
  MESSAGING_APP_CLIENT_ID,
  type IntegratorPermissionManifest,
  normalizePermissionManifest,
  validatePermissionManifest
} from '@par-noir/standard-data-points';

export interface OAuthClient {
  clientId: string;
  /** Never returned from DB reads; only used when registering with a new secret */
  clientSecret?: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes?: string[];
  permissionManifest?: IntegratorPermissionManifest;
  /** Set when registered via developer portal (self-service) */
  ownerPnId?: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

function rowToClient(row: Record<string, unknown>): OAuthClient {
  const redirectUris = row.redirect_uris as string[] | unknown;
  const scopes = row.scopes as string[] | unknown;
  const ownerRaw = row.owner_pn_id;
  const manifestRaw = row.permission_manifest;
  const scopeList = Array.isArray(scopes) && scopes.length > 0 ? scopes : [];
  return {
    clientId: row.client_id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    redirectUris: Array.isArray(redirectUris) ? redirectUris : [],
    scopes: scopeList,
    permissionManifest: normalizePermissionManifest(manifestRaw, scopeList),
    ownerPnId: ownerRaw != null && String(ownerRaw).length > 0 ? String(ownerRaw) : undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    isActive: Boolean(row.is_active)
  };
}

export class ClientRegistrationService {
  /**
   * Seed built-in clients. Runs on every boot and upserts scopes, so first-party
   * scopes are sourced from the shared client contracts to stop the DB drifting
   * from what the apps actually request.
   */
  static async ensureDefaultClientsSeeded(): Promise<void> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();

    const defaults: Array<{
      clientId: string;
      name: string;
      description: string;
      redirectUris: string[];
      scopes: string[];
    }> = [
      {
        clientId: BROWSER_APP_CLIENT_ID,
        name: CLIENT_CONTRACTS[BROWSER_APP_CLIENT_ID].name,
        description: CLIENT_CONTRACTS[BROWSER_APP_CLIENT_ID].description,
        redirectUris: [
          'https://browse.parnoir.com/oauth-callback.html',
          'https://browse.parnoir.com/',
          'https://browse-parnoir.web.app/oauth-callback.html',
          'https://browse-parnoir.web.app/',
          'https://pn.parnoir.com/oauth-callback.html',
          'https://pn.parnoir.com/pn-oauth-callback.html',
          'https://pn.parnoir.com/',
          'https://par-noir-dashboard.web.app/oauth-callback.html',
          'https://par-noir-dashboard.web.app/pn-oauth-callback.html',
          'https://par-noir-dashboard.web.app/',
          'https://localhost/oauth-callback.html',
          'https://localhost/pn-oauth-callback.html',
          'https://localhost/',
          'http://localhost:3000/oauth-callback.html',
          'http://localhost:3000/pn-oauth-callback.html',
          'http://localhost:3000/',
          'http://localhost:5173/oauth-callback.html',
          'http://localhost:5173/pn-oauth-callback.html',
          'http://localhost:5173/',
          'http://localhost:3001/oauth-callback.html',
          'http://localhost:3001/pn-oauth-callback.html',
          'http://localhost:3001/',
          'http://127.0.0.1:3001/pn-oauth-callback.html',
          'http://127.0.0.1:3001/'
        ],
        scopes: [...CLIENT_CONTRACTS[BROWSER_APP_CLIENT_ID].scopes]
      },
      {
        clientId: MESSAGING_APP_CLIENT_ID,
        name: CLIENT_CONTRACTS[MESSAGING_APP_CLIENT_ID].name,
        description: CLIENT_CONTRACTS[MESSAGING_APP_CLIENT_ID].description,
        redirectUris: [
          'https://messaging.parnoir.com/oauth-callback.html',
          'https://messaging.parnoir.com/',
          'https://messaging-parnoir.web.app/oauth-callback.html',
          'https://messaging-parnoir.web.app/',
          'http://localhost:3001/oauth-callback.html',
          'http://localhost:3001/',
          'http://127.0.0.1:3001/oauth-callback.html',
          'http://127.0.0.1:3001/'
        ],
        scopes: [...CLIENT_CONTRACTS[MESSAGING_APP_CLIENT_ID].scopes]
      },
      {
        clientId: 'prism-app',
        name: 'par Noir Prism',
        description: 'Prism auditor program for DMCA content review',
        redirectUris: [
          'https://prism.parnoir.com/oauth-callback.html',
          'https://prism.parnoir.com/',
          'https://prism-parnoir.web.app/oauth-callback.html',
          'https://prism-parnoir.web.app/',
          'https://localhost/oauth-callback.html',
          'https://localhost/',
          'http://localhost:5174/oauth-callback.html',
          'http://localhost:5174/'
        ],
        scopes: ['openid', 'profile']
      },
      {
        clientId: 'developer-portal',
        name: 'par Noir Developer console',
        description: 'Sign in to create API keys and register OAuth apps for your integrations',
        redirectUris: [
          'https://developers.parnoir.com/oauth-callback.html',
          'https://developers-parnoir.web.app/oauth-callback.html',
          'http://localhost:5176/oauth-callback.html',
          'http://127.0.0.1:5176/oauth-callback.html'
        ],
        scopes: ['openid', 'profile']
      },
      {
        clientId: 'licensing-portal',
        name: 'par Noir Licensing',
        description: 'Rights-holder track library for the licensed music registry',
        redirectUris: [
          'https://licensing.parnoir.com/oauth-callback.html',
          'https://licensing.parnoir.com/',
          'https://licensing-parnoir.web.app/oauth-callback.html',
          'https://licensing-parnoir.web.app/',
          'http://localhost:5175/oauth-callback.html',
          'http://127.0.0.1:5175/oauth-callback.html'
        ],
        scopes: ['openid', 'profile', 'zkp:age_attestation']
      }
    ];

    for (const d of defaults) {
      await pool.query(
        `INSERT INTO oauth_clients (client_id, name, description, redirect_uris, scopes, is_active, verified, registry_source, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true, true, 'seed', NOW())
         ON CONFLICT (client_id) DO UPDATE SET
           redirect_uris = EXCLUDED.redirect_uris,
           scopes = EXCLUDED.scopes,
           registry_source = 'seed',
           verified = true,
           updated_at = NOW()`,
        [d.clientId, d.name, d.description, JSON.stringify(d.redirectUris), JSON.stringify(d.scopes)]
      );
    }
  }

  static async registerClient(
    client: Omit<OAuthClient, 'createdAt' | 'updatedAt'>
  ): Promise<OAuthClient> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();

    let clientSecretHash: string | null = null;
    if (client.clientSecret && client.clientSecret.length > 0) {
      clientSecretHash = await bcrypt.hash(client.clientSecret, 12);
    }

    const ownerPnId = client.ownerPnId?.trim() || null;
    const scopes =
      Array.isArray(client.scopes) && client.scopes.length > 0
        ? client.scopes
        : ['openid', 'profile'];
    const permissionManifest = JSON.stringify(
      normalizePermissionManifest(client.permissionManifest, scopes)
    );

    const result = await pool.query(
      `INSERT INTO oauth_clients (client_id, name, description, redirect_uris, scopes, permission_manifest, client_secret_hash, is_active, owner_pn_id)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [
        client.clientId,
        client.name,
        client.description ?? null,
        JSON.stringify(client.redirectUris),
        JSON.stringify(scopes),
        permissionManifest,
        clientSecretHash,
        client.isActive !== false,
        ownerPnId
      ]
    );

    return rowToClient(result.rows[0]);
  }

  static async getClient(clientId: string): Promise<OAuthClient | null> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(`SELECT * FROM oauth_clients WHERE client_id = $1`, [clientId]);
    if (result.rows.length === 0) return null;
    return rowToClient(result.rows[0]);
  }

  static async validateClient(clientId: string, redirectUri: string): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client || !client.isActive) return false;

    return client.redirectUris.some((allowedUri) => {
      if (allowedUri === redirectUri) return true;
      if (allowedUri.includes('*')) {
        const pattern = allowedUri
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(redirectUri);
      }
      return false;
    });
  }

  static async validateClientSecret(clientId: string, clientSecret: string): Promise<boolean> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT client_secret_hash FROM oauth_clients WHERE client_id = $1 AND is_active = true`,
      [clientId]
    );
    if (result.rows.length === 0) return false;
    const hash = result.rows[0].client_secret_hash as string | null;
    if (!hash) return true;
    return bcrypt.compare(clientSecret, hash);
  }

  static async validateScopes(clientId: string, requestedScopes: string[]): Promise<boolean> {
    const client = await this.getClient(clientId);
    if (!client || !client.isActive) return false;
    // Fail closed: empty registered scopes must not allow arbitrary requests.
    if (!client.scopes || client.scopes.length === 0) return false;
    return requestedScopes.every((scope) => client.scopes!.includes(scope));
  }

  static async updateClient(
    clientId: string,
    updates: Partial<Omit<OAuthClient, 'clientId' | 'createdAt'>>
  ): Promise<OAuthClient | null> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const existing = await this.getClient(clientId);
    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description ?? null;
    const redirectUris = updates.redirectUris ?? existing.redirectUris;
    const scopes = updates.scopes ?? existing.scopes ?? [];
    const isActive = updates.isActive !== undefined ? updates.isActive : existing.isActive;

    if (updates.clientSecret !== undefined) {
      const clientSecretHash =
        updates.clientSecret && updates.clientSecret.length > 0
          ? await bcrypt.hash(updates.clientSecret, 12)
          : null;
      await pool.query(
        `UPDATE oauth_clients SET name = $2, description = $3, redirect_uris = $4::jsonb, scopes = $5::jsonb,
         is_active = $6, client_secret_hash = $7, updated_at = NOW() WHERE client_id = $1`,
        [clientId, name, description, JSON.stringify(redirectUris), JSON.stringify(scopes), isActive, clientSecretHash]
      );
    } else {
      await pool.query(
        `UPDATE oauth_clients SET name = $2, description = $3, redirect_uris = $4::jsonb, scopes = $5::jsonb,
         is_active = $6, updated_at = NOW() WHERE client_id = $1`,
        [clientId, name, description, JSON.stringify(redirectUris), JSON.stringify(scopes), isActive]
      );
    }

    return this.getClient(clientId);
  }

  static async deleteClient(clientId: string): Promise<boolean> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(`DELETE FROM oauth_clients WHERE client_id = $1`, [clientId]);
    return (result.rowCount ?? 0) > 0;
  }

  static async listClients(): Promise<OAuthClient[]> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(`SELECT * FROM oauth_clients ORDER BY client_id`);
    return result.rows.map(rowToClient);
  }

  /** OAuth clients registered by a given pN via developer self-service */
  static async listClientsByOwnerPnId(ownerPnId: string): Promise<OAuthClient[]> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT * FROM oauth_clients WHERE owner_pn_id = $1 ORDER BY client_id`,
      [ownerPnId.trim()]
    );
    return result.rows.map(rowToClient);
  }

  static async clientExists(clientId: string): Promise<boolean> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(`SELECT 1 FROM oauth_clients WHERE client_id = $1`, [clientId]);
    return result.rows.length > 0;
  }
}
