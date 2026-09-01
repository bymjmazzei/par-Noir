# Plan: Owner cloud layout upgrade + L5 protocolVersion

**Status:** Phases 1–3 (owner A+B) **implemented**. Domain D (L5 `protocolVersion`) and `/api/v2` remain deferred.  
**Depends on inventory:** [CLOUD_PROTOCOL_VERSIONING_TOUCHPOINTS.md](../developer/CLOUD_PROTOCOL_VERSIONING_TOUCHPOINTS.md).  
**Related:** [DRIVE_INDEX.md](../DRIVE_INDEX.md), [ADR_DEVICE_CLOUD_CUSTODY.md](./ADR_DEVICE_CLOUD_CUSTODY.md), [ADR_MESSAGING_CHANNEL_THREADS.md](./ADR_MESSAGING_CHANNEL_THREADS.md).

### Shipped (owner layout)

| Piece | Location |
|-------|----------|
| Catalog + single-flight upgrade | `api/src/server/modules/storage/cloudLayoutMigrations.ts` |
| First migration `inbox_channel_client_id_v1` | Google Inbox A–I via `ensureInboxChannelColumn`; portable `migrateInboxChannelClientIdPortable` |
| Routes | `GET/POST /api/storage/:identityId/layout/status\|upgrade` in `storageCredentialsRoutes.ts` |
| Stamp on init | `driveInitSteps.ts`, `storageInitService.ts` |
| Inbox create seeds A–I | `messageSheetsService.getOrCreateInboxSheet` |
| Dashboard Complete update | `CloudLayoutUpdateBanner` in Storage Secure Cloud + unlock CTA |
| Browser CTA (no upgrade POST) | `AggregatorCloudReconnectHost` + messaging soft-block in `MessagesPage` |
| Gate tests | `cloudLayoutMigrations.gate.test.ts` + route tests |

### Manual QA (two existing test pNs)

1. Unlock dashboard → banner “Cloud layout update required” → Open Storage.
2. Storage → **Complete update** → status complete; banner clears.
3. Messaging (browse/messaging) works with channel threads; no Drive folder delete.
4. New Drive connect / full initialize → stamped current (no upgrade CTA).
5. Browser unlock shows CTA linking to dashboard `#storage`; does not call upgrade.

This is the build plan that follows the ask-only touch-point inventory. Domains A+B first; domain D after; domain C only when the public HTTP contract breaks.

## Goals

1. Versioned **owner cloud layout** with additive migrations and an explicit dashboard **Complete update** path (custody-safe).
2. First migration: Inbox channel-thread schema (`channelClientId` / portable `inboxRowKey`).
3. Unlock / browser CTA when layout is behind — no Drive notification rows.
4. Later: L5 clients declare `protocolVersion` (and optional `minCloudLayoutVersion`).

## Non-goals (this plan)

- Full re-init as the upgrade mechanism.
- Silent auto-create of folders at Drive root on unlock.
- `/api/v2` or breaking public API renames.
- Identity re-key / succession migrate under custody.
- Third parties writing owner layout.

---

## Phase 1 — Owner migration catalog + status/upgrade API

### Data model

On `storage_credentials.credentials` (alongside `pnDriveIndex`):

- `cloudLayoutVersion: number` — integer ratchet of required layout generation (start at `1` = current post-channel Inbox).
- `appliedMigrations: string[]` — ordered migration ids already applied (e.g. `inbox_channel_client_id_v1`).

Keep `pnDriveIndex.schemaVersion` as the **index object shape** version; do not overload it for product migrations.

### Catalog module (new)

Suggested location: `api/src/server/modules/storage/cloudLayoutMigrations.ts` (or `packages/user-owned-storage` if shared types are needed by dashboard).

| Export | Purpose |
|--------|---------|
| `CURRENT_CLOUD_LAYOUT_VERSION` | Required version after all migrations |
| `CLOUD_LAYOUT_MIGRATIONS` | Ordered `{ id, minVersion, description, run }` |
| `getPendingMigrations(credentials)` | Diff applied vs catalog |
| `readCloudLayoutState` / `persistCloudLayoutState` | Version + applied list |

**Hard rules for `run`:**

- Require complete `pnDriveIndex` (or fail with `DRIVE_NOT_INITIALIZED` — user must initialize first).
- Create only under **indexed parent ids** (`metadataFolderId`, `messagesFolderId`, …).
- Never search-create at Drive root.
- Single-flight per identity (reuse `runDriveInitOnce` / dedicated upgrade coordinator).
- If name collision under parent (2+ folders), fail or bind to indexed id — do not create a third.
- Google vs portable branches explicit (reuse `isPortableStorageProvider`).

### First migration: `inbox_channel_client_id_v1`

| Provider | Steps |
|----------|--------|
| Google | On `inboxSheetId`: ensure headers A–I match `INBOX_HEADERS_WITH_THREAD`; backfill empty `channelClientId` → `platform`; prefer calling shared logic extracted from `ensureInbox*Column` rather than duplicating |
| Portable | Normalize inbox rows via `normalizeInboxRow` / `dmInboxRowKey`; rewrite legacy peer-only keys |

After success: append id to `appliedMigrations`; set `cloudLayoutVersion` to current.

### Routes

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/storage/:identityId/layout/status` | Auth + owner gate. Returns `{ current, required, pending: [{ id, description }], complete: boolean }`. **No Drive writes.** Cheap read of credentials. |
| `POST` | `/api/storage/:identityId/layout/upgrade` | Auth + owner gate + `X-PN-Cloud-Access-Token` under custody. Run pending migrations in order. Single-flight. Return updated status. |

Do **not** fold this into `POST /storage/initialize`. Keep initialize for first connect / wiped tree / incomplete index only.

Precedent for targeted patch: `POST /api/storage/:identityId/zkp-docs/ensure`.

### Tests (falsification first)

1. Synthetic credentials with complete index but **missing** `inbox_channel_client_id_v1` → status `complete: false`, pending includes that id.
2. After upgrade mock → `complete: true`, id in `appliedMigrations`.
3. Upgrade without cloud token under custody → same error class as other owner Drive routes.
4. Concurrent upgrade → single-flight (second waits or no-ops safely).
5. Gate: status check must **fail** the “current” assertion when migration missing (prove the check can fail).

---

## Phase 2 — Dashboard Storage UI + unlock CTA

### Storage → Cloud

In id-dashboard Storage (near connect/reconnect in `FileStorageAggregator` / `MultiCloudStoragePanel`):

- On hydrate / cloud ready: `GET .../layout/status`.
- If `!complete`: banner + **Complete update** button.
- Button: `POST .../layout/upgrade` with forwarded Google/portable token via existing ownerFetch / cloud header path.
- Progress / error messaging; on success refresh status and clear banner.

### Unlock prompt

| Surface | Behavior |
|---------|----------|
| Dashboard unlock / `CloudReconnectHost` / post-`ensureCloudSession` | If status incomplete → in-app banner/modal: “Cloud layout update required” → navigate to Storage |
| Browser (`AggregatorCloudReconnectHost`) | Same message; CTA opens dashboard Storage URL (browser does **not** call upgrade) |

Do **not** block unlock or wipe session. Soft-block messaging (or features that need the migration) with the same CTA if product requires it.

### Stop silent full init for drift

- `cloudSessionBootstrap.ensureDriveLayout` / unlock paths must **not** treat schema drift as “run full initialize.”
- Full initialize remains for incomplete index / missing credentials layout only.
- Prefer status → upgrade for known migrations.

---

## Phase 3 — Retire ad hoc Inbox ensures as SoT

- Keep `ensureInbox*Column` as a **safety net** on write paths until all clients have upgraded, or remove once layout version gates messaging.
- New Google Inbox **create** paths must seed full A–I headers (fix short A–E/F seed in `getOrCreateInboxSheet`).
- Align `setAllInboxEntries` / group inbox updates with channel column model where still lagging (see inventory).

---

## Phase 4 — L5 `protocolVersion` (domain D)

Ship when a breaking integrator contract needs a pin (not required for Inbox owner migration alone).

| Change | Detail |
|--------|--------|
| `oauth_clients` | Add `protocol_version` (int or semver string) and optional `min_cloud_layout_version` |
| Registration | `ClientRegistrationService` + developer-portal Credentials / Platform clients |
| SDK | `createPnIntegratorClient({ protocolVersion })` documents required pin; package semver tracks kit |
| Token (optional) | Include negotiated version in grant/token metadata if handlers need it |
| Docs | Changelog section in `L5_INTEGRATOR_QUICKSTART.md` + starter example |
| Gate | Return clear error when client protocol &lt; platform min **or** user layout &lt; client `min_cloud_layout_version` |

Model after ZK v1/v2 dual-package discipline: breaking changes bump major protocol; old clients fail loudly with upgrade docs.

**Out of scope until HTTP contract breaks:** `/api/v2` (domain C).

---

## Acceptance (Phase 1–2)

Observable:

1. User with old Inbox (no `channelClientId` / missing migration id) sees Storage **Complete update** after unlock prompt.
2. After upgrade, status is complete; messaging channel threads work without deleting the Drive folder.
3. Browser unlock shows CTA; no layout mutation from browser.
4. Concurrent / repeated upgrade does not create duplicate `_metadata` or messages folders.
5. Unit/gate tests prove status fails on synthetic “behind” credentials before trusting “current.”

---

## Suggested file touch list (implementation)

**API:** `cloudLayoutMigrations.ts` (new), `storageCredentialsRoutes.ts` or dedicated `cloudLayoutRoutes.ts`, extract shared Inbox header ensure from `messageSheetsService.ts`, tests under `api/src/server/modules/storage/`.

**Dashboard:** status fetch + banner/button in Storage cloud section; unlock banner; ownerFetch upgrade call with cloud token.

**Browser:** unlock CTA only (link to dashboard).

**Docs:** update `DRIVE_INDEX.md` (upgrade vs init), this plan status → Implemented when done, inventory “Gap” section.

**Ratchet (preferred):** gate test that `CURRENT_CLOUD_LAYOUT_VERSION` and migration catalog stay in sync; status endpoint fails when migration missing.
