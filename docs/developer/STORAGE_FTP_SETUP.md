# FTP storage through your own relay

par Noir's servers never connect to your FTP server, and browsers can't speak FTP. To use FTP
storage you host a small HTTPS service, `apps/pn-storage-relay`, that holds your FTP login and
forwards your devices' reads and writes to the server. par Noir never sees the FTP password. Your
devices keep only the relay address and its token, sealed in the device cloud vault.

```
your devices ──HTTPS + token──▶ your relay ──FTPS/SFTP──▶ your FTP server
```

## 1. Prepare the FTP server

- Use **SFTP** or **FTPS** (explicit `AUTH TLS`, or implicit on port 990). The relay refuses plain FTP.
- Create a dedicated user and, if you can, chroot it to one directory.
- For FTPS, open the passive port range on the firewall.
- Plan disk space for SQLite tables, message logs and encrypted attachments.

## 2. Generate the relay settings

In the dashboard, open **Storage → Secure Cloud → FTP**. The flow shows:

| Variable | Value |
| --- | --- |
| `RELAY_TOKEN` | Random 256-bit token generated in your browser. |
| `RELAY_PREFIX` | `par-noir-pn-…`, the folder your pN's data lives in. |
| `ALLOWED_ORIGINS` | The par Noir app origins allowed to call the relay. |

Copy those values. You add your FTP login on the relay host yourself:
`STORAGE_PROTOCOL` (`sftp` or `ftps`), `STORAGE_HOST`, `STORAGE_USER`, and either `STORAGE_PASSWORD`
or, for SFTP, `STORAGE_PRIVATE_KEY`. Optional settings (`STORAGE_PORT`, `FTPS_IMPLICIT`,
`STORAGE_ROOT`, `MAX_UPLOAD_MB`) are listed in [`apps/pn-storage-relay/README.md`](../../apps/pn-storage-relay/README.md).

## 3. Deploy the relay

### Railway

If the dashboard shows **Deploy on Railway**, use it and paste the variables when Railway asks. Otherwise:

1. Create a new Railway project from the `bymjmazzei/par-Noir` GitHub repo.
2. In the service settings, set **Root Directory** to `apps/pn-storage-relay`. Railway picks up the
   `Dockerfile` and `railway.json` (health check on `/healthz`).
3. Add the variables from step 2.
4. Under **Networking**, generate a public domain. Railway serves it over HTTPS.

### Any Docker host

```bash
docker build -t pn-storage-relay https://github.com/bymjmazzei/par-Noir.git#main:apps/pn-storage-relay
docker run -d --restart unless-stopped -p 8080:8080 \
  -e RELAY_TOKEN='…' -e RELAY_PREFIX='par-noir-pn-…' -e ALLOWED_ORIGINS='…' \
  -e STORAGE_PROTOCOL=sftp -e STORAGE_HOST=… -e STORAGE_USER=… -e STORAGE_PASSWORD=… \
  pn-storage-relay
```

Put it behind a TLS proxy (Caddy, nginx, Cloudflare Tunnel) so devices reach it over `https://`.
The dashboard refuses `http://` relay addresses.

## 4. Connect

Paste the relay's HTTPS address in the dashboard and press **Test relay**. The test checks the
token, origin and prefix, then writes, reads and deletes `.par-noir-relay-test/…` under your prefix.
Each failure names the setting to fix. When it passes, **Save relay** seals the address and token on
this device and registers only the account id and prefix with par Noir.

On another device, reconnect FTP with the same relay address and `RELAY_TOKEN`.

## Layout

```
{STORAGE_ROOT}/par-noir-{pn}/_metadata/
{STORAGE_ROOT}/par-noir-{pn}/integrators/
{STORAGE_ROOT}/par-noir-{pn}/par-noir-messages/
```

## Rotating the token

1. Start the FTP setup again in the dashboard and press **New token**.
2. Set the new `RELAY_TOKEN` on the relay host and redeploy.
3. Test and save in the dashboard, then reconnect your other devices with the new token.

## Moving from the old FTP connection

Older FTP connections went through par Noir's servers. They no longer work, and the dashboard shows
**Set up your FTP relay**. Follow the steps above with the same FTP server and
`STORAGE_ROOT` set to your old base path; your existing `par-noir-{pn}` folder is reused.

## Concurrency

The relay serialises operations per connection and honours `If-Match` on writes, so concurrent
device writes fail cleanly instead of overwriting each other. Large indexes are slower than on S3 or
OneDrive.
