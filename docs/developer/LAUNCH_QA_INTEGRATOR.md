# Launch QA — L5 integrator platform

Run before treating the integrator SDK as launch-ready.

## API (Railway)

- [ ] `main` deployed to production API (`https://api.parnoir.com`)
- [ ] Health check responds
- [ ] New Drive connect creates empty `integrators/` and caches `integratorsRootId`

## OAuth + silo E2E

1. Register a test OAuth client on developers.parnoir.com.
2. Copy `oauth-callback.html` to your test app `public/`.
3. Request scopes: `openid`, `profile`, `cloud:app`, `zkp:age_attestation`.
4. Complete consent (including Step 2 for `cloud:app`).
5. `GET /api/integrator/storage-root` returns stable `integratorFolderId`.
6. `POST /api/drive/files` upload succeeds; `GET /api/drive/files` lists only silo children.
7. Confirm **one** `integrators/` parent under canonical `par Noir - pn-…` root (no duplicate roots).

## SDK

- [ ] `npm run build` and `npm test` pass in `sdk/identity-sdk`
- [ ] `examples/l5-integrator-starter` runs locally with valid `VITE_PN_CLIENT_ID`

## npm (when publishing)

- [ ] `./scripts/publish-integrator-packages.sh` build succeeds
- [ ] Clean install: `npm install @identity-protocol/identity-sdk@<version>` in empty project

See also [GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md](../../GOOGLE_DRIVE_INITIALIZATION_DIAGNOSIS.md).
