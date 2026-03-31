# OAuth Session Hardening Matrix

This matrix defines expected OAuth/session behavior across all app surfaces.
Use it during staging and production smoke tests.

## Shared invariants

- `redirect_uri` must exactly match a registered URI for the client.
- `state` is generated client-side and validated on callback.
- OAuth errors returned to UI are safe and non-sensitive.
- Tokens are never logged in plaintext.
- Refresh failures must force re-authentication without leaking sensitive identity details.

## App matrix

| App | Auth entrypoint | Callback | Session store | Refresh behavior | Status |
|---|---|---|---|---|---|
| `apps/aggregator-browser` | `src/services/pnOAuthService.ts` | `public/oauth-callback.html` | `sessionStorage` | refresh via `/oauth/refresh`, recover or reauth | [ ] |
| `apps/id-dashboard` | inline/oauth flows | oauth callback route/page used by dashboard | app-local storage/session | refresh/retry then reauth | [ ] |
| `apps/prism` | prism auth service/context | popup + resume callback | app session context | forced refresh path validated | [ ] |
| `apps/developer-portal` | oauth-ui unlock button + portal context | portal callback | portal session context | refresh path validated | [ ] |
| `apps/licensing-portal` | app auth client (if enabled) | licensing callback | app session context | refresh path validated | [ ] |

## Required negative tests

- Invalid `redirect_uri` rejected by API with `invalid_client` or `invalid_request`.
- Reused/expired auth code rejected by `/oauth/token`.
- Missing required auth payload fields rejected by `/oauth/authorize/authenticate` with 4xx.
- Invalid refresh token rejected by `/oauth/refresh` with safe message.

## API-side hardening checks

Primary files:
- `api/src/server.ts`
- `api/src/server/modules/pnOAuthService.ts`

Required outcomes:
- OAuth authenticate path never logs raw identity secrets.
- Third-party permission/age-check fallback errors are message-only logs.
- Production uses explicit `PN_OAUTH_*` signing config and documented rotation process.

