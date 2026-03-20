# Native mobile apps (iOS and Android)

The Dashboard, Browser, Messaging, and Prism web apps are wrapped with [Capacitor](https://capacitorjs.com/) for iOS and Android. Same codebase as web; native shells load the built web assets.

## App overview

| App | App ID | Source | Scripts |
|-----|--------|--------|---------|
| **Dashboard** | `com.parnoir.dashboard` | `apps/id-dashboard` | `build:mobile`, `open:android`, `open:ios` |
| **Browser** | `com.parnoir.browser` | `apps/aggregator-browser` | `build:mobile`, `open:android`, `open:ios` |
| **Messaging** | `com.parnoir.messaging` | `apps/aggregator-browser` (variant) | `build:mobile:messaging`; sync in `capacitor-messaging/` |
| **Prism** | `com.parnoir.prism` | `apps/prism` | `build:mobile`, `open:android`, `open:ios` |

## Build and run

1. **Build web assets and sync to native**
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

`public/oauth-authorize.html` uses **`https://api.parnoir.com`** unless the page is opened from the Vite dev server (**`http://localhost:3001`** / **`http://127.0.0.1:3001`** only). Do not infer “localhost → :3001” from hostname alone — some WebViews mis-report `protocol`, which caused **`ERR_CLEARTEXT_NOT_PERMITTED`** for Capacitor’s **`https://localhost`**.

**Physical keys (USB / NFC):** The authorize page matches the dashboard: **File** (upload `.json`), **USB** (key + drive passcode + optional payload, same as dashboard export), or **NFC** (Web NFC on Chrome/Android). Shared logic lives in `public/js/oauth-physical-unlock.js` (also copied under Prism). Native Android apps declare **`android.permission.NFC`** so Web NFC can work in the WebView where the OS allows it.
