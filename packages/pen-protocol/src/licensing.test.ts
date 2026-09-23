import { describe, it, expect } from 'vitest';
import {
  allocatePostBounty,
  assertLicensingRoot,
  assertPlatformRoyaltyConfig,
  BPS_DENOM,
  defaultLicensingRoot,
  defaultPlatformRoyaltyConfig,
  normalizeLicensingRoot,
  claimsFromLicensingRoot
} from './licensing.js';

describe('platform royalty config', () => {
  it('defaults satisfy royalty cap', () => {
    const cfg = defaultPlatformRoyaltyConfig();
    expect(assertPlatformRoyaltyConfig(cfg)).toBeNull();
    expect(cfg.contentRightsBucketBps + cfg.musicBucketBps).toBe(cfg.royaltyCapBps);
    expect(cfg.engagerPoolBps + cfg.royaltyCapBps).toBeLessThanOrEqual(BPS_DENOM);
  });
});

describe('licensing root', () => {
  it('defaults ARR with full content_rights claim to owner', () => {
    const root = defaultLicensingRoot('pn_hash_a');
    expect(root.workLicense).toBe('all-rights-reserved');
    expect(assertLicensingRoot(root)).toBeNull();
    expect(root.contracts[0]?.claimBps).toBe(BPS_DENOM);
    expect(root.contracts[0]?.splits[0]?.holderPnHash).toBe('pn_hash_a');
  });

  it('rejects duplicate party and bad splits', () => {
    expect(
      assertLicensingRoot({
        workLicense: 'cc-by',
        contracts: [
          { party: 'content_rights', claimBps: 5000, splits: [] },
          { party: 'content_rights', claimBps: 5000, splits: [] }
        ]
      })
    ).toBe('duplicate_party');

    expect(
      assertLicensingRoot({
        workLicense: 'cc-by',
        contracts: [
          {
            party: 'content_rights',
            claimBps: 10000,
            splits: [
              { holderPnHash: 'a', role: 'author', shareBps: 5000 },
              { holderPnHash: 'b', role: 'label', shareBps: 4000 }
            ]
          }
        ]
      })
    ).toBe('splits_sum');
  });

  it('normalizeLicensingRoot recovers from garbage', () => {
    const n = normalizeLicensingRoot({ workLicense: 'nope', contracts: 'x' }, 'owner');
    expect(n.workLicense).toBe('all-rights-reserved');
    expect(assertLicensingRoot(n)).toBeNull();
  });
});

describe('allocatePostBounty', () => {
  const ownerSplit = [{ holderPnHash: 'owner', role: 'author', shareBps: BPS_DENOM }];
  const artistSplit = [{ holderPnHash: 'artist', role: 'artist', shareBps: BPS_DENOM }];

  it('claim 100%/100% with music → 15 engager / 15 content / 10 music / 60 publisher', () => {
    const a = allocatePostBounty({
      contentClaimBps: BPS_DENOM,
      musicClaimBps: BPS_DENOM,
      contentSplits: ownerSplit,
      musicSplits: artistSplit,
      musicAttached: true
    });
    expect(a.engagerPoolBps).toBe(1500);
    expect(a.contentRightsClaimedBps).toBe(1500);
    expect(a.musicClaimedBps).toBe(1000);
    expect(a.publisherBps).toBe(6000);
    expect(a.contentPayees[0]?.bps).toBe(1500);
    expect(a.musicPayees[0]?.bps).toBe(1000);
  });

  it('claim 75% content leaves unclaimed bucket to publisher', () => {
    const a = allocatePostBounty({
      contentClaimBps: 7500,
      contentSplits: ownerSplit,
      musicAttached: false
    });
    // 1500 * 0.75 = 1125 claimed; music 0; engager 1500; publisher = 10000 - 1500 - 1125 = 7375
    expect(a.contentRightsClaimedBps).toBe(1125);
    expect(a.musicClaimedBps).toBe(0);
    expect(a.engagerPoolBps).toBe(1500);
    expect(a.publisherBps).toBe(7375);
    expect(a.contentPayees[0]?.bps).toBe(1125);
  });

  it('claimsFromLicensingRoot feeds allocatePostBounty', () => {
    const root = normalizeLicensingRoot(
      {
        workLicense: 'cc-by',
        contracts: [
          {
            party: 'content_rights',
            claimBps: 10000,
            splits: ownerSplit
          },
          {
            party: 'music',
            claimBps: 10000,
            splits: artistSplit
          }
        ]
      },
      'owner'
    );
    const claims = claimsFromLicensingRoot(root);
    const a = allocatePostBounty({ ...claims });
    expect(a.publisherBps).toBe(6000);
  });
});
