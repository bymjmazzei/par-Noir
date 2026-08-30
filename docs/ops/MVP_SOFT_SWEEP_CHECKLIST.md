# MVP soft sweep checklist

Manual / ops checks that hermetic CI cannot replace. Use after dual-pN feature QA and after soft API auth gates land.

**Related:** [TESTING.md](../developer/TESTING.md), [GO_NO_GO_LAUNCH.md](./GO_NO_GO_LAUNCH.md), production flags via `PN_STRICT_GUARDRAILS=1 bash scripts/check-production-flags.sh`.

---

## 1. Railway / API production flags

- [ ] `DEVICE_CLOUD_CUSTODY` left on (default) — do not set to `0`
- [ ] `SOCKET_REQUIRE_AUTH=true`
- [ ] `PN_OAUTH_SECRET` (or RS256/KMS) + `PN_OAUTH_ISSUER` + `PN_OAUTH_AUDIENCE`
- [ ] `MAILBOX_ROUTE_PEPPER` set
- [ ] `ADMIN_API_KEY` set; `ALLOW_UNSAFE_DEV_ADMIN_BYPASS` unset
- [ ] API and Firebase hosting deployed from the **same commit**

Run locally with secrets loaded:

```bash
PN_STRICT_GUARDRAILS=1 bash scripts/check-production-flags.sh
bash scripts/check-production-flags.selftest.sh
```

---

## 2. Curl soft routes (must not be open)

Unauthenticated calls should return **401 / 403 / 503**, never **200**:

```bash
API="${API_BASE_URL:-https://api.parnoir.com}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/verification/sync" -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/aggregator/metadata-index/debug"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/aggregator/metadata-index/invalidate-cache"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/aggregator/metadata-index/cleanup-tables"
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "$API/api/third-party/access/pn-test" -H 'Content-Type: application/json' -d '{"updates":[]}'
```

Gate tests: `api/src/server/modules/softUnauthRoutes.gate.test.ts`.

---

## 3. 48–72h revisit (both test pNs)

Without redoing a perfect first-day path:

- [ ] Unlock dashboard again after idle
- [ ] Cloud reconnect / Drive list still works (no stuck `cloud_token_*` 409)
- [ ] Browse unlock + feed media
- [ ] Messaging unlock on **messaging** origin (separate from browse)
- [ ] Mailbox drain / DM after being offline

---

## 4. Dual-origin unlock

- [ ] Unlock once on `browse.parnoir.com`
- [ ] Unlock once on `messaging.parnoir.com` (browse unlock does not provision messaging)
- [ ] Send/receive DM between the two test pNs after both unlocks

---

## 5. Accepted residuals (document, do not “paper over”)

| Residual | Notes |
|----------|--------|
| Browser XSS | `sessionStorage` holds OAuth Bearer + `pn_dm_session_v1` (ML-KEM). Hosting CSP is frame-ancestors only — not script-restricting. |
| OAuth Maps in memory | Auth codes / unlock challenges are process-local. Prefer single API instance or sticky sessions until Redis-backed. |
| Passcode on wire | Must remain forbidden (CI ratchet). |

---

## 6. Automated suite reminder

```bash
# Guardrails + units (includes browser vitest via test:browser:unit)
npm test

# Soft API gates
cd api && ./node_modules/.bin/jest src/server/modules/softUnauthRoutes.gate.test.ts --forceExit

# Playwright smokes
cd apps/id-dashboard && npm run test:e2e:smoke:prebuilt
cd apps/aggregator-browser && npm run test:e2e:smoke:prebuilt
cd apps/aggregator-browser && npm run test:e2e:messaging:smoke:prebuilt   # needs dist-messaging
```

**This checklist does not mean public GA.** It means closed-beta / soft-invite confidence after dual-pN QA.
