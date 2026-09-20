# Unlock broker — device acceptance matrix

Symptom-based checks (not “tests pass”). Record outcomes below.

## Web (no Unlock app)

1. Open a first-party or L5 client → start OAuth.
2. Browser lands on `https://unlock.parnoir.com/oauth/consent?...` (or API 302 hop).
3. Enter factors only on that origin → receive `code` on caller `redirect_uri`.
4. Token exchange succeeds for granted scopes.

| Check | Status | Observed |
|-------|--------|----------|
| Custom domain HTTPS 200 + cert CN=unlock.parnoir.com | PASS | 2026-09-20 |
| Consent SPA mounts (`Step 1: Unlock Your pN`, branding) | PASS | live unlock SPA |
| `assetlinks.json` served (debug SHA-256) | PASS | matches debug APK cert |
| AASA served | PASS (stub TEAMID allowlisted) | fill Team ID before iOS claim |
| API GET `/oauth/consent` 302 → unlock origin | PASS | prior cutover |

## Native (Unlock app installed + App Links verified)

1. Same OAuth start → OS opens `com.parnoir.unlock`.
2. Factors entered only in Unlock app → `Browser.open` / redirect returns code to caller.
3. Messaging (`browser-app` / `messaging-app`): ML-KEM handoff still present after unlock.

| Check | Status | Observed |
|-------|--------|----------|
| Debug APK builds; cert matches assetlinks | PASS | see `INTERNAL_BUILDS.md` |
| iOS project sync + pods | PASS (Xcode archive ops) | Team ID still required for UL verify |
| App Links open native app on device | PENDING | needs physical device + (iOS) Team ID |
| Vault enroll + biometric re-mint | PENDING | code wired; needs Cap device QA |
| Messaging handoff after native unlock | PENDING | needs device |

## Native (app not installed)

1. Universal Link falls through to web SPA on unlock.parnoir.com.
2. Same as web path above.

| Check | Status | Observed |
|-------|--------|----------|
| Web fallback without app | PASS | same as web row |

## Negative

1. Integrator UI must not render Key 1 / Key 2 inputs (kit only launches broker URL).
2. `POST /oauth/authorize/authenticate` body must not contain passcode / pn name (existing ratchets).

| Check | Status | Observed |
|-------|--------|----------|
| Passcode-on-wire ratchet | PASS | `scripts/check-no-passcode-on-oauth-wire.sh` |
| Vault secrets not on wire (unit) | PASS | `assertNoVaultSecretsOnWire` tests |

## Store association

See `STORE_ASSOCIATION_CHECKLIST.md`. **Do not claim phishing-hardening complete** until native App Links / Universal Links verify on real devices and Apple `TEAMID` stub is burned down.
