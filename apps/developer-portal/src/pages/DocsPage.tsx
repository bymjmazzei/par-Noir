export function DocsPage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Integration guides</h2>
        <p>
          Use the par Noir OAuth flow for user unlock. Register your OAuth client and redirect URLs on the Credentials tab,
          then wire your app with the identity SDK or the shared OAuth UI package.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>L5 integrator quickstart</h3>
        <p>
          End-to-end guide: login, <code>cloud:app</code> Drive silo, ZKP data points. See{' '}
          <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code> in the repo and example app{' '}
          <code>examples/l5-integrator-starter/</code>.
        </p>
        <pre className="dev-code-block">
          <code>npm install @identity-protocol/identity-sdk @par-noir/oauth-ui</code>
        </pre>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Identity SDK</h3>
        <p>
          <code>createPnIntegratorClient</code> — OAuth + <code>IntegratorStorageClient</code> +{' '}
          <code>IntegratorZkpClient</code>. For login only, use <code>createPNOAuthClient</code>.
        </p>
        <pre className="dev-code-block">
          <code>{`import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';

const pn = createPnIntegratorClient({
  clientId: 'your-client-id',
  redirectUri: 'https://your.app/oauth-callback.html',
  apiEndpoint: 'https://api.parnoir.com',
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
});`}</code>
        </pre>
        <p className="dev-muted">
          Copy <code>static/oauth-callback.html</code> from the SDK package into your <code>public/</code> folder.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>React unlock button</h3>
        <p>Install <code>@par-noir/oauth-ui</code> for <code>UnlockButton</code> / <code>LockButton</code> with your{' '}
          <code>clientId</code>, <code>apiEndpoint</code>, and registered <code>redirectUri</code>.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Backend API keys</h3>
        <p>
          API keys (<code>X-Api-Key</code>) power <code>/api/v1/...</code> routes including public index. User OAuth tokens
          power <code>/api/drive/*</code> and <code>/oauth/zkp-data-points</code> with scopes such as <code>cloud:app</code>.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Repository docs</h3>
        <ul>
          <li><code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code></li>
          <li><code>docs/developer/PN_OAUTH_INTEGRATION.md</code></li>
          <li><code>docs/developer/third-party-sharing-and-L5.md</code></li>
          <li><code>docs/developer/ROUTE_MANIFEST.md</code></li>
        </ul>
      </section>
    </main>
  );
}
