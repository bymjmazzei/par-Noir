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

/** Every pN download is named by its pN identifier, e.g. "pn-87f49f0fb345.pn". */
export function pnFileName(publicKey: string | undefined, variant?: 'device-bound'): string {
  const base = publicKey ? deriveCanonicalPnIdentifier(publicKey) : 'par-noir-identity';
  return variant ? `${base}.${variant}.pn` : `${base}.pn`;
}
