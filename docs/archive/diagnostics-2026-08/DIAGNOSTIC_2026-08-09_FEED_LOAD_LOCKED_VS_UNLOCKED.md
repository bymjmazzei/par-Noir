# Diagnostic: Feed load — locked hang vs unlocked ~7s

Date: 2026-08-09. Ask-only. No product code changes. No deploy.

Findings labelled **OBSERVED** or **INFERRED** per `.cursor/rules/diagnostic-discipline.mdc` §6.

Sample thought: `fileId` hash `b3d3858c97550405` (`thought-thumbnail`, `thumb_thought-…png`). Public index: 1 thought.

---

## Summary

| Symptom | What we saw | Root class |
|---------|-------------|------------|
| **Locked hang** | Hard refresh → metadata + chrome load; **“Loading image…” spinner with zero `<img>` for ≥30–53s**; padlock UI | **Client** — media never lands in `thumbnails` Map despite `public-content` completing |
| **Unlocked ~7s** | User-reported (empty cache). **Not fully reproduced here** (no unlock credentials in agent browser) | **Incomplete** — API cold MISS alone was **~1.65s**, not ~7s; remainder unverified |

**Locked hang and unlocked 7s are not the same problem.** Locked hang is not “waiting on Drive.” Optimizing Drive/Redis further will not clear the locked spinner.

---

## Phase 0 — UI definition

### Locked end-state (OBSERVED ×2 hard navigations)

- Tab: **pN** feed, lock icon visible, engagement locks present.
- Index-derived chrome: title/caption **“test”**, “1 VIEWS”, timestamp — **visible**.
- Media: blue spinner + **“Loading image…”**; **`document.images.length === 0`**.
- Did **not** flip to “Image unavailable” (so not `failedThumbnails`).
- Waited **~30s** and **~53s** on two runs — still spinner. Matches user “hangs.”

### Unlocked ~7s

- **User OBSERVED:** hard refresh + empty cache, unlocked, ~7s to content.
- **Agent:** could not unlock pN in MCP browser → unlocked Network table **not captured**. Marked below.

---

## Phase 1 — Network (locked runs)

### Locked run L2 (representative)

| Request | start (ms) | duration (ms) | Notes |
|---------|------------|---------------|--------|
| `GET /api/aggregator/metadata-index?contentClass=media` | 666 | 295 |  |
| `GET /api/aggregator/metadata-index?contentClass=thought` | 666 | 416 |  |
| `GET /api/aggregator/metadata-index?contentClass=collection` | 667 | 406 |  |
| `GET /api/aggregator/public-content/{fileId}` | 1089 | **3** | Resource Timing; transferSize often 0 (cross-origin sizing) |
| `POST /api/engagement/bulk-stats` | 3588 | 275 | **After** public-content; not on media critical path for hang |

Also seen on L1: `/api/feeds`, `/api/public-names/…`, `/api/profile/…` (~300ms each), then same early `public-content`.

**OBSERVED:**

- `public-content` **is issued while locked** → **H-L1 falsified**.
- Request **completes** (timing entry with finite duration; not pending forever) → **H-L2 falsified**.
- No 4xx/5xx observed for that id on live manual fetch (200 + envelope) → **H-L3 falsified** for this sample.
- Index returns the thought; UI shows metadata → **H-L4 falsified**.
- Envelope **decrypts in-page** to PNG in ~8ms while UI still spins → **H-L5 confirmed** (client never paints blob).

**public-content count:** at least one automatic fetch per navigation; additional fetches only from diagnostic `fetch()` probes.

**Unlock RPCs on locked path:** no `google-oauth/refresh` / `ml-kem` on these locked captures. `bulk-stats` runs without unlock.

---

## Phase 2 — API isolate

| Probe | Result | Label |
|-------|--------|--------|
| `public-content` MISS | **200 in 1.65s**, `X-PN-Envelope-Cache: MISS`, `Cache-Control: max-age=300` | OBSERVED |
| Same id HIT ×4 | **0.34–0.40s**, `X-PN-Envelope-Cache: HIT` | OBSERVED |
| `metadata-index` thought | **~0.31s** | OBSERVED |
| Index token | `publicToken` + `shareKey` present; no `shareEncrypted` | OBSERVED |

**Falsifier for “API alone explains locked hang”:** curl/browser fetch returns 200 quickly (or from HTTP cache in ~3–7ms) while locked UI still shows Loading image → **confirmed client-side hang**.

**H-U1 (single public-content ≈ 7s):** for this object, cold MISS **1.65s** — **falsified as sole explanation** of user ~7s (unless user’s miss was much slower that day). Unverified whether user saw stacked client retries + MISS + unlock work.

**H-U3 (Drive multi-URL waterfall):** API timing logs (`path`, `primary_ms`, `fallback_used`) **not read** this pass → **unverified**. MISS 1.65s is compatible with a single Drive RTT, not proof of stacking.

---

## Phase 3 — Code inventory (implicated by Network)

### Locked paint path

[`FullScreenFeed.tsx`](apps/aggregator-browser/src/components/FullScreenFeed.tsx) adjacent-preload effect (~680–790):

1. Adds `fileId` to `loadingFeedThumbnailsRef`.
2. `await import` + `await decryptPublicFeedMedia`.
3. If `cancelled` → **return without `setThumbnails`** (still `finally` clears loading set).
4. New effect run while id ∈ loading set → **early return** (skip).
5. UI: missing thumb + not failed → perpetual **“Loading image…”** (~2358–2376).

**INFERRED mechanism (high confidence):** effect cleanup/`cancelled` + in-flight skip race when `files` / `externalThumbnails` identities churn during discovery (media/thought/collection indices resolve on staggered updates → `filteredFilesByFeed` new arrays). Matches OBSERVED: network fetch happens, decrypt works out-of-band, Map never updated, spinner forever.

**Not proven with React instrumentation** this pass (no effect-run counters) — mechanism remains INFERRED; hang symptom OBSERVED.

[`useThumbnailsAndMedia`](apps/aggregator-browser/src/hooks/useThumbnailsAndMedia.ts) **skips** `thumb_*` — parent `thumbnails` Map does not rescue thought thumbs. FullScreenFeed must succeed alone.

[`publicContentClient.fetchPublicEnvelope`](packages/aggregator-domain/src/publicContentClient.ts) coalesce/cache — not the hang cause; in-page fetch+decrypt succeeded.

### Unlock extras (context only)

- `bulk-stats`: [`useEngagement.ts`](apps/aggregator-browser/src/hooks/useEngagement.ts)
- `ml-kem-public-key`: messaging/session paths — seen in user’s unlocked console, not on locked agent runs

---

## Phase 4 — Scorecard

### Locked hang

| ID | Claim | Result |
|----|--------|--------|
| H-L1 | No `public-content` while locked | **Falsified** |
| H-L2 | `public-content` pending forever | **Falsified** |
| H-L3 | `public-content` 4xx/5xx, UI never recovers | **Falsified** (this sample) |
| H-L4 | Empty index / wrong feed | **Falsified** |
| H-L5 | Decrypt/UI after 200 (client) | **Confirmed** (OBSERVED UI + working decrypt) |

### Unlocked ~7s

| ID | Claim | Result |
|----|--------|--------|
| H-U1 | Single `public-content` ≈ 7s | **Falsified** for this id’s API MISS (~1.65s); user 7s unexplained in full |
| H-U2 | Multiple stacked public-content/Drive hops | **Unverified** (no unlocked Network) |
| H-U3 | Envelope-cache MISS + multi-URL Drive | **Unverified** (no server path logs) |
| H-U4 | Unlock RPCs block first paint | **Unverified** (no unlocked Network) |
| H-U5 | Effect cancel/restart delays first paint | **Plausible / unverified** for unlocked; **same bug family as locked hang** |

---

## Phase 4 — Optimization routing (recommendations only)

| Prior change | Keep / revert / leave | Basis |
|--------------|----------------------|--------|
| Client coalesce + envelope memory cache | **Keep** | Neutral/positive for warm; not hang cause |
| FullScreenFeed adjacent preload + `cancelled`/`loadingFeedThumbnailsRef` | **Fix next (do not leave)** | Locked hang root class; race INFERRED |
| `useThumbnailsAndMedia` concurrency pool | **Leave** for now | Not on `thumb_*` critical path |
| Redis envelope cache + max-age=300 | **Keep** | HIT ~0.35s OBSERVED; helps warm/API |
| Drive usercontent-then-uc waterfall | **Unverified** for 7s; **do not treat as confirmed root of locked hang** | Revisit only with unlocked Network + server `path` logs |

### Correct next target (ordered)

1. **Fix FullScreenFeed media load so a completed decrypt always commits to `thumbnails` (or retries), and in-flight skip cannot strand an id after cancel** — unlocks locked hang; may also remove multi-second “retries” contributing to unlocked slowness.
2. Re-measure unlocked empty-cache with Network (user or agent with session): table `public-content` duration, count, unlock RPC overlap, paint time.
3. Only then decide Drive URL order revert vs keep, using MISS `path` / `primary_ms` logs.

### What not to do next

- Do not spend another pass “speeding Drive” expecting locked hang to disappear — **falsified**.
- Do not average Redis HIT (~0.35s) with locked hang (~∞ UI) or user 7s.

---

## Gaps (explicit)

- Unlocked empty-cache Network waterfall (credentials).
- Server log lines for `path` / `fallback_used` on MISS.
- React effect re-run count during discovery (would elevate cancel race from INFERRED → OBSERVED).

---

## Out of scope (this run)

No code fixes, no reverts, no deploy, no ciphertext re-embed.
