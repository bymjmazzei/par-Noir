# Railway PostgreSQL Setup Guide

This guide explains how to set up PostgreSQL on Railway for the aggregator metadata service.

## Prerequisites

- Railway account (free tier works)
- Google Cloud Console account (for service account)

## Step 1: Add PostgreSQL to Railway

1. Go to your Railway project dashboard
2. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically create a PostgreSQL database
4. Railway will provide a connection string automatically via the `DATABASE_URL` environment variable

**No additional configuration needed!** Railway handles everything automatically.

**Note**: You don't need a separate API key for the Railway API server. The service account (configured in Step 2) provides all the authentication needed to scan Google Drive.

## Step 2: Set Up Google Service Account (Optional but Recommended)

The Google Drive sync service allows the API to automatically scan Google Drive for public files without requiring user authentication.

### 2.1 Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Navigate to **"IAM & Admin"** → **"Service Accounts"**
4. Click **"Create Service Account"**
5. Fill in:
   - **Name**: `parnoir-aggregator-sync`
   - **Description**: `Service account for aggregating public files from Google Drive`
6. Click **"Create and Continue"**
7. Skip role assignment (not needed), click **"Continue"**
8. Click **"Done"**

### 2.2 Enable Required Google APIs

You need to enable **both** Google Drive API and Google Sheets API:

**Enable Google Drive API:**
1. Go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Drive API"**
3. Click on it and click **"Enable"**

**Enable Google Sheets API (Required for Companion Metadata):**
1. In the same **"APIs & Services"** → **"Library"** page
2. Search for **"Google Sheets API"**
3. Click on it and click **"Enable"**
4. **Important**: This API is required for creating companion metadata sheets in the `_metadata` folder

### 2.3 Create and Download Key

1. Go back to **"IAM & Admin"** → **"Service Accounts"**
2. Click on the service account you just created
3. Go to **"Keys"** tab
4. Click **"Add Key"** → **"Create new key"**
5. Select **"JSON"** format
6. Click **"Create"** - the JSON file will download automatically

### 2.4 Configure Service Account Email in Dashboard

**Automatic**: The dashboard automatically shares folders with the service account when files are made public. You just need to configure the service account email.

1. Find the service account email (format: `parnoir-aggregator-sync@your-project.iam.gserviceaccount.com`)
   - It's in the JSON key file you downloaded: `"client_email": "parnoir-aggregator-sync@your-project.iam.gserviceaccount.com"`
   
2. Add environment variable to your dashboard build/deployment:
   - **Name**: `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - **Value**: The service account email (e.g., `parnoir-aggregator-sync@your-project.iam.gserviceaccount.com`)

**Note**: If this is not configured, folders won't be automatically shared, but the API sync service will still work if you manually share folders. The dashboard will log a warning but continue normally.

### 2.5 Add Service Account Key to Railway

1. Open the downloaded JSON key file
2. Copy the entire JSON content
3. Go to your Railway project
4. Add a new environment variable:
   - **Name**: `GOOGLE_SERVICE_ACCOUNT_KEY`
   - **Value**: Paste the entire JSON content (as a single line or multi-line string)

## Step 3: Environment Variables

### Railway API Server Environment Variables

Add these environment variables to your Railway project:

**Required:**
- `DATABASE_URL` - Automatically provided by Railway PostgreSQL service
- `MAILBOX_ROUTE_PEPPER` - High-entropy secret for opaque mailbox owner hashing (API throws if unset; no soft default)

**Optional (for Google Drive sync):**
- `GOOGLE_SERVICE_ACCOUNT_KEY` - JSON key from Google Cloud Console (see Step 2.5)
  - This provides all authentication needed - no API key required for the API server

### Dashboard Environment Variables (Firebase)

Add this environment variable to your dashboard build/deployment (Firebase Hosting):

**Optional (for automatic folder sharing):**
- `VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email from Step 2.4

**Note**: If this is not set, folders won't be automatically shared with the service account, but you can manually share them. The dashboard will log a warning but continue normally.

## Step 4: Verify Setup

After deployment, check the Railway logs:

1. Go to your Railway project
2. Click on the API service
3. View the logs

You should see:
```
✅ Database connection pool created
✅ Database schema initialized
🚀 Identity Protocol API Server running on port 3001
```

## How It Works

1. **Database**: Public feed metadata is stored in PostgreSQL (`aggregator_media`, `aggregator_thoughts`, `aggregator_collections`).
2. **Reconcile job**: Every 5 minutes the API aligns the cache with each owner's `public-file-index` (membership truth). Manual trigger: `POST /api/aggregator/metadata-index/reconcile`.
3. **Browser queries**: The aggregator browser calls the API; responses come from PostgreSQL (with short Redis/browser TTL).
4. **Writes**: Upload/delete via the API update storage, the owner's index, and the cache together.

## DMCA moderation (Gemini)

Optional bot DMCA screening runs before public indexing. Configure on the **API** Railway service:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | No | — | Google AI Studio key. If unset, DMCA checks **fail open** (content allowed). |
| `GOOGLE_DRIVE_API_KEY` | Recommended for public feed | — | Platform Google API key for OAuth-less public file `alt=media` fetch (not owner OAuth). Used by blind public-content proxy when `uc?export=download` is insufficient. |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Generative model for DMCA checks. Override if Google deprecates the default. |
| `DMCA_GATE_FAIL_MODE` | No | `open` | `open` = allow on API errors; `closed` = send to Prism review queue on errors. |

## Troubleshooting

### "Database connection failed"
- Check that `DATABASE_URL` is set in Railway
- Verify the PostgreSQL service is running in Railway

### Stale public feed after manual Drive folder delete
- Wait up to 5 minutes for the reconcile job, or call `POST /api/aggregator/metadata-index/reconcile`
- Hard-refresh the browser (aggregator-browser caches index responses ~60s)

### Reconcile skipped a user (auth)
- Owner Google OAuth may be expired; reconnect Drive in the dashboard
- Reconcile intentionally skips purge on auth errors to avoid false mass deletion

## Cost

- **Railway PostgreSQL**: Free tier (5GB storage) or ~$5/month for larger databases
- **Google Service Account**: Free
- **Total**: $0-5/month

