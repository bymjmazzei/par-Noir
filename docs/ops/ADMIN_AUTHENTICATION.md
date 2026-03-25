# Admin API authentication

Admin routes (`/api/admin/*`, `POST /oauth/clients` where applicable) must not be reachable with a shared secret from the public internet.

## Recommended production setup

1. **Network:** Restrict admin traffic at the edge (private VPC, Cloud Load Balancer + IAP, or mTLS). The sample `api/nginx.conf` uses `allow`/`deny` on `/api/admin/`; replace `10.0.0.0/8` with your CIDRs or terminate admin on an internal hostname only.

2. **Identity headers:** Set `ADMIN_IDENTITY_HEADERS_ENABLED=true` and `ADMIN_ALLOWED_PRINCIPALS` to the exact values your gateway forwards (e.g. `user:email@domain` from IAP, or `x-admin-principal` from your automation).

3. **Disable legacy key:** Once automation sends the correct principal, set `ADMIN_DISABLE_LEGACY_API_KEY=true` and stop relying on `ADMIN_API_KEY` in production.

## How automation should authenticate

- Prefer **identity headers** from your trusted ingress (IAP, internal LB, or mTLS with a fixed service identity).
- **Do not** embed `ADMIN_API_KEY` in client apps, static sites, or public repositories.
- For local development only, non-production may use `ALLOW_UNSAFE_DEV_ADMIN_BYPASS=true` with explicit `ADMIN_API_KEY` unset; never enable this in production.

## Verification

- `POST` to an admin route **without** a valid principal or key should return **401** or **503** (when admin is not configured).
- After enabling `ADMIN_DISABLE_LEGACY_API_KEY`, confirm legacy `X-Admin-Key` is rejected.
