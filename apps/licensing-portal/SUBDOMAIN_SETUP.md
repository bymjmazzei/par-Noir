# Setting up licensing.parnoir.com

These steps connect the custom subdomain **licensing.parnoir.com** to the licensing-portal app so the splash page is live after deploy.

## Prerequisites

- Firebase project already has hosting with the **licensing** target (see root `firebase.json` and `.firebaserc`).
- You have access to the Firebase Console and to DNS for **parnoir.com**.

## 1. Add the site in Firebase (if not already)

1. Open [Firebase Console](https://console.firebase.google.com) and select your project.
2. Go to **Hosting**.
3. If you use multiple sites, ensure there is a site for the licensing app. The target in this repo is **licensing** and maps to a site (e.g. **licensing-parnoir** in `.firebaserc`).
4. If the site does not exist yet:
   - Click **Add another site**.
   - Use a site ID that matches what you have in `.firebaserc` under `targets` → `licensing` (e.g. `licensing-parnoir`).
   - Create the site.

## 2. Connect the custom domain

1. In **Hosting**, select the **licensing** site (the one that serves `apps/licensing-portal/dist`).
2. Click **Add custom domain**.
3. Enter: **licensing.parnoir.com**
4. Follow the wizard. Firebase will show you either:
   - **A records** (two IPs to add), or
   - A **CNAME** target (e.g. `licensing-parnoir.web.app` or similar) and host **licensing** (or **licensing.parnoir.com** depending on your DNS host).

## 3. Add DNS records

In your DNS provider for **parnoir.com**:

- **If Firebase gave you A records:** Create two A records for **licensing** (or **licensing.parnoir.com**) pointing to the two IPs Firebase provided.
- **If Firebase gave you a CNAME:** Create a CNAME record:
  - **Name/host:** `licensing` (so the full name is `licensing.parnoir.com`)
  - **Value/target:** the hostname Firebase shows (e.g. `licensing-parnoir.web.app` or the exact value from the console)

Save the records. Propagation can take a few minutes up to 48 hours.

## 4. Verify in Firebase

1. Back in Hosting → custom domains, Firebase will show **Pending** until DNS is correct.
2. When verification succeeds, the domain will show as **Connected** and SSL will be provisioned (HTTPS).

## 5. Deploy the app

From the repo root:

```bash
cd apps/licensing-portal && npm run build
cd ../..
firebase deploy --only hosting
```

Or use the root deploy script (builds all apps including licensing-portal):

```bash
./deploy.sh
```

After deploy, open **https://licensing.parnoir.com** to confirm the splash page loads.

## Troubleshooting

- **Domain not verifying:** Double-check the CNAME or A records; ensure the host is exactly `licensing` (for `licensing.parnoir.com`).
- **Wrong site after deploy:** Confirm in `firebase.json` that the **licensing** target’s `public` is `apps/licensing-portal/dist`, and that `firebase deploy --only hosting` deploys all targets (or at least the one mapped to the licensing site).
- **404 on refresh:** The app is an SPA; the hosting config should have a rewrite `** → /index.html` (already in `firebase.json` for the licensing target).
