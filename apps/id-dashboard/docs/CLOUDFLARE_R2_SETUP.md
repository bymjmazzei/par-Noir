# Cloudflare R2 Storage Setup Guide

## Overview

This guide walks you through setting up your own Cloudflare R2 storage for permanent, user-owned media storage in the par Noir ecosystem.

## Benefits

- ✅ **Permanent Storage**: Files never expire (unlike temporary IPFS)
- ✅ **User-Owned**: You control your data completely
- ✅ **Zero Liability**: par Noir never stores your content
- ✅ **Encrypted**: Files encrypted with pN standard
- ✅ **Portable**: Works across all pN platforms
- ✅ **Cost-Effective**: $0.015/GB/month (very affordable)

## Quick Setup (5 minutes)

### Step 1: Create Cloudflare Account
1. Go to [cloudflare.com](https://cloudflare.com)
2. Click "Sign Up" in the top right
3. Enter your email and create a password
4. Verify your email address
5. Complete your profile setup

### Step 2: Create R2 Bucket
1. Log into your Cloudflare dashboard
2. Go to "R2 Object Storage" in the sidebar
3. Click "Create bucket"
4. Name your bucket (e.g., "par-noir-media")
5. Choose your preferred region
6. Click "Create bucket"

### Step 3: Generate API Keys
1. Go to "My Profile" → "API Tokens"
2. Click "Create Token"
3. Use "Custom token" template
4. Set permissions: "Cloudflare R2:Edit"
5. Set account resources: "Include - All accounts"
6. Set zone resources: "Include - All zones"
7. Click "Continue to summary"
8. Click "Create Token"
9. Copy the token (you won't see it again!)

### Step 4: Configure in par Noir
1. Open your par Noir dashboard
2. Go to the Storage tab
3. Click "Setup Permanent Storage"
4. Follow the guided setup walkthrough
5. Paste your API keys when prompted
6. Test the connection
7. Complete setup

## Detailed Setup

### Finding Your Account ID

1. In your Cloudflare dashboard, look for "Account ID" in the right sidebar
2. Copy this ID - you'll need it for configuration

### Creating API Tokens

**Required Permissions:**
- Cloudflare R2:Edit
- Account: Include - All accounts
- Zone: Include - All zones

**Token Template:**
```
Permissions:
- Cloudflare R2:Edit

Account Resources:
- Include - All accounts

Zone Resources:
- Include - All zones
```

### Bucket Configuration

**Recommended Settings:**
- **Bucket Name**: `par-noir-media` (or your preferred name)
- **Region**: `auto` (automatic selection for best performance)
- **Public Access**: Disabled (files are encrypted anyway)

## Security Features

### pN Encryption Standard
- All files encrypted with your pN identity key
- Only you can decrypt your private files
- Public files encrypted but accessible via pN browser
- Friends files encrypted but accessible to pN connections

### Access Control
- **Private**: Only you can access
- **Friends**: Only your pN connections can access
- **Public**: Anyone can access via pN media browser

### Data Ownership
- Files stored in YOUR Cloudflare account
- par Noir never has access to your content
- You control all access permissions
- You pay Cloudflare directly for storage

## Cost Breakdown

### Cloudflare R2 Pricing
- **Storage**: $0.015/GB/month
- **Class A Operations**: $4.50/million requests
- **Class B Operations**: $0.36/million requests
- **Egress**: $0.09/GB (first 10GB free per month)

### Example Costs
- **100GB storage**: $1.50/month
- **1TB storage**: $15/month
- **10TB storage**: $150/month

### Free Tier
- **10GB storage** free per month
- **1 million Class A operations** free per month
- **10 million Class B operations** free per month
- **10GB egress** free per month

## Troubleshooting

### Connection Test Failed
1. Verify your API token has correct permissions
2. Check that your Account ID is correct
3. Ensure your bucket name matches exactly
4. Try regenerating your API token

### Upload Failed
1. Check your storage quota in Cloudflare
2. Verify your API token hasn't expired
3. Ensure your bucket exists and is accessible
4. Check your internet connection

### Files Not Accessible
1. Verify your pN identity is correct
2. Check file visibility settings
3. Ensure you're using the correct pN browser
4. Verify encryption keys are working

## Advanced Configuration

### Custom Domains
You can set up a custom domain for your R2 bucket:
1. Go to your bucket settings
2. Click "Custom Domains"
3. Add your domain
4. Configure DNS records as instructed

### CORS Configuration
For web access, you may need to configure CORS:
```json
[
  {
    "AllowedOrigins": ["https://parnoir.com", "https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### Lifecycle Rules
Set up automatic cleanup rules:
1. Go to your bucket settings
2. Click "Lifecycle"
3. Add rules for automatic deletion of old files
4. Configure based on your needs

## Migration from Other Storage

### From IPFS
1. Export your files from IPFS
2. Set up Cloudflare R2
3. Upload files to R2
4. Update file references in pN metadata

### From Other Cloud Storage
1. Download files from your current provider
2. Set up Cloudflare R2
3. Upload files to R2
4. Update file references in pN metadata

## Support

### Cloudflare Support
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Cloudflare Community](https://community.cloudflare.com/)
- [Cloudflare Support](https://support.cloudflare.com/)

### par Noir Support
- Check the Storage tab for setup walkthrough
- Use the Integration Settings for configuration
- Contact support if you need help

## Best Practices

### File Organization
- Use descriptive file names
- Organize files in folders by type/date
- Set appropriate visibility levels
- Use tags for better organization

### Security
- Keep your API tokens secure
- Regularly rotate your API tokens
- Monitor your storage usage
- Set up billing alerts

### Performance
- Use appropriate file formats
- Compress large files when possible
- Use CDN for frequently accessed files
- Monitor your usage patterns

## Next Steps

Once you've set up Cloudflare R2 storage:

1. **Upload your first files** using the Storage tab
2. **Test different visibility levels** (private, friends, public)
3. **Explore the media browser** for public content
4. **Set up sharing** with your pN connections
5. **Monitor your usage** in Cloudflare dashboard

Your files are now permanently stored, encrypted, and portable across all pN platforms!
