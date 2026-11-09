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

## Push notifications (content-free, while locked)

After a biometric vault unlock the app registers its FCM token for every saved pN
(`POST /oauth/push/register`, signed per pN with its ML-DSA key; Key 1 / Key 2 never leave
the device). Notifications only say a category happened ("You have a new message");
tapping one opens that web app. Removing a saved pN unregisters it.

Firebase files are supplied locally and are gitignored:

- Android: put `google-services.json` in `android/app/`. `app/build.gradle` applies the
  google-services plugin only when the file exists.
- iOS:
  1. Put `GoogleService-Info.plist` in `ios/App/App/` and add it to the App target.
  2. In Xcode → Signing & Capabilities add **Push Notifications** and **Background Modes →
     Remote notifications** (adds `aps-environment` to the entitlements).
  3. Upload an APNs auth key (.p8) in Firebase → Project settings → Cloud Messaging.
  4. Add `pod 'FirebaseMessaging'` under `target 'App'` in `ios/App/Podfile`, then `pod install`.
  5. In `AppDelegate.swift`, configure Firebase and hand Capacitor the FCM token (the API
     sends through FCM, so the raw APNs token is not enough):

     ```swift
     import FirebaseCore
     import FirebaseMessaging

     // application(_:didFinishLaunchingWithOptions:)
     if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
         FirebaseApp.configure()
     }

     func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
         Messaging.messaging().apnsToken = deviceToken
         Messaging.messaging().token { token, error in
             if let error = error {
                 NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
             } else if let token = token {
                 NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
             }
         }
     }

     func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
         NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
     }
     ```

API environment (Cloud Run secrets, never committed):

- `GOOGLE_APPLICATION_CREDENTIALS` — Firebase service account for FCM sends.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:support@parnoir.com`) —
  Web Push for the browser apps. Generate once with `npx web-push generate-vapid-keys`.

Distribution stays internal: TestFlight and the Play internal track only.
