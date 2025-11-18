/**
 * Encryption Manager for Browser App
 * Decrypts files using stable pN identity (DID + publicKey)
 * Matches dashboard's EncryptionManager logic
 */

export class EncryptionManager {
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
      
      // Hash the combined identity (same process as encryption)
      const hashBuffer = await crypto.subtle.digest('SHA-256', combinedData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedKeyMaterial = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const key = await this.deriveKey(hashedKeyMaterial, salt);
      const ivBuffer = this.base64ToArrayBuffer(iv);
      const dataBuffer = this.base64ToArrayBuffer(encryptedData);
      
      // Use crypto.subtle for file decryption
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        dataBuffer
      );
      
      return new Uint8Array(decryptedBuffer);
    } catch (error: any) {
      console.error('❌ [EncryptionManager] Decryption failed:', {
        error: error?.message || error,
        errorName: error?.name,
        hasPnId: !!pnId,
        hasPublicKey: !!publicKey
      });
      throw error;
    }
  }

  /**
   * Derive encryption key from key material and salt
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
    
    // Derive key using PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
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

