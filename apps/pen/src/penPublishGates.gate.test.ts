/**
 * Gate: Connect-to-feed targets + licensing coercion.
 * Falsifies: unverified may not ship pen-templates; unverified licensing → free.
 */

import { describe, it, expect } from 'vitest';
import {
  defaultLicensingRoot,
  type PenLicensingRoot
} from '@par-noir/pen-protocol';
import {
  assertAggregatorTargetsAllowed,
  sanitizeAggregatorTargets,
  licensingForPublish,
  PUBLIC_TEMPLATE_REQUIRES_VERIFICATION
} from './services/penPublishGates';
import { canPublishPublicTemplate, isVerifiedAuthor } from './services/penVerified';

describe('Pen publish verification gates', () => {
  it('isVerifiedAuthor fails closed until Veriff', () => {
    expect(isVerifiedAuthor(null)).toBe(false);
    expect(canPublishPublicTemplate(null)).toBe(false);
  });

  it('unverified may target browse only; pen-templates rejected', () => {
    expect(sanitizeAggregatorTargets(['browse', 'pen-templates'], false)).toEqual([
      'browse'
    ]);
    expect(assertAggregatorTargetsAllowed(['browse'], false)).toEqual(['browse']);
    expect(() => assertAggregatorTargetsAllowed(['browse', 'pen-templates'], false)).toThrow(
      PUBLIC_TEMPLATE_REQUIRES_VERIFICATION
    );
    expect(() => assertAggregatorTargetsAllowed(['pen-templates'], false)).toThrow(
      PUBLIC_TEMPLATE_REQUIRES_VERIFICATION
    );
  });

  it('verified may target browse and pen-templates', () => {
    expect(assertAggregatorTargetsAllowed(['browse', 'pen-templates'], true)).toEqual([
      'browse',
      'pen-templates'
    ]);
    expect(sanitizeAggregatorTargets(['browse', 'pen-templates'], true)).toEqual([
      'browse',
      'pen-templates'
    ]);
  });

  it('unverified licensing normalizes to unconditionalFree', () => {
    const paid: PenLicensingRoot = {
      family: 'unconditionalPaid',
      workLicense: 'all-rights-reserved',
      contracts: [],
      offers: [{ scope: 'personal', priceCents: 999, currency: 'usd' }]
    };
    const coerced = licensingForPublish(paid, 'ownerhash', { membership: false });
    expect(coerced.family).toBe('unconditionalFree');
    expect(coerced.offers).toBeUndefined();

    const implied = defaultLicensingRoot('ownerhash', { membership: true, family: 'implied' });
    expect(implied.family).toBe('implied');
    const free = licensingForPublish(implied, 'ownerhash', { membership: false });
    expect(free.family).toBe('unconditionalFree');
  });

  it('verified social licensing keeps claimBps adjustable', () => {
    const root = defaultLicensingRoot('ownerhash', { membership: true, family: 'implied' });
    expect(root.family).toBe('implied');
    expect(root.contracts[0]?.claimBps).toBe(10000);
    const adjusted: PenLicensingRoot = {
      ...root,
      contracts: root.contracts.map((c) => ({ ...c, claimBps: 5000 }))
    };
    const kept = licensingForPublish(adjusted, 'ownerhash', {
      membership: true,
      connectReady: true
    });
    expect(kept.family).toBe('implied');
    expect(kept.contracts[0]?.claimBps).toBe(5000);
  });
});
