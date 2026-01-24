/**
 * Message Encryption Utility
 * Encrypts/decrypts messages using connection-specific shared secrets
 * Uses PBKDF2 key derivation and AES-256-GCM encryption
 */

import crypto from 'crypto';

interface EncryptedMessagePayload {
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class MessageEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly pbkdf2Iterations = 100000; // 100k iterations (optimized for strong random secrets)
  private static readonly pbkdf2KeyLength = 32; // 256 bits for AES-256
  private static readonly pbkdf2Digest = 'sha512'; // SHA-512

  /**
   * Derive encryption key from connectionId and shared secret
   */
  private static deriveKey(connectionId: string, sharedSecret: string, salt: Buffer): Buffer {
    // Combine connectionId and sharedSecret
    const keyMaterial = `${connectionId}:${sharedSecret}`;
    
    // Hash the key material with SHA-256
    const hashedMaterial = crypto.createHash('sha256').update(keyMaterial).digest();
    
    // Derive key using PBKDF2 (1M iterations, SHA-512)
    return crypto.pbkdf2Sync(
      hashedMaterial,
      salt,
      this.pbkdf2Iterations,
      this.pbkdf2KeyLength,
      this.pbkdf2Digest
    );
  }

  /**
   * Encrypt message content using connection's shared secret
   */
  static encryptMessage(
    content: string,
    connectionId: string,
    sharedSecret: string
  ): string {
    if (!content || content === '') {
      return '';
    }

    if (!connectionId || !sharedSecret) {
      throw new Error('Connection ID and shared secret are required for encryption');
    }

    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12); // 12 bytes for GCM

      // Derive encryption key
      const key = this.deriveKey(connectionId, sharedSecret, salt);

      // Encrypt message
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(content, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      // Create payload
      const payload: EncryptedMessagePayload = {
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64')
      };

      // Return as base64-encoded JSON for easy storage in spreadsheet cells
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (error: any) {
      console.error('[MessageEncryption] Failed to encrypt message:', error);
      throw new Error(`Failed to encrypt message: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Decrypt message content using connection's shared secret
   */
  static decryptMessage(
    encryptedContent: string,
    connectionId: string,
    sharedSecret: string
  ): string {
    if (!encryptedContent || encryptedContent === '') {
      return '';
    }

    if (!connectionId || !sharedSecret) {
      throw new Error('Connection ID and shared secret are required for decryption');
    }

    try {
      // Parse base64-encoded JSON payload
      const payloadJson = Buffer.from(encryptedContent, 'base64').toString('utf8');
      const payload: EncryptedMessagePayload = JSON.parse(payloadJson);

      // Convert base64 strings to buffers
      const salt = Buffer.from(payload.salt, 'base64');
      const iv = Buffer.from(payload.iv, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');

      // Derive decryption key
      const key = this.deriveKey(connectionId, sharedSecret, salt);

      // Decrypt message
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      console.error('[MessageEncryption] Failed to decrypt message:', error);
      throw new Error(`Failed to decrypt message: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if a value appears to be encrypted
   */
  static isEncrypted(value: string | undefined | null): boolean {
    if (!value || value === '') {
      return false;
    }

    try {
      const payloadJson = Buffer.from(value, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      return !!(payload.salt && payload.iv && payload.authTag && payload.ciphertext);
    } catch {
      return false;
    }
  }
}
