# Custom Domain Setup for Firebase Hosting

## Issue
The custom domain `pn.parnoir.com` is not configured in Firebase Hosting, causing `ERR_CONNECTION_CLOSED` errors when accessing the site.

## Solution

### Option 1: Add Custom Domain via Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/project/par-noir-dashboard/hosting)
2. Select the `pn-parnoir` site
3. Click "Add custom domain"
4. Enter `pn.parnoir.com`
5. Follow the DNS verification steps:
   - Add the provided A record or CNAME to your DNS provider
   - Wait for DNS propagation (can take up to 48 hours)
   - Firebase will automatically provision SSL certificate

### Option 2: Use Firebase CLI

```bash
# Add custom domain
firebase hosting:sites:create pn-parnoir

# Note: Custom domains must be added via Firebase Console
# CLI doesn't support custom domain configuration directly
```

### Option 3: Use Default Firebase URL (Temporary)

Until the custom domain is configured, use:
- **Default URL**: `https://pn-parnoir.web.app`
- This URL works immediately and doesn't require DNS configuration

## DNS Configuration

Once you add the custom domain in Firebase Console, you'll need to:

1. **Get DNS records from Firebase Console**
   - Firebase will provide A records or CNAME records
   - Example: `151.101.1.195` (A record) or `pn-parnoir.web.app` (CNAME)

2. **Add DNS records to your domain provider**
   - Log in to your DNS provider (e.g., Cloudflare, GoDaddy, Namecheap)
   - Add the A record or CNAME for `pn.parnoir.com`
   - Wait for DNS propagation

3. **Verify in Firebase Console**
   - Firebase will automatically verify DNS
   - SSL certificate will be provisioned automatically

## Troubleshooting

### ERR_CONNECTION_CLOSED Error

This error occurs when:
- Custom domain is not configured in Firebase Hosting
- DNS is not pointing to Firebase
- DNS propagation hasn't completed yet

**Solution**: Use `https://pn-parnoir.web.app` until custom domain is configured.

### Check Current Status

```bash
# Check site configuration
firebase hosting:sites:get pn-parnoir

# List all sites
firebase hosting:sites:list
```

## Current Status

- ✅ Site deployed: `pn-parnoir`
- ✅ Default URL working: `https://pn-parnoir.web.app`
- ❌ Custom domain: `pn.parnoir.com` - **NOT CONFIGURED**

## Next Steps

1. Add `pn.parnoir.com` as custom domain in Firebase Console
2. Configure DNS records as provided by Firebase
3. Wait for DNS propagation and SSL certificate provisioning
4. Test access to `https://pn.parnoir.com`

