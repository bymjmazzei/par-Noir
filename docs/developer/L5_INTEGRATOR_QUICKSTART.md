# L5 integrator quickstart

Build a third-party app on par Noir: **pN login**, optional **ZKP data points**, and **app-owned files** in the user’s Drive silo.

---

## 1. Register your app

1. Open [developers.parnoir.com](https://developers.parnoir.com) and unlock with pN.
2. **Credentials** → create an OAuth client (`client_id`, redirect URIs).
3. Add redirect URI: `https://your-app.com/oauth-callback.html` (or `http://localhost:5173/oauth-callback.html` for local dev).

---

## 2. Install SDK and OAuth callback

Packages are **workspace / `file:`** (not on the public npm registry yet):

```json
{
  "@identity-protocol/identity-sdk": "file:../../sdk/identity-sdk",
  "@par-noir/oauth-ui": "file:../../packages/oauth-ui"
}
```

Copy the OAuth callback page into your app’s `public/` folder:

- Canonical: `packages/oauth-ui/static/oauth-callback.html`
- Or after install: `node_modules/@par-noir/oauth-ui/static/oauth-callback.html`

It must match your registered `redirect_uri` path.

User OAuth is **`/oauth/*` only** (interactive unlock). Do not call messaging, mailbox, connections, or groups APIs from an L5 client — those return `403 first_party_required`.

### Messaging (hosted embed)

Show chat scoped to your app with a first-party iframe (no message REST for your Bearer):

```html
<iframe
  src="https://messaging.parnoir.com/embed?client_id=YOUR_CLIENT_ID"
  title="par Noir messaging"
  style="width:100%;height:640px;border:0;"
  allow="clipboard-write"
></iframe>
```

- Unlock happens **inside** the iframe (messaging origin handoff).
- Connect/accept on this viewport creates a peer edge + **your channel’s thread only** — it does **not** create the platform primary DM.
- Aggregated view of all channels lives on messaging.parnoir.com (not in your iframe).

See [MESSAGING_UI_SURFACES.md](../MESSAGING_UI_SURFACES.md) and [ADR_MESSAGING_CHANNEL_THREADS.md](../architecture/ADR_MESSAGING_CHANNEL_THREADS.md).

---

## 3. Sign in (browser)

```typescript
import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';

const pn = createPnIntegratorClient({
  clientId: import.meta.env.VITE_PN_CLIENT_ID,
  redirectUri: `${window.location.origin}/oauth-callback.html`,
  apiEndpoint: import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com',
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
  usePopup: true
});

const session = await pn.auth.authenticate();
// session.accessToken — use for API calls below
```

Consent includes **Step 2** when you request `cloud:app`: user approves the integrator Drive silo.

---

## 4. App storage silo (`cloud:app`)

```typescript
const root = await pn.storage.getStorageRoot(session.accessToken);
console.log(root.integratorPath); // integrators/your-client-id

const { files } = await pn.storage.listFiles(session.accessToken);
await pn.storage.uploadFile(session.accessToken, {
  fileName: 'hello.txt',
  fileDataBase64: btoa('hello from my app'),
  mimeType: 'text/plain',
  encrypt: false
});
```

Files stay under `integrators/{client_id}/` on the user’s Drive. The API enforces this; do not use Drive to read `_metadata`.

---

## 5. ZKP data points (API only)

```typescript
const { dataPoints } = await pn.zkp.getDataPoints(session.accessToken, {
  dataPoints: ['age_attestation']
});
// Proofs only — verify with @par-noir/zk-protocol-v2; never log raw tokens or pn name
```

User must have granted the data point at consent. Permissions live in `_metadata/third-party-permissions.xlsx` (API-managed).

---

## 6. Identity succession

```typescript
const info = await pn.succession.getSuccessor('pn-abc123');
if (info.revoked && info.successorPnIdentifier) {
  // Stop using predecessor for network-backed features
}
```

See [INTEGRATOR_IDENTITY_SUCCESSION.md](./INTEGRATOR_IDENTITY_SUCCESSION.md).

---

## 7. Public feed (optional, API key)

For aggregator-style public metadata (not user OAuth):

```typescript
import { createPublicIndexClient } from '@identity-protocol/identity-sdk';

const index = createPublicIndexClient({ apiEndpoint: 'https://api.parnoir.com' });
const feed = await index.getPublicIndex('pn-creator-id', process.env.PN_API_KEY!);
```

Requires an API key with `content` scope from the developer portal.

---

## Security

- Never collect **pn name** or **passcode** in your UI.
- Never log access tokens or ZKP payloads in production.
- Do not store standard pN data-point rows inside `integrators/`; use ZKP API only.

---

## Reference

| Topic | Doc |
|-------|-----|
| OAuth details | [PN_OAUTH_INTEGRATION.md](./PN_OAUTH_INTEGRATION.md) |
| Storage model | [third-party-sharing-and-L5.md](./third-party-sharing-and-L5.md) |
| Drive layout | [GOOGLE_DRIVE_STRUCTURE.md](../../GOOGLE_DRIVE_STRUCTURE.md) |
| Example app | `examples/l5-integrator-starter/` in the repo |
| SDK source | `sdk/identity-sdk/` |
