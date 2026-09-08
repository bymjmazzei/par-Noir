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
- Also stores **feed preview refs** (`feedPoster` / `feedPreviewSd` / `feedPreviewHd`): R2 keys + owner-cloud canonical plaintext preview ids (for pull-through)
- **Rejects** publish bodies that embed `shareEncrypted` ciphertext
- PG is **not** the byte CDN; warm preview bytes live in platform R2

### 3. Public media delivery

**Swipe / grid playback (CDN previews):**

1. Publish: on-device adaptive encode (poster + SD [+ HD]) under tier duration/byte caps → dual-write **R2** (warm) + **owner-cloud canonical** plaintext → index refs
2. Reader: `GET /api/aggregator/public-media/:fileId?variant=poster|sd|hd` → free daily caps / HD verification gate → **302** to signed R2 URL (Range-friendly)
3. Cold miss (SD/HD idle &gt; 30d): API pull-through from owner canonical → rehydrate R2 → redirect. **Poster + metadata** stay hot while public
4. Slider publish tiers (`$9` floor / `$20` average creator / …): max **post length** + monthly **upload GB**; soft degrade when GB exhausted

**Legacy envelope path (custody / non-feed):**

1. Make public: client builds share envelope, uploads it to owner cloud, `POST .../ensure-public`, submits slim token + ref
2. `GET /api/aggregator/public-content/:fileId` streams envelope without peer OAuth; not used for public swipe when feed preview refs exist

Ops: [docs/ops/FEED_PREVIEW_R2_SETUP.md](ops/FEED_PREVIEW_R2_SETUP.md)

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
| `POST /api/aggregator/feed-media/presign-upload` | Owner: R2 PUT presign for poster/sd/hd |
| `POST /api/aggregator/feed-media/confirm-upload` | Owner: meter GB + patch index refs |
| `GET /api/aggregator/public-media/:fileId?variant=` | Signed R2 redirect; pull-through; free/HD gates |
| `POST /api/aggregator/feed-media/:fileId/revoke` | Owner: delete R2 previews |
| `POST /api/aggregator/feed-media/evict-idle` | Cron: cold-evict idle SD/HD |
| `GET /api/users/:pn/verification-status` | Verified + publish plan ceilings |
| `POST /api/aggregator/metadata-index` | Catalog upsert (no embedded ciphertext) |
| `DELETE /api/aggregator/metadata-index/:fileId` | Owner delete |
| `DELETE /api/aggregator/metadata-index/user/:pnIdentifier` | Owner purge own rows (auth required) |

## Safety

- One Drive token resolver: `resolveOwnerDriveToken` ([diagnostic-discipline](../.cursor/rules/diagnostic-discipline.mdc))
- No silent peer credential builds (`check-token-resolver-boundary.sh`)
- Revoked OAuth / missing cloud token: owner routes return `cloud_token_required` (409), do not invent tokens
