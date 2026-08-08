/**
 * Persist opaque client-sealed cloud-credentials envelopes.
 * Server never decrypts client seal — only stores/returns ciphertext JSON.
 */

import { getDatabasePool } from '../utils/database';

export interface StoredSealedEnvelope {
  encryptedData: string;
  iv: string;
  salt: string;
  expiresAt?: string | null;
  updatedAt: string;
}

function isSealedEnvelopeShape(value: unknown): value is StoredSealedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.encryptedData === 'string' &&
    o.encryptedData.length > 0 &&
    typeof o.iv === 'string' &&
    o.iv.length > 0 &&
    typeof o.salt === 'string' &&
    o.salt.length > 0 &&
    typeof o.updatedAt === 'string'
  );
}

export function looksLikePlaintextCloudSecrets(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (isSealedEnvelopeShape(value)) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.access_token === 'string' || typeof o.accessToken === 'string') return true;
  if (typeof o.refresh_token === 'string' || typeof o.refreshToken === 'string') return true;
  if (Array.isArray(o.googleDriveAccounts) || o.googleDrive) return true;
  return false;
}

export class CloudVaultService {
  async putSealedVault(identityId: string, envelope: StoredSealedEnvelope): Promise<void> {
    if (!identityId) throw new Error('identityId is required');
    if (!isSealedEnvelopeShape(envelope)) {
      throw new Error('Invalid sealed envelope shape');
    }
    if (looksLikePlaintextCloudSecrets(envelope)) {
      throw new Error('Plaintext cloud secrets are not allowed in vault');
    }
    const db = getDatabasePool();
    const serialized = JSON.stringify({
      encryptedData: envelope.encryptedData,
      iv: envelope.iv,
      salt: envelope.salt,
      expiresAt: envelope.expiresAt ?? null,
      updatedAt: envelope.updatedAt || new Date().toISOString()
    });
    await db.query(
      `
        INSERT INTO storage_cloud_vault (identity_id, sealed_envelope, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (identity_id)
        DO UPDATE SET
          sealed_envelope = EXCLUDED.sealed_envelope,
          updated_at = NOW()
      `,
      [identityId, serialized]
    );
  }

  async getSealedVault(identityId: string): Promise<StoredSealedEnvelope | null> {
    if (!identityId) throw new Error('identityId is required');
    const db = getDatabasePool();
    const result = await db.query(
      `
        SELECT sealed_envelope
        FROM storage_cloud_vault
        WHERE identity_id = $1
      `,
      [identityId]
    );
    if (result.rows.length === 0) return null;
    const raw = result.rows[0].sealed_envelope;
    let parsed: unknown;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
    if (!isSealedEnvelopeShape(parsed)) return null;
    return parsed;
  }

  async deleteSealedVault(identityId: string): Promise<void> {
    if (!identityId) return;
    const db = getDatabasePool();
    await db.query(`DELETE FROM storage_cloud_vault WHERE identity_id = $1`, [identityId]);
  }
}

export const cloudVaultService = new CloudVaultService();
