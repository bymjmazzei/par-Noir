import { describe, expect, it } from 'vitest';
import { assessCloudSessionReadiness } from '@par-noir/user-owned-storage';

/**
 * Smoke: oauth-ui gate readiness classification (shared detector).
 */
describe('cloud reconnect readiness (oauth-ui consumer)', () => {
  it('flags linkedInactive for layout-only API accounts', () => {
    expect(
      assessCloudSessionReadiness({
        apiAccounts: [{ provider: 'google_drive', accountId: 'a' }],
        socialCloudProvider: 'google_drive',
        localEnvelope: null
      })
    ).toBe('linkedInactive');
  });
});
