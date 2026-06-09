# Identity re-key migration

User-initiated **cryptographic rotation** (new ML-DSA / ML-KEM keys, new canonical `pn-*`) with seamless continuity: same Google Drive folder, re-issued ZKPs, DM/group re-key, recovery vault rebuild, and network succession.

Distinct from **Shamir custodian recovery**, which keeps the same `publicKey` and only changes passcode.

## User flow (dashboard)

1. **Recovery & Devices** → **Rotate identity (new keys)**
2. Unlock predecessor `.pn` (or use currently unlocked identity)
3. Set new passcode → migration wizard runs client-side steps
4. Download new `.pn`; unlock browser with new passcode to finish DM/group handoff

## API routes (OAuth Bearer — predecessor or successor during migration)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/identity/migration/start` | Create `migration_id`, return checklist + pinned `driveFolderId` |
| GET | `/api/identity/migration/:id` | Migration status |
| PATCH | `/api/identity/migration/:id/steps/:stepId` | Idempotent step completion |
| POST | `/api/identity/migration/:id/connections/rekey` | Update connection sheet `kemCiphertext` |
| POST | `/api/identity/migration/:id/groups/rewrap` | Owner group key re-wrap fan-out |
| POST | `/api/identity/migration/:id/zkp-data-points/batch` | Batch ZKP sheet updates |
| POST | `/api/identity/migration/:id/recovery/custodians` | Recovery vault custodian rows |
| POST | `/api/identity/migration/:id/complete` | Verify lineage ZK + `registerSuccession` (successor token) |

Admin override remains: `POST /api/admin/identity/succession`.

## Lineage ZK (`par-noir.zkp.identity_succession`)

Dual-signed envelopes bind predecessor and successor `public_key` + `pn_identifier` + `migration_id`. Required for `complete`. Integrators may accept predecessor-key ZKPs during a **90-day grace window** when verifying with `successorPnIdentifier` (see `ZKPDataPointsService.verifyProof`).

## Drive folder continuity

`getMetadataFolder` resolves via pinned `driveFolderId` in `storage_credentials` before name lookup (`par Noir - pn-{id}`). Succession `complete` patches successor credentials with the pinned folder id.

## Shared package

`@par-noir/identity-migration` — drive re-encrypt, ZKP reissue, DM self-rekey, group re-wrap, lineage ZK, resumable runner.

## Security

- pn name, passcode, and secret keys never sent to API
- `pn_identity_migration_kem_handoff` in **sessionStorage** only (cleared after browser DM step)
- Legacy DM roots in local migration state for historical decrypt only
