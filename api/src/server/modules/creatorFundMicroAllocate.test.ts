import {
  defaultLicensingRoot,
  BPS_DENOM
} from '@par-noir/pen-protocol';
import {
  addMicroWeights,
  bucketForKey,
  originalityFromMetadata,
  recipientIdFromKey,
  type PayeeOriginality
} from './creatorFundMicroAllocate';
import { buildPayeeAliasMap, mergeResolvedWeights } from './creatorFundPayeeResolve';
import { COPY_RANK_DEMOTION, VERIFIED_ORIGINAL_RANK_BOOST, originalityRankAdjust } from './discoveryRank';

describe('creatorFundMicroAllocate', () => {
  it('maps keys to micro buckets', () => {
    expect(bucketForKey('e:alice')).toBe('engager_verified');
    expect(bucketForKey('r:bob')).toBe('content_rights_verified');
    expect(bucketForKey('m:artist')).toBe('music_verified');
    expect(bucketForKey('c:pub')).toBe('publisher_verified');
    expect(recipientIdFromKey('c:pub')).toBe('pub');
  });

  it('implied post without music / comments → engager folds to publisher + content + residual', () => {
    const target = new Map<string, number>();
    const post = defaultLicensingRoot('owner', { membership: true });
    addMicroWeights({
      target,
      cnt: 1,
      contentOwnerPn: 'owner',
      orphan: false,
      trackOwnerPn: '',
      postLicensing: post,
      musicLicensing: null,
      musicAttached: false,
      commentAuthorPns: []
    });
    expect(target.get('c:owner')).toBe(1500 + 7000);
    expect(target.get('r:owner')).toBe(1500);
    let sum = 0;
    for (const w of target.values()) sum += w;
    expect(sum).toBe(BPS_DENOM);
  });

  it('free family → engager + publisher only (no content claim)', () => {
    const target = new Map<string, number>();
    const post = defaultLicensingRoot('owner');
    addMicroWeights({
      target,
      cnt: 2,
      contentOwnerPn: 'owner',
      orphan: false,
      trackOwnerPn: '',
      postLicensing: post,
      musicLicensing: null,
      musicAttached: false,
      commentAuthorPns: ['c1']
    });
    expect(target.get('e:c1')).toBe(2 * 1500);
    expect(target.get('c:owner')).toBe(2 * 8500);
    expect([...target.keys()].some((k) => k.startsWith('r:'))).toBe(false);
  });

  describe('originality payees', () => {
    function weigh(originality: PayeeOriginality | null, commentAuthorPns: string[] = []) {
      const target = new Map<string, number>();
      addMicroWeights({
        target,
        cnt: 1,
        contentOwnerPn: 'uploader',
        orphan: false,
        trackOwnerPn: '',
        postLicensing: defaultLicensingRoot('uploader', { membership: true }),
        musicLicensing: null,
        musicAttached: false,
        commentAuthorPns,
        originality
      });
      return target;
    }
    const uploaderKeys = (t: Map<string, number>) => [...t.keys()].filter((k) => k.endsWith(':uploader'));

    it('a copy pays a member creator the publisher and content-rights shares, never the uploader', () => {
      const t = weigh({ kind: 'copy', creatorPn: 'ada' });
      expect(t.get('c:ada')).toBe(1500 + 7000);
      expect(t.get('r:ada')).toBe(1500);
      expect(uploaderKeys(t)).toEqual([]);
    });

    it("a copy of a non-member's work returns those shares to the fund; commenters still earn", () => {
      expect(weigh({ kind: 'copy', creatorPn: null }).size).toBe(0);
      const t = weigh({ kind: 'copy', creatorPn: null }, ['c1']);
      expect([...t.entries()]).toEqual([['e:c1', 1500]]);
    });

    it('a licensed remix keeps the publisher share and pays content rights to the creator', () => {
      const t = weigh({ kind: 'licensed_remix', creatorPn: 'ada' });
      expect(t.get('c:uploader')).toBe(1500 + 7000);
      expect(t.get('r:ada')).toBe(1500);
      expect(t.has('r:uploader')).toBe(false);

      const nonMember = weigh({ kind: 'licensed_remix', creatorPn: null });
      expect(nonMember.get('c:uploader')).toBe(1500 + 7000);
      expect([...nonMember.keys()].some((k) => k.startsWith('r:'))).toBe(false);
    });

    it('reads indexed originality from post metadata', () => {
      expect(originalityFromMetadata({ originality: { kind: 'copy' }, originalityCreatorPn: ' ada ' })).toEqual({
        kind: 'copy',
        creatorPn: 'ada'
      });
      expect(originalityFromMetadata({ originality: { kind: 'licensed_remix' } })).toEqual({
        kind: 'licensed_remix',
        creatorPn: null
      });
      expect(originalityFromMetadata({ originality: { kind: 'original' }, originalityCreatorPn: 'ada' })).toBeNull();
      expect(originalityFromMetadata(null)).toBeNull();
    });

    it('drops unknown payees instead of folding them to the uploader when a copy has no member creator', () => {
      const global = new Map<string, number>();
      mergeResolvedWeights(
        global,
        new Map([
          ['e:member', 10],
          ['e:stranger', 5]
        ]),
        buildPayeeAliasMap(['member']),
        ''
      );
      expect([...global.entries()]).toEqual([['e:member', 10]]);
    });
  });
});

describe('originality ranking', () => {
  const rank = (metadata: unknown) => originalityRankAdjust(metadata);

  it('demotes copies and gives verified originals a smaller boost', () => {
    const copy = rank({ originality: { kind: 'copy', verifiedOriginal: false }, c2pa: { trust: 'trusted' } });
    const verified = rank({ originality: { kind: 'original', verifiedOriginal: true }, c2pa: { trust: 'trusted' } });
    expect(copy).toBe(-COPY_RANK_DEMOTION);
    expect(verified).toBe(VERIFIED_ORIGINAL_RANK_BOOST);
    expect(VERIFIED_ORIGINAL_RANK_BOOST).toBeLessThan(COPY_RANK_DEMOTION);
    expect(copy).toBeLessThan(rank({}));
  });

  it('gives no boost to untrusted or self-signed manifests, remixes, or posts without credentials', () => {
    expect(rank({ originality: { kind: 'original', verifiedOriginal: true }, c2pa: { trust: 'untrusted' } })).toBe(0);
    expect(rank({ originality: { kind: 'original', verifiedOriginal: false }, c2pa: { trust: 'trusted' } })).toBe(0);
    expect(rank({ originality: { kind: 'licensed_remix', verifiedOriginal: false }, c2pa: { trust: 'trusted' } })).toBe(0);
    expect(rank({ originality: { kind: 'original', verifiedOriginal: false, reason: 'no_manifest' } })).toBe(0);
    expect(rank(null)).toBe(0);
  });
});
