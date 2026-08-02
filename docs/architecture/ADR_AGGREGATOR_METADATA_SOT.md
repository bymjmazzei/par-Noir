# ADR: Aggregator metadata source of truth vs performance cache

**Status:** Accepted  
**Date:** 2026-08-02

## Context

Aggregator public discovery needs both durable per-owner membership and fast cross-owner queries. During development, an in-memory `AggregatorMetadataService`, Google Sheets/portable owner indexes, and a PostgreSQL-backed `AggregatorMetadataServiceDB` existed in parallel. Leaving all three as “live” encouraged new features to invent a fourth track.

## Decision

1. **Source of truth (membership):** Each owner’s **public-file-index** (Drive Sheets via index adapters, or portable index storage) decides which files are public for that identity.
2. **Performance cache:** PostgreSQL tables served by `AggregatorMetadataServiceDB` are a **query cache** for feed/discovery APIs — not authoritative membership.
3. **Alignment:** `aggregatorReconcileService` and API write paths (submit/delete) keep the cache aligned with each owner’s public index.
4. **No in-memory index:** The dead in-memory `AggregatorMetadataService` class is removed. `aggregatorMetadataService.ts` retains **shared types only**.

## Consequences

- New aggregator features must update owner index + DB cache together (or go through existing facades); do not add a third store.
- Route handlers and clients should use `AggregatorMetadataServiceDB` (or facades documented in `docs/developer/SOCIAL_CLOUD_PARITY.md`), never a process-local Map.
- Sheets remain behind table/portable adapters where migration is incomplete; prefer facades over scattering `*SheetsService` imports in route surfaces.

## References

- [`api/src/server/modules/aggregatorMetadataServiceDB.ts`](../../api/src/server/modules/aggregatorMetadataServiceDB.ts)
- [`api/src/server/modules/aggregatorMetadataService.ts`](../../api/src/server/modules/aggregatorMetadataService.ts) (types only)
- [`docs/developer/SOCIAL_CLOUD_PARITY.md`](../developer/SOCIAL_CLOUD_PARITY.md)
