/**
 * Falsify: authenticate body must never include passcode / pn name.
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('crypto', {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    return arr;
  },
});

vi.mock('@par-noir/pqc-crypto/encoding', () => ({
  base64ToBytes: () => new Uint8Array([1, 2, 3]),
}));

vi.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: () => 'pn-testidentifier',
  signOauthUnlockProof: () => 'sig-b64',
}));

describe('oauthUnlockProofMint', () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('authenticateWithUnlockProof posts public_key+signature without passcode fields', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ challenge_id: 'cid', challenge: 'chal' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'auth-code' }),
      });

    const { authenticateWithUnlockProof } = await import('./oauthUnlockProofMint');
    const result = await authenticateWithUnlockProof({
      apiEndpoint: 'https://api.example.com',
      clientId: 'browser-app',
      redirectUri: 'https://app.example.com/oauth-callback.html',
      publicKey: 'pk',
      mlDsaSecretKeyB64: 'sk',
      state: 'st',
      nonce: 'nn',
    });

    expect(result.code).toBe('auth-code');
    expect(result.pnIdentifier).toBe('pn-testidentifier');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const authCall = fetchMock.mock.calls[1];
    expect(authCall[0]).toBe('https://api.example.com/oauth/authorize/authenticate');
    const body = JSON.parse(authCall[1].body as string) as Record<string, unknown>;
    expect(body.public_key).toBe('pk');
    expect(body.signature).toBe('sig-b64');
    expect(body.challenge_id).toBe('cid');
    expect(body).not.toHaveProperty('passcode');
    expect(body).not.toHaveProperty('pn_name');
    expect(body).not.toHaveProperty('pnName');
    expect(body).not.toHaveProperty('password');
  });
});
