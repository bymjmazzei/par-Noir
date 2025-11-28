# Google Sheets API Setup Guide

## Why You Need This

The companion metadata system uses **Google Sheets** to store file metadata, engagement data (likes, comments, shares), and other information. Each uploaded file gets a companion metadata spreadsheet in the `_metadata` folder.

## Quick Setup

### Step 1: Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (Project ID: `43740774041` or your project)
3. Navigate to **"APIs & Services"** → **"Library"**
4. Search for **"Google Sheets API"**
5. Click on the **"Google Sheets API"** result
6. Click the **"Enable"** button
7. Wait a few minutes for the API to propagate (usually 1-2 minutes)

### Step 2: Verify API is Enabled

1. Go to **"APIs & Services"** → **"Enabled APIs"**
2. You should see both:
   - ✅ **Google Drive API** (for file operations)
   - ✅ **Google Sheets API** (for companion metadata)

### Step 3: Test the Setup

After enabling the API, try uploading a file again. The companion metadata sheet should be created automatically in the `_metadata` folder.

## Direct Link

You can use this direct link to enable the API for your project:
- **Project 43740774041**: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43740774041

## What Gets Created

When you upload a file, the system creates a Google Sheet named `${fileId}.metadata` in your `_metadata` folder with 4 tabs:

1. **Metadata** - File information (name, size, type, visibility, etc.)
2. **Likes** - Engagement tracking for likes
3. **Comments** - Engagement tracking for comments  
4. **Shares** - Engagement tracking for shares

## Troubleshooting

### Error: "Google Sheets API has not been used in project..."

**Solution**: Enable the Google Sheets API following Step 1 above.

### Error: "API not enabled" after enabling

**Solution**: Wait 2-3 minutes for the API to propagate, then try again.

### Can't find the API in Library

**Solution**: Make sure you're in the correct Google Cloud project. Check the project ID in the error message and select that project in the console.

## Cost

- **Google Sheets API**: Free (within quota limits)
- **Quota**: 500 requests per 100 seconds per user
- **For most use cases**: This is more than enough and completely free

## Related APIs

Make sure these are also enabled:
- ✅ **Google Drive API** - For file operations
- ✅ **Google Sheets API** - For companion metadata (this guide)

