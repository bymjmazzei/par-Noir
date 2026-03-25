# Mobile Development Readiness Report

**Date:** 2025-03-16  
**Scope:** id-dashboard, aggregator-browser, messaging (browser + API), prism, licensing-portal, API  
**Purpose:** Identify all issues and provide a remediation plan for mobile production readiness.

---

## 1. Executive summary

**Verdict:** **Ready with conditions.** The ecosystem is structurally ready for mobile (Capacitor shells, PWA manifest, viewport, API-only browser), but several security and consistency issues must be addressed before production mobile rollout. No critical data-exposure issues should ship as-is.

**Issue counts by severity**

| Severity | Security | Scaling | Mobile/PWA | Consistency |
|----------|----------|---------|------------|-------------|
| Critical | 1       | 0       | 0          | 0           |
| High     | 4       | 1       | 2          | 1           |
| Medium   | 2       | 2       | 2          | 1           |
| Low      | 0       | 1       | 1          | 1           |

**Summary**

- **Security:** One critical finding (API returns decrypted pn name/passcode). Auth middleware logs sensitive identifiers in dev; WebSockets have no token verification; XSS risk on feed content; REACT_APP_* and API fallback violate project rules. **Update:** API key requests are rate-limited in `ApiKeyService.checkRateLimit()` (in-memory per key, minute/day windows).
- **Scaling:** Unbounded list queries (limit 999999) in connections and notifications; DB pool is bounded and documented.
- **Mobile/PWA:** id-dashboard has PWA manifest and Capacitor but service worker disabled; CORS does not list Capacitor/origin for native WebView; aggregator-browser has no PWA manifest; prism/licensing use VITE fallback.
- **Consistency:** REACT_APP_* vs VITE_* and scattered API defaults; SHARED_CODE_RULES references `packages/` but repo uses `core/` and `sdk/`.

---

## 2. Findings

### 2.1 Security

#### S1 — API returns decrypted pn name and passcode in feed tokens (Critical)

- **Issue:** `GET /api/feeds/tokens` decrypts stored feed credentials and returns `pnName` and `passcode` in the JSON response. Per guiding principles, pn name and passcode must never appear in plain text; sending them over the wire (even over HTTPS) exposes them to client-side storage, logs, and proxies.
- **Location:** `api/src/server/modules/feedRoutes.ts` (lines 1004–1012), response `feedTokens[].pnName`, `feedTokens[].passcode`.
- **Severity:** Critical
- **Evidence:**  
  `const feedTokens = result.rows.map(row => ({ ... pnName: Buffer.from(row.encrypted_pn_name, 'base64').toString('utf8'), passcode: Buffer.from(row.encrypted_passcode, 'base64').toString('utf8'), ... }));`  
  then `return res.json({ feedTokens });`

#### S2 — Auth middleware logs DID and pnIdentifier (High)

- **Issue:** In development, successful auth logs `Authenticated user: ${tokenPayload.did} (${tokenPayload.pnIdentifier})`. Per “no sensitive data in plain text,” identifiers should not be logged; if logs are ever collected or misconfigured in production, this leaks identity data.
- **Location:** `api/src/server/middleware/authMiddleware.ts` (lines 84–86 and 113–115).
- **Severity:** High
- **Evidence:**  
  `console.log(\`[Auth] Authenticated user: ${tokenPayload.did} (${tokenPayload.pnIdentifier || 'no pnIdentifier'})\`);`

#### S3 — WebSocket connections not tied to Bearer token (High)

- **Issue:** Socket.IO accepts connections without validating a Bearer token. Handlers (`auth:challenge`, `did:resolve`) do not verify identity. Any client can connect and use real-time features; if sockets are used for sensitive or user-scoped data, this is an authorization gap.
- **Location:** `api/src/server.ts` — `setupWebSockets()` (approx. lines 9857–9877).
- **Severity:** High
- **Evidence:** `this.io.on('connection', (socket) => { ... });` with no `socket.handshake.auth` or token check.

#### S4 — API key rate limiting (High) — **addressed in code**

- **Issue (historical):** API-key–authenticated clients needed per-key rate limits to reduce abuse and cost/load risk.
- **Current behavior:** `ApiKeyService.checkRateLimit()` enforces per–API-key minute and day counts in an in-memory store, using limits from the key record or defaults (`DEFAULT_REQUESTS_PER_MINUTE` / `DEFAULT_REQUESTS_PER_DAY`). Returns `allowed`, `remaining`, and `resetAt`.
- **Location:** `api/src/server/modules/apiKeyService.ts` (`checkRateLimit`, `rateLimitState` map).
- **Severity:** High (if missing); mitigated while the in-memory implementation is deployed (multi-instance deployments may need a shared store).

#### S5 — Feed content rendered with dangerouslySetInnerHTML without sanitization (High)

- **Issue:** id-dashboard FeedPage renders `post.content` with `dangerouslySetInnerHTML`. If content is user-controlled or from an untrusted source, this is an XSS vector.
- **Location:** `apps/id-dashboard/src/pages/FeedPage.tsx` (line 83).
- **Severity:** High
- **Evidence:** `dangerouslySetInnerHTML={{ __html: post.content }}`

#### S6 — VITE_API_ENDPOINT fallback to production URL (Medium)

- **Issue:** id-dashboard and aggregator-browser (and prism) use `import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com'`. Project rules require failing when required env is unset; a hardcoded default can mask misconfiguration and send dev/local traffic to production.
- **Location:** `apps/id-dashboard/src/config/api.ts`, `apps/aggregator-browser/src/config/api.ts`, `apps/prism/src/config/api.ts`.
- **Severity:** Medium
- **Evidence:** `export const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com';`

#### S7 — REACT_APP_* used across id-dashboard (Medium)

- **Issue:** id-dashboard still reads many integration and verification settings from `process.env.REACT_APP_*`. Rules specify VITE_* only and a single config pattern; mixing REACT_APP_* with Vite is inconsistent and can break in build/deploy.
- **Location:** Multiple files, e.g. `IntegrationSettingsManager.tsx`, `IntegrationSettingsManager.refactored.tsx`, `veriffWebhookHandler.ts`, `smsService.ts`, `productionServices.ts`, `verificationConfig.ts`, `decentralizedAuth.ts`, `integrationTests.ts`, `ipfsMetadataService.ts`, `coinbaseProxy.ts`, `emailService.ts`, `IntegrationDebugger.tsx`, `orbitDBService.ts`, `config/coinbase.ts`, `TransferReceiver.refactored.tsx`.
- **Severity:** Medium
- **Evidence:** Grep for `process.env.REACT_APP_` across `apps/id-dashboard/src` returns 50+ references.

#### S8 — CORS origins may block Capacitor/native WebView (Medium)

- **Issue:** API `DEFAULT_ORIGINS` includes web origins and localhost but no Capacitor/origin used when the app runs in a native WebView (e.g. `capacitor://localhost` or `ionic://localhost` or null origin). Mobile app API calls may be blocked by CORS.
- **Location:** `api/src/server.ts` (DEFAULT_ORIGINS, approx. lines 29–43); CORS middleware that blocks no-origin in production.
- **Severity:** Medium
- **Evidence:** Capacitor config exists (`apps/id-dashboard/android/.../capacitor.config.json`, appId `com.parnoir.mobile`); DEFAULT_ORIGINS has no capacitor/ionic scheme or documented mobile origin.

---

### 2.2 Scaling

#### SC1 — Unbounded list queries (limit 999999) (High)

- **Issue:** Connections and notifications use `limit: 999999` (and similar), which can cause large responses, high memory use, and slow responses on mobile.
- **Location:** `api/src/server/modules/connectionsSheetsService.ts` (e.g. lines 243, 544); `api/src/server/modules/notificationService.ts` (line 86).
- **Severity:** High
- **Evidence:** `this.getConnections(..., { limit: 999999, offset: 0 })`, `limit: 999999`.

#### SC2 — API key rate limit (Medium — same as S4) — **addressed in code**

- **Issue (historical):** API key clients were not throttled.
- **Current behavior:** Same as S4: in-memory per-key limits in `checkRateLimit()`.
- **Location:** `api/src/server/modules/apiKeyService.ts`.
- **Severity:** Medium

#### SC3 — Rate limits and body size not documented for mobile (Medium)

- **Issue:** Express rate limiters (general, aggregator, read-only, auth, OAuth) and body size (10mb default, 200mb for drive uploads) are not documented. Mobile clients (and NAT/shared IPs) need clear limits and behavior to avoid unexpected 429s or failures.
- **Location:** `api/src/server.ts` (limiters and body parser); no single doc listing limits and response headers.
- **Severity:** Medium
- **Evidence:** Multiple `rateLimit({ windowMs: ..., max: ... })` blocks; no `docs/api` section for “Rate limits and payload size.”

#### SC4 — DB pool size (Low)

- **Issue:** Pool max is 20. Under high concurrency or many long-running jobs, the pool could be exhausted. Worth documenting and tuning if traffic grows.
- **Location:** `api/src/server/utils/database.ts` (max: 20 in PoolConfig).
- **Severity:** Low
- **Evidence:** Documented in code; no issue unless load testing shows exhaustion.

---

### 2.3 Mobile / PWA

#### M1 — Capacitor / native WebView CORS (High)

- **Issue:** Same as S8: mobile app may call API from a context that sends an origin not in ALLOWED_ORIGINS (e.g. capacitor:// or null), leading to CORS errors and broken mobile flows.
- **Location:** `api/src/server.ts` (CORS/origins); `apps/id-dashboard` Capacitor config.
- **Severity:** High
- **Evidence:** DEFAULT_ORIGINS has no mobile-specific entry; production blocks no-origin.

#### M2 — Service worker disabled for id-dashboard PWA (High)

- **Issue:** PWA registration is gated with `if (false && 'serviceWorker' in navigator)`, so the service worker is never registered. Offline and cache behavior are disabled; installability may still work via manifest but without SW benefits.
- **Addressed:** id-dashboard PWA is documented as **install-only**: the service worker is intentionally disabled; offline/cache behavior is deferred. Install prompt and manifest remain; to enable the service worker later, remove the `false &&` guard in `usePWA.ts` and `index.html` and ensure `sw.js` has a safe cache strategy.
- **Location:** `apps/id-dashboard/src/hooks/usePWA.ts` (line 204); `apps/id-dashboard/index.html` (similar guard).
- **Severity:** High (for PWA/offline goals); Medium if PWA is “install only” and offline is deferred.
- **Evidence:** `if (false && 'serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js') ... }`

#### M3 — aggregator-browser has no PWA manifest (Medium)

- **Issue:** aggregator-browser has viewport and CSP but no `manifest.json` or `<link rel="manifest">`. Users cannot install the browser app as a PWA from supported browsers.
- **Location:** `apps/aggregator-browser/index.html`; no `public/manifest.json` in aggregator-browser.
- **Severity:** Medium
- **Evidence:** Glob for manifest in `apps/aggregator-browser` returns no manifest file.

#### M4 — Prism and licensing-portal API config fallback (Medium)

- **Issue:** Prism and licensing-portal use the same pattern as id-dashboard/browser: `VITE_API_ENDPOINT || 'https://api.parnoir.com'`. Same policy concern: fail when unset in production.
- **Location:** `apps/prism/src/config/api.ts`; likely similar in licensing-portal.
- **Severity:** Medium

#### M5 — Responsive and touch audit not recorded (Low)

- **Issue:** Key flows (unlock, feeds, messaging, notifications, settings) have not been formally audited for viewport, touch targets, and accessibility on small screens. aggregator-browser has viewport meta; id-dashboard has manifest with orientation.
- **Location:** General; no doc or checklist of “mobile UX audit” results.
- **Severity:** Low
- **Evidence:** Viewport present in aggregator-browser and id-dashboard index; no MOBILE_UX_AUDIT or similar.

---

### 2.4 Consistency and maintainability

#### C1 — REACT_APP_* vs VITE_* and single config (High)

- **Issue:** Same as S7: id-dashboard relies on REACT_APP_* in many places; project rules require VITE_* and one config module. This increases risk of misconfiguration and inconsistent behavior across builds.
- **Location:** id-dashboard as listed under S7; `.cursor/rules` and SHARED_CODE_RULES.
- **Severity:** High

#### C2 — SHARED_CODE_RULES references packages/ but repo uses core/ and sdk/ (Medium)

- **Issue:** SHARED_CODE_RULES and .cursor rules say shared types/clients live in `packages/`; the repo has no `packages/` directory and uses `core/` and `sdk/` instead. This can confuse contributors and tooling.
- **Location:** `SHARED_CODE_RULES.md`; `.cursor/rules/shared-code-and-architecture.mdc`.
- **Severity:** Medium
- **Evidence:** Rules say “Types ... `packages/par-noir-types`”; repo has `core/identity-core`, `sdk/identity-sdk`, no `packages/`.

#### C3 — Prism and licensing-portal in deploy, env not centralized (Low)

- **Issue:** deploy.sh builds and deploys prism and licensing-portal; VITE_PN_CLIENT_ID is set in script. Required env vars for each app are not listed in a single .env.example or MOBILE_READINESS doc.
- **Location:** `deploy.sh`; per-app .env or env.template.
- **Severity:** Low
- **Evidence:** deploy.sh sets VITE_PN_CLIENT_ID for browser and prism; no root or docs/env checklist.

---

### 2.5 Compliant items (no change required for this report)

- **Auth:** Bearer token validation (authMiddleware + pnOAuthService) is implemented and used on protected routes; token format is validated for rate-limit tiers.
- **Error messages:** API uses `safeClientErrorMessage(error, NODE_ENV === 'production')` widely; production clients get generic messages.
- **Rate limiting (HTTP):** Express rate limiters are applied (general, aggregator, read-only, auth, OAuth) with different windows and max; body size capped (10mb / 200mb for drive).
- **CORS:** Origin allowlist is used; no-origin is blocked in production.
- **DB:** Connection pool is created with explicit max (20) and timeouts; DATABASE_URL required.
- **Pagination:** feedRoutes and prism use limit/offset with caps (e.g. prism max 50); some routes need tightening (see SC1).
- **id-dashboard:** Has root manifest.json, PWA install flow, Capacitor Android/iOS config, viewport.
- **aggregator-browser:** Has viewport, CSP, API-only storage (no direct Google), connect-src includes API and IPFS.
- **Deploy:** deploy.sh builds all four apps and runs firebase deploy --only hosting.
- **Secrets:** check-secrets.sh blocks known key patterns in commits; no hardcoded keys in config/api.ts (only fallback URL).

---

## 3. Remediation plan

Actions are ordered by priority; dependencies are noted.

| # | Action | Phase | Linked finding(s) |
|---|--------|--------|--------------------|
| 1 | **Stop returning decrypted pn name/passcode in GET /api/feeds/tokens.** Redesign so the client never receives plaintext credentials (e.g. return only opaque tokens or server-side-only operations that use decrypted values). | Security | S1 |
| 2 | **Remove or redact auth logging of DID and pnIdentifier.** Do not log identity identifiers in any environment; at most log a non-reversible hash or “authenticated” for debugging. | Security | S2 |
| 3 | **Define WebSocket auth policy.** If sockets are used for user-scoped or sensitive data, require Bearer token on connection (e.g. socket.handshake.auth.token) and validate via pnOAuthService; otherwise document that sockets are public/unauthenticated. | Security | S3 |
| 4 | **API key rate limiting.** Implemented in `ApiKeyService.checkRateLimit()` (in-memory per key). Optional follow-up: shared store (e.g. Redis) for multi-instance APIs. | Security / Scaling | S4, SC2 |
| 5 | **Sanitize feed post content before render.** In id-dashboard FeedPage, run post.content through a sanitizer (e.g. DOMPurify) before passing to dangerouslySetInnerHTML, or render as plain text. Prefer server-side sanitization at ingestion as well. | Security | S5 |
| 6 | **Require VITE_API_ENDPOINT in production.** In id-dashboard, aggregator-browser, and prism config/api.ts, in production build throw or fail fast if import.meta.env.VITE_API_ENDPOINT is missing; remove hardcoded 'https://api.parnoir.com' fallback. | Security / Consistency | S6, M4 |
| 7 | **Migrate id-dashboard from REACT_APP_* to VITE_*.** Replace all process.env.REACT_APP_* with import.meta.env.VITE_* (or a single config module that reads VITE_*). Update IntegrationConfigManager and any build/deploy docs. Provide .env.example with VITE_* only. | Security / Consistency | S7, C1 |
| 8 | **Allow Capacitor / native WebView origin in API CORS.** Add the origin(s) used by the Capacitor app (e.g. capacitor://localhost or the production app URL) to ALLOWED_ORIGINS, or document and add the exact origin the mobile app sends. Test API calls from built Capacitor app. | Security / Mobile | S8, M1 |
| 9 | **Cap list sizes for connections and notifications.** Replace limit 999999 with a safe cap (e.g. 500 or 1000) and document max page size; add pagination (limit/offset or cursor) and use it in clients. | Scaling | SC1 |
| 10 | **Document API rate limits and body size.** Add a short section (e.g. in docs/api/API_REFERENCE.md or new RATE_LIMITS.md) listing window/max for each limiter and 10mb/200mb body rules; mention mobile/NAT. | Scaling | SC3 |
| 11 | **Decide and implement PWA service worker for id-dashboard.** Either enable service worker registration (remove `false &&`, test offline/cache) or document that PWA is “install only” and defer SW. | Mobile/PWA | M2 |
| 12 | **Add PWA manifest for aggregator-browser.** Add manifest.json and link in index.html (name, start_url, display, icons, viewport); optional short_name and theme_color. | Mobile/PWA | M3 |
| 13 | **Align docs with repo layout.** Update SHARED_CODE_RULES and .cursor rules to state that shared code lives in core/ and sdk/ (and when to add packages/); remove or qualify references to packages/par-noir-* if not used. | Consistency | C2 |
| 14 | **Centralize env checklist.** Add docs/MOBILE_READINESS.md or extend DEPLOYMENT_GUIDE with required env vars per app (VITE_API_ENDPOINT, VITE_PN_CLIENT_ID, etc.) and point to deploy.sh and .env.example. See [docs/MOBILE_READINESS.md](MOBILE_READINESS.md). | Consistency | C3 |
| 15 | **Optional: Mobile UX audit.** Run a one-time audit of unlock, feeds, messaging, notifications, settings on a small viewport; document touch targets and any fixes. | Mobile/PWA | M5 |

---

## 4. Appendix — Checklist

| Area | Item | Status | Note |
|------|------|--------|------|
| Security | Feed tokens return decrypted pn name/passcode | Addressed | S1 — API returns only safe fields; client uses server-side ops |
| Security | Auth logs DID/pnIdentifier | Addressed | S2 — Logs redacted |
| Security | WebSocket auth | Addressed | S3 — Documented as unauthenticated; must not be used for sensitive data |
| Security | API key rate limit | Addressed | S4, SC2 — Implemented per key |
| Security | Feed content XSS | Addressed | S5 — DOMPurify in FeedPage |
| Security | API_ENDPOINT fallback | Addressed | S6 — Production requires VITE_API_ENDPOINT |
| Security | REACT_APP_* in id-dashboard | Addressed | S7, C1 — Migrated to VITE_* / integrationsEnv |
| Security | CORS for Capacitor | Addressed | S8, M1 — capacitor://localhost, ionic://localhost in DEFAULT_ORIGINS |
| Scaling | Unbounded connections/notifications | Addressed | SC1 — Cap 500; pagination |
| Scaling | Document rate limits | Addressed | SC3 — docs/api/RATE_LIMITS.md |
| Mobile | Capacitor CORS | Addressed | M1 — Same as S8 |
| Mobile | Service worker disabled | Addressed | M2 — Documented install-only PWA |
| Mobile | Browser PWA manifest | Addressed | M3 — manifest.json + link in aggregator-browser |
| Mobile | Prism/licensing API fallback | Addressed | M4 — Same as S6 |
| Consistency | packages/ vs core/sdk docs | Addressed | C2 — SHARED_CODE_RULES and .cursor rules updated |
| Consistency | Env checklist | Addressed | C3 — docs/MOBILE_READINESS.md |
| Security | Bearer auth on API | Compliant | — |
| Security | safeError in production | Compliant | — |
| Scaling | DB pool configured | Compliant | — |
| Mobile | id-dashboard manifest + Capacitor | Compliant | — |
| Mobile | Browser viewport + CSP | Compliant | — |

---

*End of report. Implementation of the remediation plan is a separate phase; this document only identifies issues and the plan to address them.*
