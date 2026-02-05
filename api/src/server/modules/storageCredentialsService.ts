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

  /** Fix 4: Enforce single Drive account when returning credentials (handles legacy duplicates) */
  private ensureSingleDriveAccount(credentials: any): any {
    if (!credentials?.googleDriveAccounts || !Array.isArray(credentials.googleDriveAccounts)) {
      return credentials;
    }
    const accounts = credentials.googleDriveAccounts;
    if (accounts.length <= 1) {
      return credentials;
    }
    const sorted = [...accounts].sort((a, b) => {
      const aTime = (a?.updatedAt || a?.connectedAt || '').toString();
      const bTime = (b?.updatedAt || b?.connectedAt || '').toString();
      return bTime.localeCompare(aTime);
    });
    return {
      ...credentials,
      googleDriveAccounts: [sorted[0]],
    };
  }

  async upsertCredentials(identityId: string, credentials: any, cid?: string): Promise<StoredCredentialsRecord> {
    if (!identityId) {
      throw new Error('identityId is required');
    }
    if (!credentials) {
      throw new Error('credentials payload is required');
    }

    // CRITICAL: Deduplicate Google Drive accounts before storing
    // Only ONE account per pN should exist - if client sends more, deduplicate aggressively
    if (credentials?.googleDriveAccounts && Array.isArray(credentials.googleDriveAccounts)) {
      const accounts = credentials.googleDriveAccounts;
      
      if (accounts.length > 1) {
        console.warn(`🚨 [StorageCredentials] API received ${accounts.length} Google Drive accounts (expected max 1). Deduplicating...`);
        
        // Deduplicate by email - only ONE account per email
        const accountsByEmail = new Map<string, typeof accounts[0]>();
        const accountsWithoutEmail: typeof accounts = [];
        
        for (const account of accounts) {
          if (account?.email) {
            const normalizedEmail = account.email.toLowerCase();
            if (!accountsByEmail.has(normalizedEmail)) {
              accountsByEmail.set(normalizedEmail, account);
            } else {
              // Keep the most recent one
              const existing = accountsByEmail.get(normalizedEmail)!;
              const accountTime = account.updatedAt || account.connectedAt || '';
              const existingTime = existing.updatedAt || existing.connectedAt || '';
              if (accountTime > existingTime) {
                accountsByEmail.set(normalizedEmail, account);
              }
            }
          } else {
            // Only keep ONE account without email
            if (accountsWithoutEmail.length === 0) {
              accountsWithoutEmail.push(account);
            }
          }
        }
        
        const deduplicatedAccounts = Array.from(accountsByEmail.values()).concat(accountsWithoutEmail);
        
        // CRITICAL: If still more than 1 account, keep only the most recent one
        if (deduplicatedAccounts.length > 1) {
          console.error(`🚨 [StorageCredentials] After deduplication, still have ${deduplicatedAccounts.length} accounts. Keeping only the most recent one.`);
          deduplicatedAccounts.sort((a, b) => {
            const aTime = a.updatedAt || a.connectedAt || '';
            const bTime = b.updatedAt || b.connectedAt || '';
            return bTime.localeCompare(aTime); // Most recent first
          });
          deduplicatedAccounts.length = 1; // Keep only first (most recent)
        }
        
        credentials.googleDriveAccounts = deduplicatedAccounts;
        console.log(`✅ [StorageCredentials] Deduplicated ${accounts.length} accounts down to ${deduplicatedAccounts.length} account(s)`);
      }
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
      const encryptedRaw = row.encrypted_metadata;
      let encryptedPayload: EncryptedPayload;

      if (typeof encryptedRaw === 'string') {
        encryptedPayload = JSON.parse(encryptedRaw);
      } else if (encryptedRaw && typeof encryptedRaw === 'object') {
        // Handles legacy JSONB rows that may already be objects
        encryptedPayload = encryptedRaw as EncryptedPayload;
      } else {
        throw new Error('Unsupported encrypted payload format');
      }

      if (!encryptedPayload?.iv || !encryptedPayload?.authTag || !encryptedPayload?.ciphertext) {
        throw new Error('Encrypted payload missing required fields');
      }

      const decrypted = this.decryptPayload(encryptedPayload);
      credentials = JSON.parse(decrypted);
    } catch (error) {
      console.warn(`⚠️ Failed to decrypt storage credentials for identity ${identityId}:`, error);
      try {
        await this.deleteCredentials(identityId);
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to clean up corrupted credentials for identity ${identityId}:`, cleanupError);
      }
      return null;
    }

    credentials = this.ensureSingleDriveAccount(credentials);

    return {
      identityId: row.identity_id,
      credentials,
      cid: row.cid,
      updatedAt: row.updated_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  /**
   * Find credentials by trying multiple identity candidates
   * Returns the first match found
   */
  async findCredentialsByIdentityCandidates(candidates: string[]): Promise<StoredCredentialsRecord | null> {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const db = getDatabasePool();
    
    // Try each candidate in order
    for (const candidate of candidates) {
      if (!candidate) continue;
      
      try {
        const result = await db.query(
          `
            SELECT identity_id, encrypted_metadata, cid, updated_at, created_at
            FROM storage_credentials
            WHERE identity_id = $1
          `,
          [candidate]
        );

        if (result.rows.length > 0) {
          console.log(`[StorageCredentials] Found credentials using candidate: ${candidate}`);
          const row = result.rows[0];
          // Decrypt and return (same logic as getCredentials)
          let credentials: any = null;

          try {
            const encryptedRaw = row.encrypted_metadata;
            let encryptedPayload: EncryptedPayload;

            if (typeof encryptedRaw === 'string') {
              encryptedPayload = JSON.parse(encryptedRaw);
            } else if (encryptedRaw && typeof encryptedRaw === 'object') {
              encryptedPayload = encryptedRaw as EncryptedPayload;
            } else {
              throw new Error('Unsupported encrypted payload format');
            }

            if (!encryptedPayload?.iv || !encryptedPayload?.authTag || !encryptedPayload?.ciphertext) {
              throw new Error('Encrypted payload missing required fields');
            }

            const decrypted = this.decryptPayload(encryptedPayload);
            credentials = JSON.parse(decrypted);
          } catch (error) {
            console.warn(`⚠️ Failed to decrypt storage credentials for identity ${candidate}:`, error);
            continue; // Try next candidate
          }

          credentials = this.ensureSingleDriveAccount(credentials);

          return {
            identityId: row.identity_id,
            credentials,
            cid: row.cid,
            updatedAt: row.updated_at.toISOString(),
            createdAt: row.created_at.toISOString(),
          };
        }
      } catch (error) {
        console.warn(`[StorageCredentials] Error querying candidate ${candidate}:`, error);
        continue; // Try next candidate
      }
    }
    
    return null;
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

