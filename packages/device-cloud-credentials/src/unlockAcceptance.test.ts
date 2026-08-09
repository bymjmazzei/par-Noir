/**
 * Acceptance: the reported symptom, reproduced as absent.
 *
 * Reported: "it worked, then time passed and I hard refreshed and unlocked
 * again and it asked for my permissions again", with 500s from
 * /oauth/grant/persist and /api/profile/ml-kem-public-key behind it.
 *
 * The chain was: the vault holds the access token captured when Drive was
 * connected, the unlock page handed it over unchecked, Google refused it, the
 * grant could not be read, and consent was shown again.
 *
 * This drives the real shipped bundle, not a stand-in, so it fails if the
 * generated script ever drifts from the resolver it is built from.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { sealCloudVaultWithMlKem } from './cloudVault.js';
import type { SealedEnvelope } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VAULT_SCRIPT = resolve(HERE, '../../oauth-ui/static/oauth-cloud-vault.js');

const ML_KEM_SECRET = 'test-ml-kem-secret-key';
const API = 'https://api.example.com';
const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000;

interface VaultApi {
  accessTokenFromSealedVault(
    envelope: SealedEnvelope | null,
    options: Record<string, unknown>
  ): Promise<string | null>;
}

function loadVaultScript(): VaultApi {
  const source = readFileSync(VAULT_SCRIPT, 'utf8');
  const holder = globalThis as unknown as Record<string, unknown>;
  const previous = holder.ParNoirCloudVault;
  try {
    new Function(source)();
    return holder.ParNoirCloudVault as unknown as VaultApi;
  } finally {
    if (previous === undefined) delete holder.ParNoirCloudVault;
    else holder.ParNoirCloudVault = previous;
  }
}

/** A vault sealed back when Drive was connected: its token died an hour later. */
async function sealAgedVault(): Promise<SealedEnvelope> {
  return sealCloudVaultWithMlKem(
    {
      socialCloudProvider: 'google_drive',
      googleDriveAccounts: [
        {
          accountId: 'acct-1',
          access_token: 'stale-ga',
          refresh_token: 'rt-1',
          expires_at: TWO_HOURS_AGO
        }
      ]
    } as never,
    ML_KEM_SECRET
  );
}

describe('unlocking with a vault whose token aged out', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands the grant lookup a live token instead of the dead stored one', async () => {
    const vault = loadVaultScript();
    const envelope = await sealAgedVault();

    const token = await vault.accessTokenFromSealedVault(envelope, {
      mlKemSecretKey: ML_KEM_SECRET,
      apiEndpoint: API,
      code: 'auth-code-123',
      clientId: 'browser-app'
    });

    // The whole bug in one assertion: this used to be 'stale-ga'.
    expect(token).toBe('minted-ga');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/oauth/authorize/drive-token`);
    // The unlock page has no pN access token yet, so the authorization code is
    // what proves the caller just unlocked.
    expect(JSON.parse(String(init.body))).toEqual({
      code: 'auth-code-123',
      client_id: 'browser-app',
      refresh_token: 'rt-1'
    });
  });

  it('does not call out when the sealed token is still valid', async () => {
    const vault = loadVaultScript();
    const envelope = await sealCloudVaultWithMlKem(
      {
        socialCloudProvider: 'google_drive',
        googleDriveAccounts: [
          {
            accountId: 'acct-1',
            access_token: 'good-ga',
            refresh_token: 'rt-1',
            expires_at: Date.now() + 3600_000
          }
        ]
      } as never,
      ML_KEM_SECRET
    );

    const token = await vault.accessTokenFromSealedVault(envelope, {
      mlKemSecretKey: ML_KEM_SECRET,
      apiEndpoint: API,
      code: 'auth-code-123',
      clientId: 'browser-app'
    });

    expect(token).toBe('good-ga');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null rather than a dead token when the refresh is refused', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ reason: 'rejected' })
    });

    const vault = loadVaultScript();
    const envelope = await sealAgedVault();

    const token = await vault.accessTokenFromSealedVault(envelope, {
      mlKemSecretKey: ML_KEM_SECRET,
      apiEndpoint: API,
      code: 'auth-code-123',
      clientId: 'browser-app'
    });

    // Consent will be shown, which is degraded but honest. Forwarding the dead
    // token instead produced a 500 and re-prompted anyway.
    expect(token).toBeNull();
  });

  it('does not forward a stale token when it has no way to refresh', async () => {
    const vault = loadVaultScript();
    const envelope = await sealCloudVaultWithMlKem(
      {
        socialCloudProvider: 'google_drive',
        googleDriveAccounts: [
          { accountId: 'acct-1', access_token: 'stale-ga', expires_at: TWO_HOURS_AGO }
        ]
      } as never,
      ML_KEM_SECRET
    );

    const token = await vault.accessTokenFromSealedVault(envelope, {
      mlKemSecretKey: ML_KEM_SECRET,
      apiEndpoint: API,
      code: 'auth-code-123',
      clientId: 'browser-app'
    });

    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
