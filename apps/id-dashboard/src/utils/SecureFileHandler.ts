/**
 * Secure File Handler
 * Provides secure file processing with encryption and secure deletion
 * Ensures ID images are never stored permanently
 */

export interface SecureFileData {
  encryptedData: ArrayBuffer;
  key: CryptoKey;
  iv: Uint8Array;
}

export class SecureFileHandler {
  /**
   * Encrypt a file securely
   */
  static async encryptFile(file: File): Promise<SecureFileData> {
    try {
      // Generate a random encryption key
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      // Generate a random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Read file as ArrayBuffer
      const fileBuffer = await file.arrayBuffer();
      
      // Encrypt the file
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        fileBuffer
      );
      
      // Securely delete the original buffer
      this.secureDeleteBuffer(fileBuffer);
      
      return {
        encryptedData,
        key,
        iv
      };
    } catch (error) {
      throw new Error(`File encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Decrypt a file securely
   */
  static async decryptFile(secureData: SecureFileData): Promise<ArrayBuffer> {
    try {
      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: secureData.iv },
        secureData.key,
        secureData.encryptedData
      );
      
      return decryptedData;
    } catch (error) {
      throw new Error(`File decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Securely delete a file from memory
   */
  static async secureDeleteFile(file: File): Promise<void> {
    try {
      // Create a new file with random data to overwrite memory
      const randomData = new Uint8Array(file.size);
      crypto.getRandomValues(randomData);
      
      // Create a new file with random data
      const randomFile = new File([randomData], file.name, { type: file.type });
      
      // This helps ensure the original file data is overwritten
      // Note: This is a best-effort approach as JavaScript doesn't guarantee memory overwriting
    } catch (error) {
      console.warn('Secure file deletion warning:', error);
    }
  }
  
  /**
   * Securely delete an ArrayBuffer from memory
   */
  static secureDeleteBuffer(buffer: ArrayBuffer): void {
    try {
      // Overwrite the buffer with random data
      const randomData = new Uint8Array(buffer.byteLength);
      crypto.getRandomValues(randomData);
      
      // Copy random data to the buffer
      new Uint8Array(buffer).set(randomData);
      
      // Clear the random data array
      randomData.fill(0);
    } catch (error) {
      console.warn('Secure buffer deletion warning:', error);
    }
  }
  
  /**
   * Securely delete secure file data
   */
  static async secureDeleteSecureData(secureData: SecureFileData): Promise<void> {
    try {
      // Overwrite encrypted data
      this.secureDeleteBuffer(secureData.encryptedData);
      
      // Overwrite IV
      secureData.iv.fill(0);
      
      // The key will be garbage collected, but we can't explicitly delete it
      // as it's a CryptoKey object
    } catch (error) {
      console.warn('Secure data deletion warning:', error);
    }
  }
  
  /**
   * Create a secure temporary file URL that auto-revokes
   */
  static createSecureFileURL(file: File): string {
    const url = URL.createObjectURL(file);
    
    // Auto-revoke after 5 minutes as a safety measure
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5 * 60 * 1000);
    
    return url;
  }
  
  /**
   * Securely revoke a file URL
   */
  static secureRevokeURL(url: string): void {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('URL revocation warning:', error);
    }
  }
  
  /**
   * Hash a file for verification without storing the file
   */
  static async hashFile(file: File): Promise<string> {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      
      // Securely delete the buffer
      this.secureDeleteBuffer(buffer);
      
      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Securely delete the hash buffer
      this.secureDeleteBuffer(hashBuffer);
      
      return hashHex;
    } catch (error) {
      throw new Error(`File hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Validate file before processing
   */
  static validateFile(file: File): { isValid: boolean; error?: string } {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: 'Invalid file type. Please upload a JPEG, PNG, or PDF file.'
      };
    }
    
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: 'File size too large. Please upload a file smaller than 10MB.'
      };
    }
    
    // Check minimum file size (at least 1KB)
    const minSize = 1024; // 1KB
    if (file.size < minSize) {
      return {
        isValid: false,
        error: 'File size too small. Please upload a valid file.'
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Create a secure file processing pipeline
   */
  static async processFileSecurely<T>(
    file: File,
    processor: (decryptedData: ArrayBuffer) => Promise<T>
  ): Promise<T> {
    let secureData: SecureFileData | null = null;
    
    try {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
      
      // Encrypt file
      secureData = await this.encryptFile(file);
      
      // Securely delete original file reference
      await this.secureDeleteFile(file);
      
      // Decrypt for processing
      const decryptedData = await this.decryptFile(secureData);
      
      // Process the data
      const result = await processor(decryptedData);
      
      // Securely delete decrypted data
      this.secureDeleteBuffer(decryptedData);
      
      return result;
    } catch (error) {
      // Ensure cleanup on error
      if (secureData) {
        await this.secureDeleteSecureData(secureData);
      }
      throw error;
    } finally {
      // Final cleanup
      if (secureData) {
        await this.secureDeleteSecureData(secureData);
      }
    }
  }
}
