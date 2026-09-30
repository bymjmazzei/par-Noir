export type ShellUnlockStoredToken = {
  accessToken: string;
  expiresAt: number;
  pnIdentifier: string;
};

/** Shell unlock has no passcode. The exchanged access token is the API token for this pN. */
export async function shellUnlockStoredToken(
  accessToken: string,
  publicKey: string,
  now = Date.now()
): Promise<ShellUnlockStoredToken> {
  const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
  return {
    accessToken,
    expiresAt: now + 60 * 60 * 1000,
    pnIdentifier: deriveCanonicalPnIdentifier(publicKey),
  };
}
