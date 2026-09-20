# Unlock broker — device acceptance matrix

Symptom-based checks (not “tests pass”).

## Web (no Unlock app)

1. Open a first-party or L5 client → start OAuth.
2. Browser lands on `https://unlock.parnoir.com/oauth/consent?...` (or API 302 hop).
3. Enter factors only on that origin → receive `code` on caller `redirect_uri`.
4. Token exchange succeeds for granted scopes.

## Native (Unlock app installed + App Links verified)

1. Same OAuth start → OS opens `com.parnoir.unlock`.
2. Factors entered only in Unlock app → `Browser.open` / redirect returns code to caller.
3. Messaging (`browser-app` / `messaging-app`): ML-KEM handoff still present after unlock.

## Native (app not installed)

1. Universal Link falls through to web SPA on unlock.parnoir.com.
2. Same as web path above.

## Negative

1. Integrator UI must not render Key 1 / Key 2 inputs (kit only launches broker URL).
2. `POST /oauth/authorize/authenticate` body must not contain passcode / pn name (existing ratchets).

## Store association

See `STORE_ASSOCIATION_CHECKLIST.md` — do not claim phishing-hardening complete until AASA/assetlinks verify on real devices.
