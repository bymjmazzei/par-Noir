/**
 * Volume ID Generator
 * Generates stable, hashed identifiers for pN-specific folders
 * Format: pn-{12-character-hex-hash}
 */

import { cryptoWorkerManager } from './cryptoWorkerManager';

export interface VolumeIdParams {
  pnName: string;
  passcode: string;
  publicKey: string;
}

export class VolumeIdGenerator {
  /**
   * Generate a stable volume ID from pN credentials
   * Uses the same algorithm as the desktop app for consistency
   */
  static async generateVolumeId(params: VolumeIdParams): Promise<string> {
    const { pnName, passcode, publicKey } = params;

    // Combine credentials (same as desktop app)
    const combined = `${pnName}:${passcode}:${publicKey}`;

    // Hash using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Convert to hex and take first 12 characters
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const shortHash = hexHash.substring(0, 12);

    // Format: pn-{12-char-hex}
    return `pn-${shortHash}`;
  }
}

