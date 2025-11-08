import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';

interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface StoredCredentialsRecord {
  identityId: string;
  credentials: any;
  cid?: string | null;
  updatedAt: string;
  createdAt: string;
}

export class StorageCredentialsService {
  private static instance: StorageCredentialsService;
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  private constructor() {
    const secret = process.env.STORAGE_CREDENTIALS_SECRET;
    if (!secret) {
      throw new Error(
        'STORAGE_CREDENTIALS_SECRET environment variable is required to persist storage credentials securely.'
      );
    }
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  static getInstance(): StorageCredentialsService {
    if (!StorageCredentialsService.instance) {
      StorageCredentialsService.instance = new StorageCredentialsService();
    }
    return StorageCredentialsService.instance;
  }

  private encryptPayload(plaintext: string): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  private decryptPayload(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  async upsertCredentials(identityId: string, credentials: any, cid?: string): Promise<StoredCredentialsRecord> {
    if (!identityId) {
      throw new Error('identityId is required');
    }
    if (!credentials) {
      throw new Error('credentials payload is required');
    }

    const db = getDatabasePool();
    const serialized = JSON.stringify(credentials);
    const encryptedPayload = this.encryptPayload(serialized);

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
      [identityId, JSON.stringify(encryptedPayload), cid ?? null]
    );

    const row = result.rows[0];
    return {
      identityId: row.identity_id,
      credentials,
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
    let credentials: any = null;

    try {
      const encryptedPayload: EncryptedPayload = JSON.parse(row.encrypted_metadata);
      const decrypted = this.decryptPayload(encryptedPayload);
      credentials = JSON.parse(decrypted);
    } catch (error) {
      console.error(`Failed to decrypt storage credentials for identity ${identityId}:`, error);
      throw new Error('Failed to decrypt storage credentials');
    }

    return {
      identityId: row.identity_id,
      credentials,
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

