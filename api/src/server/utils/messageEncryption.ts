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
  iterations?: number; // Optional: iteration count (100k for new messages, missing for legacy 1M messages)
}

export class MessageEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly pbkdf2IterationsNew = 100000; // 100k iterations for new messages (10x faster, still secure)
  private static readonly pbkdf2IterationsLegacy = 1000000; // 1M iterations for backward compatibility with old messages
  private static readonly pbkdf2KeyLength = 32; // 256 bits for AES-256
  private static readonly pbkdf2Digest = 'sha512'; // SHA-512 (military-grade)

  /**
   * Derive encryption key from connectionId and shared secret (async for parallel processing)
   */
  private static async deriveKey(connectionId: string, sharedSecret: string, salt: Buffer, iterations: number): Promise<Buffer> {
    // Combine connectionId and sharedSecret
    const keyMaterial = `${connectionId}:${sharedSecret}`;
    
    // Hash the key material with SHA-256
    const hashedMaterial = crypto.createHash('sha256').update(keyMaterial).digest();
    
    // Derive key using PBKDF2 (iterations specified, SHA-512) - async for parallel processing
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        hashedMaterial,
        salt,
        iterations,
        this.pbkdf2KeyLength,
        this.pbkdf2Digest,
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  /**
   * Encrypt message content using connection's shared secret
   */
  static async encryptMessage(
    content: string,
    connectionId: string,
    sharedSecret: string
  ): Promise<string> {
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

      // Derive encryption key (async) - use 100k iterations for new messages (10x faster)
      const key = await this.deriveKey(connectionId, sharedSecret, salt, this.pbkdf2IterationsNew);

      // Encrypt message
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(content, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      // Create payload - store iterations for backward compatibility detection
      const payload: EncryptedMessagePayload = {
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        iterations: this.pbkdf2IterationsNew // Store iteration count for decryption
      };

      // Return as base64-encoded JSON for easy storage in spreadsheet cells
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    } catch (error: any) {
      console.error('[MessageEncryption] Failed to encrypt message:', error);
      throw new Error(`Failed to encrypt message: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Decrypt message content using connection's shared secret (async for parallel processing)
   */
  static async decryptMessage(
    encryptedContent: string,
    connectionId: string,
    sharedSecret: string
  ): Promise<string> {
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

      // Determine iterations: use stored value if present (new messages), otherwise default to 1M (legacy)
      const iterations = payload.iterations ?? this.pbkdf2IterationsLegacy;
      
      // Log iteration count for debugging (only log occasionally to avoid spam)
      if (Math.random() < 0.1) { // Log ~10% of the time
        console.log(`[MessageEncryption] Decrypting with ${iterations === this.pbkdf2IterationsNew ? '100k (new)' : iterations === this.pbkdf2IterationsLegacy ? '1M (legacy)' : `${iterations} (custom)`} iterations`);
      }

      // Derive decryption key (async - allows parallel processing)
      const key = await this.deriveKey(connectionId, sharedSecret, salt, iterations);

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
