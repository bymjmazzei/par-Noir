# Feed latency — after optimization (client + API)

Date: 2026-08-09. Follow-up to [`DIAGNOSTIC_2026-08-09_FEED_PUBLIC_CONTENT_LATENCY.md`](./DIAGNOSTIC_2026-08-09_FEED_PUBLIC_CONTENT_LATENCY.md).

## Changes shipped

### Client
- In-flight coalesce + TTL envelope cache in `packages/aggregator-domain` `fetchPublicEnvelope` (TTL 300s).
- `FullScreenFeed`: priority decrypt for `[i, i+1, i+2, i-1]`, concurrency 3; in-flight set; no re-entry on `thumbnails` Map updates; removed stale “embedded shareEncrypted” path comment.
- `useThumbnailsAndMedia`: bounded pool concurrency 3 instead of serial `for await`.

### API
- `fetchPublicBytesTimed`: prefer Drive `usercontent` URL, then `publicUrl` (uc), then API-key fallback; timing fields.
- Redis envelope cache keyed by `objectId`, TTL 60s; invalidate on revoke/purge.
- `Cache-Control: public, max-age=300`; `X-PN-Envelope-Cache: HIT|MISS`.
- Timing log: `db_ms`, `primary_ms`, `fallback_used`, `fallback_ms`, `cache_hit`, `path`, `bytes`, `total_ms` (hashed ids only).

## Pre-deploy OBSERVED baselines (API still old)

| Probe | Result |
|-------|--------|
| `public-content` cold ×3 | 1.81s, 1.72s, 1.72s; `Cache-Control: max-age=60` |
| Drive usercontent direct ×3 | 1.44s, 1.12s, 1.20s |

## Post-deploy OBSERVED (2026-08-09, after Railway rolled `max-age=300`)

| Probe | Result | Label |
|-------|--------|--------|
| API build marker | `Cache-Control: public, max-age=300` + `X-PN-Envelope-Cache` | OBSERVED |
| First request after roll (MISS) | attempt 8: MISS header present | OBSERVED |
| 2nd / 3rd same `fileId` | **HIT**, totals **0.53s** / **0.32s** | OBSERVED — was ~1.7s cold pre-change |
| Falsifier for Redis warm | still ~1.5s+ with no HIT | **Falsified** |

Browser hosting deployed via `./deploy.sh` (client coalesce + adjacent preload). Multi-item scroll still limited by public index N=1; duplicate coalesce is package-level (verified by code + prior Resource Timing failure mode).

## Structural floor (unchanged)

Cold global miss still pays Drive download (~1.1–1.6s observed on usercontent). Preload + Redis hide that for scroll and repeat viewers.
