/**
 * Encryption Manager for Browser App
 * Decrypts files using stable pN identity (DID + publicKey)
 * Matches dashboard's EncryptionManager logic
 */

export class EncryptionManager {
  /**
   * Encrypt data using stable pN identity (DID + publicKey)
   * Matches dashboard's EncryptionManager.encrypt
   */
  async encrypt(
    data: Uint8Array,
    pnId: string,
    publicKey: string
  ): Promise<{ encrypted: string; iv: string; salt: string }> {
    try {
      // Derive encryption key from stable pN identity (id + publicKey)
      const combined = `${pnId}:${publicKey}`;
      const encoder = new TextEncoder();
      const combinedData = encoder.encode(combined);
      
      // Hash the combined identity to get stable key material
      const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedKeyMaterial = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const salt = await this.generateSalt();
      const key = await this.deriveKey(hashedKeyMaterial, salt);
      const iv = await this.generateIV();
      
      // Use crypto.subtle for file encryption
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data.buffer
      );
      
      return {
        encrypted: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv),
        salt
      };
    } catch (error: any) {
      console.error('❌ [EncryptionManager] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data using stable pN identity (DID + publicKey)
   */
  async decrypt(
    encryptedData: string,
    iv: string,
    salt: string,
    pnId: string,
    publicKey: string
  ): Promise<Uint8Array> {
    try {
      // Derive decryption key from stable pN identity (id + publicKey)
      const combined = `${pnId}:${publicKey}`;
      const encoder = new TextEncoder();
      const combinedData = encoder.encode(combined);
      
      console.log('🔐 [EncryptionManager] Decryption parameters:', {
        pnId: pnId.substring(0, 30) + '...',
        publicKey: publicKey.substring(0, 50) + '...',
        publicKeyLength: publicKey.length,
        combined: combined.substring(0, 80) + '...',
        combinedLength: combined.length,
        saltLength: salt.length,
        ivLength: iv.length,
        encryptedDataLength: encryptedData.length
      });
      
      // Hash the combined identity (same process as encryption)
      const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedKeyMaterial = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log('🔐 [EncryptionManager] Key derivation:', {
        hashedKeyMaterial: hashedKeyMaterial.substring(0, 64) + '...',
        hashedKeyMaterialLength: hashedKeyMaterial.length
      });
      
      const key = await this.deriveKey(hashedKeyMaterial, salt);
      const ivBuffer = this.base64ToArrayBuffer(iv);
      const dataBuffer = this.base64ToArrayBuffer(encryptedData);
      
      // Use crypto.subtle for file decryption
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        dataBuffer
      );
      
      console.log('✅ [EncryptionManager] Decryption successful');
      return new Uint8Array(decryptedBuffer);
    } catch (error: any) {
      console.error('❌ [EncryptionManager] Decryption failed:', {
        error: error?.message || error,
        errorName: error?.name,
        hasPnId: !!pnId,
        pnIdLength: pnId?.length,
        pnIdPreview: pnId?.substring(0, 30),
        hasPublicKey: !!publicKey,
        publicKeyLength: publicKey?.length,
        publicKeyPreview: publicKey?.substring(0, 50),
        saltLength: salt?.length,
        ivLength: iv?.length,
        encryptedDataLength: encryptedData?.length
      });
      throw error;
    }
  }

  /**
   * Derive encryption key from key material and salt
   * MUST match dashboard's parameters: 1M iterations, SHA-512
   */
  private async deriveKey(keyMaterial: string, salt: string): Promise<CryptoKey> {
    const saltBuffer = this.base64ToArrayBuffer(salt);
    const keyMaterialBuffer = new TextEncoder().encode(keyMaterial);
    
    // Import key material
    const baseKey = await crypto.subtle.importKey(
      'raw',
      keyMaterialBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive key using PBKDF2 - MUST match dashboard: 1M iterations, SHA-512
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 1000000, // Military-grade: 1M iterations (matches dashboard)
        hash: 'SHA-512' // Military-grade: SHA-512 (matches dashboard)
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
  }

  /**
   * Generate random salt for key derivation
   */
  private async generateSalt(): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return this.arrayBufferToBase64(salt.buffer);
  }

  /**
   * Generate random IV for encryption
   */
  private generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

