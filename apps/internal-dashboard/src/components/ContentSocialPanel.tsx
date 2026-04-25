import type { DashboardData } from '../types';

export function ContentSocialPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.content_social ?? [];
  return (
    <section className="panel">
      <h3>Content / Social Panel</h3>
      <p>Probe count: {probes.length}</p>
      <p>Successes: {probes.filter((p) => p.ok).length}</p>
    </section>
  );
}
