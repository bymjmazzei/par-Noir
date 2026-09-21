# Native mobile apps (iOS and Android)

The Dashboard, Browser, Messaging, Prism, and **Unlock** web apps are wrapped with [Capacitor](https://capacitorjs.com/) for iOS and Android. Same codebase as web; native shells load the built web assets.

## App overview

| App | App ID | Source | Scripts |
|-----|--------|--------|---------|
| **Unlock** | `com.parnoir.unlock` | `apps/pn-unlock` | `build:mobile`, `open:android`, `open:ios` |
| **Unlock Desktop** | `com.parnoir.unlock` | `apps/pn-unlock-desktop` | Electron: `build`, `dist:mac`, `dist:win` |
| **Dashboard** | `com.parnoir.dashboard` | `apps/id-dashboard` | `build:mobile`, `open:android`, `open:ios` |
| **Browser** | `com.parnoir.browser` | `apps/aggregator-browser` | `build:mobile`, `open:android`, `open:ios` |
| **Messaging** | `com.parnoir.messaging` | `apps/aggregator-browser` (variant) | `build:mobile:messaging`; sync in `capacitor-messaging/` |
| **Prism** | `com.parnoir.prism` | `apps/prism` | `build:mobile`, `open:android`, `open:ios` |

## Unlock broker (phishing-hardened OAuth)

Canonical interactive unlock UI is **`https://unlock.parnoir.com`** (`ConsentUnlockApp` in `@par-noir/oauth-ui`). Callers use `buildOAuthConsentUrl` / `UnlockButton` — they never collect Key 1 / Key 2.

- **Web broker (live):** SPA on Firebase target `unlock` (site `unlock-parnoir`). Custom domain must show Connected TLS.
- **Native claim:** Capacitor app `com.parnoir.unlock` — Universal/App Links for `unlock.parnoir.com`. **Phishing-hardening is not complete** until association stubs are burned down and [`ACCEPTANCE_MATRIX.md`](../apps/pn-unlock/ACCEPTANCE_MATRIX.md) native rows pass on real devices. See [`STORE_ASSOCIATION_CHECKLIST.md`](../apps/pn-unlock/STORE_ASSOCIATION_CHECKLIST.md) and [`INTERNAL_BUILDS.md`](../apps/pn-unlock/INTERNAL_BUILDS.md).
- **Desktop Unlock:** Electron shell [`apps/pn-unlock-desktop`](../apps/pn-unlock-desktop) registers `com.parnoir.unlock://` and hosts the same consent UI. Callers **prefer the app** (custom scheme) before the HTTPS popup (`launchUnlockBroker` / `startPnOAuthPopup`).
- **Session vault:** Native enroll + biometric re-mint of sealed `unlock_keys` (includes `encryptedIdentityJson`) is wired in `apps/pn-unlock`; desktop uses Electron `safeStorage`. Web has no vault.
- **API:** `GET /oauth/consent` and `/oauth/authorize/consent` **302** to the unlock origin with `api_endpoint` for challenge/authenticate.
- **Ratchet:** `scripts/check-unlock-association-stubs.sh` (pre-commit + CI) — Apple `TEAMID` may remain on the burn-down allowlist until filled; Android SHA256 stub is forbidden.
- Env: `PN_UNLOCK_ORIGIN` (API), `VITE_UNLOCK_ORIGIN` / `VITE_API_ENDPOINT` (unlock + callers).

Public store submission paperwork is ops, not a merge blocker. Verified App Links + matrix pass **are** required before claiming the mobile trust story.

## Build and run

1. **Build web assets and sync to native**
   - Unlock: `cd apps/pn-unlock && npm run build:mobile` (run `npm run cap:add` once if android/ios folders are missing)
   - Dashboard: `cd apps/id-dashboard && npm run build:mobile`
   - Browser: `cd apps/aggregator-browser && npm run build:mobile`
   - Messaging: `cd apps/aggregator-browser && npm run build:mobile:messaging` (uses `vite build --mode messaging` and `.env.messaging` → **`dist-messaging`**; then syncs `capacitor-messaging/`). Open **`capacitor-messaging/android`** in Android Studio, not the main browser project.
   - Prism: `cd apps/prism && npm run build:mobile` — open **`apps/prism/android`** (`com.parnoir.prism`). Web deploy is **`apps/prism/dist`** (e.g. `prism` Firebase target); same build works in the native shell.

2. **Open in IDE**
   - Android: `npm run open:android` in the app folder (or `open:android` in `capacitor-messaging` for Messaging).
   - iOS: `npm run open:ios` (requires Xcode and CocoaPods; run `pod install` in `ios/App` if needed).

## Messaging app

The Messaging app uses the same aggregator-browser codebase with `VITE_DEFAULT_VIEW=messaging`. That build opens with the Inbox/messages view by default. The native project lives in `apps/aggregator-browser/capacitor-messaging/` and uses `webDir: ../dist-messaging`.

**Messaging web (`messaging.parnoir.com`):** The **`dist-messaging`** build is deployed to Firebase Hosting site **`messaging-parnoir`** (target `messaging` in `firebase.json`). Root [`deploy.sh`](../deploy.sh) runs `npm run build:messaging` after the main browser build. In **Firebase Console** → Hosting → site `messaging-parnoir` → **Add custom domain** `messaging.parnoir.com` and complete DNS (same pattern as `browse.parnoir.com`). The API must allow OAuth redirect URIs and CORS for `https://messaging.parnoir.com` (see `clientRegistration` + `DEFAULT_ORIGINS` in the API).

**Messaging-only UI:** `.env.messaging` sets `VITE_DEFAULT_VIEW=messaging` and `VITE_MESSAGING_ONLY=true`. The messaging build hides Home/Search/Upload in the bottom nav (Inbox + Me only), hides the upload status circle, and keeps notifications in the inbox instead of jumping to the home feed. Messages remain available in the full **browser** build (`dist`) — we are not removing messaging from the browser.

## Prism

Same API/CORS rules as other apps (`https://localhost` for Capacitor). `apps/prism` uses `base: './'` and `server.androidScheme: "https"` for Android assets and API calls.

## iOS (CocoaPods / Xcode)

If `pod install` fails (e.g. CocoaPods not installed or Xcode not selected), install CocoaPods and set the active developer directory to Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
# Install CocoaPods if needed: sudo gem install cocoapods
cd apps/<app>/ios/App && pod install
```

Then open the `.xcworkspace` in Xcode and build/run.

## API and CORS

The API allows these origins for mobile WebViews (see `DEFAULT_ORIGINS` in `api/src/server.ts`):

- `capacitor://localhost`, `ionic://localhost` — some shells
- **`https://localhost`** (and `https://127.0.0.1`) — **Android Capacitor** when `server.androidScheme` is `"https"` (the dashboard app uses this). Without this, calls to `api.parnoir.com` fail in the emulator with **CORS** and `/api/public-config` never loads, so **Google Drive OAuth** can’t get a client ID from the API.

After changing CORS, **redeploy the API** so production allows `https://localhost`.

Ensure `VITE_API_ENDPOINT` points at the deployed API for production mobile builds. For Drive connect in the app, either set **`VITE_GOOGLE_DRIVE_CLIENT_ID`** at build time or rely on **`/api/public-config`** (requires CORS + API `GOOGLE_DRIVE_CLIENT_ID`). In **Google Cloud Console**, add authorized redirect URI **`https://localhost/oauth-callback.html`** for the same OAuth client used by the dashboard build.

### Aggregator browser: OAuth popup → return to app

After login, `oauth-callback.html` **navigates the main window** to `/?oauth_resume=1&code=...` (in addition to `postMessage`). Android WebViews often do not deliver `postMessage` to the opener, and the popup’s `localStorage` may not be visible to the main WebView — so the app **must** resume from the URL query. The React hook `useAuthAndSession` completes the token exchange on load.

On **native**, unlock uses **full-page** OAuth (`popup=false`) instead of `window.open`.

### Aggregator browser: pN unlock (OAuth authorize page)

`apps/aggregator-browser/public/oauth-authorize.html` is served on the **same origin** as the browse/messaging app (`browse.parnoir.com`, `messaging.parnoir.com`). The popup decrypts locally, stashes ML-KEM keys to `localStorage`, POSTs to `api.parnoir.com/oauth/authorize/authenticate`, then redirects to same-origin `oauth-callback.html`.

API endpoint: `api_endpoint` query param (set by the React app from `VITE_API_ENDPOINT`), default `https://api.parnoir.com`. Do not infer “localhost → local API” from hostname alone — some WebViews mis-report `protocol`, which caused **`ERR_CLEARTEXT_NOT_PERMITTED`** for Capacitor’s **`https://localhost`**.

**Physical keys (USB / NFC):** The authorize page matches the dashboard: **File** (upload `.json`), **USB** (key + drive passcode + optional payload, same as dashboard export), or **NFC** (Web NFC on Chrome/Android). Shared logic lives in `public/js/oauth-physical-unlock.js` (source: `api/src/static/oauth/oauth-physical-unlock.js`). Messaging stash: `public/js/oauth-messaging-stash.js` (from `@par-noir/oauth-ui`). Native Android apps declare **`android.permission.NFC`** so Web NFC can work in the WebView where the OS allows it.
