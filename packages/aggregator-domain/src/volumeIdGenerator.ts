export class VolumeIdGenerator {
  /** Stable platform id from the public key only. Never derived from Key 1 or Key 2. */
  static async generateCanonicalVolumeId(publicKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(publicKey));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pn-${hexHash.substring(0, 12)}`;
  }
}
