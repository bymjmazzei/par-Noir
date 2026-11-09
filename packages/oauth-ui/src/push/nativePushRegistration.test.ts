import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { verifyOauthUnlockProof } from '@par-noir/pqc-crypto/oauth-unlock-proof';

const keys = mlDsa65Keygen();
const publicKey = bytesToBase64(keys.publicKey);

vi.mock('../consentUnlock/decryptIdentityLocal', () => ({
  parseIdentityFileJson: (raw: unknown) => raw,
  decryptIdentityFileLocal: vi.fn(async (_row: unknown, key1: string) => {
    if (key1 === 'bad') throw new Error('wrong keys');
    return { publicKey, did: 'did:x', decryptedIdentity: {} };
  }),
  extractMlDsaSecretKeyB64: () => bytesToBase64(keys.secretKey),
}));

import { PUSH_PROOF_CLIENT_ID, PUSH_PROOF_REDIRECT_URI, registerNativePushForEntries } from './nativePushRegistration';

const entry = (key1: string) => ({
  identityId: `id-${key1}`,
  publicKey,
  key1,
  key2: 'k2',
  encryptedIdentityJson: '{}',
});

describe('registerNativePushForEntries', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs a push-register proof per pN and never sends Key 1 / Key 2', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/oauth/authorize/challenge')) {
        return { ok: true, json: async () => ({ challenge_id: 'c1', challenge: 'abc' }) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });

    const out = await registerNativePushForEntries({
      apiEndpoint: 'https://api/',
      entries: [entry('good'), entry('bad')],
      token: 'fcm-token-abcdefghijklmnop',
      platform: 'android',
    });
    expect(out).toEqual({ registered: 1, failed: 1 });

    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/oauth/push/register'))!;
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({
      client_id: PUSH_PROOF_CLIENT_ID,
      redirect_uri: PUSH_PROOF_REDIRECT_URI,
      challenge_id: 'c1',
      public_key: publicKey,
      token: 'fcm-token-abcdefghijklmnop',
      platform: 'android',
    });
    for (const secret of ['key1', 'key2', 'passcode', 'k2', 'good']) {
      expect(JSON.stringify(body)).not.toContain(`"${secret}"`);
    }
    expect(
      verifyOauthUnlockProof(
        body.signature,
        {
          challenge: 'abc',
          clientId: PUSH_PROOF_CLIENT_ID,
          redirectUri: PUSH_PROOF_REDIRECT_URI,
          scope: 'pn:push_register',
          state: body.state,
          nonce: body.nonce,
          publicKey,
        },
        publicKey
      )
    ).toBe(true);
  });
});
