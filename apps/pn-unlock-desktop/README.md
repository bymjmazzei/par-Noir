# par Noir Unlock (desktop)

Mac / Windows Electron shell for the same OAuth unlock broker as `unlock.parnoir.com` and the Cap mobile Unlock app.

## What it does

- Registers protocol `com.parnoir.unlock://`
- Hosts `ConsentUnlockApp` (local decrypt → ML-DSA unlock proof → redirect_uri)
- Returns to the caller via `shell.openExternal(https://…/oauth-callback…)` so browse/SDK pick up the code via BroadcastChannel / localStorage (no `window.opener`)
- Optional device vault via Electron `safeStorage` (OS keychain): **one biometric gate**, then pick among enrolled pNs; each entry seals all three factors (identity file JSON + Key 1 + Key 2)
- **Mac:** vault enroll / re-open gated by **Touch ID** (`systemPreferences.promptTouchID`). Vault is unavailable if Touch ID cannot be prompted.
- **Windows:** vault gated by Unlock/Cancel confirmation dialog

## Dev

```bash
cd apps/pn-unlock-desktop
npm install
npm run build:main && npm run build:preload
# terminal A
npx vite --config vite.config.ts
# terminal B
VITE_DEV_SERVER_URL=http://127.0.0.1:5179 npx electron .
```

Or: `npm run build && npx electron .` (loads `dist/`).

Smoke: open  
`com.parnoir.unlock://oauth/consent?client_id=browser-app&redirect_uri=https%3A%2F%2Fbrowse.parnoir.com%2Foauth-callback.html&scope=openid&state=test&api_endpoint=https%3A%2F%2Fapi.parnoir.com`

### Touch ID multi-pN vault QA (Mac)

1. Full unlock pN A → Enable with Touch ID.
2. Full unlock pN B → Enable with Touch ID (second entry merges).
3. Quit → reopen → Touch ID → **Choose a pN** → continue without re-entering keys.
4. Single enrolled pN skips the picker and continues immediately.

## Dist

```bash
npm run dist:mac   # or dist:win / dist:all
```

`appId` is `com.parnoir.unlock` (same product family as Cap Unlock).

## Prefer-app from callers

`startPnOAuthPopup` / `UnlockButton` try the custom scheme first, then fall back to `https://unlock.parnoir.com`. Disable with `VITE_UNLOCK_PREFER_APP=0`.

See [ACCEPTANCE.md](./ACCEPTANCE.md).
