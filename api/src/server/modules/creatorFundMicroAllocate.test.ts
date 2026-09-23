import {
  defaultLicensingRoot,
  BPS_DENOM
} from '@par-noir/pen-protocol';
import {
  addMicroWeights,
  bucketForKey,
  recipientIdFromKey
} from './creatorFundMicroAllocate';

describe('creatorFundMicroAllocate', () => {
  it('maps keys to micro buckets', () => {
    expect(bucketForKey('e:alice', true)).toBe('engager_verified');
    expect(bucketForKey('r:bob', false)).toBe('content_rights_unverified');
    expect(bucketForKey('m:artist', true)).toBe('music_verified');
    expect(bucketForKey('c:pub', false)).toBe('publisher_unverified');
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
});
