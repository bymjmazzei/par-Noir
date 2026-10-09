# Feed System Production Implementation Plan

## 📋 Overview

This document outlines the complete implementation plan to make the Feed System production-ready. The feed system allows users to create paid feeds, delegate access, and switch between their pN identity and feeds in the browser app.

### Services Tab Structure

The **Services Tab** (renamed from Developer Portal) consolidates all service-related features:

1. **Feed Services** - Create and manage paid feeds
2. **API Access** - API key activation via Veriff verification (replaces old license purchase)
3. **Developer Resources** - SDK documentation, quick start, data point proposals

**Key Changes:**
- ❌ Remove obsolete license purchase UI
- ✅ Add Feed Services section
- ✅ Integrate API key activation (LicenseModal)
- ✅ Keep Developer Resources (SDK docs, quick start)

## 🎯 Core Requirements

1. **Services Tab** - Rename Developer Portal to Services, add feed creation
2. **Feed Purchase Flow** - Payment → Veriff Verification → Feed Assignment
3. **Feed Google Drive Integration** - Each feed gets its own Google Drive folder
4. **Dashboard Navigation** - Add Feeds tab for feed management
5. **Browser Context Switcher** - Switch between pN and feeds (feeds as first-class contexts)
6. **Feed Delegation UI** - Delegate feed access to other pNs
7. **Feed Content Management** - Enhanced thought creator for feed posts

---

## 📦 Phase 1: Dashboard Updates - Services Tab Transformation

### 1.1 Transform Developer Portal → Services Tab

**Files to Modify:**
- `apps/id-dashboard/src/App.tsx` - Update tab label
- `apps/id-dashboard/src/hooks/useAppState.ts` - Update activeTab type
- `apps/id-dashboard/src/pages/DeveloperPortal.tsx` - Transform to `ServicesPortal.tsx`

**New Services Tab Structure:**
```
Services Tab
├── Feed Services Section
│   ├── Create Feed button
│   ├── My Feeds (owned + delegated)
│   └── Feed management
│
├── API Access Section
│   ├── API Key Status (Active/Inactive)
│   ├── Activate API Key button (opens Veriff)
│   └── API key display (when active)
│
└── Developer Resources Section
    ├── SDK Documentation links
    ├── Quick Start guide
    └── Data Point Proposals
```

**Changes:**
```typescript
// In App.tsx - Update tab button
<button onClick={() => setActiveTab('developer')}>
  Services  // Changed from "Developer Portal"
</button>

// In useAppState.ts - Keep type as 'developer' for backward compatibility
// But update UI labels everywhere

// Remove obsolete license purchase UI:
// - Remove "Purchase Commercial License" button
// - Remove license status banner (Open Source/Perpetual/Annual)
// - Remove license info loading logic
```

**Checklist:**
- [ ] Update tab label in `App.tsx` navigation
- [ ] Update page title/heading from "Developer Portal" to "Services"
- [ ] Remove obsolete license purchase button
- [ ] Remove license status banner
- [ ] Remove license info loading logic
- [ ] Add Feed Services section
- [ ] Add API Access section (integrate LicenseModal/API key activation)
- [ ] Keep Developer Resources section (SDK docs, quick start, data point proposals)
- [ ] Update any references in documentation
- [ ] Test tab navigation still works

---

### 1.2 Feed Management in Services Tab

**Note:** Feeds are now managed within the Services tab, not a separate tab.

**Files to Modify:**
- `apps/id-dashboard/src/pages/DeveloperPortal.tsx` (becomes Services tab)
- `apps/id-dashboard/src/components/feeds/FeedCreator.tsx`

**Feed Services Section Features:**
- Create Feed button → Opens FeedCreator modal
- My Feeds list:
  - Owned feeds
  - Delegated feeds (feeds user has access to)
- Feed management actions:
  - Edit feed settings
  - Delete feed
  - Delegate access
  - View subscribers
  - View statistics (subscribers, posts, etc.)

**Implementation:**
```typescript
// In DeveloperPortal.tsx (Services tab)
<section className="feed-services-section">
  <h2>Feed Services</h2>
  <button onClick={() => setShowFeedCreator(true)}>
    Create Feed
  </button>
  
  <div className="my-feeds">
    <h3>My Feeds</h3>
    {ownedFeeds.map(feed => (
      <FeedCard feed={feed} onEdit={...} onDelete={...} />
    ))}
    {delegatedFeeds.map(feed => (
      <FeedCard feed={feed} isDelegated={true} />
    ))}
  </div>
</section>
```

**Checklist:**
- [ ] Add Feed Services section to Services tab
- [ ] Integrate FeedService to load user's feeds
- [ ] Add "Create Feed" button that opens FeedCreator modal
- [ ] Display owned feeds list
- [ ] Display delegated feeds list
- [ ] Add feed management actions (edit, delete, delegate)
- [ ] Show feed statistics
- [ ] Handle empty state (no feeds)

---

### 1.3 Transform Developer Portal to Services Tab

**Files to Modify:**
- `apps/id-dashboard/src/pages/DeveloperPortal.tsx` - Transform to Services tab
- `apps/id-dashboard/src/components/feeds/FeedCreator.tsx`
- `apps/id-dashboard/src/components/LicenseModal.tsx` - Already handles API key activation

**New Services Tab Layout:**

**Section 1: Feed Services**
- Create Feed button → Opens FeedCreator modal
- My Feeds list (owned + delegated)
- Feed management actions

**Section 2: API Access**
- API Key Status display (Active/Inactive)
- Activate API Key button → Opens LicenseModal (Veriff verification)
- API key display (when active)
- API documentation links

**Section 3: Developer Resources**
- SDK Documentation links
- Quick Start guide
- Data Point Proposals

**Checklist:**
- [ ] Restructure DeveloperPortal.tsx into three sections
- [ ] Add Feed Services section with "Create Feed" button
- [ ] Integrate FeedCreator modal
- [ ] Add API Access section
- [ ] Integrate LicenseModal for API key activation
- [ ] Remove obsolete license purchase UI
- [ ] Keep Developer Resources section
- [ ] Update styling to match new structure
- [ ] Test all sections work correctly

---

### 1.4 API Access Section Integration

**Files to Modify:**
- `apps/id-dashboard/src/pages/DeveloperPortal.tsx` (Services tab)
- `apps/id-dashboard/src/components/LicenseModal.tsx` (already handles API key activation)

**API Access Section Features:**
- Display API key status (Active/Inactive)
- Show API key (masked if inactive, full if active)
- "Activate API Key" button → Opens LicenseModal with Veriff verification
- API documentation links
- Rate limit information
- Usage statistics (if available)

**Implementation:**
```typescript
// In DeveloperPortal.tsx (Services tab)
<section className="api-access-section">
  <h2>API Access</h2>
  
  {apiKey ? (
    <>
      <div className="api-key-status">
        {apiKey.isActive ? (
          <div className="status-active">
            <CheckCircle /> Active
            <button onClick={handleCopyKey}>Copy API Key</button>
          </div>
        ) : (
          <div className="status-inactive">
            <Shield /> Inactive
            <button onClick={() => setShowLicenseModal(true)}>
              Activate API Key
            </button>
          </div>
        )}
      </div>
      
      {apiKey.isActive && (
        <div className="api-key-display">
          <code>{apiKey.key}</code>
        </div>
      )}
    </>
  ) : (
    <div>Loading API key...</div>
  )}
  
  <LicenseModal
    isOpen={showLicenseModal}
    onClose={() => setShowLicenseModal(false)}
    authenticatedUser={authenticatedUser}
    onApiKeyActivated={(activatedKey) => {
      setApiKey(activatedKey);
      setShowLicenseModal(false);
    }}
  />
</section>
```

**Checklist:**
- [ ] Add API Access section to Services tab
- [ ] Load API key status on Services tab open
- [ ] Display API key status badge (Active/Inactive)
- [ ] Add "Activate API Key" button (opens LicenseModal)
- [ ] Integrate LicenseModal component
- [ ] Handle API key activation callback
- [ ] Display API key when active
- [ ] Add copy API key functionality
- [ ] Add API documentation links
- [ ] Show rate limit information
- [ ] Test API key activation flow

---

## 📦 Phase 2: Feed Purchase → Veriff Verification Flow

### 2.1 Payment Flow Integration

**Files to Modify:**
- `apps/id-dashboard/src/components/feeds/FeedCreator.tsx`
- `apps/id-dashboard/src/services/feeds/FeedSubscriptionService.ts`
- `api/src/server/modules/coinbaseWebhookHandler.ts`

**Flow:**
```
User creates feed → Sets pricing → Clicks "Create & Pay"
  ↓
Coinbase Commerce checkout opens
  ↓
User completes payment
  ↓
Webhook receives payment confirmation
  ↓
Create pending feed (status: 'pending_verification')
  ↓
Frontend detects payment success
  ↓
Automatically open Veriff verification modal
  ↓
User completes Veriff verification
  ↓
Generate verified identity ZKPs
  ↓
Activate feed (status: 'active')
  ↓
Assign feed ownership
  ↓
Create feed Google Drive folder
```

**Checklist:**
- [ ] Update FeedCreator to handle payment flow
- [ ] Add payment status tracking
- [ ] Update webhook handler to create pending feed
- [ ] Add payment success callback that triggers Veriff
- [ ] Integrate IdentityVerificationModal into feed creation flow
- [ ] Generate verified identity ZKPs after verification
- [ ] Activate feed after verification completes
- [ ] Handle payment failure scenarios
- [ ] Handle verification failure scenarios

---

### 2.2 Veriff Integration with Feed Creation

**Files to Modify:**
- `apps/id-dashboard/src/components/feeds/FeedCreator.tsx`
- `apps/id-dashboard/src/components/IdentityVerificationModal.tsx`
- `apps/id-dashboard/src/services/verifiedIdentityManager.ts`

**Changes:**
```typescript
// In FeedCreator.tsx
const handlePaymentSuccess = async (checkoutId: string) => {
  // Store pending feed creation data
  setPendingFeedData({ checkoutId, feedData });
  
  // Open Veriff modal automatically
  setShowVerificationModal(true);
};

const handleVerificationComplete = async (verifiedData: VerifiedIdentityData) => {
  // Generate ZKPs
  const zkps = verifiedData.dataPoints;
  
  // Create feed with verified identity
  const feed = await FeedService.createFeed({
    ...pendingFeedData.feedData,
    verificationId: verifiedData.verificationId,
    verifiedZKPs: zkps
  });
  
  // Create Google Drive folder
  await createFeedGoogleDriveFolder(feed.feedId);
  
  // Show success
  onFeedCreated(feed);
};
```

**Checklist:**
- [ ] Add verification modal state to FeedCreator
- [ ] Trigger verification modal after payment success
- [ ] Pass feed creation data to verification callback
- [ ] Store verified ZKPs with feed record
- [ ] Update feed status to 'active' after verification
- [ ] Handle verification failure (allow retry)
- [ ] Update database schema to store verification data

---

## 📦 Phase 3: Feed Google Drive Integration

### 3.1 Feed Folder Creation

**Files to Create:**
- `apps/id-dashboard/src/services/feeds/FeedGoogleDriveService.ts`

**Files to Modify:**
- `apps/id-dashboard/src/services/feeds/FeedService.ts`
- `api/src/server/modules/feedService.ts`

**Implementation:**
```typescript
// FeedGoogleDriveService.ts
export class FeedGoogleDriveService {
  /**
   * Create Google Drive folder for feed
   * Folder name: "par Noir - Feed: {feedId}"
   */
  static async createFeedFolder(
    feedId: string,
    feedName: string,
    accessToken: string
  ): Promise<string> {
    // Create folder in user's Google Drive
    // Return folder ID
  }
  
  /**
   * Get feed folder ID
   */
  static async getFeedFolderId(
    feedId: string,
    accessToken: string
  ): Promise<string | null> {
    // Search for feed folder
    // Return folder ID if found
  }
  
  /**
   * Upload content to feed folder
   */
  static async uploadToFeedFolder(
    feedId: string,
    file: File,
    accessToken: string
  ): Promise<StorageFile> {
    // Upload file to feed's Google Drive folder
  }
}
```

**Checklist:**
- [ ] Create FeedGoogleDriveService
- [ ] Implement createFeedFolder method
- [ ] Implement getFeedFolderId method
- [ ] Implement uploadToFeedFolder method
- [ ] Integrate folder creation into feed creation flow
- [ ] Store folder ID in feed record
- [ ] Handle folder creation errors
- [ ] Add folder ID to feed database schema

---

### 3.2 Feed Content Storage

**Files to Modify:**
- `apps/id-dashboard/src/components/feeds/EnhancedThoughtCreator.tsx`
- `apps/id-dashboard/src/services/storage/GoogleDriveBackend.ts`

**Changes:**
- When creating feed post, upload to feed's Google Drive folder
- Store feed post metadata with file reference
- Update feed post count

**Checklist:**
- [ ] Update EnhancedThoughtCreator to accept feedId
- [ ] Modify upload logic to use feed folder
- [ ] Update feed post creation to link to Google Drive file
- [ ] Update feed post count when content added
- [ ] Handle feed folder not found errors

---

## 📦 Phase 4: Browser Context Switcher

### 4.1 Context Switcher Component

**Files to Create:**
- `apps/aggregator-browser/src/components/ContextSwitcher.tsx`
- `apps/aggregator-browser/src/hooks/useAppContext.ts`

**Files to Modify:**
- `apps/aggregator-browser/src/App.tsx`

**Implementation:**
```typescript
// Context type
type AppContext = 
  | { type: 'pn', id: string, name: string, pnIdentifier: string }
  | { type: 'feed', id: string, name: string, feedId: string, isOwned: boolean }

// Context switcher component
<ContextSwitcherButton
  currentContext={activeContext}
  availableContexts={contexts}
  onContextChange={(context) => {
    setActiveContext(context);
    loadContextContent(context);
  }}
/>

// Context loading hook
const useAppContext = () => {
  const [activeContext, setActiveContext] = useState<AppContext | null>(null);
  const [availableContexts, setAvailableContexts] = useState<AppContext[]>([]);
  
  const loadContexts = async () => {
    // Load pN identity
    const pnContext = { type: 'pn', id: pnId, name: displayName, pnIdentifier };
    
    // Load owned feeds
    const ownedFeeds = await FeedService.getOwnedFeeds(pnId);
    const ownedFeedContexts = ownedFeeds.map(f => ({
      type: 'feed' as const,
      id: f.feedId,
      name: f.feedName,
      feedId: f.feedId,
      isOwned: true
    }));
    
    // Load delegated feeds
    const delegatedFeeds = await FeedService.getDelegatedFeeds(pnId);
    const delegatedFeedContexts = delegatedFeeds.map(f => ({
      type: 'feed' as const,
      id: f.feedId,
      name: f.feedName,
      feedId: f.feedId,
      isOwned: false
    }));
    
    setAvailableContexts([
      pnContext,
      ...ownedFeedContexts,
      ...delegatedFeedContexts
    ]);
  };
  
  return { activeContext, setActiveContext, availableContexts, loadContexts };
};
```

**Checklist:**
- [ ] Create ContextSwitcher component (button + dropdown)
- [ ] Create useAppContext hook
- [ ] Add context state management
- [ ] Load available contexts (pN + feeds)
- [ ] Display context switcher button in browser header
- [ ] Handle context selection
- [ ] Persist selected context
- [ ] Update UI when context changes

---

### 4.2 Context-Aware Content Loading

**Files to Modify:**
- `apps/aggregator-browser/src/App.tsx`
- `apps/aggregator-browser/src/components/FileStorageAggregator.tsx`

**Changes:**
```typescript
// In App.tsx
const loadContextContent = async (context: AppContext) => {
  if (context.type === 'pn') {
    // Load from pN's Google Drive folder
    // "par Noir - {pnIdentifier}"
    await loadPnContent(context.pnIdentifier);
  } else if (context.type === 'feed') {
    // Load from feed's Google Drive folder
    // "par Noir - Feed: {feedId}"
    await loadFeedContent(context.feedId);
  }
};

const loadFeedContent = async (feedId: string) => {
  // Get feed folder ID
  const folderId = await FeedGoogleDriveService.getFeedFolderId(feedId);
  
  // Load files from feed folder
  const files = await GoogleDriveBackend.listFiles(folderId);
  
  // Load feed posts
  const posts = await FeedService.getFeedPosts(feedId);
  
  // Update UI with feed content
  setIndexedFiles(files);
  setFeedPosts(posts);
};
```

**Checklist:**
- [ ] Create loadContextContent function
- [ ] Implement loadPnContent (existing logic)
- [ ] Implement loadFeedContent (new logic)
- [ ] Update file loading to use context
- [ ] Update feed post loading
- [ ] Update UI to reflect current context
- [ ] Handle context switching errors
- [ ] Clear previous context data when switching

---

### 4.3 Feed Content Display

**Files to Modify:**
- `apps/aggregator-browser/src/components/FullScreenFeed.tsx`
- `apps/aggregator-browser/src/App.tsx`

**Changes:**
- When context is a feed, show feed content instead of pN content
- Display feed top post
- Display feed posts
- Show feed branding (avatar, banner, bio)

**Checklist:**
- [ ] Update FullScreenFeed to handle feed context
- [ ] Display feed top post when in feed context
- [ ] Display feed posts in feed view
- [ ] Show feed branding (avatar, banner, bio)
- [ ] Update "Me" page to show feed profile when in feed context
- [ ] Handle feed content not found

---

## 📦 Phase 5: Feed Delegation UI

### 5.1 Feed Delegation Component

**Files to Create:**
- `apps/id-dashboard/src/components/feeds/FeedDelegationModal.tsx`

**Files to Modify:**
- `apps/id-dashboard/src/pages/FeedsPage.tsx`
- `api/src/server/modules/feedRoutes.ts`

**Features:**
- Delegate feed access to other pNs
- List current delegates
- Remove delegates
- Set delegate permissions (read, write, manage)

**Implementation:**
```typescript
// FeedDelegationModal.tsx
interface FeedDelegationModalProps {
  feedId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Features:
// - Input field for pN identifier to delegate to
// - Permission selection (read, write, manage)
// - List of current delegates
// - Remove delegate button
```

**Checklist:**
- [ ] Create FeedDelegationModal component
- [ ] Add "Delegate Access" button to feed management
- [ ] Implement delegate feed API endpoint
- [ ] Implement remove delegate API endpoint
- [ ] Implement list delegates API endpoint
- [ ] Store delegation in database
- [ ] Update feed access checks to include delegates
- [ ] Show delegates in feed management UI

---

### 5.2 Feed Delegation Backend

**Files to Modify:**
- `api/src/server/modules/feedService.ts`
- `api/src/server/modules/feedRoutes.ts`
- `api/migrations/add_feed_delegations.sql` (new)

**Database Schema:**
```sql
CREATE TABLE feed_delegations (
  delegation_id VARCHAR(255) PRIMARY KEY,
  feed_id VARCHAR(255) NOT NULL,
  owner_did VARCHAR(255) NOT NULL,
  delegate_did VARCHAR(255) NOT NULL,
  permissions VARCHAR(50)[] DEFAULT ARRAY['read'],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (feed_id) REFERENCES feeds(feed_id) ON DELETE CASCADE,
  UNIQUE(feed_id, delegate_did)
);
```

**Checklist:**
- [ ] Create feed_delegations table migration
- [ ] Implement delegateFeed method in FeedService
- [ ] Implement removeDelegate method
- [ ] Implement getDelegates method
- [ ] Add API routes for delegation
- [ ] Update feed access checks to include delegates
- [ ] Add permission checks (read, write, manage)

---

## 📦 Phase 6: Enhanced Thought Creator Integration

### 6.1 Feed Post Creation

**Files to Modify:**
- `apps/id-dashboard/src/components/feeds/EnhancedThoughtCreator.tsx`
- `apps/id-dashboard/src/services/feeds/FeedService.ts`

**Changes:**
- When creating feed post, use EnhancedThoughtCreator
- Upload media to feed's Google Drive folder
- Store post metadata with feed reference

**Checklist:**
- [ ] Update EnhancedThoughtCreator to accept feedId
- [ ] Modify upload logic to use feed folder
- [ ] Create feed post API endpoint
- [ ] Store post in database
- [ ] Link post to Google Drive files
- [ ] Update feed post count

---

### 6.2 Feed Top Post Management

**Files to Modify:**
- `apps/id-dashboard/src/pages/FeedsPage.tsx`
- `apps/id-dashboard/src/components/feeds/FeedCreator.tsx`

**Changes:**
- Allow editing feed top post
- Use EnhancedThoughtCreator for top post
- Update top post in database

**Checklist:**
- [ ] Add "Edit Top Post" button to feed management
- [ ] Open EnhancedThoughtCreator with existing top post
- [ ] Update top post API endpoint
- [ ] Save top post changes
- [ ] Refresh feed display after update

---

## 📦 Phase 7: Testing & Validation

### 7.1 Unit Tests

**Files to Create:**
- `apps/id-dashboard/src/services/feeds/__tests__/FeedService.test.ts`
- `apps/id-dashboard/src/components/feeds/__tests__/FeedCreator.test.tsx`
- `apps/aggregator-browser/src/components/__tests__/ContextSwitcher.test.tsx`

**Checklist:**
- [ ] Test feed creation
- [ ] Test feed payment flow
- [ ] Test Veriff integration
- [ ] Test feed Google Drive folder creation
- [ ] Test context switching
- [ ] Test feed delegation
- [ ] Test feed content loading

---

### 7.2 Integration Tests

**Checklist:**
- [ ] Test complete feed creation flow (payment → verification → creation)
- [ ] Test feed content upload and retrieval
- [ ] Test context switching in browser
- [ ] Test feed delegation flow
- [ ] Test feed subscription flow
- [ ] Test feed post creation with enhanced thought creator

---

### 7.3 E2E Tests

**Checklist:**
- [ ] User creates feed, pays, verifies, and gets feed
- [ ] User switches between pN and feed contexts
- [ ] User delegates feed access to another pN
- [ ] User creates feed post with enhanced thought creator
- [ ] User views feed content in browser

---

## 📦 Phase 8: Database Migrations

### 8.1 Feed Tables

**Files to Create:**
- `api/migrations/add_feed_system.sql`

**Tables Needed:**
- `feeds` (already exists, verify schema)
- `feed_posts` (already exists, verify schema)
- `feed_subscriptions` (already exists, verify schema)
- `feed_delegations` (new)
- `feed_google_drive_folders` (new, or add folder_id to feeds table)

**Checklist:**
- [ ] Verify feeds table schema
- [ ] Verify feed_posts table schema
- [ ] Verify feed_subscriptions table schema
- [ ] Create feed_delegations table
- [ ] Add google_drive_folder_id to feeds table
- [ ] Add verification_id to feeds table
- [ ] Add verified_zkps to feeds table
- [ ] Create indexes for performance

---

## 📦 Phase 9: Documentation

### 9.1 User Documentation

**Files to Create:**
- `docs/FEED_SYSTEM_USER_GUIDE.md`

**Content:**
- How to create a feed
- How to manage feed settings
- How to delegate feed access
- How to create feed posts
- How to switch between pN and feeds in browser

---

### 9.2 Developer Documentation

**Files to Create:**
- `docs/FEED_SYSTEM_DEVELOPER_GUIDE.md`

**Content:**
- Feed system architecture
- API endpoints
- Database schema
- Context switching implementation
- Google Drive integration

---

## 📦 Phase 10: Deployment

### 10.1 Pre-Deployment Checklist

**Checklist:**
- [ ] All migrations tested locally
- [ ] All API endpoints tested
- [ ] Frontend components tested
- [ ] Context switching tested
- [ ] Payment flow tested (test mode)
- [ ] Veriff integration tested (test mode)
- [ ] Google Drive integration tested
- [ ] Error handling tested
- [ ] Performance tested

---

### 10.2 Deployment Steps

**Checklist:**
- [ ] Run database migrations on production
- [ ] Deploy backend API updates
- [ ] Deploy frontend dashboard updates
- [ ] Deploy browser app updates
- [ ] Verify Coinbase Commerce webhook URL
- [ ] Verify Veriff webhook URL
- [ ] Test payment flow in production (small amount)
- [ ] Test feed creation in production
- [ ] Monitor error logs
- [ ] Monitor performance metrics

---

## 🎯 Priority Order

1. **Phase 1** - Dashboard Updates (Services tab, Feeds tab)
2. **Phase 2** - Payment → Veriff Flow (Critical for feed creation)
3. **Phase 3** - Feed Google Drive Integration (Required for content)
4. **Phase 4** - Browser Context Switcher (Core feature)
5. **Phase 5** - Feed Delegation UI (Important feature)
6. **Phase 6** - Enhanced Thought Creator Integration (Content creation)
7. **Phase 7** - Testing & Validation (Before production)
8. **Phase 8** - Database Migrations (Before deployment)
9. **Phase 9** - Documentation (Ongoing)
10. **Phase 10** - Deployment (Final step)

---

## 📊 Progress Tracking

### Overall Progress: 0/10 Phases Complete

- [ ] Phase 1: Dashboard Updates (Services Tab Transformation)
- [ ] Phase 2: Payment → Veriff Flow
- [ ] Phase 3: Feed Google Drive Integration
- [ ] Phase 4: Browser Context Switcher
- [ ] Phase 5: Feed Delegation UI
- [ ] Phase 6: Enhanced Thought Creator Integration
- [ ] Phase 7: Testing & Validation
- [ ] Phase 8: Database Migrations
- [ ] Phase 9: Documentation
- [ ] Phase 10: Deployment

---

## 🔧 Technical Notes

### Context Switching Architecture

Feeds are treated as first-class contexts alongside pN identities:
- Same interface, different data source
- Context determines which Google Drive folder to load
- Context determines which content to display
- Context determines which actions are available

### Google Drive Folder Structure

```
User's Google Drive/
  ├── par Noir - {pnIdentifier}/          (pN identity folder)
  │   ├── _metadata/
  │   └── [user files]
  │
  └── par Noir - Feed: {feedId}/          (feed folder)
      ├── _metadata/
      ├── top-post/
      └── [feed posts]
```

### Feed Status Flow

```
pending_payment → pending_verification → active → (cancelled/expired)
```

### Delegation Permissions

- `read` - Can view feed content
- `write` - Can create/edit feed posts
- `manage` - Can manage feed settings and delegates

---

## 🚨 Known Issues & Considerations

1. **Google Drive API Rate Limits**
   - Monitor API usage
   - Implement rate limiting
   - Add retry logic

2. **Veriff Verification Costs**
   - Each feed creation requires verification
   - Consider verification costs in pricing

3. **Feed Folder Permissions**
   - Ensure feed folders are accessible to delegates
   - May need to share folders via Google Drive API

4. **Context Switching Performance**
   - Cache context data
   - Lazy load feed content
   - Optimize Google Drive queries

5. **Payment Failure Handling**
   - Handle payment timeouts
   - Allow retry payment
   - Clean up pending feeds

---

## 📝 Next Steps

1. Review this plan with the team
2. Prioritize phases based on business needs
3. Assign tasks to developers
4. Set up project tracking (GitHub Issues, etc.)
5. Begin implementation with Phase 1

---

**Last Updated:** 2024-01-XX
**Status:** Planning Phase
**Owner:** [To be assigned]

