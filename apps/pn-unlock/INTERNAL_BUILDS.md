# Unlock broker — internal build outputs

Generated for phishing-hardening QA (not store submission).

## Android (debug)

- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- applicationId: `com.parnoir.unlock`
- Signing cert SHA-256 (must match hosted `assetlinks.json`):

  `42:6F:75:30:20:C6:34:E2:52:63:B9:0C:33:6C:A2:36:BA:F2:A3:EF:B0:68:62:A8:96:58:F6:BD:9A:C6:F0:A3`

Rebuild:

```bash
cd apps/pn-unlock
VITE_API_ENDPOINT=https://api.parnoir.com npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Install: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

Verify App Links after install: `adb shell pm get-app-links com.parnoir.unlock`

When switching to Play App Signing, append the Play cert SHA-256 to `assetlinks.json` (keep debug fingerprint for sideload QA).

## iOS (Xcode / TestFlight)

- Bundle id: `com.parnoir.unlock`
- Associated Domains: `applinks:unlock.parnoir.com` (`ios/App/App/App.entitlements`)
- Pods: `cd ios/App && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`
- Open: `npx cap open ios` then Archive → TestFlight / ad-hoc

**Blocker:** replace `TEAMID` in `public/.well-known/apple-app-site-association` with the Apple Developer Team ID, remove that path from `scripts/unlock-association-stub-allowlist.txt`, redeploy hosting, then Universal Links can verify.
