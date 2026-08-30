# Third-party sharing and layer 5 (par Noir)

This document aligns **user-authorized third-party access** with existing API behavior. It does not introduce a second permission system: consent and storage remain **user-owned** (e.g. permissions recorded under the user’s `_metadata` in Google Drive via the API).

## Two-tier storage model

| Data | Location on Drive | How integrators access it |
|------|-------------------|---------------------------|
| **Standard pN data points** (catalog + user ZKPs) | `_metadata/zkp-data-points.xlsx` | **API only** — OAuth ZKP endpoint; grants in `third-party-permissions.xlsx` (`toolId` = `client_id`) |
| **App-specific blobs** (not in pN catalog) | `integrators/{client_id}/` under the user’s pN root folder | **Drive proxy** — `/api/drive/*` with `cloud:app` scope; server confines I/O to that silo |
| **Permission grants** | `_metadata/third-party-permissions.xlsx` | Updated on OAuth token exchange; may include `integratorFolderId` |

See [GOOGLE_DRIVE_STRUCTURE.md](../../GOOGLE_DRIVE_STRUCTURE.md) for the full folder tree.

## Principles

1. **User grants, user revokes** — Tools receive only what the user approved in privacy / tool settings. Revocation is reflected in stored permission rows (`active` / `revoked`) and in ZKP-backed data points where applicable.
2. **API is the broker** — Third parties call **par Noir API** with the user’s OAuth access token (interactive `/oauth/*`) or, for server scenarios, an **API key** on `/api/v1/...` (public index, catalog). Do not ask users for pn name or passcode.
3. **Data points vs OAuth scopes** — `dataPoints` on a tool permission reference **zkp-data-points** rows for ZKP types. OAuth-style scopes (`openid`, `profile`, `cloud:read`) are not rows in `zkp-data-points`; access follows the permission sheet and token scopes together. See `docs/api/DATA_POINTS_AND_ZKP_API.md`.
4. **Integrator silo** — Drive setup creates empty `integrators/` and caches `integratorsRootId` in `credentials.cachedFolderIds`. Scope `cloud:app` provisions `integrators/{client_id}/` on first grant and restricts L5 Drive proxy calls to that subtree. L5 clients must not read `_metadata` via Drive.

## OAuth scopes (integrators)

| Scope | Meaning |
|-------|---------|
| `openid`, `profile` | Identity / session |
| `zkp:*` or `data_point:*` | Request corresponding ZKP data points (after user grant) |
| `cloud:app` | Read/write files only under `integrators/{client_id}/` |
| `cloud:read` | **First-party only** (`browser-app`, etc.); legacy for full pN Drive read |

## Representative endpoints

- **Permissions (read/write via user’s Drive):**  
  `GET` / `PUT` `/api/users/:pnIdentifier/third-party-permissions`  
  Requires a valid bearer token and Drive access for that user.

- **Integrator storage root:**  
  `GET` `/api/integrator/storage-root` — Bearer token with `cloud:app`; returns `integratorFolderId` and path.

- **Drive proxy (L5 with `cloud:app`):**  
  `GET` / `POST` / `PUT` / `DELETE` `/api/drive/files` and `POST` `/api/drive/folders` — scoped to the integrator silo.

- **Portable public index (API key):**  
  `GET` `/api/v1/public-index/:identityId` with `content` scope — public aggregator metadata.

- **OAuth for L5 apps (interactive unlock only):**  
  `GET` `/oauth/authorize` → consent → `POST` `/oauth/token`. See `docs/developer/PN_OAUTH_INTEGRATION.md`.

- **Not available to L5:** `/api/messages`, `/api/mailbox`, `/api/connections`, `/api/groups`, `/api/engagement`, `/api/notifications` — first-party OAuth clients only.

## Revocation and succession

If a pN identifier is **superseded** on the network (recovery / rotation), **new** OAuth codes, refresh tokens, storage binding, and feed creation for the **predecessor** are rejected. Integrators must poll **`GET /api/v1/identity/successor?pn_identifier=`** and stop trusting stale identifiers. Details: `docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md`.

## Security

- Never log pn name, passcode, raw tokens, or email/phone in plaintext.
- Cache short-lived access tokens only; respect superseded identity responses.
- Do not store standard pN data-point payloads inside `integrators/`; use API proofs only.
