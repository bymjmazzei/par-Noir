# Identity re-key migration

User-initiated **cryptographic rotation** (new ML-DSA / ML-KEM keys, new canonical `pn-*`) with seamless continuity: same Google Drive folder (pinned by id, renamed to successor), full tree migration, re-issued ZKPs, DM/group re-key, recovery vault rebuild, required custodian re-invite, and network succession.

Distinct from **Shamir custodian recovery**, which keeps the same `publicKey` and only changes passcode.

## User flow (dashboard)

1. **Recovery & Devices** → **Rotate identity (new keys)**
2. Unlock predecessor `.pn` (or use currently unlocked identity)
3. Set new passcode → migration wizard runs client-side steps
4. If Drive items fail: review report and explicitly acknowledge before continuing
5. **Re-invite recovery custodians** until threshold invitations are sent (custodians accept asynchronously)
6. **Verify sub-pN backups** and run `owned_assets_sync` (IPFS manifest republish)
7. Download new `.pn`; unlock **aggregator-browser** with successor passcode so `dm_rekey` / `group_rewrap` complete before finalize

## Migration steps

| Step | Where | Purpose |
|------|-------|---------|
| `zkp_reissue` | Dashboard | Re-sign ZKPs from localStorage queue **and** `zkp-data-points.xlsx` on Drive |
| `recovery_vault` | Dashboard | New recovery envelope + `initializeRecoveryVaultOnDrive` (PendingShares on Drive; sessionStorage flush-only buffer) |
| `drive_files` | Dashboard | Full pinned Drive tree: inventory, `.encrypted` re-wrap, JSON patches, sheets (incl. followers/groups/devices/Inbox), companion `*.metadata` sheets, folder rename |
| `dm_rekey` / `group_rewrap` | **Browser only** | Browser bridge rekeys connections, re-encrypts DM history rows, re-wraps group keys; acks steps via API |
| `profile_publish` | Dashboard | `profile.json` + API mlKem cache |
| `custodian_reinvite` | Dashboard wizard | Threshold custodian invitations with new custodianship ZKPs |
| `lineage_zkp` | Dashboard | Dual-signed succession proofs |
| `owned_assets_sync` | Dashboard | Verify subs under successor root; republish IPFS `ownedAssets` manifest |
| `succession_register` | API `complete` | Network succession + credential pin |

## API routes (OAuth Bearer — predecessor or successor during migration)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/identity/migration/start` | Create `migration_id`, return checklist + pinned `driveFolderId` |
| GET | `/api/identity/migration/:id` | Migration status, `driveProgress`, `migrationReport` |
| PATCH | `/api/identity/migration/:id/steps/:stepId` | Idempotent step completion |
| PATCH | `/api/identity/migration/:id/drive/progress` | Persist drive phase cursor + report |
| POST | `/api/identity/migration/:id/drive/sheets/migrate` | Batch pn/did rewrite across `_metadata` + `par-noir-messages` sheets; companion `*.metadata` spreadsheets |
| GET | `/api/identity/migration/:id/zkp-data-points/from-drive` | Read ZKP envelopes from Drive sheet for client re-sign |
| GET | `/api/identity/migration/:id/conversations/:participantPn/rows` | Conversation rows for DM history re-encrypt |
| POST | `/api/identity/migration/:id/drive/messages/rows` | Persist re-encrypted message rows + connection kem ack |
| POST | `/api/identity/migration/:id/connections/rekey` | Update connection sheet `kemCiphertext` (requester) |
| POST | `/api/identity/migration/:id/connections/rewrap-root` | Update acceptor inbox `wrappedMessageRootKey` |
| POST | `/api/identity/migration/:id/groups/rewrap` | Owner group key re-wrap fan-out |
| POST | `/api/identity/migration/:id/zkp-data-points/batch` | Batch ZKP sheet updates |
| POST | `/api/identity/migration/:id/recovery/custodians` | Recovery custodian rows (predecessor Drive creds + pinned folder) |
| POST | `/api/identity/migration/:id/complete` | Verify lineage ZK + `registerSuccession` (successor token) |

Admin override remains: `POST /api/admin/identity/succession`.

## Drive folder continuity

- `getMetadataFolder` resolves via pinned `driveFolderId` in `storage_credentials` before name lookup.
- `drive_files` walks the **entire** pinned tree (no folder category skipped by default).
- Per-item outcomes: `migrated`, `patched`, `failed` — report at `_metadata/migration-{migrationId}-report.json`.
- Folder renamed to `par Noir - {successorPn}` after migration.
- `integrators/_pn_migration_manifest.json` written for L5 apps; opaque integrator binaries may be marked `failed` with user acknowledgment.

## Custodian re-invite

- New recovery master after re-key → old custodianship ZKPs invalid.
- Wizard requires **threshold** invitations sent (owner-side); custodians must still **accept** on their devices before approving future recovery.
- Uses `assignCustodianVaultAndIssueCredential` + migration `recovery/custodians` batch (successor pn, predecessor Drive access).

## Recovery vault (Drive `recovery.xlsx`)

- **PendingShares** — all Shamir shares encrypted with owner `publicKey`; unassigned until owner assigns to a custodian.
- **Custodians** lifecycle: `invited` → `accepted` → `revoked` (revoked returns share to pending pool). **`unrevokable`** is set only at assign and cannot be cleared later.
- **Resend** rebuilds invitation from existing Drive row (no new share consumed). **Revoke** is blocked for protected (`unrevokable`) custodians (403 `custodian_unrevokable`).
- **Recovery Ready** requires `accepted >= threshold` **and** `acceptedUnrevokable >= 1`. Completing recovery also requires at least one approving share from an accepted protected custodian.
- **Legacy unlock**: dashboard flushes `sessionStorage` `pn_pending_recovery_shares` via `POST /api/recovery/vault/initialize`, then `POST /api/recovery/vault/reconcile` normalizes `active`/`pending` custodian rows to `invited` and reports missing share indices (owner must re-initialize any missing indices from cleartext shares still in buffer).
- Identities without any accepted protected custodian cannot complete recovery until owner assigns and accepts at least one protected slot (e.g. an alt pN they control).

## Lineage ZK (`par-noir.zkp.identity_succession`)

Dual-signed envelopes bind predecessor and successor `public_key` + `pn_identifier` + `migration_id`. Required for `complete`. Integrators may accept predecessor-key ZKPs during a **90-day grace window** when verifying with `successorPnIdentifier` (see `ZKPDataPointsService.verifyProof`).

## Shared package

`@par-noir/identity-migration` — `driveFileMigration`, `driveMetadataPatch`, `dmHistoryMigration`, drive re-encrypt, ZKP reissue, DM self-rekey, group re-wrap, lineage ZK, resumable runner.

## QA matrix (manual)

Use a test account with **all** artifact types before shipping migration changes:

| Area | Verify |
|------|--------|
| `_metadata` sheets | `followers`, `following`, `groups`, `devices`, `recovery`, `connections`, `zkp-data-points` show successor pn/did |
| Companion sheets | `{fileId}.metadata` in `media/`, `thoughts/`, `collections/` decrypt with successor keys |
| Messages | `Inbox`, `conversation-*`, `conversation-group-*` updated; DM history decrypts after browser unlock |
| ZKPs | Proofs on sheet only (not localStorage queue) re-signed and verify |
| Integrators | `integrators/_pn_migration_manifest.json` present; opaque binaries acknowledged if unmigrated |
| Report | `_metadata/migration-{migrationId}-report.json` on Drive matches API `migrationReport` |
| Subs | `owned_assets_sync` completes; IPFS manifest lists subs under successor root |
| Browser | `dm_rekey` + `group_rewrap` acked only after aggregator-browser unlock with successor |

Automated: `api` Jest `replaceInCell` tests; production builds for `api`, `id-dashboard`, `aggregator-browser`.

## Security

- pn name, passcode, and secret keys never sent to API
- `pn_identity_migration_kem_handoff` in **sessionStorage** only (cleared after browser DM step)
- Legacy DM roots used as decrypt aid during migration only
