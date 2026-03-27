/**
 * @jest-environment node
 */
// OAuth PQC: ML-DSA-65 public key length validation and authorize → token flow.
// pnOAuthService imports @par-noir/pqc-crypto, which loads ESM @noble under Jest CJS — stub the package.
jest.mock('@par-noir/pqc-crypto', () => ({
  ML_DSA_65_PUBLIC_KEY_LENGTH: 1952,
}));

import { PNOAuthService } from '../modules/pnOAuthService';

const ML_DSA_65_PUBLIC_KEY_LENGTH = 1952;

function fakeMlDsa65PublicKeyBase64(): string {
  return Buffer.alloc(ML_DSA_65_PUBLIC_KEY_LENGTH, 0x42).toString('base64');
}

jest.mock('./database', () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  return {
    getDatabasePool: jest.fn(() => ({ query })),
  };
});

describe('PNOAuthService PQC public key (ML-DSA-65)', () => {
  it('rejects base64 public key when decoded length is not 1952 bytes', () => {
    const short = Buffer.from('not-a-real-key').toString('base64');
    expect(() =>
      PNOAuthService.generateAuthorizationCode({
        clientId: 'browser-app',
        redirectUri: 'https://app/callback',
        scope: ['scope'],
        did: 'did:key:test',
        publicKey: short,
      })
    ).toThrow(/invalid_public_key/);
  });

  it('accepts ML-DSA-65 public key and completes authorize → token → validateAccessToken', async () => {
    const pkB64 = fakeMlDsa65PublicKeyBase64();
    const code = PNOAuthService.generateAuthorizationCode({
      clientId: 'browser-app',
      redirectUri: 'https://example.com/cb',
      scope: ['read'],
      did: 'did:key:pqtest',
      publicKey: pkB64,
      pnIdentifier: 'pn-abcdef123456',
    });

    const tokenResponse = await PNOAuthService.exchangeCodeForToken({
      code,
      clientId: 'browser-app',
      redirectUri: 'https://example.com/cb',
    });

    expect(tokenResponse).not.toBeNull();
    expect(tokenResponse?.access_token).toBeDefined();
    const payload = PNOAuthService.validateAccessToken(tokenResponse!.access_token);
    expect(payload?.did).toBe('did:key:pqtest');
    expect(payload?.clientId).toBe('browser-app');
  });
});
