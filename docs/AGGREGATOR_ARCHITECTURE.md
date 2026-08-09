# Aggregator Architecture: Hybrid Cache + Public Content Refs

## Overview

The aggregator uses a **hybrid cache**: each owner's **public-file-index** (Drive Sheets or portable storage) is membership truth for *what is public*; PostgreSQL is a **performance cache** of **catalog metadata + shareKey + `publicContentRef`**. Ciphertext bytes live on the **owner's cloud**, not in the API.

Under **device cloud custody**, the server holds no long-lived Google OAuth secrets. Background credential crawl reconcile is skipped. Dead links are cleared by:

1. **Blind proxy 404/410** on `GET /api/aggregator/public-content/:fileId` → attested `removeMetadata`
2. **Owner-device reconcile** after Drive layout init (caller's `X-PN-Cloud-Access-Token` only)

```
┌─────────────────────────┐
│  Owner storage          │ ← Ciphertext + public-file-index
│  (anyone-readable ref)  │
└───────────┬─────────────┘
            │ ensure/revoke with owner token
            │ fetchPublicBytes OAuth-less
            ▼
┌─────────────────────────┐
│   PostgreSQL            │ ← metadata + shareKey + publicContentRef
│   aggregator_*          │    (never shareEncrypted file bytes)
└───────────┬─────────────┘
            │ GET metadata-index / public-content
            ▼
┌─────────────────────────┐
│  aggregator-browser     │ ← decrypt client-side with shareKey
└─────────────────────────┘
```

## Core principles

### 1. Owner public index is membership truth (listing)

Public file IDs live in each user's `public-file-index`. Drive path: `par Noir - pn-{hash}/_metadata/public-file-index.xlsx`.

### 2. Database is a metadata + key + ref cache

- Tables: `aggregator_media`, `aggregator_thoughts`, `aggregator_collections`
- Stores slim `publicToken` (shareKey/iv metadata only) and `publicContentRef` `{ backend, objectId, publicUrl }`
- **Rejects** publish bodies that embed `shareEncrypted` ciphertext
- **Not** a content CDN

### 3. Public media delivery

1. Make public: client builds share envelope, uploads it to owner cloud, `POST .../ensure-public` (owner token via `resolveOwnerDriveToken`), submits slim token + ref to API
2. Reader: `GET /api/aggregator/public-content/:fileId` streams envelope **without** peer OAuth; browser decrypts with `shareKey`
3. Drive OAuth-less fetch: `publicUrl` first; optional platform `GOOGLE_DRIVE_API_KEY` for `alt=media` (not owner OAuth). Phase 0 observed: Drive API without key → 403

### 4. No cross-user cloud access

Routes act only on the authenticated pn's cloud. Cross-user `ownerPnIdentifier` Drive media returns **409 `use_public_content`**. Peer private delivery uses the mailbox rail (unrelated to public feed).

### 5. Dead-link clearing

| Path | Behavior |
|------|----------|
| App delete/unpublish | Revoke anyone + remove aggregator row |
| Cloud UI delete | Next proxy fetch 404 → purge; or owner unlock reconcile |
| Server crawl | Skipped when `DEVICE_CLOUD_CUSTODY` on |

## API endpoints (public content)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/aggregator/public-content/:objectId/ensure-public` | Owner: set anyone-readable; return `publicContentRef` |
| `POST /api/aggregator/public-content/:objectId/revoke-public` | Owner: revoke anyone |
| `GET /api/aggregator/public-content/:fileId` | Blind ciphertext proxy; 404 purge |
| `POST /api/aggregator/metadata-index` | Catalog upsert (no embedded ciphertext) |
| `DELETE /api/aggregator/metadata-index/:fileId` | Owner delete |
| `DELETE /api/aggregator/metadata-index/user/:pnIdentifier` | Owner purge own rows (auth required) |

## Safety

- One Drive token resolver: `resolveOwnerDriveToken` ([diagnostic-discipline](../.cursor/rules/diagnostic-discipline.mdc))
- No silent peer credential builds (`check-token-resolver-boundary.sh`)
- Revoked OAuth / missing cloud token: owner routes return `cloud_token_required` (409), do not invent tokens
