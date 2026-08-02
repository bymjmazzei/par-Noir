/**
 * Memory Security Utilities
 * 
 * Provides secure memory zeroization for sensitive data.
 * Note: JavaScript strings are immutable, so zeroization is best-effort.
 */

export class MemorySecurity {
  /**
   * Securely zeroize sensitive data from memory
   * 
   * @param buffer - ArrayBuffer, Uint8Array, or string to zeroize
   */
  static zeroize(buffer: ArrayBuffer | Uint8Array | string): void {
    try {
      if (buffer instanceof ArrayBuffer) {
        const view = new Uint8Array(buffer);
        // Overwrite with random data first (defense in depth)
        crypto.getRandomValues(view);
        // Then zeroize
        view.fill(0);
      } else if (buffer instanceof Uint8Array) {
        // Overwrite with random data first
        crypto.getRandomValues(buffer);
        // Then zeroize
        buffer.fill(0);
      } else if (typeof buffer === 'string') {
        // JavaScript strings are immutable, so we can't directly zeroize them
        // But we can try to overwrite the underlying buffer if possible
        // This is best-effort - the string may still exist in memory
        const encoder = new TextEncoder();
        const bufferView = encoder.encode(buffer);
        crypto.getRandomValues(bufferView);
        bufferView.fill(0);
      }
    } catch (error) {
      // Silently fail - zeroization is best-effort
      console.warn('[MemorySecurity] Zeroization failed:', error);
    }
  }

  /**
   * Zeroize multiple buffers
   * 
   * @param buffers - Array of buffers to zeroize
   */
  static zeroizeMultiple(...buffers: (ArrayBuffer | Uint8Array | string)[]): void {
    buffers.forEach(buf => {
      try {
        this.zeroize(buf);
      } catch (error) {
        // Continue with other buffers even if one fails
      }
    });
  }

  /**
   * Secure cleanup wrapper for async operations
   * Automatically zeroizes sensitive data after operation completes
   * 
   * @param operation - Async operation that returns sensitive data
   * @param cleanup - Function to zeroize the result
   * @returns Result of operation
   */
  static async withSecureCleanup<T>(
    operation: () => Promise<T>,
    cleanup: (result: T) => void
  ): Promise<T> {
    try {
      const result = await operation();
      cleanup(result);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Zeroize credentials object
   * 
   * @param credentials - Object containing pnName and passcode
   */
  static zeroizeCredentials(credentials: { pnName: string; passcode: string }): void {
    this.zeroize(credentials.pnName);
    this.zeroize(credentials.passcode);
  }
}

