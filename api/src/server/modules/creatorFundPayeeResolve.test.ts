import { hashPnIdentifier, defaultLicensingRoot } from '@par-noir/pen-protocol';
import { cacheActorId } from '../utils/cacheActor';
import { addMicroWeights } from './creatorFundMicroAllocate';
import {
  buildPayeeAliasMap,
  mergeResolvedWeights,
  resolveWeightKey
} from './creatorFundPayeeResolve';

describe('creatorFundPayeeResolve', () => {
  const ownerPn = 'did:pn:owner-alice';
  const commenterPn = 'did:pn:commenter-bob';

  beforeAll(() => {
    process.env.PN_CACHE_ACTOR_PEPPER = 'test-cache-actor-pepper';
  });

  it('maps pn, hash, and HMAC aliases to plain pn', () => {
    const map = buildPayeeAliasMap([ownerPn, commenterPn]);
    expect(map.get(ownerPn)).toBe(ownerPn);
    expect(map.get(hashPnIdentifier(ownerPn))).toBe(ownerPn);
    expect(map.get(cacheActorId(commenterPn))).toBe(commenterPn);
  });

  it('micro weights with hash splits resolve to pn for payout keys', () => {
    const map = buildPayeeAliasMap([ownerPn, commenterPn]);
    const local = new Map<string, number>();
    const post = defaultLicensingRoot(ownerPn, { membership: true });
    addMicroWeights({
      target: local,
      cnt: 1,
      contentOwnerPn: ownerPn,
      orphan: false,
      trackOwnerPn: '',
      postLicensing: post,
      musicLicensing: null,
      musicAttached: false,
      commentAuthorPns: [cacheActorId(commenterPn)]
    });
    const global = new Map<string, number>();
    mergeResolvedWeights(global, local, map, ownerPn);
    expect(global.has(`r:${ownerPn}`)).toBe(true);
    expect(global.has(`e:${commenterPn}`)).toBe(true);
    expect(global.has(`r:${hashPnIdentifier(ownerPn)}`)).toBe(false);
    expect(recipientIdFromKey(`e:${commenterPn}`)).toBe(commenterPn);
  });

  it('folds unknown engager id to publisher', () => {
    const map = buildPayeeAliasMap([ownerPn]);
    const folded = resolveWeightKey('e:unknown-hmac', map, ownerPn);
    expect(folded).toBe(`e:${ownerPn}`);
  });
});

function recipientIdFromKey(key: string): string {
  return key.slice(2);
}
