import type { DashboardData } from '../types';

export function SystemPanel({ data }: { data: DashboardData }) {
  const probes = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
  return (
    <section className="panel">
      <h3>System Panel</h3>
      <p>Probe count: {probes.length}</p>
      <p>Failures: {probes.filter((p) => !p.ok).length}</p>
    </section>
  );
}
