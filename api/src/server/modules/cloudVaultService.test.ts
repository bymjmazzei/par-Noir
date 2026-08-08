/**
 * Unit tests for opaque cloud vault storage helpers (no DB).
 */

import {
  looksLikePlaintextCloudSecrets,
} from './cloudVaultService';

describe('cloudVaultService validation', () => {
  it('rejects plaintext oauth payloads', () => {
    expect(looksLikePlaintextCloudSecrets({ access_token: 'x', refresh_token: 'y' })).toBe(true);
    expect(
      looksLikePlaintextCloudSecrets({
        googleDriveAccounts: [{ accessToken: 'x' }]
      })
    ).toBe(true);
  });

  it('accepts sealed envelope shape', () => {
    expect(
      looksLikePlaintextCloudSecrets({
        encryptedData: 'abc',
        iv: 'iv',
        salt: 'salt',
        updatedAt: new Date().toISOString()
      })
    ).toBe(false);
  });
});
