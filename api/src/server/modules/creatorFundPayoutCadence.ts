/**
 * Payee-initiated payouts execute on 1st and 15th US Eastern (policy).
 */

export function isCreatorFundPayoutCadenceDayET(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    day: 'numeric'
  }).formatToParts(now);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
  return day === 1 || day === 15;
}
