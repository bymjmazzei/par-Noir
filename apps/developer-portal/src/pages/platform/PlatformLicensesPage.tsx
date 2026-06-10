import { useEffect, useState } from 'react';
import { createPlatformLicense, fetchPlatformLicenses, patchPlatformLicense } from '../../services/platformApi';

type LicenseRow = {
  licenseId: string;
  granteePnId: string;
  granteeClientId?: string;
  tier: string;
  type: string;
  status: string;
  issuedAt: string;
  expiresAt?: string;
  rateLimits?: { requestsPerMinute: number; requestsPerDay: number };
};

export function PlatformLicensesPage() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [granteePnId, setGranteePnId] = useState('');
  const [granteeClientId, setGranteeClientId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { ok, data } = await fetchPlatformLicenses();
    if (ok) {
      setLicenses(
        Array.isArray((data as { licenses?: LicenseRow[] }).licenses) ? (data as { licenses: LicenseRow[] }).licenses : []
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const issue = async () => {
    setErr(null);
    setMsg(null);
    if (!granteePnId.trim()) {
      setErr('Grantee pN id is required');
      return;
    }
    const { ok, data } = await createPlatformLicense({
      granteePnId: granteePnId.trim(),
      granteeClientId: granteeClientId.trim() || undefined,
      tier: 'commercial',
      type: 'annual',
      requestsPerMinute: 500,
      requestsPerDay: 100000
    });
    if (!ok) {
      setErr((data as { error_description?: string }).error_description || 'Issue failed');
      return;
    }
    setMsg(`License issued: ${(data as { license?: { licenseId?: string } }).license?.licenseId}`);
    setGranteePnId('');
    setGranteeClientId('');
    await load();
  };

  const suspend = async (licenseId: string) => {
    const { ok } = await patchPlatformLicense(licenseId, { status: 'suspended' });
    if (ok) await load();
  };

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h1>Commercial licenses</h1>
        <p className="dev-lead">Issue and revoke commercial API licenses stored on operator Drive.</p>
      </section>

      {msg && <div className="dev-alert dev-alert--success">{msg}</div>}
      {err && <div className="dev-alert dev-alert--error">{err}</div>}

      <section className="dev-card">
        <h2>Issue license</h2>
        <label className="dev-field">
          Grantee pN id
          <input className="dev-input" value={granteePnId} onChange={(e) => setGranteePnId(e.target.value)} placeholder="pn-…" />
        </label>
        <label className="dev-field">
          Grantee client id (optional)
          <input className="dev-input" value={granteeClientId} onChange={(e) => setGranteeClientId(e.target.value)} />
        </label>
        <button type="button" className="dev-btn" onClick={() => void issue()}>
          Issue commercial license
        </button>
      </section>

      {licenses.map((lic) => (
        <section key={lic.licenseId} className="dev-card" style={{ marginTop: '1rem' }}>
          <h2>
            <code>{lic.licenseId}</code>
          </h2>
          <p className="dev-muted">
            {lic.granteePnId} · {lic.status} · {lic.tier}/{lic.type}
          </p>
          {lic.status === 'active' && (
            <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void suspend(lic.licenseId)}>
              Suspend
            </button>
          )}
        </section>
      ))}
    </main>
  );
}
