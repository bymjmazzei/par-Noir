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
6. **`preferences.xlsx`** - Preference interaction log (hybrid: preferences.json maintains current state, preferences.xlsx logs all interactions)
   - Contains 1 sheet: Interactions
   - Logs: tag preferences, curated feed preferences, display name changes, profile image changes, feed subscriptions, category/subject preferences, curation card interactions
7. **`zkp-data-points.xlsx`** - Zero-knowledge proof data points (replaces old zkp-data-points.json)
   - Contains 1 sheet: Data Points
8. **`third-party-permissions.xlsx`** - Third-party app permissions (replaces old third-party-permissions.json)
   - Contains 1 sheet: Permissions
9. **`public-file-index.xlsx`** - Public file index (replaces old public-file-index.json)
   - Contains 1 sheet: Files (publicly readable)
10. **`owner-file-index.xlsx`** - Owner file index (replaces old owner-file-index.json)
    - Contains 1 sheet: Files (private)

### Content Class Folders (in `_metadata/`)

Each content class folder contains:
- **`{folder}-public-index.xlsx`** (e.g. `thoughts-public-index.xlsx`, `media-public-index.xlsx`, `collections-public-index.xlsx`) - Public index for that content class (publicly readable). Same structure as root `public-file-index.xlsx` (Files sheet).
- **`{folder}-owner-index.xlsx`** (e.g. `thoughts-owner-index.xlsx`, `media-owner-index.xlsx`, `collections-owner-index.xlsx`) - Owner index for that content class (private). Same structure as root `owner-file-index.xlsx` (Files sheet).

**Indexes are Sheets only.** Owner and public indexes (root and content-class) are only `.xlsx` (Sheets). JSON index files (`public-file-index.json`, `owner-file-index.json`) are deprecated and no longer created or read.

#### 1. `media/`
- Contains media files (images, videos, etc.)
- Has its own public and owner index Sheets

#### 2. `thoughts/`
- Contains thought files
- Has its own public and owner index Sheets

#### 3. `collections/`
- Contains collection files
- Has its own public and owner index Sheets

## Messages Folder: `par-noir-messages`

- **Location**: Inside `par Noir - {pnIdentifier}/`
- **Created**: On-demand when first message is sent or connection is accepted
- **Purpose**: Contains conversation sheets

### Conversation Files:
- **`conversation-{otherUserDid}.xlsx`** - One sheet per conversation
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
   - Sheets files: `connections.xlsx`, `notifications.xlsx`, `activity_ledger.xlsx`, `engagement.xlsx`, `messaging_ledger.xlsx`, `preferences.xlsx` (interaction log), `zkp-data-points.xlsx`, `third-party-permissions.xlsx`, `public-file-index.xlsx`, `owner-file-index.xlsx`

## Notes

- All Sheets files (`.xlsx`) are created in the `_metadata/` folder
- Messages folder (`par-noir-messages/`) is created on-demand, not during initial setup
- Conversation sheets are created when a connection is accepted, not during initial setup
- All index files are created with empty arrays initially
- Public index files have public read permissions set
- **Migration**: If old JSON files exist (engagement.json, messaging_ledger.json, etc.), they are automatically migrated to Sheets on first access
- **Scalability**: Sheets files can handle millions of rows, making them suitable for growing datasets like engagement, messaging ledger, file indexes, preference interactions, ZKP data points, and third-party permissions
- **Preferences Hybrid Approach**: `preferences.json` stores current state (used for filtering), while `preferences.xlsx` logs all preference interactions (tag preferences, curated feed preferences, display name changes, curation card interactions, etc.)
