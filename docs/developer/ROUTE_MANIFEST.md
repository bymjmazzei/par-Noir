# Route manifest (par Noir API)

Hand-maintained index of **major** HTTP routes. When you add a user-facing or integrator-facing endpoint, update this file and run `node scripts/check-route-manifest.mjs` from the repo root.

## Public / v1 (API key or unauthenticated where noted)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v1/identity/successor` | Query `pn_identifier` — succession / revocation (public read) |
| GET | `/api/v1/identity/revocations` | Alias of successor response shape |
| GET | `/api/v1/standard-data-points` | Public catalog of standard data point metadata (no auth) |
| GET | `/api/v1/oauth/authorize` | API-key gated OAuth authorize |
| POST | `/api/v1/oauth/token` | API-key gated token exchange |
| GET | `/api/v1/data-points/:dataPointId` | API key + `data_points` scope; query `identity_id`, `client_id` |
| POST | `/api/v1/data-points/request` | API key; create consent request on user Drive |
| GET | `/api/v1/data-points/requests/:requestId` | API key; poll consent request status |
| GET | `/api/users/:pnIdentifier/data-point-requests` | Bearer; list pending/approved requests |
| POST | `/api/users/:pnIdentifier/data-point-requests/:requestId/respond` | Bearer; approve or decline |
| GET | `/api/v1/public-index/:identityId` | API key + content scope |

## Dashboard / browser OAuth (PN identity)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/oauth/authorize` | PN OAuth authorization entry |
| POST | `/oauth/token` | Token exchange |
| POST | `/oauth/refresh` | Refresh token |
| GET | `/oauth/userinfo` | Userinfo |

## Storage & credentials

| Method | Path | Notes |
|--------|------|--------|
| PUT | `/api/storage/credentials/:identityId` | Encrypted storage credentials |
| GET | `/api/storage/credentials/:identityId` | Retrieve credentials |
| POST | `/api/storage/initialize/:identityId` | Re-init Drive folders |

## Feeds & aggregator (selection)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/feeds` | Create feed |
| GET | `/api/feeds` | List feeds |

## Developer portal (Bearer + OAuth client id)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/developer/api-keys` | Valid Bearer; token must be for client `developer-portal` (or `DEVELOPER_PORTAL_CLIENT_ID`) |
| GET | `/api/developer/api-keys` | List key metadata for authenticated pn |
| POST | `/api/developer/oauth-clients` | Register OAuth client with `owner_pn_id` |
| GET | `/api/developer/oauth-clients` | List clients owned by authenticated pn |
| POST | `/api/developer/data-point-proposals` | Submit standard data point proposal (audit log) |
| GET | `/api/developer/data-point-proposals` | List proposals for authenticated pn (from audit) |

## Admin (secured)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/oauth/clients` | `ADMIN_API_KEY` (break-glass; browser uses `/api/developer/oauth-clients` instead) |
| POST | `/api/admin/api-keys` | `ADMIN_API_KEY` |
| POST | `/api/admin/identity/succession` | Register predecessor → successor |
| POST | `/api/identity/migration/start` | OAuth — start re-key migration |
| GET | `/api/identity/migration/:id` | OAuth — migration status |
| PATCH | `/api/identity/migration/:id/steps/:stepId` | OAuth — ack step |
| POST | `/api/identity/migration/:id/complete` | OAuth (successor) — lineage ZK + succession |
| POST | `/api/identity/migration/:id/connections/rekey` | OAuth — update kemCiphertext |
| POST | `/api/identity/migration/:id/groups/rewrap` | OAuth — group key re-wrap |
| POST | `/api/identity/migration/:id/zkp-data-points/batch` | OAuth — batch ZKP sheet |
| POST | `/api/identity/migration/:id/recovery/custodians` | OAuth — recovery custodian rows |

## Recovery vault (OAuth Bearer + owner Drive)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/recovery/vault/initialize` | Owner — batch pending Shamir shares to Drive |
| POST | `/api/recovery/vault/reconcile` | Owner — normalize legacy custodian rows; report missing share indices |
| GET | `/api/recovery/:userPnIdentifier/vault/pending` | Owner — list unassigned share indices |
| GET | `/api/recovery/:userPnIdentifier/custodians` | Owner — custodians + pending + counts |
| POST | `/api/recovery/custodians/assign` | Owner — assign pending share to custodian (`unrevokable?`) |
| POST | `/api/recovery/custodians/:custodianId/resend` | Owner — rebuild invitation from existing row |
| POST | `/api/recovery/custodians/:custodianId/revoke` | Owner — revoke revokable custodian (403 if unrevokable) |
| POST | `/api/recovery/custodians/accept` | Custodian bearer — mark row `accepted` on owner Drive |

## Device registry (OAuth Bearer + owner Drive)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/devices/:userPnIdentifier/registry` | List active keyed devices + policy summary |
| GET | `/api/devices/:userPnIdentifier/policy` | Read `unkeyedAllows` and `firstDeviceKeyedAt` |
| PATCH | `/api/devices/:userPnIdentifier/policy` | Keyed device only — update unkeyed allow-list |
| POST | `/api/devices/pairing/nonce` | Keyed device — short-lived pairing nonce (5 min) |
| POST | `/api/devices/register` | Register device pubkey; bootstrap if no active devices |
| POST | `/api/devices/:deviceId/revoke` | Keyed device — revoke another device |
| POST | `/api/devices/:deviceId/heartbeat` | Valid device proof — update `lastSeenAt` |

Device proof headers (v1): `X-PN-Device-Id`, `X-PN-Device-Signature`, `X-PN-Device-Timestamp`, `X-PN-Device-Nonce`. See `docs/developer/DEVICE_AUTH.md`.

| POST | `/api/recovery/requests` | Create recovery request |
| POST | `/api/recovery/requests/:requestId/approvals` | Custodian ZK approval; `ready` requires threshold + unrevokable approval |
| GET | `/api/recovery/:userPnIdentifier/requests/:requestId/vault-shares` | Release shares when quorum rule satisfied |
| GET | `/api/admin/audit-events` | Query `limit`, optional `event_type` |

## Integrator storage (L5 OAuth Bearer + `cloud:app`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/integrator/storage-root` | Returns `integratorFolderId` and path under `integrators/{client_id}/` |

## Third-party permissions (user Drive)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/users/:pnIdentifier/third-party-permissions` | Requires bearer + Drive access |
| PUT | `/api/users/:pnIdentifier/third-party-permissions` | Store permissions |

See `api/src/server.ts` and `api/src/server/modules/*Routes.ts` for the full surface.

## Deprecated / removed

| Method | Path | Status |
|--------|------|--------|
| POST | `/api/auth/verify` | **410 Gone** — use pN OAuth (`/oauth/token`) |
| POST | `/api/auth/challenge` | Legacy; unused by current apps |
| POST/DELETE | `/api/feeds/:feedId/subscriptions` | **410 Gone** — platform paid subscriptions removed |
| POST | `/api/subscriptions/confirm` | **410 Gone** |

## Integrator ZKP (OAuth bearer — preferred for user-present consent)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/oauth/zkp-data-points` | Bearer token; returns granted ZKP proofs from user Drive |

