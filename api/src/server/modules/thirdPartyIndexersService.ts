import { PoolClient } from 'pg';
import { getDatabasePool } from '../utils/database';

export type ThirdPartyStatus = 'active' | 'inactive' | 'revoked';

export interface ThirdPartyIndexer {
  id: string;
  name: string;
  description?: string;
  website?: string;
  status: ThirdPartyStatus;
  requestedScopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ThirdPartyAccess {
  identity: string;
  thirdPartyId: string;
  isEnabled: boolean;
  grantedScopes: string[];
  status: ThirdPartyStatus;
  grantedAt: string;
  updatedAt: string;
}

export interface AccessUpdate {
  thirdPartyId: string;
  isEnabled: boolean;
  grantedScopes?: string[];
}

export interface FileVisibilityOverride {
  thirdPartyId: string;
  isAllowed: boolean;
}

const DEFAULT_INDEXERS: Array<Omit<ThirdPartyIndexer, 'createdAt' | 'updatedAt' | 'status'> & { status?: ThirdPartyStatus }> = [
  {
    id: 'public_catalog',
    name: 'par Noir Public Index',
    description: 'Public discovery feed operated by par Noir for cross-network search.',
    website: 'https://browse.parnoir.com',
    requestedScopes: ['index_media'],
    status: 'active',
  },
  {
    id: 'noir_collective',
    name: 'Noir Collective',
    description: 'Curated arts catalog highlighting noir creators and cultural archives.',
    website: 'https://collective.parnoir.com',
    requestedScopes: ['index_media', 'metrics_read'],
    status: 'active',
  },
  {
    id: 'atlas_archive',
    name: 'Atlas Archive',
    description: 'Permissioned preservation network for long-term cultural archiving.',
    website: 'https://atlas.parnoir.com',
    requestedScopes: ['index_media', 'high_resolution_assets'],
    status: 'active',
  },
];

export class ThirdPartyIndexersService {
  private static instance: ThirdPartyIndexersService;
  private isSeeded = false;

  private constructor() {}

  static getInstance(): ThirdPartyIndexersService {
    if (!ThirdPartyIndexersService.instance) {
      ThirdPartyIndexersService.instance = new ThirdPartyIndexersService();
    }
    return ThirdPartyIndexersService.instance;
  }

  private async seedIndexersIfNeeded(): Promise<void> {
    if (this.isSeeded) {
      return;
    }

    const db = getDatabasePool();
    const result = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM third_party_indexers');
    const count = Number(result.rows[0]?.count || 0);

    if (count === 0) {
      const seedValues = DEFAULT_INDEXERS.map((indexer) => [
        indexer.id,
        indexer.name,
        indexer.description || null,
        indexer.website || null,
        indexer.status || 'active',
        indexer.requestedScopes,
      ]);

      const insertPromises = seedValues.map((values) =>
        db.query(
          `INSERT INTO third_party_indexers (id, name, description, website, status, requested_scopes)
           VALUES ($1, $2, $3, $4, $5, $6::text[])
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             website = EXCLUDED.website,
             status = EXCLUDED.status,
             requested_scopes = EXCLUDED.requested_scopes,
             updated_at = NOW()`,
          values
        )
      );

      await Promise.all(insertPromises);
    }

    this.isSeeded = true;
  }

  async listIndexers(): Promise<ThirdPartyIndexer[]> {
    await this.seedIndexersIfNeeded();
    const db = getDatabasePool();
    const result = await db.query<{
      id: string;
      name: string;
      description: string | null;
      website: string | null;
      status: string;
      requested_scopes: string[];
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM third_party_indexers ORDER BY name ASC');

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      website: row.website ?? undefined,
      status: (row.status || 'active') as ThirdPartyStatus,
      requestedScopes: row.requested_scopes || [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getAccessForIdentity(identity: string): Promise<ThirdPartyAccess[]> {
    const db = getDatabasePool();
    const result = await db.query<{
      identity: string;
      third_party_id: string;
      granted_scopes: string[];
      status: string;
      granted_at: Date;
      updated_at: Date;
    }>(
      `SELECT identity, third_party_id, granted_scopes, status, granted_at, updated_at
         FROM pn_third_party_access
        WHERE identity = $1`,
      [identity]
    );

    return result.rows.map((row) => ({
      identity: row.identity,
      thirdPartyId: row.third_party_id,
      isEnabled: row.status !== 'revoked',
      grantedScopes: row.granted_scopes || [],
      status: (row.status || 'active') as ThirdPartyStatus,
      grantedAt: row.granted_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async upsertAccess(identity: string, updates: AccessUpdate[]): Promise<void> {
    if (!identity) {
      throw new Error('Identity is required to update third-party access');
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return;
    }

    const db = getDatabasePool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      for (const update of updates) {
        await client.query(
          `INSERT INTO pn_third_party_access (identity, third_party_id, granted_scopes, status, granted_at, updated_at)
           VALUES ($1, $2, $3::text[], $4, NOW(), NOW())
           ON CONFLICT (identity, third_party_id) DO UPDATE SET
             granted_scopes = EXCLUDED.granted_scopes,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [
            identity,
            update.thirdPartyId,
            update.isEnabled ? update.grantedScopes || ['index_media'] : [],
            update.isEnabled ? 'active' : 'revoked',
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFileOverrides(fileId: string): Promise<Record<string, boolean>> {
    if (!fileId) {
      return {};
    }

    const db = getDatabasePool();
    const result = await db.query<{ third_party_id: string; is_allowed: boolean }>(
      `SELECT third_party_id, is_allowed
         FROM file_index_visibility
        WHERE file_id = $1`,
      [fileId]
    );

    return result.rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.third_party_id] = row.is_allowed;
      return acc;
    }, {});
  }

  async setFileOverrides(fileId: string, overrides: FileVisibilityOverride[]): Promise<void> {
    if (!fileId) {
      throw new Error('fileId is required to update index visibility');
    }

    const db = getDatabasePool();
    const client: PoolClient = await db.connect();

    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM file_index_visibility WHERE file_id = $1', [fileId]);

      if (Array.isArray(overrides) && overrides.length > 0) {
        for (const override of overrides) {
          await client.query(
            `INSERT INTO file_index_visibility (file_id, third_party_id, is_allowed, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (file_id, third_party_id) DO UPDATE SET
               is_allowed = EXCLUDED.is_allowed,
               updated_at = NOW()`,
            [fileId, override.thirdPartyId, override.isAllowed]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const getThirdPartyIndexersService = () => ThirdPartyIndexersService.getInstance();

