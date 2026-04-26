# Discovery ranking (public)

This document describes how **public discovery ordering** works in par Noir: one trust-aligned score computed on the API and consumed by the aggregator browser.

## Goals

- **Trust-aligned:** verified engagement counts more than unverified; bot-like signals are discounted.
- **Transparent inputs:** engagement (likes, comments, shares, saves) and upload recency; no paid placement or ad weighting.
- **Single source of truth:** the API attaches `publicRankScore` when returning index and search results (popularity sort). The browser sorts by that score and applies only a **capped** personalization bonus on top.

## Server: public rank

- **Engagement:** `EngagementService` aggregates per-file metrics (verified vs unverified, bot score filter). `computeRecommendationScore` produces the engagement component used inside ranking.
- **Public rank:** `computePublicRankFromMetrics` in `api/src/server/modules/discoveryRank.ts` blends log-scaled engagement with a recency term from `uploadDate` / `updated_at` (see code for weights).
- **Batching:** `getEngagementMetricsBatch` loads metrics for many file IDs in one query where discovery lists are built, so ordering stays consistent without N+1 round trips.

## API surfaces

- Central index entries and public metadata may include **`publicRankScore`** when lists are sorted by popularity / discovery.
- Index cache keys were versioned so clients do not keep stale payloads without scores indefinitely.

## Browser

- **`sortIndexedFilesForDiscovery`** (`apps/aggregator-browser/src/utils/discoverySort.ts`): primary sort by `metadata.publicRankScore`, then legacy `recommendationScore`, then local engagement fallback if the server did not send a score.
- **Personalization:** niche overlap and feed membership add a small bonus, capped (see `PERSONALIZATION_BONUS_CAP` in `discoverySort.ts`) so it cannot override the global public order by large margins.

## Not in scope (current)

- Materialized rank columns updated on every engagement write (possible future optimization).
- Paid or sponsored ranking.
