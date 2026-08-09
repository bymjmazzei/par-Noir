/**
 * A consent screen may only offer proofs the user actually holds.
 *
 * The browser contract asks for over_21 at the verified level. That says what
 * the app wants, not what the user has: offering it regardless asked people to
 * share a proof they had never set up, and a "yes" recorded a grant nothing
 * could ever honour.
 */

import { describe, expect, it } from 'vitest';
import { resolveOfferableDataPoints } from '../verificationLevel';

const LEVELS = { over_21: 'verified' as const, email_verified: 'attested' as const };

describe('resolveOfferableDataPoints', () => {
  it('refuses to offer a proof the user does not hold', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21'],
      dataPointLevels: LEVELS,
      heldProofs: []
    });

    expect(out.over_21).toEqual({ available: false, reason: 'missing' });
  });

  it('refuses to offer a held proof that is below the required level', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21'],
      dataPointLevels: LEVELS,
      heldProofs: [{ dataPointId: 'over_21', verificationLevel: 'basic' }]
    });

    expect(out.over_21).toEqual({ available: false, reason: 'below_level' });
  });

  it('offers a held proof that meets the required level', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21'],
      dataPointLevels: LEVELS,
      heldProofs: [{ dataPointId: 'over_21', verificationLevel: 'verified' }]
    });

    expect(out.over_21).toEqual({ available: true });
  });

  it('accepts any level when the contract only asks for attested', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['email_verified'],
      dataPointLevels: LEVELS,
      heldProofs: [{ dataPointId: 'email_verified', verificationLevel: 'basic' }]
    });

    expect(out.email_verified).toEqual({ available: true });
  });

  it('refuses an expired proof', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21'],
      dataPointLevels: LEVELS,
      heldProofs: [
        {
          dataPointId: 'over_21',
          verificationLevel: 'verified',
          expiresAt: new Date(Date.now() - 1000).toISOString()
        }
      ]
    });

    expect(out.over_21).toEqual({ available: false, reason: 'expired' });
  });

  it('still offers a proof whose expiry is in the future', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21'],
      dataPointLevels: LEVELS,
      heldProofs: [
        {
          dataPointId: 'over_21',
          verificationLevel: 'verified',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString()
        }
      ]
    });

    expect(out.over_21).toEqual({ available: true });
  });

  it('judges each requested point independently', () => {
    const out = resolveOfferableDataPoints({
      requestedDataPoints: ['over_21', 'email_verified'],
      dataPointLevels: LEVELS,
      heldProofs: [{ dataPointId: 'email_verified', verificationLevel: 'basic' }]
    });

    expect(out.over_21.available).toBe(false);
    expect(out.email_verified.available).toBe(true);
  });
});
