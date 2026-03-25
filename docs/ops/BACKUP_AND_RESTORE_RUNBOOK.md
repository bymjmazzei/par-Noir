# PostgreSQL backup and restore (runbook)

Use this with your **actual** provider (Railway, Neon, RDS, self-hosted, etc.). Fill in the bracketed placeholders once; rerun the restore drill on a schedule (e.g. quarterly).

## 1. Where backups live

| Field | Your value |
|-------|------------|
| Provider | |
| Automated backup enabled? | |
| Retention (days) | |
| Encryption at rest? | |
| Who can restore (roles) | |

## 2. Restore drill (staging or scratch DB)

1. Create a **non-production** Postgres instance (or use a disposable database).
2. Restore from your latest **automated** backup using the provider’s documented procedure (point-in-time, snapshot export, `pg_restore`, etc.).
3. Point a **local or staging API** at the restored `DATABASE_URL` (never production secrets in shared logs).
4. Run API smoke: `API_BASE_URL=...` optional; for DB only, run migrations if required and `GET /health/ready` against an API using that DB.
5. Record results:

| Drill date | Backup used | Restore duration | Data looks correct? | Notes |
|------------|-------------|------------------|------------------------|-------|
| | | | | |

## 3. RPO / RTO (targets)

| Metric | Target | Observed in last drill |
|--------|--------|-------------------------|
| RPO (max acceptable data loss) | | |
| RTO (max acceptable downtime) | | |

## 4. Secrets rotation (related)

- Rotate `PN_OAUTH_SECRET` and dependent keys per your security policy; coordinate with active sessions.
- Feed encryption: see `FEED_TOKEN_ENCRYPTION_KEY` in [api/.env.example](../../api/.env.example).

Do not commit filled tables with real hostnames or credentials to git.
