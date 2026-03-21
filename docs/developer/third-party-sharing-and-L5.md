# Third-party sharing and layer 5 (par Noir)

This document aligns **user-authorized third-party access** with existing API behavior. It does not introduce a second permission system: consent and storage remain **user-owned** (e.g. permissions recorded under the user’s `_metadata` in Google Drive via the API).

## Principles

1. **User grants, user revokes** — Tools receive only what the user approved in privacy / tool settings. Revocation is reflected in stored permission rows (`active` / `revoked`) and in ZKP-backed data points where applicable.
2. **API is the broker** — Third parties call **par Noir API** with the user’s OAuth access token (PN OAuth) or, for platform scenarios, an **API key** tied to a pN identifier plus the documented OAuth flows (`/api/v1/...`). Do not ask users for pn name or passcode.
3. **Data points vs OAuth scopes** — `dataPoints` on a tool permission reference **zkp-data-points** rows for ZKP types. OAuth-style scopes (`openid`, `profile`, `cloud:read`) are not rows in `zkp-data-points`; access follows the permission sheet and token scopes together. See `docs/api/DATA_POINTS_AND_ZKP_API.md`.

## Representative endpoints

- **Permissions (read/write via user’s Drive):**  
  `GET` / `PUT` `/api/users/:pnIdentifier/third-party-permissions`  
  Implemented in the API server; requires a valid bearer token and Drive access for that user.

- **Portable public index (API key):**  
  `GET` `/api/v1/public-index/:identityId` with `content` scope — returns public metadata the user has published to the aggregator index.

- **OAuth for L5 apps:**  
  `GET` `/api/v1/oauth/authorize` and `POST` `/api/v1/oauth/token` after registering a client and API key (developer portal / admin). See `docs/developer/PN_OAUTH_INTEGRATION.md`.

## Revocation and succession

If a pN identifier is **superseded** on the network (recovery / rotation), **new** OAuth codes, refresh tokens, storage binding, and feed creation for the **predecessor** are rejected. Integrators must poll **`GET /api/v1/identity/successor?pn_identifier=`** and stop trusting stale identifiers. Details: `docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md`.

## Security

- Never log pn name, passcode, raw tokens, or email/phone in plaintext.
- Cache short-lived access tokens only; respect superseded identity responses.
