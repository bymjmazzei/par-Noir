# pn-storage-relay

A small HTTPS service you host in front of your own FTPS or SFTP server so par Noir can store your
data there. Your FTP login stays in this service's environment; par Noir's servers never see it, and
your devices only hold the relay URL and token.

Setup steps, Railway and Docker instructions, and token rotation are in
[`docs/developer/STORAGE_FTP_SETUP.md`](../../docs/developer/STORAGE_FTP_SETUP.md). The dashboard's
FTP option generates the values below for you.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `RELAY_TOKEN` | yes | Bearer token the dashboard generated (32+ characters). |
| `RELAY_PREFIX` | yes | Folder your pN's data lives in, e.g. `par-noir-pn-…`. Every request is confined to it. |
| `ALLOWED_ORIGINS` | yes | Comma-separated par Noir app origins the browser may call from. |
| `STORAGE_PROTOCOL` | yes | `ftps` or `sftp`. Plain `ftp` is refused. |
| `STORAGE_HOST` | yes | Your FTPS/SFTP server. |
| `STORAGE_USER` | yes | Login name. |
| `STORAGE_PASSWORD` | yes* | Login password. *SFTP may use `STORAGE_PRIVATE_KEY` instead. |
| `STORAGE_PRIVATE_KEY` | no | SFTP PEM key (`\n` escapes allowed). |
| `STORAGE_PORT` | no | Defaults to 21 (FTPS), 990 (implicit FTPS) or 22 (SFTP). |
| `FTPS_IMPLICIT` | no | `1` for implicit TLS instead of `AUTH TLS`. |
| `STORAGE_ROOT` | no | Directory on the server that `RELAY_PREFIX` sits under. Defaults to `/`. |
| `MAX_UPLOAD_MB` | no | Largest single upload. Defaults to 512. |
| `PORT` | no | Listen port. Railway sets it. Defaults to 8080. |

The relay must be reached over HTTPS. Railway provides that; on other hosts put it behind a TLS proxy.

## API

All routes except `GET /healthz` need `Authorization: Bearer $RELAY_TOKEN`.

- `GET /v1/health` returns `{ ok, protocol, backend, prefix }`.
- `GET | HEAD | PUT | DELETE /v1/blob?key=…`: keys are relative to `RELAY_PREFIX`. `PUT` honours `If-Match`.
- `GET /v1/list?prefix=…` returns `{ entries: [{ key, size, lastModified }] }`.

Errors are JSON `{ error, message }`. The shared contract is
`packages/user-owned-storage/src/relay.ts`.

## Develop

```bash
npm test
npm run build && npm start
```
