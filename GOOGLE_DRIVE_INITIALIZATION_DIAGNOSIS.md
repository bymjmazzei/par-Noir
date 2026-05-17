# Google Drive Initialization Diagnosis

## Issue
User reports not seeing any directory files on Google Drive after connecting.

## Expected Structure

When Google Drive is connected, the following structure should be created:

```
Google Drive Root
└── par Noir - {pnIdentifier}/
    ├── _metadata/
    │   ├── media/
    │   ├── thoughts/
    │   ├── collections/
    │   ├── connections.xlsx
    │   ├── notifications.xlsx
    │   ├── activity_ledger.xlsx
    │   ├── engagement.xlsx
    │   ├── messaging_ledger.xlsx
    │   ├── preferences.xlsx
    │   ├── zkp-data-points.xlsx
    │   ├── third-party-permissions.xlsx
    │   ├── followers.xlsx
    │   ├── following.xlsx
    │   ├── public-file-index.xlsx
    │   └── owner-file-index.xlsx
    ├── integrators/ (empty; created at setup; `integratorsRootId` cached in credentials)
    └── par-noir-messages/ (created on-demand)
```

## Root Causes

1. **Initialization never ran**: User connected Google Drive before initialization code existed
2. **Initialization failed silently**: Errors were caught and logged but not shown to user
3. **Looking in wrong location**: Files are in `par Noir - {pnIdentifier}/_metadata/` not at root
4. **Token/permission issues**: Google Drive API errors prevented folder creation

## Diagnosis Steps

### 1. Check Railway Logs
Look for initialization logs when credentials were saved:
- Search for: `[StorageCredentials PUT] Initializing folder structure`
- Check for: `[StorageCredentials PUT] Failed to initialize folder structure`
- Look for: `directoryBuilt: false` or `folderInitError` in responses

### 2. Check Google Drive
1. Go to Google Drive (drive.google.com)
2. Search for: `par Noir - pn-` (your pn identifier)
3. Check if the folder exists at root level
4. If folder exists, check inside for `_metadata` folder
5. If `_metadata` exists, check for Sheets files (connections.xlsx, etc.)
6. Confirm empty `integrators/` exists as a sibling of `_metadata` (per-app subfolders appear only after an L5 app is granted `cloud:app`)

### 3. Check API Response
When credentials are saved, the API returns:
```json
{
  "success": true,
  "directoryBuilt": true/false,
  "folderInitError": "error message if failed"
}
```

The dashboard doesn't currently check these fields, so errors may be hidden.

## Solution: Re-initialize

A new endpoint has been added to trigger re-initialization:

**POST `/api/storage/initialize/:identityId`**

### Usage

```bash
curl -X POST https://api.parnoir.com/api/storage/initialize/{your-pn-identifier} \
  -H "Authorization: Bearer {your-token}"
```

Or from the dashboard, you can call this endpoint to re-initialize your Google Drive structure.

### Manual QA (integrators cache)

1. Remove any duplicate stray `par Noir - …` folders in your test Drive (one-time cleanup).
2. Re-connect Drive or call `POST /api/storage/initialize/:identityId`.
3. Confirm empty `integrators/` exists under the canonical pN root (sibling to `_metadata`).
4. OAuth with `cloud:app` for an L5 client — only `integrators/{client_id}/` should be created; `GET /api/integrator/storage-root` should return stable ids without creating a second `integrators/` parent.

### What It Does

1. Finds or creates `par Noir - {pnIdentifier}` folder
2. Finds or creates `_metadata` folder inside it
3. Creates content class folders (media, thoughts, collections)
4. Creates all required Sheets files:
   - connections.xlsx
   - notifications.xlsx
   - activity_ledger.xlsx
   - engagement.xlsx
   - messaging_ledger.xlsx
   - preferences.xlsx
   - zkp-data-points.xlsx
   - third-party-permissions.xlsx
   - followers.xlsx
   - following.xlsx
   - public-file-index.xlsx
   - owner-file-index.xlsx
5. Creates messages folder structure

### Response

**Success:**
```json
{
  "success": true,
  "message": "Google Drive folder structure initialized successfully",
  "identityId": "pn-...",
  "metadataFolderId": "...",
  "pnFolderId": "..."
}
```

**Error:**
```json
{
  "error": "Failed to initialize Google Drive folder structure",
  "message": "error details",
  "details": "Check Railway logs for more details"
}
```

## Prevention

The dashboard should be updated to:
1. Check `directoryBuilt` and `folderInitError` in the response
2. Show a warning/error if initialization failed
3. Provide a button to trigger re-initialization
4. Show success message when initialization completes

## Next Steps

1. **Immediate**: Call the re-initialization endpoint to create missing files
2. **Short-term**: Update dashboard to check and display initialization status
3. **Long-term**: Add automatic retry logic for failed initializations
