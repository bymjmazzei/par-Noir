import type { DashboardData } from '../types';

export function MonetizationPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel">
      <h3>Monetization Panel</h3>
      <p>Recent periods: {data.periods.length}</p>
      <p>Payout available cents: {Number(data.monetizationStatus?.creatorFundPayoutAvailableCents ?? 0)}</p>
    </section>
  );
}
