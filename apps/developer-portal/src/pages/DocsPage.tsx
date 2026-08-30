export function DocsPage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Integration guides</h2>
        <p>
          One kit: register an OAuth client on Credentials, then wire{' '}
          <code>createPnIntegratorClient</code> + <code>@par-noir/oauth-ui</code>. User unlock is interactive{' '}
          <code>/oauth/*</code> only — never collect pn name or passcode in your UI.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>L5 integrator quickstart</h3>
        <p>
          Login, <code>cloud:app</code> Drive silo, ZKP data points. See{' '}
          <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code> and{' '}
          <code>examples/l5-integrator-starter/</code>. Packages are workspace / <code>file:</code> until npm publish.
        </p>
        <pre className="dev-code-block">
          <code>{`"@identity-protocol/identity-sdk": "file:../../sdk/identity-sdk"
"@par-noir/oauth-ui": "file:../../packages/oauth-ui"`}</code>
        </pre>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Identity SDK (one façade)</h3>
        <p>
          <code>createPnIntegratorClient</code> — OAuth + <code>IntegratorStorageClient</code> +{' '}
          <code>IntegratorZkpClient</code>. Login only: <code>createPNOAuthClient</code>.
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
          Copy <code>packages/oauth-ui/static/oauth-callback.html</code> into your <code>public/</code> folder.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>React unlock button</h3>
        <p>
          Install <code>@par-noir/oauth-ui</code> for <code>UnlockButton</code> / <code>LockButton</code> with your{' '}
          <code>clientId</code>, <code>apiEndpoint</code>, and registered <code>redirectUri</code>.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Scopes</h3>
        <ul>
          <li>
            <code>openid</code> / <code>profile</code> — session
          </li>
          <li>
            <code>cloud:app</code> — app files under <code>integrators/&#123;client_id&#125;/</code> only
          </li>
          <li>
            <code>zkp:*</code> — granted ZKP proofs via API
          </li>
          <li>
            API key <code>content</code> — <code>GET /api/v1/public-index/:id</code> (server-side)
          </li>
        </ul>
        <p className="dev-muted">
          Messaging and social graph are first-party only. Hosted messaging widgets for L5 are deferred — see{' '}
          <code>docs/developer/L5_ONE_KIT_REVIEW.md</code>.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Backend API keys</h3>
        <p>
          API keys (<code>X-Api-Key</code>) power <code>/api/v1/...</code> routes (public index, catalog). User OAuth
          tokens power siloed <code>/api/drive/*</code> and <code>/oauth/zkp-data-points</code>.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Repository docs</h3>
        <ul>
          <li>
            <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code>
          </li>
          <li>
            <code>docs/developer/L5_ONE_KIT_REVIEW.md</code>
          </li>
          <li>
            <code>docs/developer/PN_OAUTH_INTEGRATION.md</code>
          </li>
          <li>
            <code>docs/developer/third-party-sharing-and-L5.md</code>
          </li>
          <li>
            <code>docs/developer/ROUTE_MANIFEST.md</code>
          </li>
        </ul>
      </section>
    </main>
  );
}
