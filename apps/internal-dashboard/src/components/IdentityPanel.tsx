import type { DashboardData } from '../types';

export function IdentityPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel">
      <h3>Identity Panel</h3>
      <p>Eligible for fund accrual: {String(Boolean(data.monetizationStatus?.eligibleForFundAccrual))}</p>
    </section>
  );
}
