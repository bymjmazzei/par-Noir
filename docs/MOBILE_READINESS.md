# Mobile readiness

Summary of mobile/PWA readiness and deployment requirements. For the full audit and remediation plan, see [MOBILE_READINESS_REPORT.md](MOBILE_READINESS_REPORT.md). For API rate limits and body size, see [api/RATE_LIMITS.md](api/RATE_LIMITS.md).

## Environment variables

Production builds **require** `VITE_API_ENDPOINT` at **build time** (Vite inlines it). If it is missing, the app throws on load. **You do not need to configure this by hand for standard Firebase deploys:** from the repo root, **`./deploy.sh` exports `VITE_API_ENDPOINT`** with default `https://api.parnoir.com`. Override: `VITE_API_ENDPOINT=https://your-api ./deploy.sh`. For ad-hoc `npm run build` inside an app, add `VITE_API_ENDPOINT=…` to that app’s `.env` or export it in your shell.

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

See root **`deploy.sh`** (sets `VITE_API_ENDPOINT` for all Vite apps) and per-app `.env.example` where present. For integration keys (SendGrid, etc.), still configure per app as needed.
