# Owned assets and sub-pN (integrators)

## Overview

par Noir tracks **owned assets** in a server registry (`pn_owned_assets`): each row has a **root** human `pn-*` id, optional **subject** `pn-*` (the acting principal), a **kind**, and **status**. API keys created via the developer portal are linked to this registry.

## Enforcement

- **API key validation** checks the linked owned-asset row when present: revoked or suspended assets reject the key.
- **Identity succession**: when a predecessor `pn-*` is retired, bindings migrate to the successor, including registry **root** columns and related tables. Sub **subjects** stay stable unless the owner rotates a compromised sub via `POST /api/owned-assets/:id/rekey`.
- **Subject succession**: when a sub subject is rekeyed, call `GET /api/v1/identity/successor?pn_identifier=` with the old subject to resolve the successor subject and refresh bindings.
- **Delegations** (`pn_asset_delegations`): per-asset grants to another `pn-*` or OAuth `client_id` with a **scope** string. Future route handlers will enforce these alongside existing checks.

## Authorization source of truth

Always use **API registry state** for allow/deny. There is no IPFS/OrbitDB manifest path in production; Google Drive + par Noir API own storage and metadata.

## Dashboard endpoints (OAuth Bearer)

Authenticated users (same Bearer token as other dashboard flows) may call:

- `GET /api/owned-assets` — list assets for the token’s `pnIdentifier` as root
- `POST /api/owned-assets` — create a non-`api_key` asset (e.g. sub for feed, device, agent)
- `POST /api/owned-assets/:id/revoke`
- `POST /api/owned-assets/:id/rekey` — compromise rotation: new subject, delegation migration, `pn_subject_succession` row
- `GET|POST /api/owned-assets/:id/delegations`
- `DELETE /api/owned-assets/delegations/:delegationId`
- `POST /api/owned-assets/:id/export-audit` — audit-only (no secrets)

Third-party apps should use their own OAuth integration; these routes expect a valid par Noir access token.

## Related

- [OWNED_ASSETS_AND_SUB_PN.md](./OWNED_ASSETS_AND_SUB_PN.md) — internal product spec
- [INTEGRATOR_IDENTITY_SUCCESSION.md](./INTEGRATOR_IDENTITY_SUCCESSION.md) — predecessor/successor behavior
