import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  getCloudAccessTokenFromSession,
  hasCloudCredentialsReady,
  ownerCloudHeaders
} from './index.js';

describe('ownerCloudHeaders custody ready-check', () => {
  beforeEach(() => {
    clearAllSessionCloudCredentials();
  });

  it('is not ready for empty session', () => {
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    expect(getCloudAccessTokenFromSession('pn-test')).toBeNull();
  });

  it('is not ready for layout-only shells (no secrets)', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', email: 'x@example.com' }]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(false);
    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: 'pn-test' });
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
  });

  it('is ready with refresh token even when access token missing', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', refresh_token: 'rt-1' }]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(true);
    expect(getCloudAccessTokenFromSession('pn-test')).toBeNull();
  });

  it('attaches access token header when present', () => {
    setSessionCloudCredentials('pn-test', {
      googleDriveAccounts: [{ accountId: 'a1', access_token: 'ga-1', refresh_token: 'rt-1' }]
    } as any);
    expect(hasCloudCredentialsReady('pn-test')).toBe(true);
    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: 'pn-test' });
    expect(headers['X-PN-Cloud-Access-Token']).toBe('ga-1');
    expect(headers.Authorization).toBe('Bearer oauth');
  });
});
