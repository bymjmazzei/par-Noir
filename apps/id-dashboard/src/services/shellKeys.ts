/**
 * Keys from the current shell unlock: ML-KEM (cloud vault, Pen docKeys) and ML-DSA
 * (authorship and ZK proofs). Lock clears them. They never go to the API.
 */
const mlKemSecrets = new Map<string, string>();

export type ShellSigningKeys = { mlDsaSecretKey: string; mlDsaPublicKey: string };
const signingKeys = new Map<string, ShellSigningKeys>();

export function rememberShellMlKem(ids: Array<string | null | undefined>, secret: string): void {
  if (!secret) return;
  for (const id of ids) {
    if (id) mlKemSecrets.set(id, secret);
  }
}

export function readShellMlKem(id: string | null | undefined): string | null {
  if (!id) return null;
  return mlKemSecrets.get(id) || null;
}

export function rememberShellSigningKeys(
  ids: Array<string | null | undefined>,
  keys: ShellSigningKeys
): void {
  if (!keys.mlDsaSecretKey || !keys.mlDsaPublicKey) return;
  for (const id of ids) {
    if (id) signingKeys.set(id, keys);
  }
}

export function readShellSigningKeys(id: string | null | undefined): ShellSigningKeys | null {
  if (!id) return null;
  return signingKeys.get(id) || null;
}

export function clearShellKeys(): void {
  mlKemSecrets.clear();
  signingKeys.clear();
}
