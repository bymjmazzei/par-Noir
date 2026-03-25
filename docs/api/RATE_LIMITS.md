# API rate limits and body size

This document lists HTTP rate limiters, request body size limits, and API-key rate limits for the par Noir API. Mobile and NAT/shared-IP clients should use authenticated requests where possible and respect `Retry-After` (or standard rate-limit headers) on 429 responses.

## HTTP rate limiters (per IP)

All windows are **15 minutes**. Limits depend on whether the request includes a valid Bearer token (format checked; token is not validated for the limit decision).

| Limiter | Scope | Unauthenticated | Authenticated |
|--------|--------|------------------|----------------|
| **General** | Default for most routes | 100 / 15 min | 500 / 15 min |
| **Aggregator** | Aggregator / read-heavy routes | 1000 / 15 min | 2000 / 15 min |
| **Metadata index read** | GET metadata-index, nsfw-index (discovery) | 5000 / 15 min | 10000 / 15 min |
| **Read-only** | Profile, feeds, engagement GETs | 1500 / 15 min | 3000 / 15 min |
| **Auth** | Login / auth endpoints | 20 / 15 min | — |
| **OAuth token** | OAuth token exchange | 50 / 15 min | — |

Responses use `standardHeaders: true` (e.g. `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`). On 429, clients should honor `Retry-After` when present.

## Request body size

- **Default:** 10 MB (JSON and URL-encoded).
- **POST /api/drive/files:** 200 MB (for video and large encrypted uploads).

Larger bodies receive 413 or body-parser errors.

## API key rate limits (per key)

When using API-key authentication (e.g. `X-API-Key` or equivalent), limits are enforced **per API key** in addition to any per-IP limits:

- **Default:** 60 requests per minute, 10 000 requests per day (configurable per key in the database).
- **Process vs cluster:** With a single API process, counts are held in memory. When **`REDIS_URL` is set** and Redis connects successfully at startup, the same limits are enforced using Redis so **multiple API instances** share one counter per key (fixed clock-minute and calendar-day buckets).
- On exceed: 429 with `Retry-After` (or standard rate-limit headers).

See API key management docs for per-key overrides.

## List pagination caps

- **Connections:** Max 500 per request; use `limit` and `offset` (or equivalent) to paginate.
- **Notifications:** Max 500 per request; use `limit` and `offset` query parameters.

## Mobile / NAT

Clients behind shared IPs (NAT, mobile carriers) may hit per-IP limits more easily. Prefer authenticated (Bearer) requests to benefit from higher limits, and implement backoff using `Retry-After` on 429.
