import type { DashboardData } from '../types';
import { cx, moduleProbeSummary } from '../statusUi';

export function SystemPanel({ data }: { data: DashboardData }) {
  const probes = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
  const fail = probes.filter((p) => !p.ok).length;
  const { ok } = moduleProbeSummary(probes);
  return (
    <section className="panel">
      <h3>System Panel</h3>
      <p className="text-muted-soft">Probe count: {probes.length}</p>
      <p>
        Failures:{' '}
        <span className={fail === 0 ? 'text-ok' : 'text-bad'}>{fail}</span>
      </p>
      <div
        className={cx(
          'diag-strip',
          ok || probes.length === 0 ? 'diag-strip--ok' : 'diag-strip--bad'
        )}
      >
        {probes.length === 0 ? 'No probe results yet.' : ok ? 'All probes succeeded.' : 'One or more probes failed.'}
      </div>
    </section>
  );
}
