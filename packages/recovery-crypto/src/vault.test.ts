import { describe, expect, it } from 'vitest';
import {
  isCustodianRevokable,
  recoveryMeetsQuorumRule,
  countAcceptedCustodians,
  computeMissingShareIndices,
} from './vault';

describe('recoveryMeetsQuorumRule', () => {
  const custodians = [
    { custodianId: 'c1', status: 'accepted', unrevokable: true, shareIndex: 1 },
    { custodianId: 'c2', status: 'accepted', unrevokable: false, shareIndex: 2 },
    { custodianId: 'c3', status: 'invited', unrevokable: false, shareIndex: 3 },
  ] as const;

  it('requires threshold and unrevokable approval', () => {
    const one = recoveryMeetsQuorumRule({
      approvals: [{ custodianId: 'c1', shareIndex: 1 }],
      custodians: [...custodians],
      threshold: 2,
    });
    expect(one.thresholdMet).toBe(false);
    expect(one.ready).toBe(false);

    const twoRevokableOnly = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'c2', shareIndex: 2 },
        { custodianId: 'c3', shareIndex: 3 },
      ],
      custodians: [...custodians],
      threshold: 2,
    });
    expect(twoRevokableOnly.thresholdMet).toBe(true);
    expect(twoRevokableOnly.includesUnrevokableShare).toBe(false);
    expect(twoRevokableOnly.ready).toBe(false);
    expect(twoRevokableOnly.reason).toBe('missing_unrevokable_approval');

    const ready = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'c1', shareIndex: 1 },
        { custodianId: 'c2', shareIndex: 2 },
      ],
      custodians: [...custodians],
      threshold: 2,
    });
    expect(ready.ready).toBe(true);
    expect(ready.includesUnrevokableShare).toBe(true);
  });
});

describe('isCustodianRevokable', () => {
  it('blocks unrevokable rows', () => {
    expect(isCustodianRevokable({ unrevokable: true, status: 'accepted' })).toBe(false);
    expect(isCustodianRevokable({ unrevokable: false, status: 'accepted' })).toBe(true);
  });
});

describe('computeMissingShareIndices', () => {
  it('lists indices not in pending or assigned', () => {
    expect(
      computeMissingShareIndices({
        totalShares: 5,
        assignedIndices: [1, 3],
        pendingIndices: [2],
      })
    ).toEqual([4, 5]);
  });
});

describe('countAcceptedCustodians', () => {
  it('counts accepted and protected', () => {
    const counts = countAcceptedCustodians([
      { custodianId: 'a', status: 'accepted', unrevokable: true } as never,
      { custodianId: 'b', status: 'accepted', unrevokable: false } as never,
      { custodianId: 'c', status: 'invited', unrevokable: false } as never,
    ]);
    expect(counts.accepted).toBe(2);
    expect(counts.acceptedUnrevokable).toBe(1);
    expect(counts.invited).toBe(1);
  });
});
