import type { DashboardData } from '../types';
import { cx, moduleProbeSummary } from '../statusUi';

export function MonetizationPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.monetization ?? [];
  const { ok } = moduleProbeSummary(probes);
  return (
    <section className="panel">
      <h3>Monetization Panel</h3>
      <p>
        Recent periods:{' '}
        <span className={data.periods.length > 0 ? 'text-ok' : 'text-warn'}>{data.periods.length}</span>
      </p>
      <p className="text-muted-soft">
        Payout available cents: {Number(data.monetizationStatus?.creatorFundPayoutAvailableCents ?? 0)}
      </p>
      <div
        className={cx(
          'diag-strip',
          probes.length === 0 ? 'diag-strip--warn' : ok ? 'diag-strip--ok' : 'diag-strip--bad'
        )}
      >
        {probes.length === 0 ? 'No monetization probes yet.' : ok ? 'Monetization probes succeeded.' : 'Monetization probe failed.'}
      </div>
    </section>
  );
}
