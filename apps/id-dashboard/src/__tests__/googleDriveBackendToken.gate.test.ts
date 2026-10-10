/**
 * @jest-environment jsdom
 *
 * Gate: GoogleDriveBackend must check token freshness (or mint) before any
 * /api/drive/ owner call. Unknown expiry is not fresh; dead tokens are cleared.
 * Drive file I/O must use API paths (/api/drive/ or api.parnoir.com).
 * Token refresh posts to https://oauth2.googleapis.com/token.
 */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
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

jest.mock('../config/googleDriveClientId', () => ({
  getGoogleDriveClientId: async () => 'google-client',
  getGoogleDriveClientSecret: async () => 'google-secret'
}));

const ownerFetch = jest.fn();
const ownerGet = jest.fn();

jest.mock('../services/ownerApiService', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  getOwnerApiPnIdentifier: () => 'pn-abcdef123456'
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
    clientId: string;
    clientSecret: string;
    path: string;
  }) {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: opts.refreshToken,
        client_id: opts.clientId,
        client_secret: opts.clientSecret
      })
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

  async function deviceDriveCall(
    method: string,
    path: string,
    body: unknown,
    _init?: { accessToken?: string }
  ): Promise<Response> {
    const authToken = 'owner-api-token';
    if (method === 'GET') {
      const res = await ownerGet(authToken, path);
      const data = await res.json();
      return new Response(JSON.stringify(data), { status: res.ok ? 200 : 500 });
    }
    const res = await ownerFetch(authToken, method, path, body);
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: res.ok ? 200 : 500 });
  }

  return {
    GOOGLE_TOKEN_URL,
    DRIVE_TOKEN_SKEW_MS,
    isAccessTokenFresh,
    refreshDriveAccessToken,
    getSessionDriveIndex: () => null,
    findPnRootFolderId: async () => null,
    deviceDriveCall
  };
});

import { GoogleDriveBackend } from '../services/storage/GoogleDriveBackend';
import * as fs from 'fs';
import * as path from 'path';

const API = 'https://api.example.com';
const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000;

function isDriveApiPath(urlOrPath: unknown): boolean {
  const s = String(urlOrPath);
  return (
    s.includes('/api/drive/') ||
    s.includes('api.parnoir.com') ||
    s.includes('api.example.com')
  );
}

function assertNoDriveGoogleApis(urlOrPath: unknown): void {
  const s = String(urlOrPath);
  if (s.includes('oauth2.googleapis.com/token')) return;
  expect(s).not.toMatch(/googleapis\.com/i);
}

describe('GoogleDriveBackend check-then-mint', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    ownerFetch.mockReset();
    ownerGet.mockReset();
  });

  it('source file has no googleapis.com URLs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/storage/GoogleDriveBackend.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/googleapis\.com/i);
    expect(src).not.toMatch(/makeRequest/);
    expect(src).toMatch(/\/api\/drive\//);
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

  it('refreshes against Google before the first /api/drive/ request', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      assertNoDriveGoogleApis(url);
      if (url.includes(GOOGLE_TOKEN_URL)) {
        return {
          ok: true,
          json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    ownerGet.mockImplementation(async (_auth: string, pathArg: string) => {
      assertNoDriveGoogleApis(pathArg);
      expect(isDriveApiPath(pathArg)).toBe(true);
      return {
        ok: true,
        json: async () => ({ files: [] })
      };
    });
    ownerFetch.mockImplementation(async (_auth: string, _method: string, pathArg: string) => {
      assertNoDriveGoogleApis(pathArg);
      expect(isDriveApiPath(pathArg)).toBe(true);
      return {
        ok: true,
        json: async () => ({ folder: { id: 'folder-1', name: 'par Noir - pn-abcdef123456' } })
      };
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
      String(u).includes(GOOGLE_TOKEN_URL)
    );
    expect(firstRefreshIdx).toBeGreaterThanOrEqual(0);

    const driveOwnerCalls = [...ownerGet.mock.calls, ...ownerFetch.mock.calls];
    expect(driveOwnerCalls.length).toBeGreaterThan(0);
    for (const call of driveOwnerCalls) {
      const pathArg = call.find((a: unknown) => typeof a === 'string' && String(a).includes('/api/'));
      assertNoDriveGoogleApis(pathArg);
      expect(isDriveApiPath(pathArg)).toBe(true);
    }

    const googleApisFetch = fetchMock.mock.calls.find(([u]) => {
      const url = String(u);
      return url.includes('googleapis.com') && !url.includes('oauth2.googleapis.com/token');
    });
    expect(googleApisFetch).toBeUndefined();
  });

  it('ensureAccessToken returns null and skips drive API when refresh is unavailable', async () => {
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
    expect(ownerFetch).not.toHaveBeenCalled();
    expect(ownerGet).not.toHaveBeenCalled();
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
      GOOGLE_TOKEN_URL,
      expect.objectContaining({ method: 'POST' })
    );
    const refreshCall = fetchMock.mock.calls.find(([u]) => String(u).includes(GOOGLE_TOKEN_URL));
    expect(String(refreshCall?.[1]?.body)).toContain('client_secret=google-secret');
    expect(tok).toBe('minted-ga');
    expect(backend.getAccessToken()).toBe('minted-ga');
  });
});
