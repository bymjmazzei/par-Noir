# Microsoft OneDrive setup

## 1. Azure app registration

1. [Azure Portal](https://portal.azure.com) → App registrations → New registration
2. Redirect URI (Web): `https://your-dashboard.example/oauth-callback.html`
3. API permissions (delegated): `Files.ReadWrite`, `offline_access`
4. Create client secret

## 2. API environment

Set on the par Noir API server:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

`GET /api/public-config` exposes `microsoftClientId` to the dashboard.

## 3. Connect in dashboard

**Additional Cloud Providers → OneDrive** → OAuth popup.

## 4. Storage format

Same portable layout as S3/Dropbox: SQLite `.db` table files under `par-noir-{pn}/`. No Graph Excel API in v1.
