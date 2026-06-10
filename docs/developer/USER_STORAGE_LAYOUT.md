# User storage layout (provider-agnostic)

Logical tree used by all storage providers. See [GOOGLE_DRIVE_STRUCTURE.md](../../GOOGLE_DRIVE_STRUCTURE.md) for Google-specific details.

```
par-noir-{pn}/
  _metadata/
    profile.json
    preferences.json
    {table}.db          # portable providers (SQLite)
    {table}.xlsx        # Google Drive (Sheets)
    media/
    thoughts/
    collections/
  integrators/
    {oauth_client_id}/
    _pn_migration_manifest.json
  par-noir-messages/
    Inbox               # Google: spreadsheet
    conversation-{pn}.jsonl   # portable message log
    attachments/
```

## Portable table files

Non-Google providers store tables as SQLite blobs at `_metadata/{name}.db`.

## Path helpers

`@par-noir/user-owned-storage` exports `pnLayout` constants (`TABLE_PATHS`, `JSON_BLOB_PATHS`, etc.).

### Encrypted media blobs

Per-file blobs use content-class paths on the **file backend** (not necessarily the social cloud):

| Helper | Path |
|--------|------|
| `encryptedMediaPath('media', fileId)` | `_metadata/media/{fileId}.encrypted` |
| `companionMetadataPath('media', fileId)` | `_metadata/media/{fileId}.metadata.json` |
| `fileRef(provider, key, opts?)` | `{ backend, backendFileId, backendAccountId?, contentClass? }` |

Owner/public indexes (on the **social cloud**) record `backend` + `backendFileId` per entry so apps resolve the correct provider API.

### Curated feeds

Subscriber lists live on the creator's **social cloud** at `_metadata/feeds/{feedId}/subscribers.json`.
