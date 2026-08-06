# Owned assets and sub-pN (internal spec)

This document defines how par Noir models **human-rooted ownable assets** (API keys, feeds, devices, AI agents, smart devices) and **sub-principals** bound to a root human pN.

## Identifiers

- **`root_pn_identifier`**: The human anchor (`pn-*`). Policy, UI, and succession pivot on this.
- **`subject_pn_identifier`**: The acting principal on the wire (often `pn-*`) used in OAuth tokens, API keys, Drive folder naming, and integrator APIs. Subs have their own subject distinct from root when they act as first-class actors.
- **Normalization**: Prefer `pn-` prefix for human and most sub kinds. **Feed subjects** may use `feed-*` (created at feed activation); owned-asset create stores those as-is (does not rewrite to `pn-*`).
- APIs should normalize consistently with existing succession code.

## Kinds (`OwnedAssetKind`)

`human` | `api_key` | `feed` | `device` | `ai_agent` | `smart_device`

Human rows may exist for symmetry; most registry rows are non-human kinds.

## Feed kind (paid Sub-pN)

- **Registration**: Dashboard **Sub-pN** tab → kind Feed → Buy Feed ($5 Coinbase) → Veriff → `POST /api/feeds/activate-after-verification`.
- Activation creates the platform `feeds` row (tokens, storage folder), then an owned-asset row with `kind: 'feed'` and `metadata: { feedId, feedName, label }`. Cloud token (`X-PN-Cloud-Access-Token`) is required.
- **Ops** (post, add-to-feed, context switch): aggregator-browser. Lock-button menu loads controlled feeds via `GET /api/users/:pn/controlled-feeds` (owned assets + creator fallback + delegated).
- **Capabilities**: On a selected feed sub, Sub-pN delegations use scopes `read` | `write` | `manage` (mirrored into `feed_delegations` for `hasFeedAccess`). Non-feed kinds keep Privacy/Sharing data-point scopes.
- There is **no** dashboard Services tab for feeds; the hosted developer portal covers API keys / OAuth clients.

## Status

`active` | `revoked` | `suspended`

## Storage (API → user cloud)

- **Source of truth**: `_metadata/owned-assets.xlsx` on the user’s Drive (tabs **Assets** and **Delegations**), via `/api/owned-assets*` with Bearer + `X-PN-Cloud-Access-Token` (same custody model as devices / Privacy).
- **Postgres** (`pn_owned_assets`, `pn_asset_delegations`): thin **authz cache** (API-key ownership checks, succession joins, browser controlled-feed listing). Drive remains SoT for dashboard list/create/revoke; migrate-on-read copies legacy Postgres rows onto an empty sheet.
- Sheet is created at storage init and/or lazily on first owned-assets request (`PN_DRIVE_SHEET_KEYS.OWNED_ASSETS`).

## Succession

- On identity succession (predecessor → successor), **`root_pn_identifier`** on owned-asset rows where root = predecessor updates to successor (cache + Drive when cloud token present).
- **Default**: **`subject_pn_identifier` does not change** for subs (cryptographic identity stable for integrators until re-issued).
- After re-key, the dashboard verifies subs under the successor root.
- **Sub compromise rotation**: `POST /api/owned-assets/:id/rekey` revokes the old subject, creates a new asset row, records `pn_subject_succession`, and optionally migrates delegations (Drive + cache).

## Revocation

- **Network revocation** (`pn_identity_succession`): predecessor pNs are blocked for OAuth, storage binding, etc.
- **Sub subjects** not in succession: revocation is **registry row** `status = revoked` (and linked feature deactivation as needed).

## Export (dashboard)

- **Main pN re-auth** required before export or reveal of sub factors.
- Optional **export passphrase** at sub creation encrypts the export bundle client-side; server never stores passphrase plaintext.
- Paid feed activation does not produce a client-side export seal; feed tokens remain server-managed.

## Delegations

- **Delegation tab**: lists grants from the Drive-backed registry (same cloud session as Sub-pN).
- **Per-sub delegations**: grants from root to other `pn-*` or OAuth `client_id` with scoped access; written to the Delegations sheet + Postgres cache.
- **Feed sub**: prefer capability scopes `read` / `write` / `manage`; mirrored to `feed_delegations` for feed route ACL.

## Secrets

Never log or store in plaintext: pn name, passcode, export passphrases, tokens. Audit events use opaque ids only.
