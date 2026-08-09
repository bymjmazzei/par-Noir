import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  getCloudAccessTokenFromSession,
  hasCloudCredentialsReady,
  hasCloudHydrateMaterial,
  ownerCloudHeaders,
  publishCloudDriveReady,
  PN_CLOUD_CREDENTIALS_READY_EVENT
} from './index.js';

describe('ownerCloudHeaders custody ready-check', () => {
  beforeEach(() => {
    clearAllSessionCloudCredentials();
  });

  it('is not Drive-ready for empty session', () => {
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    expect(hasCloudHydrateMaterial('pn-test')).toBe(false);
    expect(getCloudAccessTokenFromSession('pn-test')).toBeNull();
  });

  it('is not ready for layout-only shells (no secrets)', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', email: 'x@example.com' }]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    expect(hasCloudHydrateMaterial('pn-test')).toBe(false);
    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: 'pn-test' });
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
  });

  it('refresh-only is hydrate material but NOT Drive-ready', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', refresh_token: 'rt-1' }]
    } as any);
    expect(hasCloudHydrateMaterial('pn-test')).toBe(true);
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    expect(getCloudAccessTokenFromSession('pn-test')).toBeNull();
  });

  it('attaches access token header when present and unexpired (Drive-ready)', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'ga-1',
          refresh_token: 'rt-1',
          expires_at: Date.now() + 3600_000
        }
      ]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(true);
    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: 'pn-test' });
    expect(headers['X-PN-Cloud-Access-Token']).toBe('ga-1');
    expect(headers.Authorization).toBe('Bearer oauth');
  });

  it('is NOT Drive-ready for an access token with no known expiry', () => {
    // Unknown expiry used to count as fresh forever, which forwarded dead
    // tokens to Google until the user reconnected Drive.
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', access_token: 'ga-1', refresh_token: 'rt-1' }]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: 'pn-test' });
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
  });
});

describe('publishCloudDriveReady', () => {
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    clearAllSessionCloudCredentials();
    listeners.clear();
    vi.stubGlobal('window', {
      addEventListener(type: string, fn: EventListener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: EventListener) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(ev: Event) {
        const set = listeners.get(ev.type);
        if (set) for (const fn of set) fn(ev);
        return true;
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fire READY for refresh-only until mint succeeds', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', refresh_token: 'rt-1' }]
    } as any);

    let readyCount = 0;
    const onReady = () => {
      readyCount += 1;
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);

    const ok = await publishCloudDriveReady({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);

    expect(ok).toBe(true);
    expect(readyCount).toBe(1);
    expect(getCloudAccessTokenFromSession('pn-test')).toBe('minted-ga');
    expect(hasCloudCredentialsReady('pn-test')).toBe(true);
  });

  it('returns false and does not fire READY when mint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'fail' })
      }))
    );
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', refresh_token: 'rt-1' }]
    } as any);

    let readyCount = 0;
    const onReady = () => {
      readyCount += 1;
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);

    const ok = await publishCloudDriveReady({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);

    expect(ok).toBe(false);
    expect(readyCount).toBe(0);
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
  });

  it('fires READY without minting when the present token is still valid', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'ga-1',
          refresh_token: 'rt-1',
          expires_at: Date.now() + 3600_000
        }
      ]
    } as any);

    let readyCount = 0;
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, () => {
      readyCount += 1;
    });

    const ok = await publishCloudDriveReady({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    expect(ok).toBe(true);
    expect(readyCount).toBe(1);
    expect(getCloudAccessTokenFromSession('pn-test')).toBe('ga-1');
  });

  it('mints a replacement when the present token has expired', async () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'ga-1',
          refresh_token: 'rt-1',
          expires_at: Date.now() - 3600_000
        }
      ]
    } as any);

    let readyCount = 0;
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, () => {
      readyCount += 1;
    });

    const ok = await publishCloudDriveReady({
      authToken: 'oauth',
      pnIdentifier: 'pn-test',
      apiEndpoint: 'https://api.example.com'
    });

    expect(ok).toBe(true);
    expect(readyCount).toBe(1);
    expect(getCloudAccessTokenFromSession('pn-test')).toBe('minted-ga');
  });
});
