import { describe, it, expect } from 'vitest';
import { encryptOwnerVaultShare, decryptOwnerVaultShare } from './ownerShareVault';

describe('ownerShareVault', () => {
  it('round-trips share encryption', async () => {
    const share = { index: 1, share: 'abc123share' };
    const pk = 'test-public-key-base64';
    const enc = await encryptOwnerVaultShare(share, pk);
    const dec = await decryptOwnerVaultShare(enc, pk);
    expect(dec.index).toBe(share.index);
    expect(dec.share).toBe(share.share);
  });
});
