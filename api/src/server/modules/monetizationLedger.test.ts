import { creatorFundAvailableCents } from './monetizationService';

describe('creatorFundAvailableCents', () => {
  it('subtracts renewal debits payouts and processing from past allocations', () => {
    const available = creatorFundAvailableCents({
      payableEarnedCents: 10_000,
      paidOutCents: 2_000,
      processingReservedCents: 500,
      renewalDebitsCents: 1_500,
      inHoldEarnedCents: 0
    });
    expect(available).toBe(6_000);
  });
});
