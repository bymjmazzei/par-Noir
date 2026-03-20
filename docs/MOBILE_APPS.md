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
   - Messaging: `cd apps/aggregator-browser && npm run build:mobile:messaging` (builds messaging variant then syncs `capacitor-messaging/`)
   - Prism: `cd apps/prism && npm run build:mobile`

2. **Open in IDE**
   - Android: `npm run open:android` in the app folder (or `open:android` in `capacitor-messaging` for Messaging).
   - iOS: `npm run open:ios` (requires Xcode and CocoaPods; run `pod install` in `ios/App` if needed).

## Messaging app

The Messaging app uses the same aggregator-browser codebase with `VITE_DEFAULT_VIEW=messaging`. That build opens with the Inbox/messages view by default. The native project lives in `apps/aggregator-browser/capacitor-messaging/` and uses `webDir: ../dist-messaging`.

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
