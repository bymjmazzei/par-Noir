# Mobile readiness

Summary of mobile/PWA readiness and deployment requirements. For the full audit and remediation plan, see [MOBILE_READINESS_REPORT.md](MOBILE_READINESS_REPORT.md). For API rate limits and body size, see [api/RATE_LIMITS.md](api/RATE_LIMITS.md).

## Environment variables

Production builds **require** `VITE_API_ENDPOINT` to be set; apps will throw at load if it is missing in production. Do not rely on hardcoded fallbacks.

### id-dashboard

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_ENDPOINT` | **Yes** (production) | API base URL (e.g. `https://api.parnoir.com`) |
| `VITE_PN_CLIENT_ID` | Optional | OAuth / pN client identifier |
| `VITE_*` integration keys | Optional | See `apps/id-dashboard/src/config/integrationsEnv.ts`; e.g. SendGrid, Twilio, Pinata, Veriff, Coinbase. Use `.env.example` in the app if present. |

Reference: `apps/id-dashboard` build; `deploy.sh` may set `VITE_PN_CLIENT_ID` for deploy.

### aggregator-browser

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_ENDPOINT` | **Yes** (production) | API base URL |
| `VITE_PN_CLIENT_ID` | Optional | Set by `deploy.sh` for production |

### prism

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_ENDPOINT` | **Yes** (production) | API base URL |

### API (server)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `PORT` | Optional | Default 3001 |
| `ALLOWED_ORIGINS` | Optional | Comma-separated; merged with default origins (includes Capacitor/origin) |
| `DATABASE_POOL_MAX` | Optional | Pool size; default 20 |
| `NODE_ENV` | Optional | `development` / `production` |

### licensing-portal

If present in the repo: require `VITE_API_ENDPOINT` in production and list any app-specific vars here.

---

See root or per-app `deploy.sh` and `.env.example` (where available) for deploy-time values. Production checklist: set `VITE_API_ENDPOINT` (and any required integration vars) before building each front-end app.
