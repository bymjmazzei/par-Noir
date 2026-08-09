import type { ShareToken, PublicCipherEnvelope } from './tokenDecryption';

export interface PublicShareGenerationResult {
  /** Key material only — safe to store in API publicToken */
  token: ShareToken;
  /** Ciphertext envelope — must be uploaded to owner cloud, never to API */
  envelope: PublicCipherEnvelope;
}

export function envelopeJsonBytes(envelope: PublicCipherEnvelope): Blob {
  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

export function slimPublicTokenJson(token: ShareToken): string {
  const { shareEncrypted: _omit, ...slim } = token as ShareToken & { shareEncrypted?: unknown };
  return JSON.stringify(slim);
}
