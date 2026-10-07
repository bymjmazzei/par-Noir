import { describe, it, expect } from 'vitest';
import {
  allocatePostBounty,
  assertLicensingRoot,
  assertPlatformRoyaltyConfig,
  BPS_DENOM,
  claimsForPostWithMusic,
  defaultLicensingRoot,
  defaultPlatformRoyaltyConfig,
  licensingForTemplateReuse,
  normalizeLicensingRoot,
  claimsFromLicensingRoot,
  reuseContractForAttachments,
  reuseKindForClass
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
  it('non-membership defaults to unconditionalFree', () => {
    const root = defaultLicensingRoot('pn_hash_a');
    expect(root.family).toBe('unconditionalFree');
    expect(root.contracts).toEqual([]);
    expect(assertLicensingRoot(root)).toBeNull();
  });

  it('membership defaults to implied with full content_rights claim', () => {
    const root = defaultLicensingRoot('pn_hash_a', { membership: true });
    expect(root.family).toBe('implied');
    expect(assertLicensingRoot(root)).toBeNull();
    expect(root.contracts[0]?.claimBps).toBe(BPS_DENOM);
    expect(root.contracts[0]?.splits[0]?.holderPnHash).toBe('pn_hash_a');
  });

  it('musicAsset default uses music party', () => {
    const root = defaultLicensingRoot('artist', { membership: true, musicAsset: true });
    expect(root.contracts[0]?.party).toBe('music');
  });

  it('rejects duplicate party and bad splits', () => {
    expect(
      assertLicensingRoot({
        family: 'implied',
        workLicense: 'cc-by',
        contracts: [
          { party: 'content_rights', claimBps: 5000, splits: [] },
          { party: 'content_rights', claimBps: 5000, splits: [] }
        ]
      })
    ).toBe('duplicate_party');

    expect(
      assertLicensingRoot({
        family: 'implied',
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

  it('paid offers require priceCents > 0', () => {
    expect(
      assertLicensingRoot({
        family: 'unconditionalPaid',
        contracts: [],
        offers: [{ scope: 'personal', priceCents: 0, currency: 'usd' }]
      })
    ).toBe('paid_offer_price');

    expect(
      assertLicensingRoot({
        family: 'unconditionalPaid',
        contracts: [],
        offers: [{ scope: 'commercial', priceCents: 999, currency: 'usd' }]
      })
    ).toBeNull();
  });

  it('normalize coerces implied to free when membership false', () => {
    const n = normalizeLicensingRoot(
      {
        family: 'implied',
        contracts: [
          {
            party: 'content_rights',
            claimBps: 10000,
            splits: [{ holderPnHash: 'o', role: 'author', shareBps: 10000 }]
          }
        ]
      },
      'owner',
      { membership: false }
    );
    expect(n.family).toBe('unconditionalFree');
  });

  it('normalizeLicensingRoot recovers from garbage', () => {
    const n = normalizeLicensingRoot({ workLicense: 'nope', contracts: 'x' }, 'owner');
    expect(n.family).toBe('unconditionalFree');
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
    expect(a.contentRightsClaimedBps).toBe(1125);
    expect(a.musicClaimedBps).toBe(0);
    expect(a.engagerPoolBps).toBe(1500);
    expect(a.publisherBps).toBe(7375);
    expect(a.contentPayees[0]?.bps).toBe(1125);
  });

  it('claimsFromLicensingRoot zero for free family', () => {
    const free = defaultLicensingRoot('o');
    const c = claimsFromLicensingRoot(free);
    expect(c.contentClaimBps).toBe(0);
    expect(c.musicAttached).toBe(false);
  });

  it('claimsFromLicensingRoot feeds allocatePostBounty for implied', () => {
    const root = defaultLicensingRoot('owner', { membership: true });
    const c = claimsFromLicensingRoot(root);
    const a = allocatePostBounty({
      ...c,
      musicAttached: false
    });
    expect(a.contentRightsClaimedBps).toBe(1500);
    expect(a.publisherBps).toBe(7000);
  });

  it('claimsForPostWithMusic zeros music when music doc is free', () => {
    const post = defaultLicensingRoot('pub', { membership: true });
    const music = defaultLicensingRoot('artist');
    const c = claimsForPostWithMusic({
      postLicensing: post,
      musicLicensing: music,
      musicAttached: true
    });
    expect(c.musicAttached).toBe(true);
    expect(c.musicClaimBps).toBe(0);
  });
});

describe('reuse bucket', () => {
  it('maps widget classes onto slices and treats other forms as layout', () => {
    expect(reuseKindForClass('widgets.widget')).toBe('widget');
    expect(reuseKindForClass('widgets.sticker')).toBe('sticker');
    expect(reuseKindForClass('widgets.animation')).toBe('animation');
    expect(reuseKindForClass('widgets.transition')).toBe('transition');
    expect(reuseKindForClass('widgets.text_preset')).toBe('text_preset');
    expect(reuseKindForClass('social.note')).toBe('layout');
  });

  it('splits a layout plus a sticker across the 1500 bps bucket', () => {
    const contract = reuseContractForAttachments([
      { kind: 'layout', holderPnHash: 'author', claimBps: BPS_DENOM },
      { kind: 'sticker', holderPnHash: 'sticker_author', claimBps: BPS_DENOM }
    ]);
    expect(contract?.claimBps).toBe(5000);
    expect(contract?.splits).toEqual([
      { holderPnHash: 'author', role: 'author', shareBps: 8000 },
      { holderPnHash: 'sticker_author', role: 'author', shareBps: 2000 }
    ]);
    expect(assertLicensingRoot({ family: 'implied', contracts: [contract!] })).toBeNull();
  });

  it('splits one kind across several holders and scales by claim', () => {
    const half = reuseContractForAttachments([
      { kind: 'layout', holderPnHash: 'author', claimBps: 5000 }
    ]);
    expect(half?.claimBps).toBe(2000);
    expect(half?.splits[0]?.shareBps).toBe(BPS_DENOM);

    const stickers = reuseContractForAttachments([
      { kind: 'sticker', holderPnHash: 'a', claimBps: BPS_DENOM },
      { kind: 'sticker', holderPnHash: 'b', claimBps: BPS_DENOM }
    ]);
    expect(stickers?.claimBps).toBe(1000);
    expect(stickers?.splits.map((split) => split.shareBps)).toEqual([5000, 5000]);
  });

  it('writes an implied layout claim and leaves free and paid alone', () => {
    const implied = licensingForTemplateReuse(
      'social.note',
      defaultLicensingRoot('author_hash', { membership: true })
    );
    expect(implied.family).toBe('implied');
    expect(implied.contracts[0]?.claimBps).toBe(4000);
    expect(implied.contracts[0]?.splits[0]?.holderPnHash).toBe('author_hash');

    const free = licensingForTemplateReuse('widgets.widget', defaultLicensingRoot('author_hash'));
    expect(free.family).toBe('unconditionalFree');
    expect(free.contracts).toEqual([]);

    const paid = licensingForTemplateReuse('widgets.sticker', {
      family: 'unconditionalPaid',
      contracts: [],
      offers: [{ scope: 'personal', priceCents: 500, currency: 'usd' }]
    });
    expect(paid.family).toBe('unconditionalPaid');
    expect(paid.contracts).toEqual([]);
    expect(paid.offers?.[0]?.priceCents).toBe(500);
  });
});
