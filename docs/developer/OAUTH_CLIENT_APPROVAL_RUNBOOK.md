# OAuth client approval runbook (platform operators)

When the platform registry is configured (`PLATFORM_REGISTRY_PN_IDENTIFIER` + `PLATFORM_OPERATOR_PN_IDS` on the API), developer-portal registrations do **not** activate OAuth immediately. They create a **pending application** until an operator approves.

## Who can approve

Operators are pN identifiers listed in **`PLATFORM_OPERATOR_PN_IDS`** (comma-separated). Those users unlock on [developers.parnoir.com](https://developers.parnoir.com) and open **`/platform`**. Non-operators are redirected to `/`.

## Integrator experience

1. Unlock on Credentials → **Save OAuth client**.
2. If registry is on: response `status: pending` + `applicationId`. Client id is **not** live for `/oauth/authorize` yet.
3. Credentials shows the application under **Pending review**.
4. After approval: client appears under **Active OAuth clients** (`isActive: true`). Integrator uses that `client_id` in their app.

If registry is **not** configured, `POST /api/developer/oauth-clients` registers an active client immediately (dev/local).

## Operator steps

1. Unlock with an operator pN on developers.parnoir.com.
2. Go to **Platform → Applications** (pending filter).
3. Review client id, redirect URIs, scopes, and permission manifest.
4. **Approve (verified)** or **Approve** / **Reject** as appropriate (`POST /api/developer/platform/applications/:id/approve` or `.../reject`).
5. Confirm the client appears on Platform → Clients and that the integrator’s Credentials list shows it as **Active**.

## How the integrator knows they are live

- Credentials: status badge **Active** (not Pending).
- Optional: attempt authorize with their `client_id`; pending/unknown clients fail consent/token.
- Get-started panel on Credentials only appears for **active** clients.

## Related

- Self-service: `POST /api/developer/oauth-clients`, `GET /api/developer/applications/mine`
- Operator: `GET /api/developer/platform/applications`, approve/reject routes
- Integrator QA: [LAUNCH_QA_INTEGRATOR.md](./LAUNCH_QA_INTEGRATOR.md)
