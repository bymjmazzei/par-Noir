/**
 * Metadata Field Encryption Utility
 * Encrypts sensitive fields in companion metadata sheets to make them machine-readable only
 * Uses AES-256-GCM for encryption (same as storage credentials)
 */

import crypto from 'crypto';

interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class MetadataEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static key: Buffer | null = null;

  /**
   * Get or derive encryption key from environment variable
   */
  private static getKey(): Buffer {
    if (MetadataEncryption.key) {
      return MetadataEncryption.key;
    }

    // Use STORAGE_CREDENTIALS_SECRET if available, otherwise use a fallback
    // In production, STORAGE_CREDENTIALS_SECRET should always be set
    const secret = process.env.STORAGE_CREDENTIALS_SECRET || process.env.METADATA_ENCRYPTION_SECRET;
    
    if (!secret) {
      // Fallback: use a default key (not recommended for production)
      // This allows the system to work even if secret isn't set, but warns
      console.warn('⚠️ [MetadataEncryption] No encryption secret found. Using fallback key. Set STORAGE_CREDENTIALS_SECRET or METADATA_ENCRYPTION_SECRET for production.');
      MetadataEncryption.key = crypto.createHash('sha256').update('par-noir-metadata-encryption-fallback').digest();
      return MetadataEncryption.key;
    }

    MetadataEncryption.key = crypto.createHash('sha256').update(secret).digest();
    return MetadataEncryption.key;
  }

  /**
   * Encrypt a sensitive field value
   * Returns base64-encoded encrypted payload
   */
  static encryptField(value: string | undefined | null): string {
    if (!value || value === '') {
      return '';
    }

    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();

      const payload: EncryptedPayload = {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };

      // Return as base64-encoded JSON for easy storage in spreadsheet cells
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (error: any) {
      console.error('❌ [MetadataEncryption] Failed to encrypt field:', error);
      // Return empty string on error to avoid breaking the system
      return '';
    }
  }

  /**
   * Decrypt a sensitive field value
   * Accepts base64-encoded encrypted payload
   */
  static decryptField(encryptedValue: string | undefined | null): string {
    if (!encryptedValue || encryptedValue === '') {
      return '';
    }

    try {
      // Try to parse as base64-encoded JSON payload (new encrypted format)
      const payloadJson = Buffer.from(encryptedValue, 'base64').toString('utf8');
      const payload: EncryptedPayload = JSON.parse(payloadJson);

      const key = this.getKey();
      const iv = Buffer.from(payload.iv, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      // If decryption fails, it might be plain text (backward compatibility)
      // or corrupted data - return as-is and let the caller handle it
      console.warn('⚠️ [MetadataEncryption] Failed to decrypt field (may be plain text):', error?.message || error);
      return encryptedValue; // Return as-is for backward compatibility
    }
  }

  /**
   * Check if a value appears to be encrypted
   * (heuristic: encrypted values are base64-encoded JSON with iv/authTag/ciphertext)
   */
  static isEncrypted(value: string | undefined | null): boolean {
    if (!value || value === '') {
      return false;
    }

    try {
      const payloadJson = Buffer.from(value, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      return payload.iv && payload.authTag && payload.ciphertext;
    } catch {
      return false;
    }
  }
}

