# Unlock broker ops checklist

Phishing-hardening on production devices is **not** claimed until every item below is done.

## Hosting

1. Firebase Hosting site `unlock-parnoir` + custom domain `unlock.parnoir.com` (TLS Connected)
2. Live association files return 200 with correct `Content-Type`:
   - `https://unlock.parnoir.com/.well-known/apple-app-site-association`
   - `https://unlock.parnoir.com/.well-known/assetlinks.json`

## Association (code + ops)

3. Apple Developer Team ID → replace `TEAMID` in `public/.well-known/apple-app-site-association`, then **remove** that path from `scripts/unlock-association-stub-allowlist.txt` (ratchet: `scripts/check-unlock-association-stubs.sh`)
4. iOS Associated Domains entitlement: `applinks:unlock.parnoir.com` (already in `App.entitlements`)
5. Android signing SHA-256 in `assetlinks.json` (debug fingerprint filled for internal APK; add Play App Signing cert before Play track)
6. Android intent-filter `autoVerify` for `https://unlock.parnoir.com` `/oauth` (already in `AndroidManifest.xml`)

## Builds + device QA

7. Internal TestFlight / Play internal or sideload debug APK — see `INTERNAL_BUILDS.md`
8. Verify: with app installed, opening `https://unlock.parnoir.com/oauth/consent?...` opens Unlock app
9. Verify: without app, same URL loads web SPA and completes unlock-proof mint
10. Vault: enroll after unlock; biometric re-open remints without re-entering factors

Do not treat public store submission paperwork as a code merge blocker. Do treat steps 3–10 as required before claiming phishing-hardening complete.
