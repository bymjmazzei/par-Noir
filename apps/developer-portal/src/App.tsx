import { useState, type ReactNode } from 'react';
import { API_ENDPOINT } from './config/api';

function FieldHelp({ children }: { children: ReactNode }) {
  return <span className="dev-help">{children}</span>;
}

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
        `OAuth client registered: ${data.clientId}. Put that value in your app as the client id (see PN_OAUTH_INTEGRATION.md).`
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
        `API key created — copy it now; it won’t be shown again.\n\n${data.apiKey}\n\nSend this value as header X-Api-Key when your backend calls /api/v1/... on par Noir.`
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
            <p className="dev-sub">Register apps that use par Noir sign-in and API access</p>
          </div>
        </div>
      </header>

      <main className="dev-main">
        <section className="dev-intro" aria-labelledby="intro-heading">
          <h2 id="intro-heading" className="dev-intro-title">
            What this page is for
          </h2>
          <p>
            If you’re building a <strong>website or product</strong> that should talk to par Noir (for example “log in with
            par Noir” or calling par Noir’s HTTP API), this console registers that product with our servers. End users
            never paste secrets here — you do, as the builder or admin.
          </p>
          <p>
            There are <strong>two different things</strong> below, for two different jobs:
          </p>
          <ul>
            <li>
              <strong>Sign-in for your app (OAuth)</strong> — Tells par Noir which product is allowed to run the login
              flow and which URLs are safe to send people back to after login.
            </li>
            <li>
              <strong>Backend API key</strong> — A secret your <em>server</em> sends when it calls{' '}
              <code>/api/v1/...</code>, tied to one user’s par Noir id (<code>pn-…</code>).
            </li>
          </ul>
          <p>
            <strong>Typical order:</strong> (1) Paste the admin password your API host gave you. (2) Register the OAuth
            client for your app. (3) If you need server-to-server API calls,             create an API key for a test <code>pn-</code> id.
          </p>
        </section>

        <p className="dev-lead">
          API base URL: <span className="dev-api-pill">{API_ENDPOINT}</span>
        </p>

        <p className="dev-section-label">Before the forms</p>
        <div className="dev-field">
          <label htmlFor="admin-key">Admin password</label>
          <input
            id="admin-key"
            type="password"
            className="dev-input"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Paste ADMIN_API_KEY from your API deployment"
            autoComplete="off"
          />
          <FieldHelp>
            Your par Noir API (e.g. on Railway) defines a variable called <code>ADMIN_API_KEY</code>. That value unlocks
            these buttons. It is sent only to your API over HTTPS (from this browser) — not shown to end users.
          </FieldHelp>
        </div>

        {error && <div className="dev-alert dev-alert--error">{error}</div>}
        {message && <div className="dev-alert dev-alert--success">{message}</div>}

        <div className="dev-grid">
          <section className="dev-card" aria-labelledby="oauth-heading">
            <h2 id="oauth-heading">Sign-in for your app (OAuth client)</h2>
            <p className="dev-card-desc">
              Use this when your product has a “Connect par Noir” or “Sign in with par Noir” button. You get a{' '}
              <strong>client id</strong> (and the app uses it in the OAuth flow). Redirect URLs must match your real app
              URLs exactly — that stops random sites from stealing logins.
            </p>
            <div className="dev-field">
              <label htmlFor="oc-client-id">Client id</label>
              <input
                id="oc-client-id"
                className="dev-input"
                value={ocClientId}
                onChange={(e) => setOcClientId(e.target.value)}
                placeholder="e.g. my-company-web"
              />
              <FieldHelp>Stable id you choose (often like a short product name). Your frontend code will reference it.</FieldHelp>
            </div>
            <div className="dev-field">
              <label htmlFor="oc-name">Display name</label>
              <input
                id="oc-name"
                className="dev-input"
                value={ocName}
                onChange={(e) => setOcName(e.target.value)}
                placeholder="e.g. My Company Dashboard"
              />
              <FieldHelp>Human-readable name people may see on consent or internal lists.</FieldHelp>
            </div>
            <div className="dev-field">
              <label htmlFor="oc-desc">Description (optional)</label>
              <input
                id="oc-desc"
                className="dev-input"
                value={ocDescription}
                onChange={(e) => setOcDescription(e.target.value)}
                placeholder="Internal note what this app is"
              />
            </div>
            <div className="dev-field">
              <label htmlFor="oc-redirect">Allowed return URLs after login</label>
              <textarea
                id="oc-redirect"
                className="dev-textarea"
                value={ocRedirectUris}
                onChange={(e) => setOcRedirectUris(e.target.value)}
              />
              <FieldHelp>
                One URL per line. After sign-in, par Noir only redirects to these addresses. Use your real https://
                production URL and local dev URLs (e.g. http://localhost:5173/...) as needed.
              </FieldHelp>
            </div>
            <div className="dev-field">
              <label htmlFor="oc-scopes">Permission labels (scopes)</label>
              <input
                id="oc-scopes"
                className="dev-input"
                value={ocScopes}
                onChange={(e) => setOcScopes(e.target.value)}
              />
              <FieldHelp>
                Space-separated tokens describing what the login may ask for. For most apps start with:{' '}
                <code>openid profile</code>. Add more only when your integration docs say so.
              </FieldHelp>
            </div>
            <button type="button" className="dev-btn" onClick={registerOAuthClient}>
              Save OAuth client
            </button>
          </section>

          <section className="dev-card" aria-labelledby="apikey-heading">
            <h2 id="apikey-heading">Backend API key</h2>
            <p className="dev-card-desc">
              Use this when <strong>your server</strong> (not the user’s browser) calls par Noir’s versioned API under{' '}
              <code>/api/v1/</code>. The key is tied to one par Noir user id so the API knows which identity it acts for.
            </p>
            <div className="dev-field">
              <label htmlFor="ak-pn">Par Noir user id (pn-…)</label>
              <input
                id="ak-pn"
                className="dev-input"
                value={akPnId}
                onChange={(e) => setAkPnId(e.target.value)}
                placeholder="e.g. pn-abc123def456"
              />
              <FieldHelp>
                The <code>pn-</code> id for the account this key represents (from the identity / dashboard side). Each key
                is scoped to that id.
              </FieldHelp>
            </div>
            <div className="dev-field">
              <label htmlFor="ak-scopes">Which API areas this key may use</label>
              <input
                id="ak-scopes"
                className="dev-input"
                value={akScopes}
                onChange={(e) => setAkScopes(e.target.value)}
              />
              <FieldHelp>
                Comma-separated. Defaults include OAuth helper routes, data points, and content index — match what your
                integration needs; tighten in production if possible.
              </FieldHelp>
            </div>
            <button type="button" className="dev-btn" onClick={createApiKey}>
              Create API key
            </button>
          </section>
        </div>

        <footer className="dev-foot">
          Step-by-step integration (code samples): <code>docs/developer/PN_OAUTH_INTEGRATION.md</code> in the par Noir
          repository.
        </footer>
      </main>
    </div>
  );
}
