import { useEffect, useState } from 'react';
import {
  approveApplication,
  fetchPlatformApplications,
  rejectApplication
} from '../../services/platformApi';

type AppRow = {
  applicationId: string;
  clientId: string;
  name: string;
  ownerPnId: string;
  status: string;
  submittedAt: string;
  redirectUris?: string[];
  scopes?: string[];
};

export function PlatformApplicationsPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { ok, data } = await fetchPlatformApplications(filter === 'pending' ? 'pending' : undefined);
    if (ok) {
      setApps(Array.isArray((data as { applications?: AppRow[] }).applications) ? (data as { applications: AppRow[] }).applications : []);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const approve = async (id: string, verified: boolean) => {
    setErr(null);
    setMsg(null);
    const { ok, data } = await approveApplication(id, { verified });
    if (!ok) {
      setErr((data as { error_description?: string }).error_description || 'Approve failed');
      return;
    }
    setMsg(`Approved ${id}`);
    await load();
  };

  const reject = async (id: string) => {
    setErr(null);
    const { ok, data } = await rejectApplication(id);
    if (!ok) {
      setErr((data as { error_description?: string }).error_description || 'Reject failed');
      return;
    }
    setMsg(`Rejected ${id}`);
    await load();
  };

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h1>OAuth applications</h1>
        <p className="dev-lead">Review integrator OAuth client registration requests.</p>
      </section>

      {msg && <div className="dev-alert dev-alert--success">{msg}</div>}
      {err && <div className="dev-alert dev-alert--error">{err}</div>}

      <div className="dev-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`dev-btn${filter === 'pending' ? '' : ' dev-btn--ghost'}`} onClick={() => setFilter('pending')}>
          Pending
        </button>
        <button type="button" className={`dev-btn${filter === 'all' ? '' : ' dev-btn--ghost'}`} onClick={() => setFilter('all')}>
          All
        </button>
      </div>

      {apps.length === 0 ? (
        <p className="dev-muted">No applications.</p>
      ) : (
        apps.map((app) => (
          <section key={app.applicationId} className="dev-card" style={{ marginBottom: '1rem' }}>
            <h2>{app.name}</h2>
            <p className="dev-muted">
              <code>{app.clientId}</code> · {app.status} · owner {app.ownerPnId}
            </p>
            <p className="dev-muted">Submitted {new Date(app.submittedAt).toLocaleString()}</p>
            {app.status === 'pending' && (
              <div className="dev-actions">
                <button type="button" className="dev-btn" onClick={() => void approve(app.applicationId, true)}>
                  Approve (verified)
                </button>
                <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void approve(app.applicationId, false)}>
                  Approve (unverified)
                </button>
                <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void reject(app.applicationId)}>
                  Reject
                </button>
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
