# OAuth and production rollout checklist

**Order matters** for the risky steps (staging before prod, fix clients before enforcing rotation).

Use this doc to track progress; tick items as you complete them. For a compact env-only audit, see [PRODUCTION_ENV_AUDIT.md](./PRODUCTION_ENV_AUDIT.md). OAuth env details: [api/README.md](../../api/README.md) (Environment). Admin / edge: [ADMIN_AUTHENTICATION.md](./ADMIN_AUTHENTICATION.md).

---

## 1. Staging: prove refresh rotation is safe

In your **staging** API environment (Railway or equivalent):

- [ ] Set `PN_OAUTH_ENFORCE_REFRESH_ROTATION=true`.

**Smoke test** (real logins, not just health checks):

- [ ] Browse + messaging (aggregator)
- [ ] Developer portal
- [ ] Prism (if you use it)

**Confirm:** Session survives at least one access-token expiry path (or force a refresh by waiting / using the app until it refreshes).

- [ ] If anything breaks with **400 on `/oauth/refresh`**, turn the flag **off** and fix clients before production.

---

## 2. Production: turn on refresh rotation (after staging OK)

- [ ] Set `PN_OAUTH_ENFORCE_REFRESH_ROTATION=true` on the **production** API.
- [ ] Quick smoke test again (same apps as step 1).

---

## 3. Lock OAuth token signing (Railway / API env)

Pick **one** approach and make production match it.

### Option A — HS256 (simplest)

- [ ] Set a strong, unique `PN_OAUTH_SECRET` in production.
- [ ] Ensure `PN_OAUTH_ISSUER` and `PN_OAUTH_AUDIENCE` are set to what you intend (defaults are `par-noir-api` / `par-noir-clients` if unset—**do not change casually** or existing tokens break).

### Option B — RS256 (PEM or KMS)

- [ ] Set `PN_OAUTH_ACCESS_TOKEN_ALG=RS256` and the PEM/KMS vars your team chose (see [api/README.md](../../api/README.md) Environment section).
- [ ] Keep issuer / audience consistent with the code.

**Documentation**

- [ ] Note where the secret/keys live and a short rotation runbook (even one paragraph in internal notes).

---

## 4. Admin: move off shared key when ready

- [ ] Configure your edge (IAP, internal LB, VPN, or mTLS) so only trusted callers hit `/api/admin/`.
- [ ] Set on the API: `ADMIN_IDENTITY_HEADERS_ENABLED=true`.
- [ ] Set `ADMIN_ALLOWED_PRINCIPALS` to a comma-separated list of the exact principal values your proxy sends (e.g. IAP user strings).
- [ ] When automation/scripts send that header correctly, set `ADMIN_DISABLE_LEGACY_API_KEY=true`.
- [ ] Align network allowlists (e.g. nginx `/api/admin/` rules or your GCP LB) with real IPs/CIDRs—not template `10.0.0.0/8` unless that is really you.

---

## 5. Storage envelope v2 (optional)

Only if you want KMS-wrapped storage credentials.

**Staging first**

- [ ] In GCP: create KMS key; grant the API service account encrypt/decrypt on it.
- [ ] Set `STORAGE_CREDENTIALS_KMS_KEY` (full resource name) and `STORAGE_CREDENTIALS_ENVELOPE_V2=true` in **staging**.
- [ ] Test: connect storage / credentials flow; confirm nothing locks users out.

**Production**

- [ ] Repeat after staging burn-in.

If you are not ready for KMS, **skip** this until you are.

---

## 6. Ops baseline (ongoing)

In **production** API env, confirm:

- [ ] `ALLOW_UNSAFE_DEV_ADMIN_BYPASS` is **not** `true`.
- [ ] Postgres: automated backups on; restore drill done or scheduled.
- [ ] Multiple API instances: `REDIS_URL` set so rate limits behave.
- [ ] Monitoring: `SENTRY_DSN` (or equivalent) + alerts on 5xx / OAuth errors.

Use [PRODUCTION_ENV_AUDIT.md](./PRODUCTION_ENV_AUDIT.md) as the detailed tick list for this step.

---

## 7. What you do not need to do

- **Redeploy API manually** if GitHub → Railway already deploys on push—unless you change env without redeploy (some hosts pick up env on next deploy).
- **Change Firebase hosting** unless you change frontend code again.

---

## Related docs

- [PRODUCTION_ENV_AUDIT.md](./PRODUCTION_ENV_AUDIT.md)
- [ADMIN_AUTHENTICATION.md](./ADMIN_AUTHENTICATION.md)
- [BACKUP_AND_RESTORE_RUNBOOK.md](./BACKUP_AND_RESTORE_RUNBOOK.md)
- [api/README.md](../../api/README.md) (Environment)
