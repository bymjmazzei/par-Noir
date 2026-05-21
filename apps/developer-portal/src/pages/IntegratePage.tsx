export function IntegratePage() {
  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Third parties and layer 5</h2>
        <p>
          Users grant and revoke access; tools call the par Noir API with the user&apos;s OAuth access token or, for
          platform flows, an API key tied to a pN plus the documented OAuth routes.
        </p>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Principles</h3>
        <ul>
          <li>
            <strong>User grants, user revokes</strong> — permissions live in user-owned storage; revocation updates tool rows
            and ZKP-backed data points where applicable.
          </li>
          <li>
            <strong>API as broker</strong> — third parties use par Noir HTTP APIs; do not collect pn name or passcode in your
            integration UI.
          </li>
          <li>
            <strong>Data points vs OAuth scopes</strong> — tool permissions reference standard data point ids; OAuth scopes
            like <code>openid</code> / <code>profile</code> are separate from the ZKP catalog rows.
          </li>
          <li>
            <strong>Integrator silo</strong> — scope <code>cloud:app</code> provisions{' '}
            <code>integrators/your-client-id/</code> on the user&apos;s Drive. App-specific files go there; pN data points are
            read via API only (not copied into the silo).
          </li>
        </ul>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>Representative endpoints</h3>
        <ul>
          <li>
            <code>GET /api/integrator/storage-root</code> — integrator folder id (Bearer + <code>cloud:app</code>).
          </li>
          <li>
            <code>GET</code> / <code>PUT /api/users/:pnIdentifier/third-party-permissions</code> — permissions sheet (bearer +
            Drive access).
          </li>
          <li>
            <code>GET /api/v1/public-index/:identityId</code> — public metadata (API key with <code>content</code> scope).
          </li>
          <li>
            <code>GET /api/v1/oauth/authorize</code> and <code>POST /api/v1/oauth/token</code> — L5 OAuth (API key + registered
            client).
          </li>
          <li>
            <code>GET /api/v1/identity/successor?pn_identifier=</code> — follow identity succession after recovery.
          </li>
        </ul>
      </section>

      <section className="dev-card dev-doc-block">
        <h3>SDK</h3>
        <p>
          <code>npm install @identity-protocol/identity-sdk</code> — see{' '}
          <code>docs/developer/L5_INTEGRATOR_QUICKSTART.md</code> and <code>examples/l5-integrator-starter/</code>.
        </p>
      </section>

      <p className="dev-muted">
        See <code>docs/developer/third-party-sharing-and-L5.md</code> and <code>docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md</code>{' '}
        in the repository.
      </p>
    </main>
  );
}
