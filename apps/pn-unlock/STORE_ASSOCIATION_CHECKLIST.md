# Unlock broker ops checklist (non-merge)

Fill before claiming Universal/App Links phishing-hardening on production devices:

1. Firebase Hosting site `unlock-parnoir` + custom domain `unlock.parnoir.com`
2. Apple Developer Team ID → replace `TEAMID` in `public/.well-known/apple-app-site-association`
3. iOS Associated Domains entitlement: `applinks:unlock.parnoir.com`
4. Android signing SHA-256 → `assetlinks.json`; intent-filter `autoVerify` for `https://unlock.parnoir.com`
5. Internal TestFlight / Play internal track install smoke
6. Verify: with app installed, opening `https://unlock.parnoir.com/oauth/consent?...` opens Unlock app
7. Verify: without app, same URL loads web SPA and completes unlock-proof mint

Do not treat store submission itself as a code merge blocker.
