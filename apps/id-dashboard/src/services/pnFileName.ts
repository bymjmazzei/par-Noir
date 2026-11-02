import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';

/** Public key inside a pN file: a bare identity row, `{ identity }`, or `{ identities: [row] }`. */
export function pnFilePublicKey(file: unknown): string | undefined {
  if (!file || typeof file !== 'object') return undefined;
  const row = file as {
    publicKey?: unknown;
    identity?: { publicKey?: unknown };
    identities?: Array<{ publicKey?: unknown }>;
  };
  const found = [row.publicKey, row.identity?.publicKey, row.identities?.[0]?.publicKey].find(
    (value) => typeof value === 'string' && value.length > 0
  );
  return found as string | undefined;
}

/** First 8 hex of the pN id, matching the Drive root fingerprint, e.g. "pn-3f9a1c2e". */
export function pnShortName(publicKey: string | undefined): string | undefined {
  return publicKey ? `pn-${deriveCanonicalPnIdentifier(publicKey).slice(3, 11)}` : undefined;
}

/**
 * Download basename for a pN file. The full id lives inside the file (via the public key).
 * e.g. "pn-3f9a1c2e.pn" or "pn-3f9a1c2e.device-bound.pn".
 */
export function pnFileName(publicKey: string | undefined, variant?: 'device-bound'): string {
  const base = pnShortName(publicKey) ?? 'par-noir-identity';
  return variant ? `${base}.${variant}.pn` : `${base}.pn`;
}
