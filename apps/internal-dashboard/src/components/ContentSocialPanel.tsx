import type { DashboardData } from '../types';
import { cx, moduleProbeSummary } from '../statusUi';

export function ContentSocialPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.content_social ?? [];
  const { ok } = moduleProbeSummary(probes);
  return (
    <section className="panel">
      <h3>Content / Social Panel</h3>
      <p className="text-muted-soft">Probe count: {probes.length}</p>
      <p>
        Successes:{' '}
        <span className={fail === 0 ? 'text-ok' : 'text-warn'}>{probes.filter((p) => p.ok).length}</span>
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
