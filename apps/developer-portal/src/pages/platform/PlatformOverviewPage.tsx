import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchPlatformOverview,
  initializePlatformRegistry,
  syncPlatformRegistry
} from '../../services/platformApi';

export function PlatformOverviewPage() {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { ok, data } = await fetchPlatformOverview();
    if (ok) setOverview(data as Record<string, unknown>);
  };

  useEffect(() => {
    void load();
  }, []);

  const initRegistry = async () => {
    setErr(null);
    setMsg(null);
    const { ok, data } = await initializePlatformRegistry();
    if (!ok) {
      setErr((data as { error_description?: string }).error_description || 'Initialize failed');
      return;
    }
    setMsg((data as { message?: string }).message || 'Registry initialized');
    await load();
  };

  const runSync = async () => {
    setErr(null);
    setMsg(null);
    const { ok, data } = await syncPlatformRegistry();
    if (!ok) {
      setErr((data as { error_description?: string }).error_description || 'Sync failed');
      return;
    }
    const sync = (data as { sync?: { syncedAt?: string } }).sync;
    setMsg(`Synced at ${sync?.syncedAt || 'now'}`);
    await load();
  };

  const lastSync = overview?.lastSync as { syncedAt?: string } | null;

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h1>Platform operator</h1>
        <p className="dev-lead">
          Approve OAuth integrators and issue commercial licenses. Source of truth lives on the operator pN Google Drive (
          <code>platform-registry.xlsx</code>); Postgres is an enforcement cache.
        </p>
      </section>

      {msg && <div className="dev-alert dev-alert--success">{msg}</div>}
      {err && <div className="dev-alert dev-alert--error">{err}</div>}

      <section className="dev-card">
        <h2>Registry status</h2>
        <ul className="dev-list">
          <li>Pending applications: {String(overview?.pendingApplications ?? '—')}</li>
          <li>Active OAuth clients: {String(overview?.activeClients ?? '—')}</li>
          <li>Active commercial licenses: {String(overview?.activeLicenses ?? '—')}</li>
          <li>Last sync: {lastSync?.syncedAt ? new Date(lastSync.syncedAt).toLocaleString() : 'Never'}</li>
        </ul>
        <div className="dev-actions">
          <button type="button" className="dev-btn" onClick={() => void initRegistry()}>
            Initialize Drive registry
          </button>
          <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void runSync()}>
            Sync to API cache
          </button>
        </div>
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
