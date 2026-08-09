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

## Post-deploy acceptance checks

Run after Railway API + Firebase hosting are live:

1. **Duplicate fetch:** hard-refresh feed; Resource Timing should show **one** `public-content` per `fileId` while first in flight (client coalesce). Falsifier: two network starts for same id before either completes.
2. **Adjacent preload:** with ≥3 public items, after item 0 paints, scroll to 1–2 without multi-second spinner if dwell ≥ fetch.
3. **Redis warm:** second `GET public-content` within 60s should show `X-PN-Envelope-Cache: HIT` and total **≪500ms**. Falsifier: still ~1.5s+ with HIT header absent.
4. **Cache-Control:** response header `max-age=300`.

## Live public index note

At probe time only **1** public thought existed — multi-item scroll remains code-verified; re-check when N≥3.

## Structural floor (unchanged)

Cold global miss still pays Drive download (~1.1–1.6s observed on usercontent). Preload + Redis hide that for scroll and repeat viewers.
