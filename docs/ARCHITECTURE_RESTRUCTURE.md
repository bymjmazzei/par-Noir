# Architecture Restructure: Fully Decentralized Approach

## Core Philosophy
**Users own everything. Platform is just a portal.**
- Users generate their own data points from interactions
- Data lives in metadata (file metadata, pN metadata)
- Platform provides portal/interface, not storage
- Users broker their aggregate data via ZKPs

---

## 1. Engagement: Decentralized Metrics + pN Tracking

### Current (Wrong):
```sql
engagement table (centralized)
- file_id, user_did, type, content, created_at
```

### Correct Architecture:

**A. Engagement Metrics (in file metadata):**
```json
{
  "fileId": "pn-123",
  "metadata": {
    "engagement": {
      "views": 1250,        // Tally - accumulates
      "likes": 45,          // Tally - accumulates  
      "shares": 12,         // Tally - accumulates
      "comments": 8         // Tally - accumulates
    }
  }
}
```
- Stored in file's companion metadata file
- Updated when engagement happens
- Anyone can read, only owner can write

**B. User Actions (in pN metadata):**
```json
{
  "pnIdentifier": "user123",
  "metadata": {
    "engagement": {
      "liked": ["file1", "file2", "file3"],
      "shared": ["file1", "file5"],
      "commented": [
        {
          "fileId": "file1",
          "commentId": "comment-123",
          "content": "Great post!",
          "timestamp": "2024-01-01T00:00:00Z"
        }
      ]
    }
  }
}
```
- Stored in user's pN metadata
- User owns their engagement history
- Can be referenced/exported via ZKPs

**Implementation:**
- Remove centralized `engagement` table
- Update file metadata when engagement happens
- Store user actions in pN metadata
- Browser queries both to show engagement state

---

## 2. Feed Subscriptions: Handshake Model

### Current (Wrong):
```sql
feed_subscriptions table (centralized)
- feed_id, user_did, subscribed_at
```

### Correct Architecture:

**A. Feed's Subscriber Index (in feed metadata):**
```json
{
  "feedId": "feed-123",
  "metadata": {
    "subscribers": [
      {
        "pnIdentifier": "user1",
        "subscribedAt": "2024-01-01T00:00:00Z"
      },
      {
        "pnIdentifier": "user2", 
        "subscribedAt": "2024-01-02T00:00:00Z"
      }
    ]
  }
}
```

**B. User's Feed Subscriptions (in pN metadata):**
```json
{
  "pnIdentifier": "user1",
  "metadata": {
    "subscriptions": [
      {
        "feedId": "feed-123",
        "subscribedAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

**Handshake Process:**
1. User subscribes → Add to their pN metadata + notify feed owner
2. Feed owner adds subscriber → Add to feed metadata
3. Both maintain their own index
4. Browser queries both to show subscription state

**Implementation:**
- Remove centralized `feed_subscriptions` table
- Store subscriptions in pN metadata
- Store subscriber list in feed metadata (creator's metadata)
- Browser queries both to determine subscription state

---

## 3. Feed Definitions: Creator Metadata

### Current (Wrong):
```sql
feeds table (centralized)
- feed_id, feed_name, creator_did, branding, etc.
```

### Correct Architecture:

**Feed Definition (in creator's pN metadata):**
```json
{
  "pnIdentifier": "creator123",
  "metadata": {
    "feeds": [
      {
        "feedId": "feed-123",
        "feedName": "My Curated Feed",
        "feedCategory": "beauty-fashion",
        "feedDescription": "Best beauty content",
        "feedRatingRange": ["GA", "FF", "T13+"],
        "branding": {
          "bannerImage": "https://...",
          "avatar": "https://...",
          "bio": "Beauty influencer"
        },
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

**Implementation:**
- Remove centralized `feeds` table
- Store feed definitions in creator's pN metadata
- Browser queries creator metadata to discover feeds
- Feed posts are still in file metadata (`feedIds` array)

---

## 4. Upload: Dashboard Secure Cloud Flow

### Current (Partially Wrong):
- Direct Google Drive upload from browser
- Doesn't use dashboard's secure cloud flow
- No proper pN authentication token

### Correct Architecture:

**Flow:**
1. User unlocks pN in browser
2. Generate authenticated user token (JWT or similar)
3. Use token to connect to secure cloud (same as dashboard)
4. Upload modal = clone of dashboard's secure cloud upload modal
5. Upload goes through secure cloud APIs (reusable)

**APIs Needed:**
```
POST /api/storage/secure-cloud/connect
  - Uses pN authentication token
  - Returns secure cloud session

POST /api/storage/secure-cloud/upload
  - Uses secure cloud session
  - Handles encryption, metadata, etc.
  - Same flow as dashboard

GET /api/storage/secure-cloud/files
  - List user's files
  - Filter by visibility, etc.
```

**Implementation:**
- Create secure cloud APIs (reusable across tools)
- Update upload modal to use secure cloud flow
- Generate pN auth token on unlock
- Reuse dashboard's secure cloud components/logic

---

## Database Schema Changes

### Remove These Tables:
- ❌ `engagement` - Move to file metadata + pN metadata
- ❌ `feed_subscriptions` - Move to feed metadata + pN metadata  
- ❌ `feeds` - Move to creator pN metadata
- ✅ Keep `feed_posts` - Still needed to link files to feeds (pointers)

### Keep These Tables:
- ✅ `aggregator_metadata` - Central index (this is the portal's index)
- ✅ `feed_posts` - Links files to feeds (just pointers, not ownership)
- ✅ `third_party_indexers` - For third-party API access
- ✅ `storage_credentials` - Encrypted storage metadata

---

## API Changes Needed

### Remove:
- ❌ `/api/engagement/*` endpoints (move to metadata updates)
- ❌ `/api/feeds/*` endpoints (move to pN metadata queries)
- ❌ `/api/feeds/:feedId/subscribe` (move to metadata handshake)

### Add:
- ✅ `/api/pn/:identifier/metadata` - Get pN metadata
- ✅ `/api/pn/:identifier/metadata/update` - Update pN metadata
- ✅ `/api/storage/secure-cloud/*` - Secure cloud APIs
- ✅ `/api/metadata/:fileId/engagement` - Update engagement metrics
- ✅ `/api/metadata/:fileId/comments` - Get comments (from pN metadata)

---

## Implementation Plan

### Phase 1: Engagement Restructure
1. Remove centralized engagement table
2. Create engagement metrics update API (updates file metadata)
3. Store user actions in pN metadata
4. Update frontend to query both sources

### Phase 2: Subscription Restructure  
1. Remove centralized subscriptions table
2. Implement handshake: update both pN metadata and feed metadata
3. Update frontend to query both sources

### Phase 3: Feed Definition Restructure
1. Remove centralized feeds table
2. Store feed definitions in creator pN metadata
3. Update feed discovery to query creator metadata
4. Keep feed_posts table (just pointers)

### Phase 4: Secure Cloud Integration
1. Create secure cloud APIs (reusable)
2. Generate pN auth token on unlock
3. Clone dashboard's secure cloud upload modal
4. Integrate into browser

---

## Questions for Clarification

1. **Engagement Metrics Update:**
   - Who can update file metadata engagement metrics?
   - Only file owner? Or anyone who views/likes?
   - Should updates go through aggregator API or directly to metadata?

2. **pN Metadata Storage:**
   - Where is pN metadata stored?
   - Is there a pN metadata service/API already?
   - Or do we need to create one?

3. **Feed Handshake:**
   - When user subscribes, how does feed owner get notified?
   - Push notification? Or poll their metadata?
   - Should browser handle the handshake or backend?

4. **Secure Cloud APIs:**
   - Should these be in the main API server?
   - Or separate service?
   - What's the current secure cloud implementation in dashboard?

Please clarify these so I can implement correctly.

