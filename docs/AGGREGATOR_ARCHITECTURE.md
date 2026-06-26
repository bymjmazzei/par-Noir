# Aggregator Architecture: Hybrid Cache + Reconcile

## Overview

The aggregator uses a **hybrid cache**: each owner's **public-file-index** (Drive Sheets or portable storage) is membership truth; PostgreSQL is a **performance cache** for feeds and search. A background **reconcile job** removes cache rows that are no longer public in the owner's index.

## Architecture Diagram

```
┌─────────────────────────┐
│  Owner storage          │ ← Membership truth (user-owned)
│  public-file-index      │
└───────────┬─────────────┘
            │
            │ Reconcile job (every 5 min + POST /metadata-index/reconcile)
            │ DB-scoped: only identities with public cache rows
            │
            ▼
┌─────────────────────────┐
│   PostgreSQL            │ ← Performance cache
│   aggregator_*          │
└───────────┬─────────────┘
            │
            │ GET /api/aggregator/metadata-index
            ▼
┌─────────────────────────┐
│  aggregator-browser     │
└─────────────────────────┘
```

## Core Principles

### 1. Owner public index is membership truth

- Public file IDs live in each user's `public-file-index` (and content-class indexes where used).
- Drive path: `par Noir - pn-{hash}/_metadata/public-file-index.xlsx`
- Portable path: same logical index on the user's social cloud provider.

### 2. Database is a performance cache

- Tables: `aggregator_media`, `aggregator_thoughts`, `aggregator_collections`
- Fast queries for feeds, search, and filtering.
- **Not authoritative** for membership: if the index no longer lists a file, reconcile removes the cache row.

### 3. Reconcile keeps the cache aligned

- **Frequency**: every 5 minutes (plus manual `POST /api/aggregator/metadata-index/reconcile`)
- **Scope**: only `pn_identifier`s that currently have public rows in the cache
- **Per user**:
  1. Read owner's public index via stored OAuth / portable APIs
  2. If folder/index missing or empty public set → `removeAllMetadataForUser`
  3. Else remove cache rows whose `fileId` is not in the index
- **Auth errors**: skip user (do not purge) until credentials work again

## Data Flow

### Upload / make public (API)

1. API updates PostgreSQL cache
2. API updates owner's public index (Drive Sheets or portable)
3. Index response cache invalidated

### Delete via app

1. `DELETE /api/drive/files/:fileId` removes Drive blobs, index entries, and cache rows
2. Immediate removal from public feed (no wait for reconcile)

### Manual folder delete in Drive / cloud

1. Owner's public index disappears or no longer lists files
2. Next reconcile run removes stale cache rows (within ~5 minutes)

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/aggregator/metadata-index` | Add/update cache + index |
| `PUT /api/aggregator/metadata-index/:fileId` | Update cache + index |
| `DELETE /api/drive/files/:fileId` | Delete storage + index + cache |
| `POST /api/aggregator/metadata-index/reconcile` | Manual reconcile |
| `POST /api/aggregator/metadata-index/sync` | Portable index upsert + reconcile |
| `DELETE /api/aggregator/metadata-index/user/:pnIdentifier` | Manual purge one user |

## Safety

- **Revoked OAuth**: reconcile skips that user rather than mass-deleting the feed.
- **No per-request Drive scans**: reconcile is background-only; feed reads use the cache.

## Future

- Optional per-file blob existence checks (Phase 2)
- `storage_verified_at` column for read-path gating at scale
