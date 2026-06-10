# Self-hosted FTP / FTPS setup

## Host checklist

1. **Dedicated user** with chroot to a base path (e.g. `/parnoir/`)
2. **FTPS (explicit TLS)** — required; do not use plain FTP in production
3. **Passive mode** — open passive port range on firewall
4. **Disk quota** — plan for SQLite DBs, JSONL message logs, and encrypted attachments

## Layout created under base path

```
{basePath}/par-noir-{pn}/_metadata/
{basePath}/par-noir-{pn}/integrators/
{basePath}/par-noir-{pn}/par-noir-messages/
```

## Connect in dashboard

**Additional Cloud Providers → FTP**

| Field | Notes |
|-------|--------|
| Host | Server hostname |
| Port | `21` or `990` |
| Username / Password | Encrypted server-side |
| Base path | e.g. `/parnoir/` |
| Use FTPS | Default on |
| Passive mode | Default on |

## Concurrency

FTP uses version sidecars (`{file}.meta.json`) for optimistic writes. Large indexes may be slower than S3 or OneDrive.

## Security

FTP credentials are high-risk. Prefer FTPS, restrict by IP where possible, and rotate passwords regularly.
