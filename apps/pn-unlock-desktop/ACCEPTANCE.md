# Desktop Unlock + prefer-app acceptance

Symptom-based (not “tests pass”).

| Case | Pass looks like |
|------|-----------------|
| Prefer-app, Unlock desktop installed | OAuth from browse opens Unlock app window; no browser popup chrome |
| Prefer-app, app not installed | Brief scheme attempt → HTTPS popup on unlock.parnoir.com |
| Unlock completes | Caller receives code via oauth-callback bridges (storage/BroadcastChannel) or redirect |
| Messaging handoff | browser-app / messaging-app still get ML-KEM material after unlock |
| Vault enroll | After unlock, optional “Save unlock on this computer?”; next launch confirms via dialog |
| Negative | Authenticate body has no passcode / pn name |

Related: [`../pn-unlock/ACCEPTANCE_MATRIX.md`](../pn-unlock/ACCEPTANCE_MATRIX.md).
