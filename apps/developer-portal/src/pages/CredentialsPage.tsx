import { useState, type ReactNode } from 'react';
import { UnlockButton } from '@par-noir/oauth-ui';
import { usePortal } from '../context/PortalContext';

function FieldHelp({ children }: { children: ReactNode }) {
  return <span className="dev-help">{children}</span>;
}

export function CredentialsPage() {
  const {
    signedIn,
    loadingSession,
    authHeaders,
    refreshDashboard,
    keys,
    oauthClients,
    message,
    setMessage,
    setError,
    error,
    handleBeforeUnlock,
    onPopupResult,
    apiEndpoint,
    clientId
  } = usePortal();

  const [ocClientId, setOcClientId] = useState('');
  const [ocName, setOcName] = useState('');
  const [ocDescription, setOcDescription] = useState('');
  const [ocRedirectUris, setOcRedirectUris] = useState('https://localhost/oauth-callback.html');
  const [ocScopes, setOcScopes] = useState('openid profile');
  const [akScopes, setAkScopes] = useState('oauth,data_points,content');

  const registerOAuthClient = async () => {
    setError(null);
    setMessage(null);
    const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
    if (!t) {
      setError('Unlock your pN first.');
      return;
    }
    const redirectUris = ocRedirectUris.split('\n').map((s) => s.trim()).filter(Boolean);
    const scopes = ocScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/oauth-clients`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          clientId: ocClientId.trim(),
          name: ocName.trim(),
          description: ocDescription.trim() || undefined,
          redirectUris,
          scopes: scopes.length ? scopes : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error_description?: string }).error_description || (data as { error?: string }).error || res.statusText);
        return;
      }
      setMessage(`OAuth client registered: ${(data as { clientId?: string }).clientId}.`);
      await refreshDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const createApiKey = async () => {
    setError(null);
    setMessage(null);
    const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
    if (!t) {
      setError('Unlock your pN first.');
      return;
    }
    const scopes = akScopes.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/api-keys`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ scopes: scopes.length ? scopes : undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error_description?: string }).error_description || (data as { error?: string }).error || res.statusText);
        return;
      }
      const apiKey = (data as { apiKey?: string }).apiKey;
      setMessage(
        `API key created — copy it now; it will not be shown again.\n\n${apiKey}\n\nSend as header X-Api-Key for /api/v1/...`
      );
      await refreshDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Credentials</h2>
        <p>
          <strong>OAuth client</strong> — your app&apos;s client id and allowed redirect URLs for the unlock flow.{' '}
          <strong>Backend API key</strong> — server-only secret for <code>/api/v1/...</code>, scoped to the pN you unlock
          here.
        </p>
      </section>

      {error && <div className="dev-alert dev-alert--error">{error}</div>}
      {message && <div className="dev-alert dev-alert--success">{message}</div>}

      {!signedIn && !loadingSession && (
        <section className="dev-unlock-hero">
          <h2 className="dev-unlock-hero-title">Unlock required</h2>
          <UnlockButton
            forceRedirect
            config={{
              clientId,
              apiEndpoint,
              redirectUri: `${window.location.origin}/oauth-callback.html`,
              scope: ['openid', 'profile']
            }}
            onBeforeNavigate={handleBeforeUnlock}
            onPopupResult={onPopupResult}
            onPopupFlowFailed={(msg) => setError(msg)}
            className="dev-btn dev-btn-unlock dev-btn-unlock--large"
          >
            Unlock pN
          </UnlockButton>
        </section>
      )}

      {signedIn && (
        <>
          {(keys.length > 0 || oauthClients.length > 0) && (
            <section className="dev-summary" aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="dev-section-label">
                Your registrations
              </h2>
              {oauthClients.length > 0 && (
                <div className="dev-summary-block">
                  <h3>OAuth clients</h3>
                  <ul className="dev-summary-list">
                    {oauthClients.map((c) => (
                      <li key={c.clientId}>
                        <code>{c.clientId}</code> — {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {keys.length > 0 && (
                <div className="dev-summary-block">
                  <h3>API keys</h3>
                  <ul className="dev-summary-list">
                    {keys.map((k) => (
                      <li key={k.id}>
                        <code>{k.id.slice(0, 8)}…</code>
                        {k.isActive ? '' : ' (inactive)'} · scopes: {k.scopes.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <div className="dev-grid">
            <section className="dev-card">
              <h2>OAuth client (your app)</h2>
              <p className="dev-card-desc">
                Client id and exact redirect URLs for your product.
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
                <FieldHelp>Reserved: browser-app, prism-app, developer-portal.</FieldHelp>
              </div>
              <div className="dev-field">
                <label htmlFor="oc-name">Display name</label>
                <input
                  id="oc-name"
                  className="dev-input"
                  value={ocName}
                  onChange={(e) => setOcName(e.target.value)}
                  placeholder="e.g. My Company App"
                />
              </div>
              <div className="dev-field">
                <label htmlFor="oc-desc">Description (optional)</label>
                <input
                  id="oc-desc"
                  className="dev-input"
                  value={ocDescription}
                  onChange={(e) => setOcDescription(e.target.value)}
                />
              </div>
              <div className="dev-field">
                <label htmlFor="oc-redirect">Allowed return URLs</label>
                <textarea
                  id="oc-redirect"
                  className="dev-textarea"
                  value={ocRedirectUris}
                  onChange={(e) => setOcRedirectUris(e.target.value)}
                />
                <FieldHelp>One URL per line.</FieldHelp>
              </div>
              <div className="dev-field">
                <label htmlFor="oc-scopes">Scopes</label>
                <input id="oc-scopes" className="dev-input" value={ocScopes} onChange={(e) => setOcScopes(e.target.value)} />
                <FieldHelp>Space-separated. Typical: openid profile</FieldHelp>
              </div>
              <button type="button" className="dev-btn" onClick={registerOAuthClient}>
                Save OAuth client
              </button>
            </section>

            <section className="dev-card">
              <h2>Backend API key</h2>
              <p className="dev-card-desc">For your server calling /api/v1/...</p>
              <div className="dev-field">
                <label htmlFor="ak-scopes">Scopes</label>
                <input id="ak-scopes" className="dev-input" value={akScopes} onChange={(e) => setAkScopes(e.target.value)} />
                <FieldHelp>Comma-separated.</FieldHelp>
              </div>
              <button type="button" className="dev-btn" onClick={createApiKey}>
                Create API key
              </button>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
