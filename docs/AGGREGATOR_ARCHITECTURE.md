# Aggregator Architecture: Hybrid Cache Approach

## Overview

The aggregator uses a **hybrid cache architecture** where Google Drive is the source of truth and the database acts as a performance cache. This maintains decentralization principles while providing fast query performance.

## Architecture Diagram

```
┌─────────────────┐
│  Google Drive   │ ← Source of Truth (decentralized, user-owned)
│  (public-file-  │
│   index.xlsx)   │
└────────┬────────┘
         │
         │ Sync Service (periodic + on-demand)
         │ Reads from Google Drive → Updates cache
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │ ← Performance Cache (fast queries)
│   Database      │
└────────┬────────┘
         │
         │ API Queries
         │ Fast reads from cache
         │
         ▼
┌─────────────────┐
│  Browser/Feed   │
│     UI          │
└─────────────────┘
```

## Core Principles

### 1. Google Drive is the Source of Truth

- **User-owned data**: All public file metadata lives in each user's Google Drive
- **File location**: `par Noir - pn-{hash}/_metadata/public-file-index.xlsx`
- **Format**: Google Sheets (`.xlsx`) for scalability and queryability
- **Ownership**: Users control their data - they can delete, modify, or restore files

### 2. Database is a Performance Cache

- **Purpose**: Fast queries for feeds, search, and filtering
- **Storage**: PostgreSQL database (`aggregator_media`, `aggregator_thoughts`, `aggregator_collections`)
- **Lifecycle**: Automatically synced from Google Drive, cleaned up when files are deleted
- **Not authoritative**: If there's a conflict, Google Drive wins

### 3. Sync Service Keeps Cache Fresh

- **Frequency**: Runs periodically (default: every 10 minutes)
- **Process**:
  1. Scans Google Drive for all pN folders
  2. Reads `public-file-index.xlsx` from each user's `_metadata` folder
  3. Upserts metadata to database (updates existing, inserts new)
  4. Cleans up orphaned files (in DB but not in Google Drive)

## Data Flow

### When Files Are Uploaded/Updated via API

1. **API receives update** → Updates database cache immediately
2. **Also updates Google Drive index** → Keeps source of truth in sync
3. **Cache invalidation** → Ensures fresh data on next query

### When Files Are Deleted

1. **User deletes from Google Drive** → Removed from `public-file-index.xlsx`
2. **Next sync cycle** → Sync service detects missing file
3. **Cleanup** → Removes orphaned file from database cache

### When Folders Are Deleted

1. **User deletes entire folder** → Folder no longer exists in Google Drive
2. **Next sync cycle** → Sync service can't find folder
3. **Cleanup** → Removes all files for that user from database cache

### When Folders Are Restored

1. **User restores folder from trash** → Folder and index file restored
2. **Next sync cycle** → Sync service finds folder, reads index
3. **Re-sync** → Files are re-inserted into database cache

## Cleanup Logic

The sync service implements smart cleanup to remove orphaned files:

### Case 1: Successfully Scanned Users

- **What**: Users whose Google Drive index was successfully read
- **Action**: Compare database files vs Google Drive files
- **Result**: Remove individual orphaned files (in DB but not in Google Drive)

### Case 2: Users Whose Folders Don't Exist

- **What**: Users whose folders can't be found in Google Drive
- **Action**: All files for that user are orphaned (folder was deleted)
- **Result**: Remove ALL files for that user from database

### Safety Measures

- **Temporary access issues**: If a folder exists but index can't be read (permission issue, temporary outage), skip cleanup for that user (safe default)
- **Order of operations**: Cleanup runs AFTER sync/upsert, so restored files are added before cleanup

## API Updates

When files are updated via API endpoints:

### PUT /api/aggregator/metadata-index/:fileId

1. Updates database cache
2. Also updates Google Drive `public-file-index.xlsx` (if file is public)
3. Invalidates cache for fresh queries

### POST /api/aggregator/metadata-index

1. Adds to database cache
2. Also adds to Google Drive `public-file-index.xlsx` (if file is public)
3. Invalidates cache for fresh queries

This ensures both the cache and source of truth stay in sync.

## Performance Considerations

### Why Use a Database Cache?

- **Google Drive API limits**: ~1000 requests per 100 seconds
- **Query performance**: Database queries are much faster than reading hundreds of Google Sheets
- **Complex filtering**: Database can efficiently filter by tags, categories, feeds, etc.
- **Scalability**: Can handle thousands of users and millions of files

### Trade-offs

- **Staleness**: Cache may be up to 10 minutes old (sync interval)
- **Storage**: Database duplicates data (but it's just metadata, not files)
- **Complexity**: Need to keep cache and source of truth in sync

## Error Handling

The sync service handles various error scenarios gracefully:

- **No metadata folder**: Expected for new users, skip silently
- **No public files**: Expected if user has no public content, skip silently
- **Permission issues**: Log warning, skip user (might be temporary)
- **Corrupted index**: Log warning, skip user (user can fix manually)
- **Temporary outages**: Log warning, skip user (will retry on next sync)

## Migration Notes

- **No breaking changes**: Existing API endpoints work the same
- **Backward compatible**: Old data remains valid
- **Automatic cleanup**: Orphaned files are cleaned up on next sync cycle
- **No user action required**: System handles everything automatically

## Future Improvements

- **Real-time sync**: Webhooks or push notifications for immediate cache updates
- **Selective sync**: Only sync changed files instead of full scan
- **Distributed cache**: Redis or similar for even faster queries
- **Compression**: Store metadata more efficiently in database
