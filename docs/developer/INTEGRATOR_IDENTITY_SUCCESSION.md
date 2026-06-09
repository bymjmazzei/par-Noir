# Identity succession for integrators (superseded pN)

After **custodian recovery (same keys)** or **identity re-key migration (new keys)**, a user may have a **successor** pN identifier on the par Noir network. User-initiated re-key is documented in [IDENTITY_REKEY_MIGRATION.md](./IDENTITY_REKEY_MIGRATION.md). The **predecessor** identifier remains cryptographically valid as a **local file** (offline math does not erase copies), but the network treats it as **retired**: no new OAuth issuance, no storage credential binding, no feed creation for that predecessor DID when recorded.

## What to do

1. **Do not cache “this `pn_identifier` is valid forever.”**  
   Before relying on a stored pN id, call:
   - `GET https://api.parnoir.com/api/v1/identity/successor?pn_identifier=pn-xxxxxxxxxxxx`  
   or the alias  
   - `GET https://api.parnoir.com/api/v1/identity/revocations?pn_identifier=pn-xxxxxxxxxxxx`

2. **Response shape (opaque ids only, no PII)**  
   - `revoked`: boolean  
   - `successorPnIdentifier`: present when `revoked` is true (omit in future if product requires privacy; clients must handle missing successor)  
   - `effectiveAt`: ISO timestamp when the succession row became effective  

3. **On `revoked: true`**  
   - Stop using the predecessor for new OAuth, API key issuance, or resource binding.  
   - Prompt the user to complete sign-in with their **current** pN file / successor identity.  
   - Discard or refresh any long-lived mappings from predecessor → tenant in your system.

## Server behavior (summary)

- **OAuth:** Authorization codes, token exchange, refresh, and in-memory access token validation reject **superseded** predecessors.
- **Storage:** `GET`/`PUT` `/api/storage/credentials/...` and Drive proxy token retrieval reject predecessors.
- **Feeds:** Creating a feed rejects **superseded** `creatorDid` when that DID was recorded on the succession row.
- **API keys:** Keys whose `pn_id` is a superseded predecessor fail validation.
- **Owned-asset registry:** On succession migration, `pn_owned_assets.root_pn_identifier`, `api_keys.root_pn_id`, and `feeds.owner_pn_identifier` rows tied to the predecessor are updated to the successor where applicable. See [OWNED_ASSETS_INTEGRATORS.md](./OWNED_ASSETS_INTEGRATORS.md).

## Registering succession

**User re-key:** `POST /api/identity/migration/:id/complete` (successor OAuth + dual lineage ZK). See [IDENTITY_REKEY_MIGRATION.md](./IDENTITY_REKEY_MIGRATION.md).

**Operators:** use **`ADMIN_API_KEY`**:

`POST /api/admin/identity/succession`

```json
{
  "predecessorPnIdentifier": "pn-aaaaaaaaaaaa",
  "successorPnIdentifier": "pn-bbbbbbbbbbbb",
  "predecessorDid": "did:key:...",
  "successorDid": "did:key:...",
  "reason": "recovery",
  "migrateBindings": true
}
```

This migrates stored bindings (storage credentials, profiles, feeds when DIDs provided, aggregator pn columns, device tokens, API keys) in one transaction where applicable.

## “Picture on a wall”

Users may still **decrypt** an old pn file offline. Online, par Noir and honest integrators treat the predecessor as **read-only retired** for **network-backed** features: ZKPs, cloud storage, feeds, and licenses follow the **successor** after migration.
