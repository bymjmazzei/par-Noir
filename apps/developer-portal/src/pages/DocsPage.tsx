export function DocsPage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Integration guides</h2>
        <p>
          Use the par Noir OAuth flow for user unlock. Register your OAuth client and redirect URLs on the Credentials tab,
          then wire your app with the shared UI package or a custom authorize URL.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Quickstart — unlock button (React)</h3>
        <p>Install the shared OAuth UI (same package the dashboard and browser use):</p>
        <pre className="dev-code-block">
          <code>npm install @par-noir/oauth-ui</code>
        </pre>
        <p>
          Use <code>UnlockButton</code> and <code>LockButton</code> with your <code>clientId</code>,{' '}
          <code>apiEndpoint</code> (e.g. production API base), and exact <code>redirectUri</code> matching a URL you
          registered. Exchange the authorization code at <code>POST /oauth/token</code> (see OpenAPI).
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Identity SDK (workspace)</h3>
        <p>
          The monorepo package <code>sdk/identity-sdk</code> is published as <code>@identity-protocol/identity-sdk</code>{' '}
          in this workspace. It includes <code>createPNOAuthClient</code> / PN OAuth helpers for non-React apps.
        </p>
        <pre className="dev-code-block">
          <code>{`import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

const client = createPNOAuthClient({
  clientId: 'your-client-id',
  redirectUri: 'https://your.app/oauth-callback',
  apiBaseUrl: 'https://api.parnoir.com'
});`}</code>
        </pre>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Backend API keys</h3>
        <p>
          After unlocking this console, create a key on the Credentials tab. Send it as <code>X-Api-Key</code> (or{' '}
          <code>api_key</code> query) for <code>/api/v1/...</code> routes such as OAuth authorize and token exchange initiated
          from your server.
        </p>
        <p>
          For app-owned files on the user&apos;s Drive, request OAuth scope <code>cloud:app</code> and use{' '}
          <code>GET /api/integrator/storage-root</code> plus <code>/api/drive/files</code> (writes stay inside{' '}
          <code>integrators/your-client-id/</code>).
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Repository docs</h3>
        <p>
          Full narrative: <code>docs/developer/PN_OAUTH_INTEGRATION.md</code>,{' '}
          <code>docs/api/DATA_POINTS_AND_ZKP_API.md</code>, and <code>docs/developer/ROUTE_MANIFEST.md</code> in the par Noir
          repo.
        </p>
      </section>
    </main>
  );
}
