# Architecture Alignment: Browser Design vs Requirements

## Your Vision: Browser as Index Reference

**Core Concept:**
- Browser references indexes (doesn't store data)
- Shows content from decentralized network
- Feeds = curated subsets of public index
- Three creator tiers with different capabilities

**Key Principles:**
1. **Index-based, not storage-based** - Browser queries indexes, doesn't own data
2. **Decentralized** - Content lives on Google Drive/IPFS, browser just displays
3. **Feed = Filter/View** - Feeds are curated selections from public index
4. **Metadata-driven** - Uses metadata to filter/organize content

---

## What I've Built: Current Architecture

### ✅ **Correctly Aligned:**

1. **Metadata Index Querying**
   - Browser queries `/api/aggregator/metadata-index` 
   - Gets public files from centralized aggregator
   - Filters by rating, category, feed membership
   - ✅ **This is correct** - browser references index

2. **Feed as Filter/View**
   - Feeds are stored as metadata (`feedIds` in file metadata)
   - Feed posts table links files to feeds (just pointers)
   - ✅ **This is correct** - feeds are curated views

3. **Content Rating System**
   - Rating stored in file metadata
   - Client-side filtering by rating
   - ✅ **This is correct** - uses metadata

4. **Creator Tiers**
   - Free: Index of their media (search results page)
   - Feed: Branded feed page (curated feed)
   - Self-hosted: Export code for own site
   - ✅ **This aligns** with your vision

### ⚠️ **Potential Misalignment:**

1. **Engagement Storage (Likes/Comments)**
   - **What I built:** Centralized database table (`engagement`)
   - **Your vision:** Should engagement be decentralized?
   - **Question:** Where should likes/comments live?
     - Option A: In file metadata (decentralized)
     - Option B: Centralized database (what I built)
     - Option C: Separate decentralized service

2. **Feed Subscriptions**
   - **What I built:** Centralized database (`feed_subscriptions`)
   - **Your vision:** Should subscriptions be user-local only?
   - **Question:** Where should subscription state live?
     - Option A: localStorage only (user's browser)
     - Option B: Centralized (syncs across devices)
     - Option C: In pN metadata (decentralized)

3. **Feed Management**
   - **What I built:** Centralized database for feed definitions
   - **Your vision:** Feeds are just metadata filters?
   - **Question:** How should feeds be defined?
     - Option A: Feed = metadata filter (no separate storage)
     - Option B: Feed = stored definition with branding (what I built)
     - Option C: Feed = stored in creator's metadata

---

## Architecture Questions for Alignment

### 1. **Engagement (Likes/Comments/Shares)**

**Current:** Centralized database
```sql
engagement table:
- file_id, user_did, type, content, created_at
```

**Questions:**
- Should likes/comments be stored in file metadata?
- Or is centralized engagement okay for the browser?
- Do you want engagement to sync across all browsers viewing the same content?

**Your original request:** "they can like and comment" - but where should this data live?

### 2. **Feed Subscriptions**

**Current:** Centralized database
```sql
feed_subscriptions table:
- feed_id, user_did, subscribed_at
```

**Questions:**
- Should subscriptions be user-local (localStorage)?
- Or centralized to sync across devices?
- Or stored in pN metadata?

**Your original request:** "users can subscribe to feeds" - but where should subscription state live?

### 3. **Feed Definitions**

**Current:** Centralized database
```sql
feeds table:
- feed_id, feed_name, creator_did, branding, etc.
```

**Questions:**
- Should feed definitions be stored in creator's metadata?
- Or is centralized storage okay for feed discovery?
- Feed posts are just pointers (`feed_posts` table) - is this correct?

**Your original request:** "feed page acts as profile page" - so feed definition needs branding, which suggests storage somewhere.

### 4. **Upload Functionality**

**Current:** Direct Google Drive upload from browser

**Questions:**
- Is this aligned? You said "integrate dashboard upload"
- Should upload go through backend API or direct to Google Drive?
- After upload, metadata gets submitted to aggregator index - correct?

---

## Proposed Architecture (Based on Your Vision)

### **Browser Should:**
1. ✅ Query metadata index (already doing this)
2. ✅ Filter by rating/category/feed (already doing this)
3. ✅ Display content from decentralized storage (already doing this)
4. ✅ Show feeds as curated views (already doing this)

### **What Should Be Decentralized:**
- **File storage:** ✅ Already decentralized (Google Drive/IPFS)
- **File metadata:** ✅ Already in aggregator index
- **Feed membership:** ✅ Already in file metadata (`feedIds`)

### **What Might Need Centralization:**
- **Feed definitions:** Need branding, description, settings
  - Could be in creator metadata OR centralized for discovery
- **Engagement:** Likes/comments need to be visible to all
  - Could be in file metadata OR centralized for performance
- **Subscriptions:** User's feed list
  - Could be localStorage OR centralized for cross-device sync

---

## Recommendation: Hybrid Approach

**Keep Centralized:**
- Feed definitions (for discovery and branding)
- Engagement (for performance and cross-browser visibility)
- Subscriptions (for cross-device sync)

**Why:** These are "browser features" that enhance the experience but don't need to be decentralized. The core content and metadata remain decentralized.

**Alternative:** If you want everything decentralized:
- Feed definitions → Creator's metadata
- Engagement → File metadata or separate decentralized service
- Subscriptions → pN metadata or localStorage

---

## ✅ **CLARIFICATIONS RECEIVED:**

### 1. **Engagement Metrics** ✅
- **Decision:** Option A - Centralized database (current implementation)
- **Status:** ✅ Already implemented correctly
- **Rationale:** Most logical option for cross-browser visibility and performance

### 2. **pN Identity Metadata** ✅
- **Storage:** Encrypted and stored on IPFS
- **Media Metadata:** Stored on user's secure cloud (Google Drive)
- **Status:** ⚠️ Need to check API status and build if they don't exist yet

### 3. **Feed Subscriptions** ✅
- **Architecture:** 
  - Creator stores subscriber info on their Google Drive (`par-noir-media/feed-{feedId}-subscribers.json`)
  - Subscriber stores local reference in browser localStorage
  - Database maintains subscriber index for quick queries
- **Notifications:** Event A happens → triggers push notification
- **Status:** ✅ Complete - Creator hosts on Google Drive, subscriber stores local reference

### 4. **Secure Cloud Storage** ✅
- **Location:** Folder on pN's Google Drive (`par-noir-media`)
- **Encryption:** Files encrypted through pN before storage
- **Indexing:** Only indexed when made public
- **Status:** ⚠️ Need to check APIs and build if needed

### 5. **Feed Discovery** ✅
- **Type:** Feed index/catalogue (not a feed itself)
- **Structure:** Like a store with different sections:
  - Main categories → subcategories
  - Trending feeds
  - New feeds
  - Curated sections
- **Status:** ⚠️ Need to build feed discovery APIs and UI

### 6. **Comments Architecture** ✅
- **Ownership:** File owner has the content
- **Comments:** pN commentor references the content
- **Rationale:** Comments wouldn't exist without content; creator owns original content and hosts it
- **Status:** ⚠️ Need to update comment structure to reference file owner

---

## Updated Architecture Summary

**What's Decentralized:**
- ✅ File storage (Google Drive/IPFS)
- ✅ pN identity metadata (encrypted on IPFS)
- ✅ Media metadata (user's secure cloud - Google Drive)
- ✅ Feed subscriptions (creator's Google Drive, subscriber's localStorage)
- ✅ File metadata (aggregator index)
- ✅ Feed membership (in file metadata)

**What's Centralized:**
- ✅ Engagement data (likes/comments) - Option A confirmed
- ✅ Feed definitions (for discovery and branding)
- ✅ Creator subscriber index (new - tracks who subscribes to creator's feeds)

**What's Been Built:**
- ✅ IPFS storage for pN identity metadata (encrypted) - Services exist
- ✅ Google Drive secure cloud APIs (encrypted folder, index only when public) - APIs exist
- ✅ Feed subscription Google Drive storage - Creator hosts, subscriber stores local reference
- ✅ Creator subscriber index (database + Google Drive sync) - Complete
- ✅ Feed discovery APIs (categories, trending, new feeds) - Complete
- ✅ Comment architecture update (file owner owns content, commentor references) - Complete
- ✅ Feed discovery UI (catalogue/store interface) - COMPLETE
- ✅ Push notification system (event → notification) - COMPLETE

---

## Implementation Plan

### Phase 1: IPFS & Metadata Storage
1. Build IPFS service for pN identity metadata (encrypted)
2. Build Google Drive secure cloud APIs (encrypted folder management)
3. Update media metadata to store on user's secure cloud

### Phase 2: Feed Subscriptions & Subscriber Index
1. Add subscriber index table for creators
2. Implement feed subscription in pN metadata (IPFS)
3. Update subscription flow: User A → pN metadata (IPFS) → Creator B subscriber index

### Phase 3: Feed Discovery
1. Build feed discovery APIs (categories, trending, new)
2. Build feed discovery UI (catalogue/store interface)

### Phase 4: Comments & Notifications
1. Update comment architecture (file owner owns, commentor references)
2. Build push notification system (event triggers)

---

**Status:** Ready to implement based on clarifications above.

