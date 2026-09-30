/**
 * Shell unlock has no passcode. The exchanged access token is still the API
 * token for this pN, so the dashboard can fetch the sealed Drive vault.
 */
jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: (publicKey: string) => `pn-${publicKey.slice(0, 12)}`,
}));

import { shellUnlockStoredToken } from '../services/shellUnlockToken';

test('shell unlock token is bound to the pN and does not require a passcode', async () => {
  const publicKey = 'dGVzdC1wdWJsaWMta2V5';
  const record = await shellUnlockStoredToken('access-token', publicKey, 1_700_000_000_000);

  expect(record.accessToken).toBe('access-token');
  expect(record.pnIdentifier).toBe(`pn-${publicKey.slice(0, 12)}`);
  expect(record.expiresAt).toBe(1_700_000_000_000 + 60 * 60 * 1000);
  expect(record).not.toHaveProperty('passcode');
});
