import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  getSessionCloudCredentials,
  normalizeCloudIdentityId,
  getCloudAccessTokenFromSession
} from './index.js';

describe('normalizeCloudIdentityId', () => {
  beforeEach(() => {
    clearAllSessionCloudCredentials();
  });

  it('maps bare and pn- prefixed ids to the same vault slot', () => {
    expect(normalizeCloudIdentityId('87f49f0fb345')).toBe('pn-87f49f0fb345');
    expect(normalizeCloudIdentityId('pn-87f49f0fb345')).toBe('pn-87f49f0fb345');

    setSessionCloudCredentials('pn-87f49f0fb345', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'ga-1',
          refresh_token: 'rt-1',
          expires_at: Date.now() + 3600_000
        }
      ]
    } as never);

    expect(getSessionCloudCredentials('87f49f0fb345')).not.toBeNull();
    expect(getCloudAccessTokenFromSession('87f49f0fb345')).toBe('ga-1');
    expect(getCloudAccessTokenFromSession('pn-87f49f0fb345')).toBe('ga-1');
  });
});
