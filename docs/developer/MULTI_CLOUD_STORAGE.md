# Multi-cloud user-owned storage

par Noir stores user data in a **logical layout** (`par-noir-{pn}/_metadata/`, `integrators/`, `par-noir-messages/`) regardless of provider.

## Providers

| Provider | Connect method | Tables (non-Google) |
|----------|----------------|---------------------|
| Google Drive | OAuth (existing) | Google Sheets (`.xlsx`) |
| Dropbox | OAuth | SQLite-on-blob (`.db`) |
| AWS S3 | Dashboard form | SQLite-on-blob |
| Azure Blob | Dashboard form (SAS) | SQLite-on-blob |
| OneDrive | Microsoft OAuth | SQLite-on-blob |
| FTP/FTPS | Dashboard form | SQLite-on-blob |

## Architecture

- Package: `@par-noir/user-owned-storage` — `BlobStore`, `UserOwnedTableStore`, `pnLayout`
- API: `storageFacade`, `storageRoutes`, provider blob adapters
- Google path unchanged: `SheetsTableAdapter` delegates to existing `*SheetsService`
- Aggregator: PostgreSQL cache; `userStorageSyncService` syncs portable public indexes

## API endpoints

- `GET /api/storage/accounts/:identityId` — list providers (no tokens)
- `GET /api/storage/context/:identityId` — active provider + paths
- `POST /api/storage/test-connection/:identityId` — probe write/delete
- `PUT /api/storage/credentials/:identityId/provider` — S3 / Azure / FTP credentials
- `POST /api/storage/oauth/dropbox/exchange` — Dropbox OAuth code exchange
- `POST /api/storage/oauth/onedrive/exchange` — OneDrive OAuth code exchange
- `GET /api/storage/blobs/:identityId?prefix=` — list blobs (non-Google)

## Social cloud and multi-account

- **Social cloud** (`socialCloudProvider` + `socialCloudAccountId`): where tables, owner/public indexes, and JSON metadata live.
- **File backends**: any connected account; owner index records per-file `backend` + `backendFileId`.
- Multiple accounts per provider (e.g. two S3 buckets) via upsert connect; see [STORAGE_MIGRATION.md](./STORAGE_MIGRATION.md).
- `PUT /api/storage/credentials/:identityId/social-cloud` — designate social cloud (migration required when switching portable providers).
- `DELETE /api/storage/credentials/:identityId/provider/:provider/:accountId` — disconnect one account.

## Migration

Social cloud and file migration wizards: [STORAGE_MIGRATION.md](./STORAGE_MIGRATION.md).

## Docs per provider

- [STORAGE_AWS_S3_SETUP.md](./STORAGE_AWS_S3_SETUP.md)
- [STORAGE_AZURE_BLOB_SETUP.md](./STORAGE_AZURE_BLOB_SETUP.md)
- [STORAGE_ONEDRIVE_SETUP.md](./STORAGE_ONEDRIVE_SETUP.md)
- [STORAGE_FTP_SETUP.md](./STORAGE_FTP_SETUP.md)
