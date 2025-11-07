import { getDatabasePool } from '../utils/database';

export interface StoredCredentialsRecord {
  identityId: string;
  encryptedMetadata: any;
  cid?: string | null;
  updatedAt: string;
  createdAt: string;
}

export class StorageCredentialsService {
  private static instance: StorageCredentialsService;

  private constructor() {}

  static getInstance(): StorageCredentialsService {
    if (!StorageCredentialsService.instance) {
      StorageCredentialsService.instance = new StorageCredentialsService();
    }
    return StorageCredentialsService.instance;
  }

  async upsertCredentials(
    identityId: string,
    encryptedMetadata: any,
    cid?: string
  ): Promise<StoredCredentialsRecord> {
    if (!identityId) {
      throw new Error('identityId is required');
    }
    if (!encryptedMetadata) {
      throw new Error('encryptedMetadata is required');
    }

    const db = getDatabasePool();

    const result = await db.query(
      `
        INSERT INTO storage_credentials (identity_id, encrypted_metadata, cid, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (identity_id)
        DO UPDATE SET
          encrypted_metadata = EXCLUDED.encrypted_metadata,
          cid = EXCLUDED.cid,
          updated_at = NOW()
        RETURNING identity_id, encrypted_metadata, cid, updated_at, created_at
      `,
      [identityId, JSON.stringify(encryptedMetadata), cid ?? null]
    );

    const row = result.rows[0];
    return {
      identityId: row.identity_id,
      encryptedMetadata: row.encrypted_metadata,
      cid: row.cid,
      updatedAt: row.updated_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  async getCredentials(identityId: string): Promise<StoredCredentialsRecord | null> {
    if (!identityId) {
      throw new Error('identityId is required');
    }

    const db = getDatabasePool();
    const result = await db.query(
      `
        SELECT identity_id, encrypted_metadata, cid, updated_at, created_at
        FROM storage_credentials
        WHERE identity_id = $1
      `,
      [identityId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      identityId: row.identity_id,
      encryptedMetadata: row.encrypted_metadata,
      cid: row.cid,
      updatedAt: row.updated_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  async deleteCredentials(identityId: string): Promise<boolean> {
    if (!identityId) {
      throw new Error('identityId is required');
    }

    const db = getDatabasePool();
    const result = await db.query(
      `
        DELETE FROM storage_credentials
        WHERE identity_id = $1
      `,
      [identityId]
    );

    return (result.rowCount ?? 0) > 0;
  }
}

export const storageCredentialsService = StorageCredentialsService.getInstance();

