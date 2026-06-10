import { useEffect, useState } from 'react';
import { fetchPlatformOAuthClients, patchPlatformOAuthClient } from '../../services/platformApi';

type ClientRow = {
  clientId: string;
  name: string;
  ownerPnId: string;
  status: string;
  verified: boolean;
};

export function PlatformClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { ok, data } = await fetchPlatformOAuthClients();
    if (ok) {
      setClients(
        Array.isArray((data as { clients?: ClientRow[] }).clients) ? (data as { clients: ClientRow[] }).clients : []
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleVerified = async (clientId: string, verified: boolean) => {
    const { ok } = await patchPlatformOAuthClient(clientId, { verified });
    if (ok) {
      setMsg(`Updated ${clientId}`);
      await load();
    }
  };

  const suspend = async (clientId: string) => {
    const { ok } = await patchPlatformOAuthClient(clientId, { status: 'suspended' });
    if (ok) await load();
  };

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h1>OAuth clients</h1>
        <p className="dev-lead">Monitor approved integrators on the operator registry.</p>
      </section>

      {msg && <div className="dev-alert dev-alert--success">{msg}</div>}

      {clients.map((c) => (
        <section key={c.clientId} className="dev-card" style={{ marginBottom: '1rem' }}>
          <h2>{c.name}</h2>
          <p className="dev-muted">
            <code>{c.clientId}</code> · {c.status} · {c.verified ? 'verified' : 'unverified'} · {c.ownerPnId}
          </p>
          <div className="dev-actions">
            {!c.verified && (
              <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void toggleVerified(c.clientId, true)}>
                Mark verified
              </button>
            )}
            {c.status === 'active' && (
              <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void suspend(c.clientId)}>
                Suspend
              </button>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
