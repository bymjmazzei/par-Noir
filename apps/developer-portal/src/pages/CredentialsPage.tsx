import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { UnlockButton, buildFeedEmbedUrl, buildMessagingEmbedUrl } from '@par-noir/oauth-ui';
import { usePortal } from '../context/PortalContext';

function FieldHelp({ children }: { children: ReactNode }) {
  return <span className="dev-help">{children}</span>;
}

/** Default manifest rows for common L5 scopes (label + rationale required at registration). */
export const DEFAULT_MANIFEST_PRESETS: Array<{ id: string; label: string; rationale: string }> = [
  { id: 'openid', label: 'Verify your identity', rationale: 'Required to unlock your pN for this app.' },
  {
    id: 'profile',
    label: 'Access your public profile',
    rationale: 'Show your display name and avatar in the community.'
  },
  {
    id: 'cloud:app',
    label: 'Store app data in your integrator folder',
    rationale: 'Posts and app settings live in integrators/{client_id}/ on your cloud — not on our servers.'
  },
  {
    id: 'zkp:age_attestation',
    label: 'Age attestation (zero-knowledge)',
    rationale: 'Confirm age-gated eligibility without revealing your date of birth to our servers.'
  }
];

interface PendingApplication {
  applicationId: string;
  clientId: string;
  name: string;
  status: string;
  submittedAt?: string;
  redirectUris?: string[];
  scopes?: string[];
}

function GetStartedPanel({
  clientId,
  redirectUris,
  scopes
}: {
  clientId: string;
  redirectUris: string[];
  scopes?: string[];
}) {
  const redirectHint = redirectUris[0] || 'https://your-app.com/oauth-callback.html';
  const scopeLine = (scopes && scopes.length ? scopes : ['openid', 'profile', 'cloud:app']).join(' ');
  const msgEmbed = buildMessagingEmbedUrl(clientId);
  const feedEmbed = buildFeedEmbedUrl(clientId);
  const envBlock = `VITE_PN_CLIENT_ID=${clientId}\nVITE_API_ENDPOINT=https://api.parnoir.com`;
  const embedBlock = `<!-- Messaging (channel for this client) -->\n<iframe\n  src="${msgEmbed}"\n  title="par Noir messaging"\n  style="width:100%;height:640px;border:0;"\n  allow="clipboard-write"\n></iframe>\n\n<!-- Community feed (display only) -->\n<iframe\n  src="${feedEmbed}"\n  title="par Noir community feed"\n  style="width:100%;height:640px;border:0;"\n></iframe>`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`Copied ${label}`);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="dev-get-started">
      <h4>Get started</h4>
      <p className="dev-card-desc">
        Active client <code>{clientId}</code>. Redirect URIs must match registration exactly (including path).
      </p>
      <ul className="dev-summary-list">
        {redirectUris.map((u) => (
          <li key={u}>
            <code>{u}</code>
          </li>
        ))}
      </ul>
      <p className="dev-help">Suggested scopes: <code>{scopeLine}</code></p>
      <div className="dev-get-started-actions">
        <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void copy(envBlock, '.env')}>
          Copy .env
        </button>
        <button type="button" className="dev-btn dev-btn--ghost" onClick={() => void copy(embedBlock, 'embed HTML')}>
          Copy embed iframes
        </button>
        <button
          type="button"
          className="dev-btn dev-btn--ghost"
          onClick={() => void copy(`npm install @identity-protocol/identity-sdk @par-noir/oauth-ui`, 'npm install')}
        >
          Copy npm install
        </button>
      </div>
      <pre className="dev-code-block">{envBlock}</pre>
      <p className="dev-help">
        Local callback example: <code>{redirectHint.includes('localhost') ? redirectHint : 'http://localhost:5180/oauth-callback.html'}</code>
        — copy <code>oauth-callback.html</code> from <code>@par-noir/oauth-ui/static/</code>.
      </p>
    </div>
  );
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
  const [ocRedirectUris, setOcRedirectUris] = useState('http://localhost:5180/oauth-callback.html');
  const [ocScopes, setOcScopes] = useState('openid profile cloud:app');
  const [manifestItems, setManifestItems] = useState(DEFAULT_MANIFEST_PRESETS.slice(0, 3));
  const [akScopes, setAkScopes] = useState('oauth,data_points,content');
  const [pendingApps, setPendingApps] = useState<PendingApplication[]>([]);
  const [selectedActiveId, setSelectedActiveId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const t = sessionStorage.getItem('dev_portal_access_token')?.trim();
    if (!t) {
      setPendingApps([]);
      return;
    }
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/applications/mine`, { headers: authHeaders() });
      if (!res.ok) {
        setPendingApps([]);
        return;
      }
      const data = (await res.json()) as { applications?: PendingApplication[] };
      const apps = Array.isArray(data.applications) ? data.applications : [];
      setPendingApps(apps.filter((a) => a.status === 'pending'));
    } catch {
      setPendingApps([]);
    }
  }, [apiEndpoint, authHeaders]);

  useEffect(() => {
    if (signedIn) void loadPending();
  }, [signedIn, loadPending, oauthClients]);

  useEffect(() => {
    if (oauthClients.length && !selectedActiveId) {
      const first = oauthClients.find((c) => c.isActive) || oauthClients[0];
      setSelectedActiveId(first?.clientId ?? null);
    }
  }, [oauthClients, selectedActiveId]);

  const applyManifestPresets = (includeAgeZkp: boolean) => {
    setOcScopes(includeAgeZkp ? 'openid profile cloud:app zkp:age_attestation' : 'openid profile cloud:app');
    setManifestItems(includeAgeZkp ? [...DEFAULT_MANIFEST_PRESETS] : DEFAULT_MANIFEST_PRESETS.slice(0, 3));
  };

  const buildManifestFromScopes = () => {
    const scopes = ocScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    const presetById = new Map(DEFAULT_MANIFEST_PRESETS.map((p) => [p.id, p]));
    setManifestItems(
      scopes.map((id) => {
        const preset = presetById.get(id);
        if (preset) return { ...preset };
        return {
          id,
          label:
            id.startsWith('zkp:') || id.startsWith('data_point:')
              ? `Access verified data: ${id.replace(/^(zkp:|data_point:)/, '')}`
              : id,
          rationale: ''
        };
      })
    );
  };

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
    const missingRationale = manifestItems.find((item) => item.id.trim() && !item.rationale.trim());
    if (missingRationale) {
      setError(`Permission manifest: add a rationale for "${missingRationale.id}".`);
      return;
    }
    const permissionManifest = {
      items: manifestItems
        .filter((item) => item.id.trim())
        .map((item) => ({
          id: item.id.trim(),
          type:
            item.id === 'cloud:app'
              ? 'storage'
              : item.id.startsWith('zkp:') || item.id.startsWith('data_point:')
                ? 'data_point'
                : 'scope',
          label: item.label.trim() || item.id.trim(),
          rationale: item.rationale.trim(),
          required: item.id === 'openid'
        }))
    };
    try {
      const res = await fetch(`${apiEndpoint}/api/developer/oauth-clients`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          clientId: ocClientId.trim(),
          name: ocName.trim(),
          description: ocDescription.trim() || undefined,
          redirectUris,
          scopes: scopes.length ? scopes : undefined,
          permissionManifest
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data as { error_description?: string }).error_description ||
            (data as { error?: string }).error ||
            res.statusText
        );
        return;
      }
      const status = (data as { status?: string }).status;
      if (status === 'pending') {
        setMessage(
          `OAuth application submitted (${(data as { applicationId?: string }).applicationId}). Pending platform operator review — OAuth activates after approval. See docs/developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md.`
        );
      } else {
        setMessage(`OAuth client registered and active: ${(data as { clientId?: string }).clientId}.`);
        setSelectedActiveId((data as { clientId?: string }).clientId || ocClientId.trim());
      }
      await refreshDashboard();
      await loadPending();
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
        setError(
          (data as { error_description?: string }).error_description ||
            (data as { error?: string }).error ||
            res.statusText
        );
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

  const selectedActive = oauthClients.find((c) => c.clientId === selectedActiveId && c.isActive);

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
          {(keys.length > 0 || oauthClients.length > 0 || pendingApps.length > 0) && (
            <section className="dev-summary" aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="dev-section-label">
                Your registrations
              </h2>
              {pendingApps.length > 0 && (
                <div className="dev-summary-block">
                  <h3>Pending review</h3>
                  <ul className="dev-summary-list">
                    {pendingApps.map((a) => (
                      <li key={a.applicationId}>
                        <span className="dev-badge dev-badge--pending">Pending</span>{' '}
                        <code>{a.clientId}</code> — {a.name}
                        <span className="dev-help"> (awaits platform operator approval)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {oauthClients.length > 0 && (
                <div className="dev-summary-block">
                  <h3>OAuth clients</h3>
                  <ul className="dev-summary-list">
                    {oauthClients.map((c) => (
                      <li key={c.clientId}>
                        <span
                          className={`dev-badge ${c.isActive ? 'dev-badge--active' : 'dev-badge--inactive'}`}
                        >
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>{' '}
                        <button
                          type="button"
                          className="dev-linkish"
                          onClick={() => setSelectedActiveId(c.clientId)}
                        >
                          <code>{c.clientId}</code>
                        </button>{' '}
                        — {c.name}
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

          {selectedActive && (
            <section className="dev-card">
              <GetStartedPanel
                clientId={selectedActive.clientId}
                redirectUris={selectedActive.redirectUris || []}
                scopes={selectedActive.scopes}
              />
            </section>
          )}

          <div className="dev-grid">
            <section className="dev-card">
              <h2>OAuth client (your app)</h2>
              <p className="dev-card-desc">Client id and exact redirect URLs for your product.</p>
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
                <FieldHelp>One URL per line. Must match your oauth-callback.html path.</FieldHelp>
              </div>
              <div className="dev-field">
                <label htmlFor="oc-scopes">Scopes</label>
                <input id="oc-scopes" className="dev-input" value={ocScopes} onChange={(e) => setOcScopes(e.target.value)} />
                <FieldHelp>Space-separated. Typical: openid profile cloud:app</FieldHelp>
                <div className="dev-get-started-actions" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="dev-btn dev-btn--ghost" onClick={() => applyManifestPresets(false)}>
                    Preset: login + silo
                  </button>
                  <button type="button" className="dev-btn dev-btn--ghost" onClick={() => applyManifestPresets(true)}>
                    Preset: + age ZKP
                  </button>
                </div>
              </div>
              <div className="dev-field">
                <div className="dev-field-header">
                  <label>Permission manifest (shown at user unlock)</label>
                  <button type="button" className="dev-btn dev-btn--ghost" onClick={buildManifestFromScopes}>
                    Sync from scopes
                  </button>
                </div>
                <FieldHelp>Each scope needs a plain-language label and why the user should grant it.</FieldHelp>
                {manifestItems.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="dev-manifest-row">
                    <input
                      className="dev-input"
                      value={item.id}
                      placeholder="scope id"
                      onChange={(e) => {
                        const next = [...manifestItems];
                        next[idx] = { ...next[idx], id: e.target.value };
                        setManifestItems(next);
                      }}
                    />
                    <input
                      className="dev-input"
                      value={item.label}
                      placeholder="Label users see"
                      onChange={(e) => {
                        const next = [...manifestItems];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setManifestItems(next);
                      }}
                    />
                    <textarea
                      className="dev-textarea"
                      value={item.rationale}
                      placeholder="Why does your app need this?"
                      rows={2}
                      onChange={(e) => {
                        const next = [...manifestItems];
                        next[idx] = { ...next[idx], rationale: e.target.value };
                        setManifestItems(next);
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="dev-btn dev-btn--ghost"
                  onClick={() => setManifestItems([...manifestItems, { id: '', label: '', rationale: '' }])}
                >
                  Add permission row
                </button>
              </div>
              <button type="button" className="dev-btn" onClick={registerOAuthClient}>
                Save OAuth client
              </button>
            </section>

            <section className="dev-card">
              <h2>Backend API key</h2>
              <p className="dev-card-desc">
                For your server calling <code>/api/v1/...</code> (public index, async data-point request). Not for user
                login.
              </p>
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
