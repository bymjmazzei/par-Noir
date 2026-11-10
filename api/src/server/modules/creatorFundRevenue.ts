/**
 * Event types that count toward creator-fund G (maintenance only — not license sales).
 * `refund` and `dispute` are negative amounts; `dispute_won` restores a disputed amount.
 */
export const CREATOR_FUND_G_EVENT_TYPES = [
  'invoice.paid',
  'maintenance_shortfall',
  'maintenance_renewal',
  'maintenance_renewal_partial',
  'refund',
  'dispute',
  'dispute_won'
] as const;

export type CreatorFundGEventType = (typeof CREATOR_FUND_G_EVENT_TYPES)[number];
