/**
 * Volume ID Generator - STANDARDIZED pN IDENTIFIER GENERATION
 * 
 * This is the ONLY method for generating pN identifiers across all implementations.
 * 
 * STANDARDIZED FORMULA (used everywhere):
 *   1. Combine: `${pnName}:${passcode}:${publicKey}`
 *   2. Hash: SHA256(combined string)
 *   3. Extract: First 12 characters of hex representation
 *   4. Format: `pn-{12-char-hex-hash}`
 * 
 * This formula produces the SAME result every time for the same credentials,
 * regardless of where it's generated (web, desktop, mobile, API, etc.)
 * 
 * Format: pn-{12-character-hex-hash}
 */

export interface VolumeIdParams {
  pnName: string;
  passcode: string;
  publicKey: string;
}

export class VolumeIdGenerator {
  /**
   * STANDARDIZED pN Identifier Generation
   * 
   * This is the ONLY method used across all implementations.
   * Same credentials always produce the same identifier.
   * 
   * Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
   * 
   * @param params - pN credentials (pnName, passcode, publicKey)
   * @returns Standardized pN identifier: pn-{12-char-hex-hash}
   */
  static async generateVolumeId(params: VolumeIdParams): Promise<string> {
    const { pnName, passcode, publicKey } = params;

    // STANDARDIZED: Combine credentials in exact order: pnName:passcode:publicKey
    const combined = `${pnName}:${passcode}:${publicKey}`;

    // STANDARDIZED: Hash using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // STANDARDIZED: Convert to hex and take first 12 characters
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const shortHash = hexHash.substring(0, 12);

    // STANDARDIZED: Format: pn-{12-char-hex}
    return `pn-${shortHash}`;
  }
}

