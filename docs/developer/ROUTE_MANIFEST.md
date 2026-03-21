# Route manifest (par Noir API)

Hand-maintained index of **major** HTTP routes. When you add a user-facing or integrator-facing endpoint, update this file and run `node scripts/check-route-manifest.mjs` from the repo root.

## Public / v1 (API key or unauthenticated where noted)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v1/identity/successor` | Query `pn_identifier` — succession / revocation (public read) |
| GET | `/api/v1/identity/revocations` | Alias of successor response shape |
| GET | `/api/v1/oauth/authorize` | API-key gated OAuth authorize |
| POST | `/api/v1/oauth/token` | API-key gated token exchange |
| GET | `/api/v1/data-points/:dataPointId` | API key + scope |
| POST | `/api/v1/data-points/request` | API key + scope |
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

## Admin (secured)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/admin/api-keys` | `ADMIN_API_KEY` |
| POST | `/api/admin/identity/succession` | Register predecessor → successor |
| GET | `/api/admin/audit-events` | Query `limit`, optional `event_type` |

## Third-party permissions (user Drive)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/users/:pnIdentifier/third-party-permissions` | Requires bearer + Drive access |
| PUT | `/api/users/:pnIdentifier/third-party-permissions` | Store permissions |

See `api/src/server.ts` and `api/src/server/modules/*Routes.ts` for the full surface.
