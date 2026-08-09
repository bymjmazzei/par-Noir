/**
 * Regression tests for the stale Drive token bug.
 *
 * Four separate resolvers each handed back a Google access token that had
 * already expired, so the unlock page forwarded a dead X-PN-Cloud-Access-Token
 * and the API turned Google's 401 into an HTTP 500. Every case below reproduced
 * that before the fix.
 *
 * The rule these pin down: a token that cannot be proven fresh is never
 * returned. Callers get null and must surface it, not fall back to the vault.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  ensureCloudAccessToken,
  getCloudAccessTokenFromSession,
  hasCloudCredentialsReady,
  isAccessTokenFresh,
  accountExpiresAtMs,
  resolveFreshDriveToken
} from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const VAULT_SCRIPT = resolve(HERE, '../../oauth-ui/static/oauth-cloud-vault.js');

const HOUR = 60 * 60 * 1000;
const TWO_HOURS_AGO = Date.now() - 2 * HOUR;
const AN_HOUR_OUT = Date.now() + HOUR;

/**
 * Load the generated unlock-page bundle and return the globals it publishes.
 *
 * This is the artifact the browser actually runs, so testing it here is what
 * keeps the page from drifting away from the resolver it was built from.
 */
function loadVaultScript(): Record<string, (...args: never[]) => unknown> {
  const source = readFileSync(VAULT_SCRIPT, 'utf8');
  const holder = globalThis as unknown as Record<string, unknown>;
  const previous = holder.ParNoirCloudVault;
  try {
    new Function(source)();
    return holder.ParNoirCloudVault as Record<string, (...args: never[]) => unknown>;
  } finally {
    if (previous === undefined) delete holder.ParNoirCloudVault;
    else holder.ParNoirCloudVault = previous;
  }
}

describe('expiry is read from absolute expires_at only', () => {
  it('ignores a bare expires_in rather than restarting the clock', () => {
    // expires_in has no issue time attached, so Date.now() + expires_in would
    // report a token minted this morning as having a full hour left.
    expect(accountExpiresAtMs({ expires_in: 3600 })).toBeNull();
    expect(isAccessTokenFresh({ access_token: 'ga', expires_in: 3600 })).toBe(false);
  });

  it('treats unknown expiry as not fresh', () => {
    expect(isAccessTokenFresh({ access_token: 'ga' })).toBe(false);
  });

  it('accepts a token with a future absolute expiry', () => {
    expect(isAccessTokenFresh({ access_token: 'ga', expires_at: AN_HOUR_OUT })).toBe(true);
  });

  it('rejects a token whose absolute expiry has passed', () => {
    expect(isAccessTokenFresh({ access_token: 'ga', expires_at: TWO_HOURS_AGO })).toBe(false);
  });

  it('accepts seconds-precision timestamps', () => {
    expect(isAccessTokenFresh({ access_token: 'ga', expires_at: Math.floor(AN_HOUR_OUT / 1000) })).toBe(
      true
    );
  });
});

describe('the unlock-page vault script refuses stale tokens', () => {
  it('does not return an access token that expired two hours ago', () => {
    const vault = loadVaultScript();
    const freshTokenFromEnvelope = vault.freshTokenFromEnvelope as (env: unknown) => string | null;

    const token = freshTokenFromEnvelope({
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'stale-ga',
          refresh_token: 'rt-1',
          expires_at: TWO_HOURS_AGO
        }
      ]
    });

    expect(token).toBeNull();
  });

  it('returns a token that is still valid', () => {
    const vault = loadVaultScript();
    const freshTokenFromEnvelope = vault.freshTokenFromEnvelope as (env: unknown) => string | null;

    const token = freshTokenFromEnvelope({
      googleDriveAccounts: [{ accountId: 'a1', access_token: 'good-ga', expires_at: AN_HOUR_OUT }]
    });

    expect(token).toBe('good-ga');
  });

  it('applies the same absolute-expiry rule as the TypeScript resolver', () => {
    const vault = loadVaultScript();
    const isFresh = vault.isAccessTokenFresh as (acct: unknown, now?: number) => boolean;
    const now = Date.now();

    const cases: Record<string, unknown>[] = [
      { access_token: 'ga' },
      { access_token: 'ga', expires_in: 3600 },
      { access_token: 'ga', expires_at: TWO_HOURS_AGO },
      { access_token: 'ga', expires_at: AN_HOUR_OUT },
      { access_token: 'ga', expires_at: Math.floor(AN_HOUR_OUT / 1000) },
      { refresh_token: 'rt' },
      {}
    ];

    for (const acct of cases) {
      expect(isFresh(acct, now)).toBe(isAccessTokenFresh(acct, now));
    }
  });
});

describe('resolveFreshDriveToken never returns an unusable token', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes when expiry is unknown instead of assuming the token is good', async () => {
    const out = await resolveFreshDriveToken({
      envelope: {
        googleDriveAccounts: [{ accountId: 'a1', access_token: 'stale-ga', refresh_token: 'rt-1' }]
      },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(out.token).toBe('minted-ga');
    expect(out.expiresAt).toBeGreaterThan(Date.now());
  });

  it('reports expiry_unknown when it cannot refresh and never saw an expiry', async () => {
    const out = await resolveFreshDriveToken({
      envelope: { googleDriveAccounts: [{ accountId: 'a1', access_token: 'stale-ga' }] },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(out.token).toBeNull();
    expect(out.reason).toBe('expiry_unknown');
  });

  it('reports expired when the deadline passed and there is no refresh token', async () => {
    const out = await resolveFreshDriveToken({
      envelope: {
        googleDriveAccounts: [
          { accountId: 'a1', access_token: 'stale-ga', expires_at: TWO_HOURS_AGO }
        ]
      },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(out.token).toBeNull();
    expect(out.reason).toBe('expired');
  });

  it('returns null when the refresh is rejected rather than the stale token', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });

    const out = await resolveFreshDriveToken({
      envelope: {
        googleDriveAccounts: [
          {
            accountId: 'a1',
            access_token: 'stale-ga',
            refresh_token: 'rt-1',
            expires_at: TWO_HOURS_AGO
          }
        ]
      },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(out.token).toBeNull();
    expect(out.reason).toBe('refresh_rejected');
  });

  it('returns null when the refresh request throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const out = await resolveFreshDriveToken({
      envelope: {
        googleDriveAccounts: [
          {
            accountId: 'a1',
            access_token: 'stale-ga',
            refresh_token: 'rt-1',
            expires_at: TWO_HOURS_AGO
          }
        ]
      },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(out.token).toBeNull();
    expect(out.reason).toBe('refresh_failed');
  });

  it('does not call out when the envelope already holds a fresh token', async () => {
    const out = await resolveFreshDriveToken({
      envelope: {
        googleDriveAccounts: [{ accountId: 'a1', access_token: 'good-ga', expires_at: AN_HOUR_OUT }]
      },
      authToken: 'oauth',
      apiEndpoint: 'https://api.example.com',
      path: 'test'
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.token).toBe('good-ga');
  });
});

describe('session helpers refuse stale tokens', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearAllSessionCloudCredentials();
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is not Drive-ready when the session token has expired', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', access_token: 'stale-ga', expires_at: TWO_HOURS_AGO }]
    } as never);

    expect(getCloudAccessTokenFromSession('pn-test')).toBeNull();
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
  });

  it('mints a replacement and records an absolute expiry', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'stale-ga',
          refresh_token: 'rt-1',
          expires_at: TWO_HOURS_AGO
        }
      ]
    } as never);

    const tok = await ensureCloudAccessToken({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    expect(tok).toBe('minted-ga');
    // The refreshed token must survive as session state, or the next caller
    // refreshes all over again.
    expect(getCloudAccessTokenFromSession('pn-test')).toBe('minted-ga');
    expect(hasCloudCredentialsReady('pn-test')).toBe(true);
  });

  it('does not write a relative expires_in back into the session', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        { accountId: 'a1', access_token: 'stale-ga', refresh_token: 'rt-1', expires_in: 3600 }
      ]
    } as never);

    await ensureCloudAccessToken({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    // A stored expires_in would let a later reader recompute the deadline from
    // "now" and revive a dead token.
    expect(getCloudAccessTokenFromSession('pn-test')).toBe('minted-ga');
  });

  it('returns null rather than the stale token when the refresh fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'stale-ga',
          refresh_token: 'rt-1',
          expires_at: TWO_HOURS_AGO
        }
      ]
    } as never);

    const tok = await ensureCloudAccessToken({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    expect(tok).toBeNull();
  });

  it('shares one refresh between concurrent callers', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'stale-ga',
          refresh_token: 'rt-1',
          expires_at: TWO_HOURS_AGO
        }
      ]
    } as never);

    const [a, b, c] = await Promise.all([
      ensureCloudAccessToken({
        authToken: 'oauth',
        pnIdentifier: 'pn-test',
        apiEndpoint: 'https://api.example.com'
      }),
      ensureCloudAccessToken({
        authToken: 'oauth',
        pnIdentifier: 'pn-test',
        apiEndpoint: 'https://api.example.com'
      }),
      ensureCloudAccessToken({
        authToken: 'oauth',
        pnIdentifier: 'pn-test',
        apiEndpoint: 'https://api.example.com'
      })
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect([a, b, c]).toEqual(['minted-ga', 'minted-ga', 'minted-ga']);
  });
});
