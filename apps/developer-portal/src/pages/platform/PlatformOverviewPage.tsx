import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlatformOverview } from '../../services/platformApi';

export function PlatformOverviewPage() {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void (async () => {
      const { ok, data } = await fetchPlatformOverview();
      if (ok) setOverview(data as Record<string, unknown>);
    })();
  }, []);

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h1>Platform operator</h1>
        <p className="dev-lead">Approve OAuth integrators and issue commercial licenses.</p>
      </section>

      <section className="dev-card">
        <h2>Registry status</h2>
        <ul className="dev-list">
          <li>Pending applications: {String(overview?.pendingApplications ?? '—')}</li>
          <li>Active OAuth clients: {String(overview?.activeClients ?? '—')}</li>
          <li>Active commercial licenses: {String(overview?.activeLicenses ?? '—')}</li>
        </ul>
      </section>

      <section className="dev-card">
        <h2>Quick links</h2>
        <p>
          <Link to="/platform/applications">Review applications</Link>
          {' · '}
          <Link to="/platform/licenses">Manage licenses</Link>
          {' · '}
          <Link to="/platform/clients">Monitor OAuth clients</Link>
        </p>
      </section>
    </main>
  );
}
