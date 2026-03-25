# Production environment audit (pre-release checklist)

Use this before calling a release “production ready.”

## Security flags

- [ ] `ALLOW_UNSAFE_DEV_ADMIN_BYPASS` is **not** `true` in production.
- [ ] `PN_OAUTH_SECRET` (HS256) or RS256/KMS PEM keys are set and rotation is documented.
- [ ] `PN_OAUTH_ISSUER` and `PN_OAUTH_AUDIENCE` match what clients and integrators expect.
- [ ] `PN_OAUTH_ENFORCE_REFRESH_ROTATION` enabled only after all OAuth clients persist refreshed `refresh_token` (staging sign-off first).
- [ ] `STORAGE_CREDENTIALS_ENVELOPE_V2` and `STORAGE_CREDENTIALS_KMS_KEY` validated in staging before production.
- [ ] `ADMIN_IDENTITY_HEADERS_ENABLED`, `ADMIN_ALLOWED_PRINCIPALS`, and `ADMIN_DISABLE_LEGACY_API_KEY` aligned with your edge (see [ADMIN_AUTHENTICATION.md](./ADMIN_AUTHENTICATION.md)).

## Data and availability

- [ ] Postgres: automated backups configured; restore drill performed.
- [ ] Multiple API instances: `REDIS_URL` set so rate limits and shared state behave correctly.
- [ ] Errors: `SENTRY_DSN` (or equivalent) set; alerts on 5xx and OAuth refresh failure rate.

## Related docs

- [BACKUP_AND_RESTORE_RUNBOOK.md](./BACKUP_AND_RESTORE_RUNBOOK.md)
- [GO_NO_GO_LAUNCH.md](./GO_NO_GO_LAUNCH.md)
- [api/README.md](../../api/README.md) (Environment)
