import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authenticateWithUnlockProofDetailed } from './mintConsentCode';
import { parseConsentUnlockParams, resolveUnlockOrigin } from './parseConsentParams';
import { DEFAULT_UNLOCK_ORIGIN, shouldUseCrossProcessBrokerHandoff } from './constants';
import { extractMlDsaSecretKeyB64 } from './extractMlDsa';
import { toUnlockVaultEnrollMaterial, assertNoVaultSecretsOnWire } from './vaultEnroll';

vi.mock('@par-noir/pqc-crypto/encoding', () => ({
  base64ToBytes: (s: string) => new TextEncoder().encode(s),
}));

vi.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: () => 'pn_test_id',
  signOauthUnlockProof: () => 'sig_b64',
}));

describe('consentUnlock mint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticate body never includes passcode or pn name', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/challenge')) {
        return {
          ok: true,
          json: async () => ({ challenge_id: 'cid', challenge: 'chal' }),
        } as Response;
      }
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      expect(body).not.toHaveProperty('passcode');
      expect(body).not.toHaveProperty('pn_name');
      expect(body).not.toHaveProperty('pnName');
      expect(body).not.toHaveProperty('password');
      expect(body).toHaveProperty('public_key');
      expect(body).toHaveProperty('signature');
      return {
        ok: true,
        json: async () => ({ code: 'authcode', existingGrant: null }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await authenticateWithUnlockProofDetailed({
      apiEndpoint: 'https://api.example.com',
      clientId: 'test-client',
      redirectUri: 'https://app.example.com/oauth-callback.html',
      publicKey: 'pk',
      mlDsaSecretKeyB64: 'c2VjcmV0',
      scope: ['openid', 'profile'],
      state: 'st',
      nonce: 'nn',
    });

    expect(result.code).toBe('authcode');
    expect(result.pnIdentifier).toBe('pn_test_id');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('passes the PKCE challenge from the deep link to authenticate', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/challenge')) {
          return { ok: true, json: async () => ({ challenge_id: 'cid', challenge: 'chal' }) } as Response;
        }
        bodies.push(JSON.parse(String(init?.body || '{}')));
        return { ok: true, json: async () => ({ code: 'authcode' }) } as Response;
      })
    );
    const p = parseConsentUnlockParams(
      `client_id=pn-agent-mcp&redirect_uri=https%3A%2F%2Fu.test%2Fcb&code_challenge=${'c'.repeat(43)}&code_challenge_method=S256`
    );
    await authenticateWithUnlockProofDetailed({
      apiEndpoint: 'https://api.example.com',
      clientId: p.clientId,
      redirectUri: p.redirectUri,
      publicKey: 'pk',
      mlDsaSecretKeyB64: 'c2VjcmV0',
      codeChallenge: p.codeChallenge,
      codeChallengeMethod: p.codeChallengeMethod,
    });
    expect(bodies[0]).toMatchObject({ code_challenge: 'c'.repeat(43), code_challenge_method: 'S256' });
  });
});

describe('shouldUseCrossProcessBrokerHandoff', () => {
  it('is false for web popup even when deliverLocalBroker is wired', () => {
    expect(
      shouldUseCrossProcessBrokerHandoff({
        popup: true,
        deliverLocalBroker: async () => {},
        openExternal: async () => {},
      })
    ).toBe(false);
  });

  it('is true for prefer-app / Cap when broker props exist and popup=false', () => {
    expect(
      shouldUseCrossProcessBrokerHandoff({
        popup: false,
        deliverLocalBroker: async () => {},
      })
    ).toBe(true);
    expect(
      shouldUseCrossProcessBrokerHandoff({
        popup: false,
        openExternal: async () => {},
      })
    ).toBe(true);
  });

  it('is false for shell even when popup is false and a broker function is wired', () => {
    expect(
      shouldUseCrossProcessBrokerHandoff({
        popup: false,
        flow: 'shell',
        deliverLocalBroker: async () => {},
        openExternal: async () => {},
      })
    ).toBe(false);
  });

  it('is false when neither broker prop is set', () => {
    expect(shouldUseCrossProcessBrokerHandoff({ popup: false })).toBe(false);
  });
});

describe('parseConsentUnlockParams', () => {
  it('reads api_endpoint and oauth fields', () => {
    const p = parseConsentUnlockParams(
      'client_id=c1&redirect_uri=https%3A%2F%2Fa.test%2Fcb&scope=openid&state=s&nonce=n&popup=true&api_endpoint=https%3A%2F%2Fapi.test'
    );
    expect(p.clientId).toBe('c1');
    expect(p.redirectUri).toBe('https://a.test/cb');
    expect(p.apiEndpoint).toBe('https://api.test');
    expect(p.popup).toBe(true);
  });
});

describe('resolveUnlockOrigin', () => {
  it('defaults to production unlock host', () => {
    expect(resolveUnlockOrigin(null)).toBe(DEFAULT_UNLOCK_ORIGIN);
    expect(resolveUnlockOrigin('https://unlock.example/')).toBe('https://unlock.example');
  });
});

describe('extractMlDsaSecretKeyB64', () => {
  it('reads pqcSecrets.mlDsaSecretKey', () => {
    expect(
      extractMlDsaSecretKeyB64({
        pqcSecrets: { mlDsaSecretKey: 'abc' },
      })
    ).toBe('abc');
  });
});

describe('vault enroll material', () => {
  it('includes sealed identity json for re-mint without re-upload', () => {
    const material = toUnlockVaultEnrollMaterial(
      {
        did: 'did:pn:1',
        publicKey: 'pk',
        encryptedIdentity: {
          publicKey: 'pk',
          encryptedData: 'ed',
          iv: 'iv',
          salt: 'salt',
        },
        decryptedIdentity: { id: 'did:pn:1', username: 'u' },
      },
      'key1',
      'key2'
    );
    expect(material.identityId).toBe('did:pn:1');
    expect(material.encryptedIdentityJson).toContain('encryptedData');
    expect(JSON.parse(material.encryptedIdentityJson).publicKey).toBe('pk');
  });

  it('rejects vault secrets on authenticate-shaped bodies', () => {
    expect(() =>
      assertNoVaultSecretsOnWire({
        public_key: 'pk',
        signature: 'sig',
        passcode: 'nope',
      })
    ).toThrow(/passcode/);
    expect(() =>
      assertNoVaultSecretsOnWire({
        public_key: 'pk',
        signature: 'sig',
        challenge_id: 'c',
      })
    ).not.toThrow();
  });
});
