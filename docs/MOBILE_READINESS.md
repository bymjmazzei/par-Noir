# Mobile readiness

Summary of mobile/PWA readiness and deployment requirements. For the full audit and remediation plan, see [MOBILE_READINESS_REPORT.md](MOBILE_READINESS_REPORT.md). For API rate limits and body size, see [api/RATE_LIMITS.md](api/RATE_LIMITS.md).

## Where to put environment variables (simple)

| What you are doing | Where variables live | What you need |
|--------------------|----------------------|---------------|
| **Deploy web apps to Firebase** using repo root `./deploy.sh` | **Nowhere in a file** for the API URL by default. The script sets `VITE_API_ENDPOINT=https://api.parnoir.com` in the shell before each Vite build. | Optional: override in the terminal: `VITE_API_ENDPOINT=https://other-api.example.com ./deploy.sh` |
| **Run an app locally** (`npm run dev` in `apps/id-dashboard`, `apps/aggregator-browser`, etc.) | That app’s **`.env`** file in the app folder (e.g. `apps/aggregator-browser/.env`). Copy from `.env.example` if the app has one. Git does **not** commit `.env`. | At minimum for talking to a local API: `VITE_API_ENDPOINT=http://127.0.0.1:3001` |
| **Run a production build by hand** (`npm run build` in an app, not via `./deploy.sh`) | Same: that app’s **`.env`** or your shell: `export VITE_API_ENDPOINT=...` before build | **`VITE_API_ENDPOINT`** (required or the built site crashes on load) |
| **Run / host the Node API** (Railway, Fly, your VM, etc.) | Your host’s **environment** UI or **`api/.env`** on the server (never commit `.env`). See [api/.env.example](../api/.env.example) and [api/README.md](../api/README.md). | **`DATABASE_URL`**, **`PN_OAUTH_SECRET`**, plus whatever that README lists for your features |

**Firebase Hosting** does not read `.env` for you—the values must already be **baked into `dist/`** at build time. That’s why `./deploy.sh` sets `VITE_API_ENDPOINT` before building.

---

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
