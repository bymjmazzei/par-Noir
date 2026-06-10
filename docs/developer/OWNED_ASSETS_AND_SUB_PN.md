# Owned assets and sub-pN (internal spec)

This document defines how par Noir models **human-rooted ownable assets** (API keys, feeds, devices, AI agents, smart devices) and **sub-principals** bound to a root human pN.

## Identifiers

- **`root_pn_identifier`**: The human anchor (`pn-*`). Policy, UI, and succession pivot on this.
- **`subject_pn_identifier`**: The acting principal on the wire (often `pn-*`) used in OAuth tokens, API keys, Drive folder naming, and integrator APIs. Subs have their own subject distinct from root when they act as first-class actors.
- **Normalization**: Prefer `pn-` prefix; APIs should normalize consistently with existing succession code.

## Kinds (`OwnedAssetKind`)

`human` | `api_key` | `feed` | `device` | `ai_agent` | `smart_device`

Human rows may exist for symmetry; most registry rows are non-human kinds.

## Status

`active` | `revoked` | `suspended`

## Succession

- On identity succession (predecessor → successor), **`root_pn_identifier`** on owned-asset rows where root = predecessor updates to successor.
- **Default**: **`subject_pn_identifier` does not change** for subs (cryptographic identity stable for integrators until re-issued).
- After re-key, the dashboard runs **`owned_assets_sync`**: verifies subs under the successor root and republishes the IPFS `ownedAssets` manifest.
- **Sub compromise rotation** (independent of root re-key): `POST /api/owned-assets/:id/rekey` revokes the old subject, creates a new asset row, records `pn_subject_succession`, and optionally migrates delegations.

## Revocation

- **Network revocation** (`pn_identity_succession`): predecessor pNs are blocked for OAuth, storage binding, etc.
- **Sub subjects** not in succession: revocation is **registry row** `status = revoked` (and linked feature deactivation as needed).

## IPFS vs API (dual SoT)

- **IPFS manifest** (`PNMetadata.ownedAssets`): user-published, non-sensitive catalog (opaque ids, kinds, labels, optional detail CIDs). Content-addressed; each update yields a new CID.
- **API / Postgres** (`pn_owned_assets`, delegations, keys): **enforcement** for par Noir network operations. Integrators must not rely on IPFS alone for authorization.

## Export (dashboard)

- **Main pN re-auth** required before export or reveal of sub factors.
- Optional **export passphrase** at sub creation encrypts the export bundle client-side; server never stores passphrase plaintext.

## Delegations

- **Main Delegation tab**: recovery / custodians (existing product direction).
- **Per-sub delegations**: grants from root (or delegated admin) to other `pn-*` or OAuth `client_id` with scoped access; enforced in API via `pn_asset_delegations` + `OwnedAssetAuthZ`.

## Secrets

Never log or store in plaintext: pn name, passcode, export passphrases, tokens. Audit events use opaque ids only.
