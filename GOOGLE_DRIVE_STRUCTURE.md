# Google Drive Directory Structure

This document outlines the correct folder and file structure created when a user authenticates with Google Drive.

## Root Structure

```
Google Drive Root
└── par Noir - {pnIdentifier}/
    ├── _metadata/
    │   ├── [Metadata Files - see below]
    │       ├── media/
    │   │   ├── media-public-index.xlsx
    │   │   └── media-owner-index.xlsx
    │   ├── thoughts/
    │   │   ├── thoughts-public-index.xlsx
    │   │   └── thoughts-owner-index.xlsx
    │   └── collections/
    │       ├── collections-public-index.xlsx
    │       └── collections-owner-index.xlsx
    ├── integrators/ (empty root created at Drive setup; per-app subfolders on first `cloud:app` grant)
    │   └── {oauth_client_id}/   (one silo per connected integrator)
    └── par-noir-messages/ (created on-demand when first message is sent)
        └── conversation-{otherUserDid}.xlsx (created when connection is accepted)
```

## Main Folder: `par Noir - {pnIdentifier}`

- **Name Format**: `par Noir - pn-{hash}`
- **Location**: Google Drive root
- **Purpose**: Main container folder for all user data

## Metadata Folder: `_metadata`

- **Location**: Inside `par Noir - {pnIdentifier}/`
- **Purpose**: Contains all metadata files, configuration, and content class folders

### Metadata Files (in `_metadata/`)

#### JSON Files (Small, Fixed Structure):
1. **`profile.json`** - User profile information
2. **`preferences.json`** - Current user preferences and tag preferences (used for filtering)

#### Google Sheets Files (.xlsx) - For Scalable, Growing Datasets:
1. **`connections.xlsx`** - Connections table (replaces old connections.json)
2. **`notifications.xlsx`** - Notifications table (replaces old notifications.json)
3. **`activity_ledger.xlsx`** - Activity ledger table (replaces old activity_ledger.json)
4. **`engagement.xlsx`** - Engagement data (replaces old engagement.json)
   - Contains 5 sheets: Likes, Dislikes, Comments, Shares, Saves
5. **`messaging_ledger.xlsx`** - Messaging activity ledger (replaces old messaging_ledger.json)
   - Contains 1 sheet: Activities
6. **`prism_ledger.xlsx`** - Prism DMCA ledger (reports, flagged content, Ray vote history)
   - Contains 1 sheet: Activities
7. **`preferences.xlsx`** - Preference interaction log (hybrid: preferences.json maintains current state, preferences.xlsx logs all interactions)
   - Contains 1 sheet: Interactions
   - Logs: tag preferences, curated feed preferences, display name changes, profile image changes, feed subscriptions, category/subject preferences, curation card interactions
8. **`zkp-data-points.xlsx`** - Zero-knowledge proof data points (replaces old zkp-data-points.json)
   - Contains 1 sheet: Data Points
9. **`third-party-permissions.xlsx`** - Third-party app permissions (replaces old third-party-permissions.json)
10. **`platform-registry.xlsx`** *(operator pN only)* - Platform OAuth application queue, approved OAuth clients, and commercial licenses (source of truth for integrator approval; synced to API Postgres cache). See `docs/developer/PLATFORM_OPERATOR.md`.
   - Contains 1 sheet: Permissions
10. **`public-file-index.xlsx`** - Public file index (replaces old public-file-index.json)
   - Contains 1 sheet: Files (publicly readable)
11. **`owner-file-index.xlsx`** - Owner file index (replaces old owner-file-index.json)
    - Contains 1 sheet: Files (private)
12. **`followers.xlsx`** / **`following.xlsx`** - Social graph (created at Drive init)
13. **`groups.xlsx`** - Group chat metadata (on-demand)
14. **`devices.xlsx`** - Registered devices (on-demand)
15. **`recovery.xlsx`** - Recovery vault custodians and pending shares (on-demand)
16. **`device-policy.json`** - Device policy flags (on-demand)
17. **`migration-{migrationId}-report.json`** - Identity re-key audit report (written after re-key migration)

### Content Class Folders (in `_metadata/`)

Each content class folder contains:
- **`{folder}-public-index.xlsx`** (e.g. `thoughts-public-index.xlsx`, `media-public-index.xlsx`, `collections-public-index.xlsx`) - Public index for that content class (publicly readable). Same structure as root `public-file-index.xlsx` (Files sheet).
- **`{folder}-owner-index.xlsx`** (e.g. `thoughts-owner-index.xlsx`, `media-owner-index.xlsx`, `collections-owner-index.xlsx`) - Owner index for that content class (private). Same structure as root `owner-file-index.xlsx` (Files sheet).

**Indexes are Sheets only.** Owner and public indexes (root and content-class) are only `.xlsx` (Sheets). JSON index files (`public-file-index.json`, `owner-file-index.json`) are deprecated and no longer created or read.

Each content-class folder may also contain **`{fileId}.metadata`** companion Google Sheets (engagement tabs + encrypted owner columns) alongside encrypted uploads (`*.encrypted`).

#### 1. `media/`
- Contains media files (images, videos, etc.)
- Has its own public and owner index Sheets

#### 2. `thoughts/`
- Contains thought files
- Has its own public and owner index Sheets

#### 3. `collections/`
- Contains collection files
- Has its own public and owner index Sheets

## Integrators Folder: `integrators`

- **Location**: Inside `par Noir - {pnIdentifier}/` (sibling to `_metadata`, not inside it)
- **Created**: Empty `integrators/` folder is created during Google Drive setup (`PUT /api/storage/credentials` or `POST /api/storage/initialize`). Its Drive folder id is cached as `credentials.cachedFolderIds.integratorsRootId`.
- **Purpose**: Siloed storage for **app-specific** data that is **not** part of the par Noir standard data-point catalog

### Per-app subfolder: `integrators/{oauth_client_id}/`

- **Created**: On first OAuth grant with `cloud:app` scope (token exchange or `GET /api/integrator/storage-root`)
- **Name**: Sanitized OAuth `client_id` (alphanumeric, `-`, `_` only)
- **Access**: Third-party apps may read/write **only** under their own subfolder via par Noir API (`/api/drive/*` with `cloud:app` scope). The API enforces this server-side.
- **Not for pN data points**: Standard ZKP data points live in `_metadata/zkp-data-points.xlsx`. Integrators receive proofs via par Noir APIs after consent (`third-party-permissions.xlsx` row keyed by `toolId` = `client_id`), not by copying rows into the integrator folder.

### First-party vs layer-5 (L5)

| Client type | Drive access |
|-------------|----------------|
| **First-party** (`browser-app`, `prism-app`, `developer-portal`) | Full pN tree including `_metadata` and content-class folders |
| **L5 integrators** (registered OAuth clients) | `integrators/{client_id}/` only for Drive proxy; pN data points via API only |

### Migration manifest (after root re-key):
- **`integrators/_pn_migration_manifest.json`** - Predecessor/successor pn ids and `migrationId` for L5 apps

## Messages Folder: `par-noir-messages`

- **Location**: Inside `par Noir - {pnIdentifier}/`
- **Created**: On-demand when first message is sent or connection is accepted
- **Purpose**: Contains conversation sheets

### Inbox and conversation files:
- **`Inbox`** - Spreadsheet (not `.xlsx` suffix) with thread metadata
- **`conversation-{otherUserPn}.xlsx`** and **`conversation-group-{groupId}.xlsx`** - One sheet per DM or group thread
- **`attachments/`** - E2E-encrypted media blobs (conversation-key encrypted, not identity re-wrapped)

### Legacy conversation naming:
- **`conversation-{otherUserDid}.xlsx`** - One sheet per conversation (legacy pn/did in filename)
  - Created automatically when a connection is accepted
  - Contains messages between two users
  - First message is system message: "{acceptor} accepted {requester}'s connection request"

## Files That Should NOT Be Created

The following files are **deprecated** and should **NOT** be initialized:
- ❌ `connections.json` (replaced by `connections.xlsx`)
- ❌ `notifications.json` (replaced by `notifications.xlsx`)
- ❌ `activity_ledger.json` (replaced by `activity_ledger.xlsx`)
- ❌ `engagement.json` (replaced by `engagement.xlsx`)
- ❌ `messaging_ledger.json` (replaced by `messaging_ledger.xlsx`)
- ❌ `zkp-data-points.json` (replaced by `zkp-data-points.xlsx`)
- ❌ `third-party-permissions.json` (replaced by `third-party-permissions.xlsx`)
- ❌ `public-file-index.json` (replaced by `public-file-index.xlsx`)
- ❌ `owner-file-index.json` (replaced by `owner-file-index.xlsx`)
- ❌ `public-file-index.json` / `owner-file-index.json` in content-class folders (replaced by `{folder}-public-index.xlsx` / `{folder}-owner-index.xlsx`, e.g. `thoughts-owner-index.xlsx`)

**Note**: Indexes are Sheets only. Content-class index files use distinct names (`{folder}-owner-index.xlsx`, `{folder}-public-index.xlsx`) to avoid collision with root. JSON index files are deprecated and no longer created or read.

## Initialization Order

When a user authenticates with Google Drive, the following happens:

1. **Create main folder**: `par Noir - {pnIdentifier}`
2. **Create metadata folder**: `_metadata` inside main folder
3. **Create content class folders**: `media/`, `thoughts/`, `collections/` inside `_metadata/`
4. **Create root index files**: `public-file-index.xlsx` and `owner-file-index.xlsx` in `_metadata/`
5. **Create content class index files**: `{folder}-owner-index.xlsx` and `{folder}-public-index.xlsx` in each content class folder (e.g. `thoughts-owner-index.xlsx`, `thoughts-public-index.xlsx` in `thoughts/`)
6. **Initialize metadata files**:
   - JSON files: `profile.json`, `preferences.json` (current state)
   - Sheets files: `connections.xlsx`, `notifications.xlsx`, `activity_ledger.xlsx`, `engagement.xlsx`, `messaging_ledger.xlsx`, `prism_ledger.xlsx`, `preferences.xlsx` (interaction log), `zkp-data-points.xlsx`, `third-party-permissions.xlsx`, `public-file-index.xlsx`, `owner-file-index.xlsx`

## Notes

- All Sheets files (`.xlsx`) are created in the `_metadata/` folder
- Messages folder (`par-noir-messages/`) is created on-demand, not during initial setup
- Conversation sheets are created when a connection is accepted, not during initial setup
- All index files are created with empty arrays initially
- Public index files have public read permissions set
- **Migration**: If old JSON files exist (engagement.json, messaging_ledger.json, etc.), they are automatically migrated to Sheets on first access
- **Scalability**: Sheets files can handle millions of rows, making them suitable for growing datasets like engagement, messaging ledger, file indexes, preference interactions, ZKP data points, and third-party permissions
- **Preferences Hybrid Approach**: `preferences.json` stores current state (used for filtering), while `preferences.xlsx` logs all preference interactions (tag preferences, curated feed preferences, display name changes, curation card interactions, etc.)
