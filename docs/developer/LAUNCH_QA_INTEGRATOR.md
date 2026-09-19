# Launch QA — L5 integrator platform

Run before treating the integrator SDK as launch-ready. Operator approval: [OAUTH_CLIENT_APPROVAL_RUNBOOK.md](./OAUTH_CLIENT_APPROVAL_RUNBOOK.md).

## API (Railway)

- [ ] `main` deployed to production API (`https://api.parnoir.com`)
- [ ] Health check responds
- [ ] New Drive connect creates empty `integrators/` and caches `integratorsRootId`

## OAuth + silo E2E

1. Register a test OAuth client on developers.parnoir.com with a **permission manifest** (label + rationale per scope).
2. If status is **Pending**, approve via Platform → Applications (operator pN).
3. Confirm Credentials shows **Active** + Get started panel.
4. Copy `oauth-callback.html` to your test app `public/`.
5. Request scopes: `openid`, `profile`, `cloud:app`, `zkp:age_attestation`.
6. Complete consent (including Step 2 for `cloud:app`); verify rationale text appears.
7. Mount **cloud reconnect** (`ThirdPartyCloudReconnectHost`) and connect Google Drive.
8. `GET /api/integrator/storage-root` returns stable `integratorFolderId`.
9. `POST /api/drive/files` upload succeeds; `GET /api/drive/files` lists only silo children.
10. Fetch one ZKP via consented scope (`pn.zkp.getDataPoints` / `/oauth/zkp-data-points`).
11. Revoke the grant from dashboard Privacy; confirm subsequent ZKP/silo calls fail closed.
12. Confirm **one** `integrators/` parent under canonical `par Noir - pn-…` root (no duplicate roots).

## Community publish + browse rail

1. Run `examples/l5-community-starter` with a registered client id.
2. Login → cloud reconnect → **Publish demo post (48h)** → **List by indexerId** returns the post.
3. Confirm publish payload uses `ttlSeconds: 172800`; with persist checkbox off, post leaves community + discover after 48h (becomes private). With checkbox on, community hides after TTL but discover can keep it (`persistOnDiscover`).
4. Grant OAuth from browse; user auto-subscribes to `community-{client_id}` feed rail item.

## Messaging + feed embeds

- [ ] `buildMessagingEmbedUrl(clientId)` loads iframe on messaging origin
- [ ] Parent page receives `pn_messaging_embed_ready` / handshake postMessage from messaging origin
- [ ] `buildFeedEmbedUrl(clientId)` loads iframe on browse origin (`/embed/feed`)
- [ ] Parent page receives `pn_feed_embed_ready` / handshake postMessage from browse origin
- [ ] Legacy `/api/widgets/feed/...` script widgets are **not** used for L5 QA

## SDK / npm

- [ ] `npm run build` and `npm test` pass in `sdk/identity-sdk` (includes gate tests for cloud headers + publish exports)
- [ ] `./scripts/publish-integrator-packages.sh` passes (no `file:` on oauth-ui / identity-sdk)
- [ ] `examples/l5-integrator-starter` and `examples/l5-community-starter` run locally with valid `VITE_PN_CLIENT_ID`
- [ ] Clean install (when publishing): `npm install @identity-protocol/identity-sdk@<version> @par-noir/oauth-ui@<version>` in empty project

## npm (when publishing)

- [ ] Publish leaf packages then oauth-ui then identity-sdk per [PUBLISHING.md](../../sdk/identity-sdk/PUBLISHING.md)

See also [GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md](../../GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md).
