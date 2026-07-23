# Microsoft OneDrive setup

## 1. Azure app registration

1. [Azure Portal](https://portal.azure.com) → App registrations → New registration
2. Redirect URI (Web): `https://your-dashboard.example/oauth-callback.html`
3. API permissions (delegated): **`Files.ReadWrite.AppFolder`**, `offline_access` only (not whole-drive `Files.ReadWrite`)
4. Create client secret

Reconnect any existing OneDrive grant that used whole-drive scope.

## 2. API environment

Set on the par Noir API server:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

`GET /api/public-config` exposes `microsoftClientId` to the dashboard.

## 3. Connect in dashboard

**Additional Cloud Providers → OneDrive** → OAuth popup (App folder).

## 4. Storage format

Portable layout under the Graph **App Root** special folder: `par-noir-{pn}/...`.
