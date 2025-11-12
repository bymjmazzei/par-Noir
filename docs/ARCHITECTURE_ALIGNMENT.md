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

## Questions for You:

1. **Engagement:** Should likes/comments be:
   - A) Centralized database (current)
   - B) In file metadata (decentralized)
   - C) Separate decentralized service

2. **Subscriptions:** Should feed subscriptions be:
   - A) Centralized database (current - syncs across devices)
   - B) localStorage only (user's browser)
   - C) In pN metadata (decentralized)

3. **Feed Definitions:** Should feed info (name, branding, description) be:
   - A) Centralized database (current - for discovery)
   - B) In creator's metadata (decentralized)
   - C) Just metadata filters (no storage needed)

4. **Upload:** Is direct Google Drive upload from browser correct, or should it go through backend API?

5. **Overall:** Is the hybrid approach (decentralized content + centralized browser features) acceptable, or do you want everything decentralized?

---

## Current State Summary

**What's Decentralized (Correct):**
- ✅ File storage (Google Drive/IPFS)
- ✅ File metadata (aggregator index)
- ✅ Feed membership (in file metadata)

**What's Centralized (Needs Your Input):**
- ⚠️ Engagement data (likes/comments)
- ⚠️ Feed subscriptions
- ⚠️ Feed definitions (branding, settings)

**What's Client-Side Only:**
- ✅ User preferences (rating filters)
- ✅ UI state

Please clarify which approach you prefer so I can align the architecture correctly.

