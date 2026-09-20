export type DecryptedIdentityRecord = Record<string, unknown> & {
  id?: string;
  username?: string;
  publicKey?: string;
  privateKey?: string;
  pqcSecrets?: {
    mlDsaSecretKey?: string;
    mlKemSecretKey?: string;
    mlKemPublicKey?: string;
  };
  mlKemSecretKey?: string;
  mlKemPublicKey?: string;
};

export function extractMlDsaSecretKeyB64(decrypted: DecryptedIdentityRecord | null | undefined): string | null {
  if (!decrypted) return null;
  const sk = decrypted.pqcSecrets?.mlDsaSecretKey || decrypted.privateKey;
  return typeof sk === 'string' && sk.length > 0 ? sk : null;
}
