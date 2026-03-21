import { useState } from 'react';
import { API_ENDPOINT } from './config/api';

export function App() {
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ocClientId, setOcClientId] = useState('');
  const [ocName, setOcName] = useState('');
  const [ocDescription, setOcDescription] = useState('');
  const [ocRedirectUris, setOcRedirectUris] = useState('https://localhost/oauth-callback.html');
  const [ocScopes, setOcScopes] = useState('openid profile');

  const [akPnId, setAkPnId] = useState('');
  const [akScopes, setAkScopes] = useState('oauth,data_points,content');

  const headers = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (adminKey.trim()) {
      (h as Record<string, string>)['X-Admin-Key'] = adminKey.trim();
    }
    return h;
  };

  const registerOAuthClient = async () => {
    setError(null);
    setMessage(null);
    const redirectUris = ocRedirectUris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const scopes = ocScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/oauth/clients`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          clientId: ocClientId.trim(),
          name: ocName.trim(),
          description: ocDescription.trim() || undefined,
          redirectUris,
          scopes
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(
        `OAuth client registered: ${data.clientId}. Use this client_id in your app (see PN_OAUTH_INTEGRATION.md).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const createApiKey = async () => {
    setError(null);
    setMessage(null);
    const scopes = akScopes.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/admin/api-keys`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          pnId: akPnId.trim(),
          scopes: scopes.length ? scopes : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(
        `API key created (copy now; not shown again):\n\n${data.apiKey}\n\nUse as X-Api-Key for /api/v1/* (see docs).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <div className="dev-root">
      <header className="dev-header">
        <div className="dev-header-inner">
          <img className="dev-logo" src="/branding/Par-Noir-Logo-White.png" alt="par Noir" />
          <div className="dev-header-text">
            <p className="dev-title">Developer console</p>
            <p className="dev-sub">OAuth clients &amp; API keys — same visual language as the identity dashboard</p>
          </div>
        </div>
      </header>

      <main className="dev-main">
        <p className="dev-lead">
          Register OAuth clients and issue API keys for <code>/api/v1/*</code>. The API must have{' '}
          <code>ADMIN_API_KEY</code> set; send it as header <code>X-Admin-Key</code>. Endpoint:{' '}
          <span className="dev-api-pill">{API_ENDPOINT}</span>
        </p>

        <div className="dev-field">
          <label htmlFor="admin-key">Admin key (X-Admin-Key)</label>
          <input
            id="admin-key"
            type="password"
            className="dev-input"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="From server ADMIN_API_KEY"
            autoComplete="off"
          />
        </div>

        {error && <div className="dev-alert dev-alert--error">{error}</div>}
        {message && <div className="dev-alert dev-alert--success">{message}</div>}

        <div className="dev-grid">
          <section className="dev-card">
            <h2>Register OAuth client</h2>
            <div className="dev-field">
              <label htmlFor="oc-client-id">clientId</label>
              <input
                id="oc-client-id"
                className="dev-input"
                value={ocClientId}
                onChange={(e) => setOcClientId(e.target.value)}
              />
            </div>
            <div className="dev-field">
              <label htmlFor="oc-name">name</label>
              <input id="oc-name" className="dev-input" value={ocName} onChange={(e) => setOcName(e.target.value)} />
            </div>
            <div className="dev-field">
              <label htmlFor="oc-desc">description</label>
              <input
                id="oc-desc"
                className="dev-input"
                value={ocDescription}
                onChange={(e) => setOcDescription(e.target.value)}
              />
            </div>
            <div className="dev-field">
              <label htmlFor="oc-redirect">redirect URIs (one per line)</label>
              <textarea
                id="oc-redirect"
                className="dev-textarea"
                value={ocRedirectUris}
                onChange={(e) => setOcRedirectUris(e.target.value)}
              />
            </div>
            <div className="dev-field">
              <label htmlFor="oc-scopes">scopes (space-separated)</label>
              <input
                id="oc-scopes"
                className="dev-input"
                value={ocScopes}
                onChange={(e) => setOcScopes(e.target.value)}
              />
            </div>
            <button type="button" className="dev-btn" onClick={registerOAuthClient}>
              Register client
            </button>
          </section>

          <section className="dev-card">
            <h2>Issue API key</h2>
            <div className="dev-field">
              <label htmlFor="ak-pn">pnId (pN identifier the key is bound to)</label>
              <input
                id="ak-pn"
                className="dev-input"
                value={akPnId}
                onChange={(e) => setAkPnId(e.target.value)}
              />
            </div>
            <div className="dev-field">
              <label htmlFor="ak-scopes">scopes (comma-separated, optional)</label>
              <input
                id="ak-scopes"
                className="dev-input"
                value={akScopes}
                onChange={(e) => setAkScopes(e.target.value)}
              />
            </div>
            <button type="button" className="dev-btn" onClick={createApiKey}>
              Create API key
            </button>
          </section>
        </div>

        <footer className="dev-foot">
          Integration guide: <code>docs/developer/PN_OAUTH_INTEGRATION.md</code>
        </footer>
      </main>
    </div>
  );
}
