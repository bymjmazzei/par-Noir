# Diagnostic: Public-feed load latency (public-content model)

Date: 2026-08-09. Read-only. No product code changes. No deploy.

Findings labelled **OBSERVED** or **INFERRED** per `.cursor/rules/diagnostic-discipline.mdc` §6.

---

## Summary

| Question | Answer |
|----------|--------|
| Where does ~3s go? | **~1.5–2.0s** in Google Drive envelope download (via API blind proxy); **~0.25–0.5s** metadata-index; **~1ms** AES; client starts media fetch only after index. Cold thought first paint ≈ **2.8s** from navigation. |
| Is this “just architecture”? | **Mostly yes** — the Aug 8 model adds a mandatory cloud hop that did not exist when ciphertext was embedded in the index. |
| Can scroll feel instant without undoing custody? | **Yes, for next items** — adjacent preload + in-flight coalesce. **First** cold view of an uncached envelope stays bound by Drive+proxy unless that hop is sped up or CDN/cached. |
| Near-instant (~300ms) again? | **Not for cold first paint** while Drive `uc`/`usercontent` stays ~1.1–1.9s. **Warm** within `Cache-Control: max-age=60` can be **1–3ms** for envelope re-fetch (browser HTTP cache). |

Primary sample: public thought thumb `fileId` hash `b3d3858c97550405` (`thought-thumbnail`, ~59KB envelope, decrypt → PNG ~44KB). Live public index at probe time: **1 thought, 0 media, 0 collections**.

---

## Phase 0 — Symptom baseline

### OBSERVED — Browser cold reload (`https://browse.parnoir.com/?view=feed`)

Resource Timing after hard reload:

| Resource | startTime (ms) | duration (ms) | Notes |
|----------|----------------|---------------|--------|
| `metadata-index` media / thought / collection | ~606–607 | ~241–262 | Parallel |
| `public-content/{id}` | **874** | **1957** | Two entries, **identical** start + duration |
| `public-content/{id}` (duplicate) | **874** | **1957** | See H-CLI-2 |

Timeline to content:

```
t≈0        navigation
t≈0.6s     metadata-index starts
t≈0.87s    index done → public-content starts
t≈2.83s    public-content done (~874+1957)
           blob:<img> present (thought “test” visible)
```

**OBSERVED:** User-visible cold first paint for this thought is **~2.8s** from navigation — matches the reported ~3s. Dominated by `public-content`, not index.

**OBSERVED:** After load, page shows thought image (not spinner). Engagement locks still show padlocks when unlocked-pN is not present — unrelated to media latency.

### Warm vs cold

| Condition | OBSERVED |
|-----------|----------|
| Cold `public-content` (curl + Origin, or first browser fetch) | **~1.5–2.0s** |
| Browser re-`fetch` same URL within `max-age=60` | **1–3ms**, 200, full body (HTTP disk/memory cache) |
| In-session revisit of same item | Blob URL already in `thumbnails` Map — no wait for pixels |
| Scroll to next 2–3 posts | **Not live-measured** — only one public thought in index |

**Falsifier for “always ~3s”:** warm HTTP cache and in-session blob reuse paint far under 1s → **confirmed**: pain is **cold first fetch** (and missing adjacent preload for *other* ids), not AES/CPU.

### Sample matrix gaps

| Class | Live sample | Status |
|-------|-------------|--------|
| Thought thumb | Yes | Measured |
| Image / video / collection | None in public index | Code-path inventory only |

---

## Phase 1 — API / Drive hop decomposition

### Endpoint under test

`GET /api/aggregator/public-content/:fileId` → `getFileMetadata` → `fetchPublicBytes(publicContentRef)` → body + `Cache-Control: public, max-age=60`.

**OBSERVED:** Requests without `Origin` in production return **403** `Origin header required in production` in ~290ms (not the media path). All timings below use `Origin: https://browse.parnoir.com`.

### Timing table (curl from diagnostic host; Railway edge `mia1`)

| Probe | Run totals (s) | Bytes | Notes |
|-------|----------------|-------|--------|
| `public-content` + Origin | 1.98, 1.64, 1.69; warm 1.67, 1.50, 1.74 | 59414 | No server-side envelope memoization |
| Drive `uc?export=download` (−L) | 1.52, 1.64, 1.44 | 59414 | Valid `{encrypted,iv,salt}` JSON |
| `drive.usercontent.google.com/download` | 1.31, 1.14, 1.58 | 59414 | Final hop after 303 |
| `uc` without −L | 303 in ~0.10s | 0 | Redirect only |
| `metadata-index/:id` | 0.38–0.46 | — | Same `getFileMetadata` family of work + RTT |
| `metadata-index?contentClass=thought` | ~0.43 | 2542 | List path |

**Earlier same-day probe** (prior diagnostic): public-content **~2.8s** for same class of object — variance **OBSERVED**; still Drive-dominated.

### Derived budget (this sample)

| Hop | Estimate | Label |
|-----|----------|--------|
| Drive download (`uc` → usercontent) | **~1.1–1.6s** | OBSERVED direct; majority of proxy time |
| API residual (RTT + DB + serialize + proxy) | **~0.1–0.4s** | INFERRED as `public-content` − Drive |
| `getFileMetadata` alone | **≪ majority**; end-to-end metadata GET **~0.3–0.5s** incl. network | OBSERVED upper bound via `/metadata-index/:id`; exact SQL ms **unverified** (no server span logs) |
| Fallback `alt=media&key=` | **Not used** | OBSERVED: primary returned non-HTML envelope |
| AES-GCM decrypt (browser) | **~1ms** (+ ~7ms key import/b64) | OBSERVED via WebCrypto on cached envelope |
| Payload size | 59KB in ~1.5s | **Not bandwidth-bound** at normal rates |

`GOOGLE_DRIVE_API_KEY` presence in production API env: **unverified** from this pass (no secret inspection). For this file, fallback was unnecessary.

### Hypothesis scorecard — API

| ID | Claim | Result |
|----|--------|--------|
| H-API-1 | Drive `uc`/usercontent is majority of wall time | **Confirmed** |
| H-API-2 | Primary HTML/empty → API-key hop adds most latency | **Falsified** for this thought (primary usable) |
| H-API-3 | 3-table `getFileMetadata` is material (≥100ms) as main cause | **Falsified as majority**; may still cost tens–low hundreds ms — exact DB span unverified |
| H-API-4 | Payload size dominates vs fixed path overhead | **Confirmed** overhead/path (tiny envelope, large time) |
| H-API-5 | `max-age=60` rarely helps first paint | **Confirmed for cold first paint**; **falsified for warm re-fetch within 60s** (browser cache 1–3ms). Server still re-hits Drive on every uncached proxy request. |

---

## Phase 2 — Client amplification

### OBSERVED — Duplicate cold fetch

On cold feed load, Resource Timing listed **two** `public-content` entries for the same id with the **same** `startTime` and `duration`. No in-flight coalesce in [`publicContentClient.ts`](../packages/aggregator-domain/src/publicContentClient.ts).

**INFERRED cause:** concurrent callers (FullScreenFeed `thumb_*` effect, whose deps include `thumbnails` / `externalThumbnails`, can overlap before the Map is populated). React `StrictMode` is present in [`main.tsx`](../apps/aggregator-browser/src/main.tsx) but double-invoking effects is a **dev-only** React behavior — production duplicate is still explained by overlapping effects/call sites without a shared promise cache.

Duplicate does **not** double wall-clock when parallel (same start), but it **doubles Drive/API load** and can worsen TTFB under contention.

### Code paths (amplifiers)

| Mechanism | OBSERVED in code | Live impact this run |
|-----------|------------------|----------------------|
| Sequential `for await` decrypt in `useThumbnailsAndMedia` | Yes | Skips `thumb_*` / `thumbnailFileId` — **not** on this thought’s critical path |
| FullScreenFeed thought thumbs | `decrypt` → `createObjectURL` (no canvas) | Critical path for this sample |
| Canvas `createThumbnailFromBlob` | Used for non-`thumb_*` images in `useThumbnailsAndMedia` | Not on thought path; would add decode/raster after decrypt for other media |
| Vertical adjacent media preload (i+1, i+2) | **Absent** (DOM window `currentIndex-1…+5` only) | Scroll-next risk **INFERRED** high when N>1 |
| CollectionFeed / HorizontalThumbnailFeed | Explicit current ±1 (and priority next/prev) | Better pattern; no live collection sample |

### Hypothesis scorecard — client

| ID | Claim | Result |
|----|--------|--------|
| H-CLI-1 | Visible item waits behind sequential thumb queue | **Unverified** live (N=1); **code supports** for non-thumb image batches |
| H-CLI-2 | Duplicate decrypts for same `fileId` | **Confirmed** |
| H-CLI-3 | Canvas re-thumb of thought PNG is meaningful | **Falsified** for thoughts (~1ms AES; object URL). Residual for other image types **unverified** magnitude |
| H-CLI-4 | Index is not the 3s | **Confirmed** (~250–500ms) |
| H-CLI-5 | No adjacent preload → each new scroll pays cold cost | **Confirmed in code**; multi-item scroll **not live-measured** |

Stale comment in FullScreenFeed (~L726–727) still claims token contains `shareEncrypted` / no API fetch — **wrong** after Aug 8; code always calls blind proxy.

---

## Phase 3 — Impact inventory

| Surface | Wait mode | Preload today | On public-content path? | User impact |
|---------|-----------|---------------|-------------------------|-------------|
| FullScreenFeed (Home feed) | First paint per item | DOM ±5; **no** media priority queue for next 2–3 | Yes (`thumb_*` + collections) | **Primary** regression |
| `useThumbnailsAndMedia` | Eager serial images; parallel video IIFEs | All-page, not adjacent | Yes (non-`thumb_*` images/videos) | Amplifies multi-item feeds; skipped for thought thumbs |
| DiscoveryPage | Per-tile decrypt | None dedicated | Yes | Grid populate lag |
| HomePage grid hover video | On demand | No | Yes | Hover wait |
| CollectionFeed | Nested decrypts | current ±1 | Yes | Better scroll UX; still pays hop per cold id |
| HorizontalThumbnailFeed | Priority current/next/prev then rest | Yes | Yes | Reference client pattern |
| Comments / likes / feed list APIs | Separate | N/A | No | Not on media critical path (falsifier for “everything slow”) |
| Dashboard ensure/revoke public-content | Publish path | N/A | Write-side | Not feed read latency |

**409 / permanent errors:** not observed on the live thought (200 + decrypt OK). Rows missing `publicContentRef` or legacy embedded ciphertext would fail closed (409) and can feel like long “Loading…” then Unavailable — separate correctness issue.

---

## Phase 4 — Improvement ceiling (no implementation)

Assumptions: Drive hop remains ~1.2–1.6s unless changed; dwell time between scrolls often ≥2s; browser HTTP cache only helps **same URL within 60s**.

| Lever | Type | Removes / hides | Expected first cold paint (this thought) | Expected scroll to next cold ids |
|-------|------|-----------------|------------------------------------------|----------------------------------|
| Faster Drive path (prefer usercontent, connection reuse, region, CDN in front of envelopes) | **Fixable (infra)** | H-API-1 | If Drive → **200–400ms**, first paint ~**0.5–0.9s** | Still cold per new id |
| Server/CDN cache of public envelopes (custody-preserving) | **Fixable (infra)** | Repeat Drive | First miss unchanged; hits ≪100ms | Cross-session warm |
| Longer / immutable Cache-Control when objectId stable | **Fixable** | H-API-5 cold-only gap | Unchanged cold #1 | Warm revisits already ~1–3ms in browser within 60s; longer TTL extends that |
| Single-query `getFileMetadata` | **Fixable (minor)** | H-API-3 | −tens–low hundreds ms at best | Negligible alone |
| Adjacent preload `[i…i+2]` concurrency 2–3 | **Amplify-only → hides** | H-CLI-5 | Unchanged cold #1 | **~0 wait** if fetch finishes during dwell |
| In-flight coalesce + memory envelope/blob cache | **Fixable (client)** | H-CLI-2 | Cuts duplicate origin load; wall-clock same when already parallel | Warm revisit / remount instant |
| Parallel bounded pool vs serial page decrypt | **Amplify-only** | H-CLI-1 | Helps item #k in large pages | Less tail latency |
| Skip canvas for display-ready PNGs | **Minor** | H-CLI-3 (non-thought) | −decode/raster ms | Minor |
| Re-embed ciphertext in metadata index | **Structural rollback** | Entire hop | ~old ~300ms | Instant list decrypt | **Out of scope** unless product revisits custody |

### Structural floor

Even with perfect client behavior, the **first** viewer of an **uncached** envelope must pay:

**API RTT + Drive download + AES (~1ms).**

Near-instant (~300ms) cold first paint returns only if that external hop drops to hundreds of ms **or** bytes are pre-positioned (CDN/edge cache) before scroll. The old embedded-ciphertext model is the regression source relative to custody goals — not recommended as the fix path in this diagnostic.

### Priority by measured ms × frequency

1. **Drive/proxy TTFB** — largest cold first-paint lever (~1.5s+).
2. **Adjacent preload** — largest scroll UX lever when N>1 (hides remaining hop).
3. **In-flight coalesce + blob cache** — correctness under remount; saves duplicate Drive cost.
4. **DB lookup / canvas / Cache-Control tuning** — secondary.

---

## Phase 5 — What we did not measure

- Exact Postgres query ms inside `getFileMetadata` (no server instrumentation this pass).
- `GOOGLE_DRIVE_API_KEY` configured or not in prod.
- Live image / video / collection cold paints (empty public classes).
- Multi-item vertical scroll waits (only one public thought).
- Whether Drive fallback HTML path occurs for some other live refs.
- User device on cellular vs this diagnostic host / browser MCP network.

---

## Correction list (future build — not done here)

Ordered by user-visible impact:

1. Instrument `public-content`: DB_ms, primary_Drive_ms, fallback_used, fallback_ms (warn logs hashed ids).
2. Reduce Drive hop latency (path choice, caching/CDN for public envelopes).
3. Client: in-flight coalesce + memory cache keyed by `fileId` (+ ref objectId).
4. FullScreenFeed: priority decrypt for `[currentIndex, +1, +2]` (mirror HorizontalThumbnailFeed).
5. Stop overlapping duplicate fetches (effect deps / shared loader).
6. Fix stale FullScreenFeed comment about embedded `shareEncrypted`.
7. Re-measure with N≥3 public posts after (1)–(4).

---

## Out of scope (this run)

No code fixes, no deploy, no custody-model change, no Storage orphan work (separate diagnostic).
