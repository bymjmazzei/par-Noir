# Launch QA — L5 integrator platform

Run before treating the integrator SDK as launch-ready.

## API (Railway)

- [ ] `main` deployed to production API (`https://api.parnoir.com`)
- [ ] Health check responds
- [ ] New Drive connect creates empty `integrators/` and caches `integratorsRootId`

## OAuth + silo E2E

1. Register a test OAuth client on developers.parnoir.com with a **permission manifest** (label + rationale per scope).
2. Copy `oauth-callback.html` to your test app `public/`.
3. Request scopes: `openid`, `profile`, `cloud:app`, `zkp:age_attestation`.
4. Complete consent (including Step 2 for `cloud:app`); verify rationale text appears.
5. Mount **cloud reconnect** (`ThirdPartyCloudReconnectHost`) and connect Google Drive.
6. `GET /api/integrator/storage-root` returns stable `integratorFolderId`.
7. `POST /api/drive/files` upload succeeds; `GET /api/drive/files` lists only silo children.
8. Confirm **one** `integrators/` parent under canonical `par Noir - pn-…` root (no duplicate roots).

## Community publish + browse rail

1. Run `examples/l5-community-starter` with a registered client id.
2. Login → cloud reconnect → **Publish demo post** → **List by indexerId** returns the post.
3. Grant OAuth from browse; user auto-subscribes to `community-{client_id}` feed rail item.

## Messaging embed

- [ ] `buildMessagingEmbedUrl(clientId)` loads iframe on messaging origin
- [ ] Parent page receives `pn_messaging_embed_ready` / handshake postMessage types from embed origin only

## SDK

- [ ] `npm run build` and `npm test` pass in `sdk/identity-sdk` (includes gate tests for cloud headers + publish exports)
- [ ] `examples/l5-integrator-starter` and `examples/l5-community-starter` run locally with valid `VITE_PN_CLIENT_ID`

## npm (when publishing)

- [ ] `./scripts/publish-integrator-packages.sh` build + tests succeed
- [ ] Clean install: `npm install @identity-protocol/identity-sdk@<version> @par-noir/oauth-ui@<version>` in empty project

See also [GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md](../../GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md).
