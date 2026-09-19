export function IntegratePage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Integrate par Noir (L5)</h2>
        <p>
          One kit for third-party apps: <strong>pN login</strong>, <strong>user cloud silo</strong>,{' '}
          <strong>consented ZKPs</strong>, and <strong>hosted social iframes</strong>. Users grant and revoke; you never
          collect pn name or passcode.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>1. Register and get approved</h3>
        <ol>
          <li>
            Unlock on <a href="/credentials">Credentials</a> and create an OAuth client with a permission manifest
            (label + rationale per scope).
          </li>
          <li>
            If the platform registry is on, your client stays <strong>Pending</strong> until a platform operator
            approves it. See{' '}
            <a href="https://github.com/par-Noir/par-Noir/blob/main/docs/developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md">
              OAuth client approval runbook
            </a>
            .
          </li>
          <li>
            When <strong>Active</strong>, use the Get started panel for <code>.env</code>, npm install, and embed
            snippets.
          </li>
        </ol>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>2. Install the kit</h3>
        <pre className="dev-code-block">{`npm install @identity-protocol/identity-sdk @par-noir/oauth-ui`}</pre>
        <p>
          Copy <code>node_modules/@par-noir/oauth-ui/static/oauth-callback.html</code> to your app{' '}
          <code>public/</code> so it matches a registered redirect URI.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>3. Login — interactive OAuth only</h3>
        <p>
          Use <code>createPnIntegratorClient</code> → <code>pn.auth.authenticate()</code> against{' '}
          <code>/oauth/*</code>. Do not use machine mint or collect unlock secrets in your UI.
        </p>
        <pre className="dev-code-block">{`import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';

const pn = createPnIntegratorClient({
  clientId: import.meta.env.VITE_PN_CLIENT_ID,
  redirectUri: \`\${window.location.origin}/oauth-callback.html\`,
  apiEndpoint: import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com',
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
  usePopup: true
});

const session = await pn.auth.authenticate();`}</pre>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>4. Storage — integrator silo</h3>
        <p>
          Scope <code>cloud:app</code> provisions <code>integrators/&#123;client_id&#125;/</code> on the user&apos;s
          Drive. Mount <code>ThirdPartyCloudReconnectHost</code> after login so Drive routes receive{' '}
          <code>X-PN-Cloud-Access-Token</code>. App blobs go in the silo; standard pN data points stay API-only.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>5. ZKPs — consented proofs</h3>
        <p>
          Request <code>zkp:*</code> / data-point scopes at consent, then call the ZKP endpoint with the user Bearer.
          For server-driven async requests, use an API key on <code>/api/v1/data-points/*</code> (see Data points).
          Proposing a new catalog type does not activate it until platform review.
        </p>
        <p className="dev-help">
          After recovery/rotation, poll <code>GET /api/v1/identity/successor?pn_identifier=</code> and stop using
          superseded ids.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>6. Social — messaging + feed iframes</h3>
        <p>
          L5 Bearer tokens cannot call messages, mailbox, connections, groups, or engagement REST (
          <code>403 first_party_required</code>). Embed first-party viewports instead:
        </p>
        <ul>
          <li>
            <strong>Messaging:</strong> <code>buildMessagingEmbedUrl(clientId)</code> →{' '}
            <code>messaging.parnoir.com/embed?client_id=…</code>
          </li>
          <li>
            <strong>Community feed (display):</strong> <code>buildFeedEmbedUrl(clientId)</code> →{' '}
            <code>browse.parnoir.com/embed/feed?client_id=…</code>
          </li>
        </ul>
        <p>
          To <strong>publish</strong> into your community index, use the thin L5 publish API (
          <code>IntegratorPublishClient</code> / community starter) — not feed mutate product routes. Optional
          <code>ttlSeconds</code> / <code>expiresAt</code> schedule when the post leaves public feeds (becomes
          private); set <code>persistOnDiscover</code> to keep browse discover after community TTL. Legacy API
          script-tag feed widgets are deprecated; do not use them for new integrations.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Representative endpoints</h3>
        <ul>
          <li>
            <code>GET /oauth/authorize</code> / <code>POST /oauth/token</code> — interactive user OAuth
          </li>
          <li>
            <code>GET /api/integrator/storage-root</code> — silo folder (Bearer + <code>cloud:app</code>)
          </li>
          <li>
            <code>GET /oauth/zkp-data-points</code> — consented proofs
          </li>
          <li>
            <code>GET /api/v1/public-index/:identityId</code> — public metadata (API key <code>content</code>)
          </li>
          <li>
            <code>GET /api/v1/identity/successor?pn_identifier=</code> — succession
          </li>
        </ul>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Docs and examples</h3>
        <ul>
          <li>
            Quickstart: <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code>
          </li>
          <li>
            Starters: <code>examples/l5-integrator-starter</code>, <code>examples/l5-community-starter</code>
          </li>
          <li>
            Launch QA: <code>docs/developer/LAUNCH_QA_INTEGRATOR.md</code>
          </li>
        </ul>
      </section>
    </main>
  );
}
