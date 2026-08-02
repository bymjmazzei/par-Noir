/**
 * Volume ID Generator - STANDARDIZED pN IDENTIFIER GENERATION
 */

export interface VolumeIdParams {
  pnName: string;
  passcode: string;
  publicKey: string;
}

export class VolumeIdGenerator {
  /** Stable platform id (passcode-independent). Prefer for OAuth and API binding. */
  static async generateCanonicalVolumeId(publicKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(publicKey));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pn-${hexHash.substring(0, 12)}`;
  }

  /** Legacy: includes passcode in hash. Used only for backward lookup during migration. */
  static async generateVolumeId(params: VolumeIdParams): Promise<string> {
    const { pnName, passcode, publicKey } = params;
    const combined = `${pnName}:${passcode}:${publicKey}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(combined));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pn-${hexHash.substring(0, 12)}`;
  }
}
