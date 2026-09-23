# Desktop Unlock + prefer-app acceptance

Symptom-based (not “tests pass”).

| Case | Pass looks like |
|------|-----------------|
| Prefer-app, Unlock desktop installed | OAuth from browse opens Unlock app window; no browser popup chrome |
| Prefer-app, app not installed | Brief scheme attempt → HTTPS popup on unlock.parnoir.com |
| Unlock completes | Caller receives code via oauth-callback bridges (storage/BroadcastChannel) or redirect |
| Messaging handoff | browser-app / messaging-app still get ML-KEM material after unlock |
| Vault enroll (Mac + Touch ID) | After unlock, save prompt → Touch ID; entry merges into multi-pN vault (all three factors per identity) |
| Vault re-open (Mac) | Touch ID → if one pN auto-continues; if several, **Choose a pN** picker (labels never Key 1) → unlock |
| Vault cancel (Mac) | Cancel Touch ID or picker → full unlock form; enrolled set kept |
| Vault unavailable (Mac, no Touch ID) | Enroll prompt does not appear (`vault-available` false); full unlock still works |
| Vault enroll (Windows) | Confirmation dialog; same multi-pN sealed payload |
| Negative | Authenticate body has no passcode / pn name; vault file values opaque |
| file:// / Electron CORS | Challenge + authenticate succeed against prod API (main stamps `Origin: https://unlock.parnoir.com`) |
| Cold-start deep link | Argv / open-url OAuth params applied even if renderer was not listening yet (`getPendingDeepLink` + keep pending) |

Packaged Mac smoke (unsigned local `dist/mac-arm64`, cursor-test-pn → live API): **PASS** 2026-09-21 — challenge/authenticate 200, `openExternal` to browse callback with code.

Note: unsigned local builds can still use Touch ID; consistent code signing helps `safeStorage` Keychain stability across rebuilds.

Related: [`../pn-unlock/ACCEPTANCE_MATRIX.md`](../pn-unlock/ACCEPTANCE_MATRIX.md).
