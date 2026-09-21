# L5 integrator quickstart

Build a third-party app on par Noir: **pN login**, **app silo storage**, **consented ZKPs**, and **hosted social iframes** (messaging + community feed).

---

## 1. Register your app

1. Open [developers.parnoir.com](https://developers.parnoir.com) and unlock with pN.
2. **Credentials** → create an OAuth client (`client_id`, redirect URIs).
3. Add redirect URI: `https://your-app.com/oauth-callback.html` (or `http://localhost:5180/oauth-callback.html` for local dev).
4. Supply a **permission manifest** — each scope/data point needs a human-readable **label** and **rationale**. The API rejects registration when rationale is missing.
5. If the platform registry is configured, the client stays **Pending** until a platform operator approves it. See [OAUTH_CLIENT_APPROVAL_RUNBOOK.md](./OAUTH_CLIENT_APPROVAL_RUNBOOK.md). When **Active**, use the Credentials **Get started** panel.

Example manifest item:

```json
{
  "items": [
    {
      "id": "cloud:app",
      "type": "storage",
      "label": "Store drafts in your pN cloud",
      "rationale": "We save encrypted drafts under integrators/your-client-id/ so you can edit offline."
    }
  ]
}
```

---

## 2. Install SDK and OAuth callback

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

(Monorepo contributors may still use `workspace:*` / `file:` links.)

Copy the OAuth callback page into your app’s `public/` folder:

- After install: `node_modules/@par-noir/oauth-ui/static/oauth-callback.html`

It must match your registered `redirect_uri` path.

User OAuth is **`/oauth/*` only** (interactive unlock). Do **not** call messaging, mailbox, connections, groups, or engagement APIs from an L5 client — those return `403 first_party_required`.

### Social (hosted iframes)

```html
<iframe
  src="https://messaging.parnoir.com/embed?client_id=YOUR_CLIENT_ID"
  title="par Noir messaging"
  style="width:100%;height:640px;border:0;"
  allow="clipboard-write"
></iframe>

<iframe
  src="https://browse.parnoir.com/embed/feed?client_id=YOUR_CLIENT_ID"
  title="par Noir community feed"
  style="width:100%;height:640px;border:0;"
></iframe>
```

Or with `@par-noir/oauth-ui`:

```typescript
import {
  buildMessagingEmbedUrl,
  buildFeedEmbedUrl,
  MESSAGING_EMBED_ORIGIN,
  BROWSE_EMBED_ORIGIN,
  PN_MESSAGING_EMBED_READY,
  PN_FEED_EMBED_READY,
} from '@par-noir/oauth-ui';

const messagingSrc = buildMessagingEmbedUrl('YOUR_CLIENT_ID');
const feedSrc = buildFeedEmbedUrl('YOUR_CLIENT_ID');
// Listen for ready/handshake postMessage types from MESSAGING_EMBED_ORIGIN / BROWSE_EMBED_ORIGIN only
```

- Unlock happens **inside** each iframe (first-party origin).
- Messaging connect/accept creates a peer edge + **your channel’s thread only**.
- Feed embed shows the `community-{client_id}` public index (display). To **publish** posts into that index, use the community publish API (see `examples/l5-community-starter`), not product feed mutate routes.
- **Deprecated:** API script-tag feed widgets (`/api/widgets/feed/...`). Do not use for new L5 apps.

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

### Cloud reconnect (Drive owner routes)

Drive reads/writes require a forwarded **`X-PN-Cloud-Access-Token`** in addition to the OAuth Bearer. After login, mount `@par-noir/oauth-ui` cloud reconnect:

```tsx
import { ThirdPartyCloudReconnectHost } from '@par-noir/oauth-ui';

<ThirdPartyCloudReconnectHost
  apiEndpoint={import.meta.env.VITE_API_ENDPOINT}
  authToken={session.accessToken}
  pnIdentifier={session.pnIdentifier}
/>
```

Pass `IntegratorApiContext` (Bearer + cloud token) to SDK storage/publish clients — see `examples/l5-integrator-starter/` and `examples/l5-community-starter/`.

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

**Lane A (consent):** request scopes at login, then:

```typescript
const { dataPoints } = await pn.zkp.getDataPoints(session.accessToken, {
  dataPoints: ['age_attestation']
});
// Proofs only — verify with @par-noir/zk-protocol-v2; never log raw tokens or pn name
```

**Lane B (server):** API key with `data_points` → `/api/v1/data-points/*` request/poll (optional webhooks).

User must have granted the data point. Permissions live in `_metadata/third-party-permissions.xlsx` (API-managed).

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

## 7. Public feed metadata (optional, API key)

For aggregator-style public metadata (not user OAuth):

```typescript
import { createPublicIndexClient } from '@identity-protocol/identity-sdk';

const index = createPublicIndexClient({ apiEndpoint: 'https://api.parnoir.com' });
const feed = await index.getPublicIndex('pn-creator-id', process.env.PN_API_KEY!);
```

Requires an API key with `content` scope from the developer portal.

---

## 8. Content expiry (browse + L5)

Public index posts may set:

| Field | Meaning |
|-------|---------|
| `expiresAt` | ISO timestamp; omit/null = never |
| `ttlSeconds` | Write-only; server sets `expiresAt = now + ttl` |
| `persistOnDiscover` | L5 only: after expiry, keep on browse discover; community/`indexerId` queries still hide. Default `false`. |

When due (and not `persistOnDiscover`), the post becomes **private** (`isPublic: false`) — same end state as manually unpublishing. File stays in user storage.

**48h community pattern:**

```typescript
await pn.publish.submitMetadataIndex(ctx, {
  // …file fields…
  isPublic: true,
  ttlSeconds: 172800,
  persistOnDiscover: false, // also flip private on browse; set true to keep discover
});
```

Browse users set Never / 24h / 48h / 7d / custom datetime in upload and share settings (no `persistOnDiscover` control).

---

## 9. Pen (authored content — silo + Note publish)

First-party Pen (`pen.parnoir.com`) owns multi-writer collab. L5 gets **silo CRUD + templates + compile/publish Note** via `pn.pen` — not groups/outbox/docKey.

```typescript
const templates = pn.pen.listTemplatesLocal();
const compiled = pn.pen.compileToNote({
  templateId: templates[0]!.id,
  title: 'Hello',
  sections: [/* PenSectionContent */],
});

// Write under integrators/{client_id}/par-noir-pen/{docId}/
await pn.pen.writeManifestJson(ctx, docId, manifest);

// Publish Note to the public index (contentClass forced to 'note')
await pn.pen.publishCompiledNote(ctx, {
  pnIdentifier: session.pnIdentifier,
  title: compiled.title,
  contentClass: 'note',
  isPublic: true,
  // …file / publicToken fields…
});

// Verify a published history chain (ML-DSA links)
const ok = pn.pen.verifyHistory(chain);
```

Do **not** call `/api/groups`, `/api/messages`, or `/api/mailbox` from L5 — they return `403 first_party_required`. Deep-link or iframe Pen for collab.

See [ADR_PEN.md](../architecture/ADR_PEN.md).

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
| Approval ops | [OAUTH_CLIENT_APPROVAL_RUNBOOK.md](./OAUTH_CLIENT_APPROVAL_RUNBOOK.md) |
| Storage model | [third-party-sharing-and-L5.md](./third-party-sharing-and-L5.md) |
| Launch QA | [LAUNCH_QA_INTEGRATOR.md](./LAUNCH_QA_INTEGRATOR.md) |
| Example apps | `examples/l5-integrator-starter/`, `examples/l5-community-starter/` |
| SDK source | `sdk/identity-sdk/` |
