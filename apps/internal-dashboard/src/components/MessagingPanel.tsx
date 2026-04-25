import type { DashboardData } from '../types';

export function MessagingPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.messaging ?? [];
  return (
    <section className="panel">
      <h3>Messaging Panel</h3>
      <p>Probe count: {probes.length}</p>
      <p>Failures: {probes.filter((p) => !p.ok).length}</p>
    </section>
  );
}
