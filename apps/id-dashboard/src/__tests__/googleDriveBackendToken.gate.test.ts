/**
 * @jest-environment jsdom
 *
 * Gate: GoogleDriveBackend must check token freshness (or mint) before any
 * googleapis.com fetch. Unknown expiry is not fresh; dead tokens are cleared.
 */
const GOOGLE_REFRESH_PATH = '/api/auth/google-oauth/refresh';
const DRIVE_TOKEN_SKEW_MS = 60_000;

jest.mock('../utils/isDev', () => ({ isDev: () => false }));
jest.mock('../services/parNoirOAuthInline', () => ({
  getStoredToken: () => null
}));
jest.mock('../utils/integrationCredentialManager', () => ({
  IntegrationCredentialManager: {
    storeCredentials: jest.fn(),
    getCredentials: jest.fn(),
    removeCredentials: jest.fn()
  }
}));

jest.mock('@par-noir/device-cloud-credentials', () => {
  function accountExpiresAtMs(acct: Record<string, unknown>): number | null {
    const raw = acct.expires_at ?? acct.expiresAt;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
    return raw < 1e12 ? raw * 1000 : raw;
  }

  function isAccessTokenFresh(acct: Record<string, unknown>, nowMs = Date.now()): boolean {
    const token = acct.access_token ?? acct.accessToken;
    if (typeof token !== 'string' || !token.trim()) return false;
    const expiresAt = accountExpiresAtMs(acct);
    if (expiresAt == null) return false;
    return expiresAt - DRIVE_TOKEN_SKEW_MS > nowMs;
  }

  async function refreshDriveAccessToken(opts: {
    refreshToken: string;
    authToken: string;
    apiEndpoint: string;
    path: string;
  }) {
    const base = opts.apiEndpoint.replace(/\/$/, '');
    const res = await fetch(`${base}${GOOGLE_REFRESH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken: opts.refreshToken })
    });
    if (!res.ok) {
      return { token: null, reason: 'refresh_rejected' as const };
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    const minted = data.access_token?.trim() ?? '';
    if (!minted) {
      return { token: null, reason: 'refresh_failed' as const };
    }
    const expiresIn =
      typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
    return { token: minted, reason: 'ok' as const, expiresAt: Date.now() + expiresIn * 1000 };
  }

  return {
    GOOGLE_REFRESH_PATH,
    DRIVE_TOKEN_SKEW_MS,
    isAccessTokenFresh,
    refreshDriveAccessToken
  };
});

import { GoogleDriveBackend } from '../services/storage/GoogleDriveBackend';

const API = 'https://api.example.com';
const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000;

describe('GoogleDriveBackend check-then-mint', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  it('does not treat unknown expiry as fresh after connect', async () => {
    const backend = new GoogleDriveBackend({
      id: 'gd-test',
      apiEndpoint: API,
      getOwnerApiToken: () => 'owner-api-token'
    });

    await backend.connect({ token: 'ga-1', refreshToken: 'rt-1' });

    expect(backend.getAccessToken()).toBeNull();
  });

  it('refreshes via canonical API path before the first googleapis.com request', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(GOOGLE_REFRESH_PATH)) {
        return {
          ok: true,
          json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
        };
      }
      if (url.includes('googleapis.com')) {
        return {
          ok: true,
          json: async () => ({ files: [] })
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const backend = new GoogleDriveBackend({
      id: 'gd-test',
      apiEndpoint: API,
      getOwnerApiToken: () => 'owner-api-token'
    });

    await backend.connect({
      token: 'stale-ga',
      refreshToken: 'rt-1'
    });

    await backend.listFiles(undefined, 'pn-abcdef123456');

    const firstRefreshIdx = fetchMock.mock.calls.findIndex(([u]) =>
      String(u).includes(GOOGLE_REFRESH_PATH)
    );
    const firstDriveIdx = fetchMock.mock.calls.findIndex(([u]) => String(u).includes('googleapis.com'));

    expect(firstRefreshIdx).toBeGreaterThanOrEqual(0);
    expect(firstDriveIdx).toBeGreaterThan(firstRefreshIdx);
  });

  it('ensureAccessToken returns null and skips google when refresh is unavailable', async () => {
    const backend = new GoogleDriveBackend({
      id: 'gd-test',
      apiEndpoint: API,
      getOwnerApiToken: () => 'owner-api-token'
    });

    await backend.connect({
      token: 'stale-ga',
      expiresAt: TWO_HOURS_AGO
    });

    const tok = await backend.ensureAccessToken();

    expect(tok).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(backend.getAccessToken()).toBeNull();
  });

  it('ensureAccessToken mints when expiry is unknown but refresh token exists', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
    });

    const backend = new GoogleDriveBackend({
      id: 'gd-test',
      apiEndpoint: API,
      getOwnerApiToken: () => 'owner-api-token'
    });

    await backend.connect({
      token: 'stale-ga',
      refreshToken: 'rt-1'
    });

    const tok = await backend.ensureAccessToken();

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}${GOOGLE_REFRESH_PATH}`,
      expect.objectContaining({ method: 'POST' })
    );
    expect(tok).toBe('minted-ga');
    expect(backend.getAccessToken()).toBe('minted-ga');
  });
});
