# L5 community starter

Minimal Vite app for L5 **community publishing** plus **hosted messaging + feed iframes**.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_PN_CLIENT_ID` (must be an **Active** OAuth client).
2. Register `http://localhost:5181/oauth-callback.html` on [developers.parnoir.com](https://developers.parnoir.com).
3. Include a **permission manifest** with rationale for each scope at registration.
4. Copy `../../packages/oauth-ui/static/oauth-callback.html` to `public/oauth-callback.html`.
5. From repo root: `npm install`, then `cd examples/l5-community-starter && npm run dev`.

External install (when packages are on npm):

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

## Flow

1. **Login** — OAuth popup with `openid`, `profile`, `cloud:app`.
2. **Cloud reconnect** — `ThirdPartyCloudReconnectHost` after login.
3. **Publish demo post (48h)** — silo upload + public metadata with `ttlSeconds: 172800`, optional **persist on browse discover** checkbox (`persistOnDiscover`), and `indexingPermissions.allowed = [client_id]`.
4. **List by indexerId** — `IntegratorFeedClient.listByIndexerId`.
5. **Iframes** — `buildMessagingEmbedUrl` + `buildFeedEmbedUrl` (display only; unlock inside each iframe).

After a user grants your app, browse auto-subscribes them to the `community-{client_id}` feed (see `communityGrantHelper`).

## Docs

- [L5 integrator quickstart](../../docs/developer/L5_INTEGRATOR_QUICKSTART.md)
- [OAuth client approval runbook](../../docs/developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md)
- [L5 integrator starter](../l5-integrator-starter/) (storage + ZKP baseline)
