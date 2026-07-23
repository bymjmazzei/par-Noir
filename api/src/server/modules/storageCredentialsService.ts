import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { normalizeLegacyAccountIds } from '@par-noir/user-owned-storage';
import { getDatabasePool } from '../utils/database';
import { securityFlags } from '../utils/securityFlags';
import { appendSecurityAuditEvent } from './auditService';

interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface EncryptedEnvelopeV2 extends EncryptedPayload {
  v: 2;
  wrappedDek: string;
  wrapMethod: 'kms' | 'local';
}

function redactIdentityIdentifier(value?: string): string {
  if (!value) return 'unknown';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
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
  private readonly kmsKeyName?: string;

  private constructor() {
    const secret = process.env.STORAGE_CREDENTIALS_SECRET;
    if (!secret) {
      throw new Error(
        'STORAGE_CREDENTIALS_SECRET environment variable is required to persist storage credentials securely.'
      );
    }
    this.key = crypto.createHash('sha256').update(secret).digest();
    this.kmsKeyName = process.env.STORAGE_CREDENTIALS_KMS_KEY;
  }

  static getInstance(): StorageCredentialsService {
    if (!StorageCredentialsService.instance) {
      StorageCredentialsService.instance = new StorageCredentialsService();
    }
    return StorageCredentialsService.instance;
  }

  private async wrapDek(dek: Buffer): Promise<{ wrappedDek: string; wrapMethod: 'kms' | 'local' }> {
    if (this.kmsKeyName && securityFlags.enableStorageEnvelopeV2) {
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const res = await client.request<{ ciphertext?: string }>({
        url: `https://cloudkms.googleapis.com/v1/${this.kmsKeyName}:encrypt`,
        method: 'POST',
        data: { plaintext: dek.toString('base64') },
      });
      if (!res.data.ciphertext) {
        throw new Error('KMS encrypt returned no ciphertext');
      }
      return { wrappedDek: res.data.ciphertext, wrapMethod: 'kms' };
    }
    const wrapped = this.encryptWithKey(dek, this.key);
    return { wrappedDek: Buffer.from(JSON.stringify(wrapped)).toString('base64'), wrapMethod: 'local' };
  }

  private async unwrapDek(wrappedDek: string, wrapMethod: 'kms' | 'local'): Promise<Buffer> {
    if (wrapMethod === 'kms') {
      if (!this.kmsKeyName) throw new Error('KMS key not configured for unwrap');
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const res = await client.request<{ plaintext?: string }>({
        url: `https://cloudkms.googleapis.com/v1/${this.kmsKeyName}:decrypt`,
        method: 'POST',
        data: { ciphertext: wrappedDek },
      });
      if (!res.data.plaintext) throw new Error('KMS decrypt returned no plaintext');
      return Buffer.from(res.data.plaintext, 'base64');
    }
    const payload = JSON.parse(Buffer.from(wrappedDek, 'base64').toString('utf8')) as EncryptedPayload;
    return this.decryptWithKey(payload, this.key);
  }

  private encryptWithKey(plaintext: Buffer | string, key: Buffer): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  private decryptWithKey(payload: EncryptedPayload, key: Buffer): Buffer {
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private async encryptPayload(plaintext: string): Promise<EncryptedPayload | EncryptedEnvelopeV2> {
    if (securityFlags.enableStorageEnvelopeV2) {
      const dek = crypto.randomBytes(32);
      const encryptedPayload = this.encryptWithKey(plaintext, dek);
      const wrapped = await this.wrapDek(dek);
      return {
        ...encryptedPayload,
        v: 2,
        wrappedDek: wrapped.wrappedDek,
        wrapMethod: wrapped.wrapMethod,
      };
    }
    return this.encryptWithKey(plaintext, this.key);
  }

  private async decryptPayload(payload: EncryptedPayload | EncryptedEnvelopeV2): Promise<string> {
    if ((payload as EncryptedEnvelopeV2).v === 2) {
      const p = payload as EncryptedEnvelopeV2;
      const dek = await this.unwrapDek(p.wrappedDek, p.wrapMethod);
      return this.decryptWithKey(p, dek).toString('utf8');
    }
    return this.decryptWithKey(payload as EncryptedPayload, this.key).toString('utf8');
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

    // No Google Drive accounts — drop stale layout index so unlock does not use deleted folder IDs.
    const hasGoogleDrive =
      (Array.isArray(credentials.googleDriveAccounts) && credentials.googleDriveAccounts.length > 0) ||
      (!!credentials.googleDrive && typeof credentials.googleDrive === 'object' && !Array.isArray(credentials.googleDrive));
    if (!hasGoogleDrive) {
      delete credentials.pnDriveIndex;
      delete credentials.cachedFolderIds;
      delete credentials.driveFolderId;
    }

    const db = getDatabasePool();
    const serialized = JSON.stringify(credentials);
    const encryptedPayload = await this.encryptPayload(serialized);

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

      const decrypted = await this.decryptPayload(encryptedPayload as EncryptedPayload | EncryptedEnvelopeV2);
      credentials = JSON.parse(decrypted);
    } catch (error) {
      console.warn(`⚠️ Failed to decrypt storage credentials for identity ${identityId}:`, error);
      void appendSecurityAuditEvent({
        eventType: 'storage_credentials.decrypt_failed',
        severity: 'high',
        subjectPnIdentifier: identityId,
        metadata: { reason: (error as Error).message },
      });
      return null;
    }

    credentials = this.ensureSingleDriveAccount(credentials);
    credentials = normalizeLegacyAccountIds(credentials, row.identity_id);

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
          if (process.env.LOG_LEVEL === 'debug') {
            console.log(
              `[StorageCredentials] Found credentials using candidate: ${redactIdentityIdentifier(candidate)}`
            );
          }
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

            const decrypted = await this.decryptPayload(encryptedPayload as EncryptedPayload | EncryptedEnvelopeV2);
            credentials = JSON.parse(decrypted);
          } catch (error) {
            console.warn(
              `⚠️ Failed to decrypt storage credentials for identity ${redactIdentityIdentifier(candidate)}:`,
              error
            );
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
        console.warn(
          `[StorageCredentials] Error querying candidate ${redactIdentityIdentifier(candidate)}:`,
          error
        );
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

  /**
   * Strip long-lived cloud secrets; keep layout / provider enum metadata only.
   * Used after device migration when DEVICE_CLOUD_CUSTODY is enabled.
   */
  stripCloudSecrets(credentials: Record<string, unknown>): Record<string, unknown> {
    const stripAccount = (acct: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
      if (!acct || typeof acct !== 'object') return acct;
      const next = { ...acct };
      for (const k of [
        'accessToken',
        'access_token',
        'refreshToken',
        'refresh_token',
        'apiKey',
        'apiSecret',
        'clientSecret',
        'secretAccessKey',
        'password',
        'sasToken',
        'connectionString'
      ]) {
        delete next[k];
      }
      return next;
    };
    const out: Record<string, unknown> = { ...credentials };
    delete out.googleDrive;
    if (Array.isArray(out.googleDriveAccounts)) {
      out.googleDriveAccounts = (out.googleDriveAccounts as Record<string, unknown>[])
        .map((a) => stripAccount(a))
        .filter(Boolean);
    }
    for (const key of [
      'dropboxAccounts',
      'awsS3Accounts',
      'azureBlobAccounts',
      'onedriveAccounts',
      'ftpAccounts'
    ] as const) {
      if (Array.isArray(out[key])) {
        out[key] = (out[key] as Record<string, unknown>[]).map((a) => stripAccount(a)).filter(Boolean);
      }
    }
    return out;
  }

  async upsertLayoutOnly(
    identityId: string,
    layout: {
      socialCloudProvider?: string;
      socialCloudAccountId?: string;
      cachedLayout?: unknown;
      driveFolderId?: string;
      publicKey?: string;
    }
  ): Promise<StoredCredentialsRecord> {
    const existing = await this.getCredentials(identityId);
    const base = existing?.credentials
      ? this.stripCloudSecrets(existing.credentials as Record<string, unknown>)
      : {};
    const merged = {
      ...base,
      ...(layout.socialCloudProvider ? { socialCloudProvider: layout.socialCloudProvider } : {}),
      ...(layout.socialCloudAccountId ? { socialCloudAccountId: layout.socialCloudAccountId } : {}),
      ...(layout.cachedLayout ? { cachedLayout: layout.cachedLayout } : {}),
      ...(layout.driveFolderId ? { driveFolderId: layout.driveFolderId } : {}),
      ...(layout.publicKey ? { publicKey: layout.publicKey } : {})
    };
    return this.upsertCredentials(identityId, merged, existing?.cid ?? undefined);
  }

  async purgeCloudSecrets(identityId: string): Promise<StoredCredentialsRecord | null> {
    const existing = await this.getCredentials(identityId);
    if (!existing?.credentials) return null;
    const stripped = this.stripCloudSecrets(existing.credentials as Record<string, unknown>);
    return this.upsertCredentials(identityId, stripped, existing.cid ?? undefined);
  }

  /**
   * Move storage_credentials from legacy passcode-based pn id to canonical publicKey-based id.
   */
  /** Pinned Drive folder id (par Noir root) if stored in credentials blob. */
  async getDriveFolderId(identityId: string): Promise<string | null> {
    const record = await this.getCredentials(identityId);
    const id = record?.credentials?.driveFolderId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  async migrateIdentityId(
    legacyId: string,
    canonicalId: string,
    patch?: { driveFolderId?: string; publicKey?: string }
  ): Promise<StoredCredentialsRecord | null> {
    if (!legacyId || !canonicalId || legacyId === canonicalId) {
      return null;
    }
    const legacy = await this.getCredentials(legacyId);
    if (!legacy?.credentials) {
      return null;
    }
    const existingCanonical = await this.getCredentials(canonicalId);
    const merged = {
      ...legacy.credentials,
      ...(existingCanonical?.credentials || {}),
      ...(patch?.driveFolderId ? { driveFolderId: patch.driveFolderId } : {}),
      ...(patch?.publicKey ? { publicKey: patch.publicKey } : {})
    };
    const record = await this.upsertCredentials(canonicalId, merged, legacy.cid ?? undefined);
    await this.deleteCredentials(legacyId);
    return record;
  }
}

export const storageCredentialsService = StorageCredentialsService.getInstance();

