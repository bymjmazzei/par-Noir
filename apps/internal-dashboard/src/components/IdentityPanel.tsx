import type { DashboardData } from '../types';

export function IdentityPanel({ data }: { data: DashboardData }) {
  const raw = data.monetizationStatus?.eligibleForFundAccrual;
  const eligible = Boolean(raw);
  const unknown = data.monetizationStatus == null;
  return (
    <section className="panel">
      <h3>Identity Panel</h3>
      <p>
        Eligible for fund accrual:{' '}
        {unknown ? (
          <span className="text-warn">unknown (no monetization payload)</span>
        ) : (
          <span className={eligible ? 'text-ok' : 'text-muted-soft'}>{eligible ? 'yes' : 'no'}</span>
        )}
      </p>
    </section>
  );
}
