/**
 * pN Name Hash Utility
 * 
 * Since pN name is a SECRET, we should never use it as a lookup key.
 * This utility provides hashed versions for safe lookups.
 */

export class PNNameHash {
  /**
   * Generate SHA-256 hash of pN name
   * 
   * @param pnName - The pN name (SECRET)
   * @returns SHA-256 hash as hex string
   */
  static async hash(pnName: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pnName);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate lookup key from pN name hash
   * Uses first 16 characters of hash for shorter keys
   * 
   * @param pnName - The pN name (SECRET)
   * @returns Lookup key (e.g., "pn_a1b2c3d4e5f6g7h8")
   */
  static async getLookupKey(pnName: string): Promise<string> {
    const hash = await this.hash(pnName);
    return `pn_${hash.substring(0, 16)}`;
  }

  /**
   * Generate full hash for storage/verification
   * 
   * @param pnName - The pN name (SECRET)
   * @returns Full 64-character hex hash
   */
  static async getFullHash(pnName: string): Promise<string> {
    return this.hash(pnName);
  }

  /**
   * Verify pN name matches hash (without exposing pN name)
   * 
   * @param pnName - The pN name to verify (SECRET)
   * @param expectedHash - The expected hash
   * @returns True if hash matches
   */
  static async verify(pnName: string, expectedHash: string): Promise<boolean> {
    const actualHash = await this.hash(pnName);
    // Constant-time comparison to prevent timing attacks
    return this.constantTimeCompare(actualHash, expectedHash);
  }

  /**
   * Constant-time string comparison
   * Prevents timing attacks
   * 
   * @param a - First string
   * @param b - Second string
   * @returns True if strings are equal
   */
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Still do comparison to maintain constant time
      const dummy = b;
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

