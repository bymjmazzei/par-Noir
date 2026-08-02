/**
 * Edge cases around an empty or degraded custodian roster.
 *
 * `vault.test.ts` covers the happy quorum path. These cover the cases that decide
 * whether recovery can be forced through with no usable custodians: an empty roster,
 * approvals that reference rows the roster no longer has, revoked rows, and legacy
 * status strings that must not silently read as `accepted`.
 */
import { describe, expect, it } from 'vitest';
import {
  countAcceptedCustodians,
  computeMissingShareIndices,
  findCustodianForApproval,
  normalizeCustodianStatus,
  parseUnrevokableFlag,
  recoveryMeetsQuorumRule,
  type AssignedCustodianRow,
} from './vault';

function custodian(overrides: Partial<AssignedCustodianRow>): AssignedCustodianRow {
  return {
    custodianId: 'c1',
    name: 'Custodian',
    custodianType: 'person',
    encryptedShare: 'enc',
    shareIndex: 1,
    custodianshipCredential: 'cred',
    status: 'accepted',
    createdAt: '2026-01-01T00:00:00.000Z',
    unrevokable: false,
    ...overrides,
  };
}

describe('recoveryMeetsQuorumRule with an empty or unusable roster', () => {
  it('is never ready when the roster is empty', () => {
    const result = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'c1', shareIndex: 1 },
        { custodianId: 'c2', shareIndex: 2 },
      ],
      custodians: [],
      threshold: 2,
    });

    expect(result.approvalCount).toBe(2);
    expect(result.thresholdMet).toBe(true);
    expect(result.includesUnrevokableShare).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('missing_unrevokable_approval');
  });

  it('is not ready with no approvals and no custodians', () => {
    const result = recoveryMeetsQuorumRule({ approvals: [], custodians: [], threshold: 2 });

    expect(result.approvalCount).toBe(0);
    expect(result.thresholdMet).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('ignores approvals for custodians missing from the roster', () => {
    const result = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'ghost-1', shareIndex: 98 },
        { custodianId: 'ghost-2', shareIndex: 99 },
      ],
      custodians: [custodian({ custodianId: 'c1', unrevokable: true, shareIndex: 1 })],
      threshold: 2,
    });

    expect(result.includesUnrevokableShare).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('does not count an approval from a revoked unrevokable custodian', () => {
    const result = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'c1', shareIndex: 1 },
        { custodianId: 'c2', shareIndex: 2 },
      ],
      custodians: [
        custodian({ custodianId: 'c1', status: 'revoked', unrevokable: true, shareIndex: 1 }),
        custodian({ custodianId: 'c2', status: 'accepted', unrevokable: false, shareIndex: 2 }),
      ],
      threshold: 2,
    });

    expect(result.includesUnrevokableShare).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('does not count an unrevokable custodian that has only been invited', () => {
    const result = recoveryMeetsQuorumRule({
      approvals: [
        { custodianId: 'c1', shareIndex: 1 },
        { custodianId: 'c2', shareIndex: 2 },
      ],
      custodians: [
        custodian({ custodianId: 'c1', status: 'invited', unrevokable: true, shareIndex: 1 }),
        custodian({ custodianId: 'c2', status: 'accepted', unrevokable: false, shareIndex: 2 }),
      ],
      threshold: 2,
    });

    expect(result.includesUnrevokableShare).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('floors the threshold at 2 so a zero or one threshold cannot unlock recovery', () => {
    const approvals = [{ custodianId: 'c1', shareIndex: 1 }];
    const custodians = [custodian({ custodianId: 'c1', unrevokable: true, shareIndex: 1 })];

    for (const threshold of [0, 1, -5, Number.NaN]) {
      const result = recoveryMeetsQuorumRule({ approvals, custodians, threshold });
      expect(result.thresholdMet).toBe(false);
      expect(result.ready).toBe(false);
    }
  });
});

describe('findCustodianForApproval', () => {
  it('returns undefined against an empty roster', () => {
    expect(findCustodianForApproval([], { custodianId: 'c1', shareIndex: 1 })).toBeUndefined();
  });

  it('skips revoked rows even when the id matches', () => {
    const rows = [custodian({ custodianId: 'c1', status: 'revoked', shareIndex: 1 })];

    expect(findCustodianForApproval(rows, { custodianId: 'c1', shareIndex: 1 })).toBeUndefined();
  });

  it('matches on share index when the approval carries no custodian id', () => {
    const rows = [custodian({ custodianId: 'c1', shareIndex: 4 })];

    expect(findCustodianForApproval(rows, { shareIndex: 4 })?.custodianId).toBe('c1');
  });

  it('prefers the first non-revoked row for a reused share index', () => {
    const rows = [
      custodian({ custodianId: 'old', status: 'revoked', shareIndex: 2 }),
      custodian({ custodianId: 'new', status: 'accepted', shareIndex: 2 }),
    ];

    expect(findCustodianForApproval(rows, { shareIndex: 2 })?.custodianId).toBe('new');
  });
});

describe('normalizeCustodianStatus', () => {
  it('maps legacy active and pending to invited', () => {
    expect(normalizeCustodianStatus('active')).toBe('invited');
    expect(normalizeCustodianStatus('pending')).toBe('invited');
  });

  it('maps legacy vault to revoked', () => {
    expect(normalizeCustodianStatus('vault')).toBe('revoked');
  });

  it('defaults missing or empty status to invited, never accepted', () => {
    expect(normalizeCustodianStatus(undefined)).toBe('invited');
    expect(normalizeCustodianStatus('')).toBe('invited');
  });

  it('is case insensitive for known statuses', () => {
    expect(normalizeCustodianStatus('ACCEPTED')).toBe('accepted');
    expect(normalizeCustodianStatus('Revoked')).toBe('revoked');
  });
});

describe('parseUnrevokableFlag', () => {
  it('accepts only the explicit truthy encodings', () => {
    expect(parseUnrevokableFlag(true)).toBe(true);
    expect(parseUnrevokableFlag('true')).toBe(true);
    expect(parseUnrevokableFlag('1')).toBe(true);
  });

  it('rejects everything else, including truthy-looking values', () => {
    for (const value of [false, 'false', '0', '', 'yes', 1, null, undefined, {}]) {
      expect(parseUnrevokableFlag(value)).toBe(false);
    }
  });
});

describe('countAcceptedCustodians with degraded rosters', () => {
  it('returns zeros for an empty roster', () => {
    expect(countAcceptedCustodians([])).toEqual({
      accepted: 0,
      acceptedUnrevokable: 0,
      invited: 0,
    });
  });

  it('excludes revoked rows entirely', () => {
    const counts = countAcceptedCustodians([
      custodian({ custodianId: 'a', status: 'revoked', unrevokable: true }),
      custodian({ custodianId: 'b', status: 'vault' }),
    ]);

    expect(counts).toEqual({ accepted: 0, acceptedUnrevokable: 0, invited: 0 });
  });

  it('counts legacy active rows as invited', () => {
    const counts = countAcceptedCustodians([
      custodian({ custodianId: 'a', status: 'active' }),
      custodian({ custodianId: 'b', status: 'pending' }),
    ]);

    expect(counts.invited).toBe(2);
    expect(counts.accepted).toBe(0);
  });
});

describe('computeMissingShareIndices edge cases', () => {
  it('returns nothing when there are no shares to cover', () => {
    expect(
      computeMissingShareIndices({ totalShares: 0, assignedIndices: [], pendingIndices: [] })
    ).toEqual([]);
    expect(
      computeMissingShareIndices({ totalShares: -3, assignedIndices: [], pendingIndices: [] })
    ).toEqual([]);
  });

  it('reports every index when nothing is assigned or pending', () => {
    expect(
      computeMissingShareIndices({ totalShares: 3, assignedIndices: [], pendingIndices: [] })
    ).toEqual([1, 2, 3]);
  });

  it('ignores zero and negative indices when computing coverage', () => {
    expect(
      computeMissingShareIndices({ totalShares: 2, assignedIndices: [0, -1], pendingIndices: [0] })
    ).toEqual([1, 2]);
  });

  it('treats duplicate coverage across pending and assigned as one', () => {
    expect(
      computeMissingShareIndices({ totalShares: 3, assignedIndices: [1, 1], pendingIndices: [1, 2] })
    ).toEqual([3]);
  });
});
