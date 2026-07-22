# Storage migration

Social cloud migration, multi-account connect, and cross-cloud file moves.

## Multi-account per provider

Each connected account has a canonical id: `{prefix}::{pn}::{slug}` (e.g. `s3::pn-abc123::my-bucket`).

- Connect additional accounts via **Additional Cloud Providers** without disconnecting others.
- `PUT /api/storage/credentials/:pn/provider` upserts by `accountId`.
- `DELETE /api/storage/credentials/:pn/provider/:provider/:accountId` removes one account.
- Blob I/O accepts `accountId` query/body param; resolves the correct bucket/account.

## Social cloud migration

When changing social cloud provider (including Google Drive ↔ portable), a completed migration job is required.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/storage/migrate/social-cloud/preview` | Inventory and blockers |
| `POST /api/storage/migrate/social-cloud/start` | Copy tables/indexes/JSON |
| `GET /api/storage/migrate/social-cloud/:jobId` | Job status |
| `POST /api/storage/migrate/social-cloud/:jobId/complete` | Flip credentials |
| `PUT /api/storage/credentials/:pn/social-cloud` | Pass `migrationJobId` when required |

**Supported directions:**

| From | To | Strategy |
|------|-----|----------|
| Google Drive | portable | Semantic export: Sheets → SQLite/JSON via `googlePortableMigrator` |
| portable | Google Drive | Semantic import: SQLite/JSON → Sheets |
| portable A | portable B | Byte-copy `_metadata/` blobs (unchanged) |

**Artifact matrix:** bridge tables (notifications, indexes, inbox, …), JSON blobs (profile, preferences, device-policy, index meta), transformers (connections, recovery, preferences, engagement, messaging conversations, companion metadata, feed subscribers, integrators).

**Not migrated with social cloud:** encrypted file blobs on file backends (use file migration). Companion metadata and feed subscribers **are** migrated via transformers when present (soft-skipped only if the user has none).

**409 semantics:** `PUT .../social-cloud` without a completed `migrationJobId` returns `migration_required` for any provider change.

Encrypted **file blobs** on other backends are not moved unless you run file migration separately.

## File migration

Move encrypted blobs between file backends; owner/public index entries update on the social cloud.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/storage/migrate/files/preview` | Count files |
| `POST /api/storage/migrate/files/start` | Migrate `fileIds[]` |
| `POST /api/storage/migrate/files/bulk` | All files on a source backend |
| `GET /api/storage/migrate/files/:jobId` | Job status |

Dashboard: select files in bulk mode → **Move to cloud** dropdown.

## Jobs table

`storage_migration_jobs` stores `job_type` (`social_cloud` | `files`), status, providers, and `progress_json`.

## Testing

- Connect two S3 buckets; upload to each; verify correct `backendAccountId` in owner index.
- Migrate social cloud S3 → Azure; preferences and indexes intact.
- Move one file from Dropbox backend to S3; download via updated `metadata.backend`.
- Social cloud change without completed job returns `migration_required` (409).
