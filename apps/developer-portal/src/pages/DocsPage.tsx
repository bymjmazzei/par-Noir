export function DocsPage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Integration guides</h2>
        <p>
          One kit for <strong>external</strong> L5 apps: register an OAuth client on Credentials, then wire{' '}
          <code>createPnIntegratorClient</code> + <code>@par-noir/oauth-ui</code>. User unlock is interactive{' '}
          <code>/oauth/*</code> — never collect pn name or passcode in your UI.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>L5 integrator quickstart</h3>
        <p>
          Login, <code>cloud:app</code> Drive silo, ZKPs, messaging + feed iframes. See{' '}
          <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code>,{' '}
          <code>examples/l5-integrator-starter/</code>, and <code>examples/l5-community-starter/</code>.
        </p>
        <pre className="dev-code-block">
          <code>{`npm install @identity-protocol/identity-sdk @par-noir/oauth-ui`}</code>
        </pre>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Identity SDK (one façade)</h3>
        <p>
          <code>createPnIntegratorClient</code> — OAuth + <code>IntegratorStorageClient</code> +{' '}
          <code>IntegratorZkpClient</code> + publish/feed helpers. Login only: <code>createPNOAuthClient</code>.
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
          Copy <code>node_modules/@par-noir/oauth-ui/static/oauth-callback.html</code> into your <code>public/</code>{' '}
          folder.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>React unlock + embeds</h3>
        <p>
          Install <code>@par-noir/oauth-ui</code> for <code>UnlockButton</code> / <code>LockButton</code>,{' '}
          <code>ThirdPartyCloudReconnectHost</code>, <code>buildMessagingEmbedUrl</code>, and{' '}
          <code>buildFeedEmbedUrl</code>.
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
          Messaging and engagement REST are first-party only. L5 uses hosted iframes — see Layer 5 / quickstart.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Backend API keys</h3>
        <p>
          Create on Credentials for server calls to <code>/api/v1/...</code> (public index, async data-point request). Not
          a substitute for interactive user OAuth.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Approval</h3>
        <p>
          When the platform registry is configured, new OAuth clients stay pending until an operator approves them. See{' '}
          <code>docs/developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md</code>.
        </p>
      </section>
    </main>
  );
}
