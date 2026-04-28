export interface VolumeIdParams {
  pnName: string;
  passcode: string;
  publicKey: string;
}

export class VolumeIdGenerator {
  static async generateVolumeId(params: VolumeIdParams): Promise<string> {
    const combined = `${params.pnName}:${params.passcode}:${params.publicKey}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(combined));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `pn-${hexHash.substring(0, 12)}`;
  }
}
