# L5 community starter

Minimal Vite app for L5 **community publishing**: pN login, cloud reconnect, publish a public post indexed under your OAuth `client_id`, then list it via `indexerId`.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_PN_CLIENT_ID`.
2. Register `http://localhost:5181/oauth-callback.html` on [developers.parnoir.com](https://developers.parnoir.com).
3. Include a **permission manifest** with rationale for each scope at registration (shown at OAuth consent).
4. Copy `../../packages/oauth-ui/static/oauth-callback.html` to `public/oauth-callback.html`.
5. From repo root: `npm install`, then `cd examples/l5-community-starter && npm run dev`.

## Flow

1. **Login** — OAuth popup with `openid`, `profile`, `cloud:app`.
2. **Cloud reconnect** — `ThirdPartyCloudReconnectHost` mounts after login; connect Google so Drive owner routes receive `X-PN-Cloud-Access-Token`.
3. **Publish demo post** — uploads to your integrator silo and submits public metadata with `indexingPermissions.allowed = [client_id]`.
4. **List by indexerId** — `IntegratorFeedClient.listByIndexerId` queries `/api/aggregator/metadata-index?indexerId=…`.

After a user grants your app, browse auto-subscribes them to the `community-{client_id}` feed (see `communityGrantHelper`).

## Docs

- [L5 integrator quickstart](../../docs/developer/L5_INTEGRATOR_QUICKSTART.md)
- [L5 integrator starter](../l5-integrator-starter/) (storage + ZKP baseline)
