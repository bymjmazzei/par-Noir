/**
 * OAuth Client Registration Service
 * Persists registered OAuth clients in PostgreSQL (see migrations/add_oauth_clients_api_keys.sql).
 */

import bcrypt from 'bcryptjs';

export interface OAuthClient {
  clientId: string;
  /** Never returned from DB reads; only used when registering with a new secret */
  clientSecret?: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes?: string[];
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

function rowToClient(row: Record<string, unknown>): OAuthClient {
  const redirectUris = row.redirect_uris as string[] | unknown;
  const scopes = row.scopes as string[] | unknown;
  return {
    clientId: row.client_id as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    redirectUris: Array.isArray(redirectUris) ? redirectUris : [],
    scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : [],
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    isActive: Boolean(row.is_active)
  };
}

export class ClientRegistrationService {
  /**
   * Seed built-in clients if missing (browser-app, prism-app).
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
        clientId: 'browser-app',
        name: 'par Noir Browser',
        description: 'Official par Noir browser application for browsing and discovering encrypted content',
        redirectUris: [
          'https://browse.parnoir.com/oauth-callback.html',
          'https://browse.parnoir.com/',
          'https://messaging.parnoir.com/oauth-callback.html',
          'https://messaging.parnoir.com/',
          'https://localhost/oauth-callback.html',
          'https://localhost/',
          'http://localhost:3000/oauth-callback.html',
          'http://localhost:3000/',
          'http://localhost:5173/oauth-callback.html',
          'http://localhost:5173/'
        ],
        scopes: ['openid', 'profile']
      },
      {
        clientId: 'prism-app',
        name: 'par Noir Prism',
        description: 'Prism auditor program for DMCA content review',
        redirectUris: [
          'https://prism.parnoir.com/oauth-callback.html',
          'https://prism.parnoir.com/',
          'https://localhost/oauth-callback.html',
          'https://localhost/',
          'http://localhost:5174/oauth-callback.html',
          'http://localhost:5174/'
        ],
        scopes: ['openid', 'profile']
      }
    ];

    for (const d of defaults) {
      await pool.query(
        `INSERT INTO oauth_clients (client_id, name, description, redirect_uris, scopes, is_active)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, true)
         ON CONFLICT (client_id) DO NOTHING`,
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

    const result = await pool.query(
      `INSERT INTO oauth_clients (client_id, name, description, redirect_uris, scopes, client_secret_hash, is_active)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING *`,
      [
        client.clientId,
        client.name,
        client.description ?? null,
        JSON.stringify(client.redirectUris),
        JSON.stringify(client.scopes ?? []),
        clientSecretHash,
        client.isActive !== false
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
    if (!client.scopes || client.scopes.length === 0) return true;
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

  static async clientExists(clientId: string): Promise<boolean> {
    const { getDatabasePool } = await import('../utils/database');
    const pool = getDatabasePool();
    const result = await pool.query(`SELECT 1 FROM oauth_clients WHERE client_id = $1`, [clientId]);
    return result.rows.length > 0;
  }
}
