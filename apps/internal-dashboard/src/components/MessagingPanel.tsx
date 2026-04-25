import type { DashboardData } from '../types';
import { cx, moduleProbeSummary } from '../statusUi';

export function MessagingPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.messaging ?? [];
  const fail = probes.filter((p) => !p.ok).length;
  const { ok } = moduleProbeSummary(probes);
  return (
    <section className="panel">
      <h3>Messaging Panel</h3>
      <p className="text-muted-soft">Probe count: {probes.length}</p>
      <p>
        Failures: <span className={fail === 0 ? 'text-ok' : 'text-bad'}>{fail}</span>
      </p>
      <div
        className={cx(
          'diag-strip',
          probes.length === 0 ? 'diag-strip--warn' : ok ? 'diag-strip--ok' : 'diag-strip--bad'
        )}
      >
        {probes.length === 0 ? 'No probes for this bucket.' : ok ? 'Bucket healthy.' : 'Bucket has failing probes.'}
      </div>
    </section>
  );
}
