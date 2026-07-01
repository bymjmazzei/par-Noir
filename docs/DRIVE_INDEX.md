# Drive index (`pnDriveIndex`)

Runtime Google Drive layout is **never discovered by name**. Storage init writes a complete `pnDriveIndex` to Postgres (`storage_credentials.credentials.pnDriveIndex`). Every API handler reads IDs from that index only.

## Schema (`schemaVersion: 1`)

Stored at `credentials.pnDriveIndex`:

| Field | Purpose |
|-------|---------|
| `pnFolderId` | pN root folder |
| `metadataFolderId` | `_metadata` folder |
| `integratorsRootId` | `integrators/` folder |
| `messagesFolderId` | `par-noir-messages/` folder |
| `inboxSheetId` | Inbox spreadsheet |
| `sheetIds` | All metadata spreadsheets (connections, devices, groups, …) |
| `conversationSheets` | `participantPn → conversation spreadsheetId` |

All `sheetIds` keys in `PN_DRIVE_SHEET_KEYS` are **required** after init. Missing any key → `409 DRIVE_NOT_INITIALIZED`.

`credentials.driveFolderId` is kept in sync with `pnFolderId`. Legacy `cachedFolderIds` is removed on persist.

## Init (only discovery path)

`PUT /api/storage/credentials` and `POST /api/storage/initialize` call `initializeGoogleDriveIndex()` in `api/src/server/modules/pnDriveInit.ts`:

1. Find/create pN root, `_metadata`, `integrators/`, messages folder, inbox sheet
2. Find/create every metadata spreadsheet
3. Initialize content-class folders, profile.json, preferences.json
4. Set public read on `public-file-index`
5. **Single** `persistPnDriveIndex` with the full object

No partial writes mid-init.

## Runtime resolver

`requireOwnerDriveContext(pn, accountId?)` in `ownerDriveContext.ts`:

- Loads credentials + OAuth token
- Validates complete `pnDriveIndex`
- Returns `{ index, token, sheetId(key), conversationSheetId(peer) }`

`getMetadataFolder()` in `server.ts` now reads the index only (no Drive search).

## Flow trees (target: 0 `files.list` on hot paths)

### OAuth unlock

1. `resolveOAuthDriveContext` — Postgres index only
2. Sheets read on third-party-permissions (via metadata path / sheet id)
3. **0 Drive API discovery**

### GET /messages/conversations

1. `readPnDriveIndex` from credentials
2. Sheets `Inbox!A2:H` via `inboxSheetId`
3. Optional groups via `sheetIds.groups`
4. **0 Drive discovery**

### POST /messages/send

1. Sender + recipient index from Postgres
2. Connection check via inbox or connections sheet id
3. Conversation sheets from `conversationSheets` (create + `patchPnDriveIndex` if new)
4. **0 Drive discovery** (except creating a new conversation file under known `messagesFolderId`)

### Device gate (`gateOwnerRoute`)

`loadDeviceBundle` uses `index.sheetIds.devices` — no `getOrCreateSpreadsheet` at gate time.

## Incomplete index

**Fail fast:** `409 DRIVE_NOT_INITIALIZED` / `DRIVE_INDEX_INCOMPLETE`.

**Fix:** Dashboard → Storage → reconnect/re-save Google Drive (re-runs full init).

No lazy backfill, no repair-on-404 name search, no `DRIVE_INDEX_STRICT` flag.

## Dev rollout

After deploy:

1. Re-save Google Drive credentials for each test pN in the dashboard
2. Verify Railway logs show no `files.list` on OAuth/messaging request paths
3. Retry OAuth + messaging flows

## Modules

| Module | Role |
|--------|------|
| `pnDriveIndex.ts` | Types, read/persist/patch, completeness check |
| `pnDriveInit.ts` | Init-only folder/sheet discovery |
| `ownerDriveContext.ts` | Runtime token + index resolver |
| `pnDriveLayout.ts` | Init-only folder helpers (no cache) |
