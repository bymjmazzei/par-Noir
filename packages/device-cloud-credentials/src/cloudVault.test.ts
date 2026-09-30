import { describe, expect, it, vi, afterEach } from 'vitest';
import { getSessionCloudCredentials, clearAllSessionCloudCredentials } from './sessionMemory.js';
import {
  canonicalCloudSealSession,
  hydrateCloudCredentialsFromVault,
  sealCloudVault,
  sealCloudVaultWithMlKem,
  unsealCloudVault,
  unsealCloudVaultWithMlKem,
  unsealCloudVaultWithAnyFactor,
  isSealedEnvelopeShape,
  looksLikePlaintextCloudSecrets,
  CLOUD_VAULT_SEAL_SESSION_ID,
  CLOUD_VAULT_MLKEM_SESSION_ID,
  cloudVaultSealSessionFromMlKem,
  omitCloudAccessHeader
} from './cloudVault.js';

describe('cloud vault canonical seal', () => {
  afterEach(() => {
    clearAllSessionCloudCredentials();
    vi.unstubAllGlobals();
  });

  it('uses fixed session id for identity seal', () => {
    const s = canonicalCloudSealSession('alice', 'secret');
    expect(s.sessionId).toBe(CLOUD_VAULT_SEAL_SESSION_ID);
  });

  it('mlkem seal is unsealable with mlkem only', async () => {
    const creds = {
      googleDriveAccounts: [{ accountId: 'a1', accessToken: 'at', refreshToken: 'rt' }]
    };
    const sealed = await sealCloudVaultWithMlKem(creds as any, 'kem-secret');
    expect(isSealedEnvelopeShape(sealed)).toBe(true);
    expect(cloudVaultSealSessionFromMlKem('kem-secret').sessionId).toBe(CLOUD_VAULT_MLKEM_SESSION_ID);
    const opened = await unsealCloudVaultWithMlKem(sealed, 'kem-secret');
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('rt');
  });

  it('any-factor prefers mlkem then falls back to identity', async () => {
    const sealed = await sealCloudVault(
      { googleDriveAccounts: [{ refreshToken: 'legacy-rt' }] } as any,
      'alice',
      'secret'
    );
    const opened = await unsealCloudVaultWithAnyFactor(sealed, {
      mlKemSecretKey: 'wrong',
      pnName: 'alice',
      passcode: 'secret'
    });
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('legacy-rt');
  });

  it('round-trips identity seal', async () => {
    const sealed = await sealCloudVault(
      { googleDriveAccounts: [{ refreshToken: 'rt' }] } as any,
      'alice',
      'secret'
    );
    const opened = await unsealCloudVault(sealed, 'alice', 'secret');
    expect((opened.googleDriveAccounts as any)?.[0]?.refreshToken).toBe('rt');
  });

  it('detects plaintext oauth payloads', () => {
    expect(looksLikePlaintextCloudSecrets({ access_token: 'x', refresh_token: 'y' })).toBe(true);
    expect(looksLikePlaintextCloudSecrets({ googleDriveAccounts: [{ accessToken: 'x' }] })).toBe(
      true
    );
  });

  it('hydrates a sealed vault into session memory', async () => {
    const creds = {
      googleDriveAccounts: [{ accountId: 'a1', accessToken: 'at', refreshToken: 'rt' }],
    };
    const sealed = await sealCloudVaultWithMlKem(creds as never, 'kem-secret');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ envelope: sealed }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await hydrateCloudCredentialsFromVault({
      apiEndpoint: 'https://api.example.test',
      authToken: 'oauth',
      pnIdentifier: 'pn-hydrate',
      mlKemSecretKey: 'kem-secret',
    });
    expect(result.status).toBe('ready');
    expect(getSessionCloudCredentials('pn-hydrate')?.googleDriveAccounts?.[0]?.refreshToken).toBe('rt');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/storage/cloud-vault/');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('googleapis.com');
  });

  it('drops a provider access token before an API request', () => {
    const headers = omitCloudAccessHeader({
      Authorization: 'Bearer session',
      'X-PN-Cloud-Access-Token': 'google-token',
      'x-pn-cloud-access-token': 'google-token'
    });
    expect(headers.Authorization).toBe('Bearer session');
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
    expect(headers['x-pn-cloud-access-token']).toBeUndefined();
  });
});
