# Google Drive Storage Setup Guide

## Overview

This guide walks you through setting up Google Drive storage for permanent, user-owned media storage in the par Noir ecosystem.

## Benefits

- ✅ **Permanent Storage**: Files never expire (unlike temporary IPFS)
- ✅ **User-Owned**: You control your data completely
- ✅ **Zero Liability**: par Noir never stores your content
- ✅ **Encrypted**: Files encrypted with pN standard (Google can't read them)
- ✅ **Portable**: Works across all pN platforms
- ✅ **Fast Loading**: Google's global CDN for quick access
- ✅ **Familiar**: Everyone knows Google Drive

## Quick Setup (2 minutes)

### Step 1: Connect Google Account
1. Open your par Noir dashboard
2. Go to the Storage tab
3. Click "Setup Permanent Storage"
4. Click "Sign in with Google"
5. Complete Google OAuth authentication
6. Grant permissions to par Noir

### Step 2: Start Uploading
1. Your Google Drive is now connected
2. A "par-noir-media" folder is created in your Google Drive
3. Upload files through the Storage tab
4. Files are automatically encrypted and stored

## How It Works

### Encryption & Security
```
Your file → pN encryption → Encrypted blob → Google Drive
Google sees: "random encrypted data"
Google can't read: your actual file content
```

### File Access
```
You want to view file → Download encrypted blob → pN decrypts → You see original file
Google never sees: the original file content, names, or metadata
```

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
- Files stored in YOUR Google Drive
- par Noir never has access to your content
- You control all access permissions
- You pay Google directly for storage

## Cost Breakdown

### Google Drive Pricing
- **Free**: 15GB storage
- **Google One 100GB**: $1.99/month
- **Google One 200GB**: $2.99/month
- **Google One 2TB**: $9.99/month

### Example Costs
- **100GB storage**: $1.99/month
- **200GB storage**: $2.99/month
- **2TB storage**: $9.99/month

### Free Tier
- **15GB storage** free (shared across Gmail, Drive, Photos)
- **No API costs** (within reasonable limits)
- **No bandwidth costs** for downloads

## Performance Benefits

### Google's CDN Network
- ✅ **Global CDN** (content delivered from nearest server)
- ✅ **Fast download speeds** (Google's infrastructure)
- ✅ **Reliable uptime** (99.9%+ availability)
- ✅ **Automatic optimization** (Google handles caching, compression)

### Media Browser Experience
- ✅ **Fast thumbnail loading** (Google's image optimization)
- ✅ **Smooth video streaming** (Google's video CDN)
- ✅ **Quick file previews** (Google's preview generation)
- ✅ **Reliable access** (no "file not found" errors)

## Troubleshooting

### Authentication Failed
1. Make sure you're signed into the correct Google account
2. Check that popups are allowed for par Noir
3. Try clearing your browser cache and cookies
4. Ensure you have a stable internet connection

### Upload Failed
1. Check your Google Drive storage quota
2. Verify your internet connection
3. Try uploading smaller files first
4. Check if your Google account has any restrictions

### Files Not Accessible
1. Verify your pN identity is correct
2. Check file visibility settings
3. Ensure you're using the correct pN browser
4. Verify encryption keys are working

## Advanced Configuration

### Custom Google Client ID
If you want to use your own Google OAuth app:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add your domain to authorized origins
6. Use your Client ID in Integration Settings

### Folder Organization
Your files are organized in Google Drive:
```
Google Drive/
└── par-noir-media/
    ├── private/
    │   ├── encrypted-file-1.bin
    │   └── encrypted-file-2.bin
    ├── friends/
    │   └── encrypted-file-3.bin
    └── public/
        └── encrypted-file-4.bin
```

## Migration from Other Storage

### From IPFS
1. Export your files from IPFS
2. Set up Google Drive storage
3. Upload files to Google Drive
4. Update file references in pN metadata

### From Other Cloud Storage
1. Download files from your current provider
2. Set up Google Drive storage
3. Upload files to Google Drive
4. Update file references in pN metadata

## Support

### Google Support
- [Google Drive Help](https://support.google.com/drive/)
- [Google Drive API Documentation](https://developers.google.com/drive/api)
- [Google Cloud Console](https://console.cloud.google.com/)

### par Noir Support
- Check the Storage tab for setup walkthrough
- Use the Integration Settings for configuration
- Contact support if you need help

## Best Practices

### File Organization
- Use descriptive file names
- Set appropriate visibility levels
- Use tags for better organization
- Regularly clean up old files

### Security
- Keep your Google account secure
- Use 2-factor authentication
- Monitor your storage usage
- Set up billing alerts

### Performance
- Use appropriate file formats
- Compress large files when possible
- Use Google's built-in optimization
- Monitor your usage patterns

## Next Steps

Once you've set up Google Drive storage:

1. **Upload your first files** using the Storage tab
2. **Test different visibility levels** (private, friends, public)
3. **Explore the media browser** for public content
4. **Set up sharing** with your pN connections
5. **Monitor your usage** in Google Drive

Your files are now permanently stored, encrypted, and portable across all pN platforms with fast loading via Google's CDN!
