# Browser App Redesign Plan: TikTok-Style Feed Experience

## Overview
Complete redesign of the browser app (`browse.parnoir.com`) to match TikTok-style full-screen vertical feed experience with horizontal feed switching, discovery page, and comprehensive content interaction features.

## Vision Summary

### Core Feed Experience (TikTok-Style)
- **Full-screen vertical media only** - No grid view in main feed
- **Swipe up/down** = Next/previous media (snap behavior)
- **Swipe left/right** = Switch between feed categories
- **Top menu bar** slides to show current feed title

### Feed Hierarchy

#### Locked Users:
1. **Public Index** (default)
2. Swipe right → 20 niche feeds

#### Unlocked Users:
1. **Curated Feed** (default) = All pNs/feeds they're fans of
2. Swipe right → **Public Index**
3. Swipe right → **Subscribed Feeds**
4. Swipe left → **Discovery Page** (YouTube-style grid with tiles, categories, info buttons)

### UI Elements
- **Engagement buttons**: Bottom right (like TikTok)
- **Bottom nav**: Search + Home (locked) | + Upload (unlocked) | Messages/Notifications tabbed
- **Top right**: Feed icon (for paid feed curators) → Their feed/profile page

### User Tiers
- **Consumer** (free): No personal page/feed, can upload content
- **Feed Curator** (paid): Subscribable feed + feed icon in top right
- **Community** (self-host): Feed + self-hosted community tools

---

## Detailed Requirements

### 1. Search Functionality
- **Scope**: Public content + user's personal history
- **Leverage**: Semantic web metadata system for accurate results
- **Results Format**: 3-wide grid, no gaps, thumbnail tiles stacked
- **Filters**: 
  - Simple sort (date, popularity, relevance)
  - Advanced filters (robust filtering options)

### 2. Content Interaction
- **Comments**: Slide-up overlay modal
- **Sharing**: Copy link, share to feed, external share
- **Save**: Creates private curated feed (only visible to curator)
- **Playback Controls**: 
  - Pause
  - System volume
  - 2x speed option
  - Captions (auto-generated or user-provided)

### 3. Feed Management
- **Subscribe/Unsubscribe**: Button in caption area (includes creator icon → their index/feed)
- **Upload Access**: All unlocked users can upload
- **Feed Curation**: Only paid users can curate feeds (differentiator)
- **Autoplay**: Feeds autoplay by default

### 4. Discovery Page
- **Categories**: Trending, New Creators, Featured, Classics, Niches
- **Navigation**: Tiles go to content/feed/community
- **Structure**: Work on structure first, details later

### 5. Creator Feed Page
- **View Toggle**: Full-screen ↔ Grid view
- **Customizable Header**: Profile-like section
- **Own Feeds**: View their own feeds
- **Statistics**: Robust stats (views, engagement, subscribers, growth trends)

### 6. Upload Flow
- **Source**: Drive encrypted folder OR upload to Drive via platform
- **Methods**: Drag-drop + file picker
- **Metadata**: Editable post-upload (except metrics)
- **No Drafts**: Completed content only, no editor

### 7. Messages
- **Type**: DMs only (no groups for now)
- **Requests**: Open requests, require authorization to accept
- **Media Sharing**: Via cloud (not device)
- **Read Receipts**: Show read status

### 8. Notifications
- **Types**: Likes, comments, follows, messages, feed updates
- **Control**: Granular control on all notifications
- **Delivery**: WebSocket (real-time, efficient) with polling fallback

### 9. Onboarding
- **Tutorial**: None (natural flow from familiar apps)
- **First Unlock**: → Public index
- **Empty Feeds**: Curated feeds can't be empty (validation needed)

### 10. UX Polish
- **Infinite Scroll**: Load more content as user scrolls
- **Pull-to-Refresh**: Refresh current feed
- **Loading States**: Skeleton screens during load
- **Error Handling**: Retry buttons, clear error messages

### 11. Accessibility
- **Navigation**: Touch-based (no keyboard nav)
- **Screen Reader**: ARIA labels for assistive tech
- **Captions**: Auto-generated or user-provided

### 12. Responsive Design
- **Layout**: Same layout across all devices (mobile-first, scales up)

---

## Implementation Phases

### Phase 1: Core Feed Experience ✅
**Status**: Completed

1. **Full-Screen Vertical Feed**
   - Remove grid view from main feed
   - Implement full-screen media display
   - One media item per screen
   - Files: `apps/aggregator-browser/src/components/FullScreenFeed.tsx` (new)

2. **Swipe Navigation (Vertical)**
   - Swipe up = next media
   - Swipe down = previous media
   - Snap behavior (no partial scrolling)
   - Files: `apps/aggregator-browser/src/hooks/useVerticalSwipe.ts` (new)

3. **Horizontal Feed Switching**
   - Swipe left/right to switch feeds
   - Feed order: Curated → Public → Subscribed → Discovery
   - Locked users: Public → Niche Feeds
   - Files: `apps/aggregator-browser/src/hooks/useHorizontalSwipe.ts` (new)

4. **Top Sliding Menu Bar**
   - Shows current feed title
   - Slides horizontally as user switches feeds
   - Click to jump to specific feed
   - Files: `apps/aggregator-browser/src/components/FeedNavBar.tsx` (new)

5. **Bottom Navigation**
   - Conditional based on auth/tier
   - Locked: Search + Home
   - Unlocked: Search + Home + Upload
   - Messages/Notifications tabbed
   - Files: `apps/aggregator-browser/src/components/BottomNav.tsx` (new)

**Dependencies**: 
- Update `App.tsx` to use new feed components
- Remove grid view from main feed
- Update routing/navigation logic

---

### Phase 2: Content Interaction ✅
**Status**: Completed

6. **Slide-Up Engagement Overlay**
   - Bottom right engagement buttons (like, comment, share, save)
   - Slide up on tap
   - Files: `apps/aggregator-browser/src/components/EngagementOverlay.tsx` (new)

7. **Comments Modal**
   - Slide-up modal
   - Comment list + input
   - Real-time updates
   - Files: `apps/aggregator-browser/src/components/CommentsModal.tsx` (update existing)

8. **Playback Controls**
   - Pause button
   - System volume control
   - 2x speed toggle
   - Captions toggle
   - Files: `apps/aggregator-browser/src/components/PlaybackControls.tsx` (new)

9. **Save to Private Feed**
   - Save button creates/updates private curated feed
   - Only visible to curator
   - Files: `apps/aggregator-browser/src/services/savedFeedService.ts` (new)

**Dependencies**: 
- Engagement API endpoints
- Comments API endpoints
- Video playback controls
- Private feed storage

---

### Phase 3: Discovery & Search 🔍
**Status**: Not Started

10. **Discovery Page**
    - Grid layout (YouTube-style)
    - Tiles with thumbnails, titles, info buttons
    - Categories: Trending, New Creators, Featured, Classics, Niches
    - Files: `apps/aggregator-browser/src/components/DiscoveryPage.tsx` (new)

11. **Search Implementation**
    - 3-column grid, no gaps
    - Thumbnail tiles
    - Simple sort + advanced filters
    - Semantic metadata search
    - Files: `apps/aggregator-browser/src/components/SearchResults.tsx` (new)
    - Files: `apps/aggregator-browser/src/services/searchService.ts` (new)

12. **Creator Profiles/Feed Pages**
    - Toggle full-screen/grid view
    - Customizable header
    - Own feeds view
    - Robust statistics
    - Files: `apps/aggregator-browser/src/components/CreatorFeedPage.tsx` (new)

**Dependencies**: 
- Search API endpoints
- Creator profile API endpoints
- Statistics API endpoints

---

### Phase 4: Upload & Messaging 📤
**Status**: Not Started

13. **Upload Flow**
    - Drive encrypted folder access
    - Upload to Drive via platform
    - Drag-drop + file picker
    - Metadata editing post-upload
    - Files: `apps/aggregator-browser/src/components/UploadFlow.tsx` (update existing)

14. **Messages/Notifications Inbox**
    - Tabbed interface (Messages | Notifications)
    - DM list with read receipts
    - Message requests with authorization
    - Media sharing via cloud
    - Files: `apps/aggregator-browser/src/components/Inbox.tsx` (new)

**Dependencies**: 
- Google Drive API integration
- Messages API endpoints
- Notifications API endpoints (already exists)

---

### Phase 5: Polish & Optimization ✨
**Status**: Not Started

15. **Statistics Dashboard**
    - Views, engagement, subscribers
    - Growth trends
    - Files: `apps/aggregator-browser/src/components/StatsDashboard.tsx` (new)

16. **Notifications (WebSocket)**
    - Real-time notifications
    - Fallback to polling
    - Files: `apps/aggregator-browser/src/services/notificationWebSocket.ts` (new)

17. **Pull-to-Refresh & Infinite Scroll**
    - Pull-to-refresh current feed
    - Infinite scroll for feed loading
    - Files: Update feed components

18. **Loading States & Error Handling**
    - Skeleton screens
    - Retry buttons
    - Clear error messages
    - Files: Update all components

**Dependencies**: 
- WebSocket server setup
- Error handling utilities
- Loading state components

---

## Technical Architecture

### New Components Structure
```
apps/aggregator-browser/src/
├── components/
│   ├── FullScreenFeed.tsx          (NEW - Phase 1)
│   ├── FeedNavBar.tsx              (NEW - Phase 1)
│   ├── BottomNav.tsx               (NEW - Phase 1)
│   ├── EngagementOverlay.tsx       (NEW - Phase 2)
│   ├── PlaybackControls.tsx        (NEW - Phase 2)
│   ├── DiscoveryPage.tsx           (NEW - Phase 3)
│   ├── SearchResults.tsx           (NEW - Phase 3)
│   ├── CreatorFeedPage.tsx         (NEW - Phase 3)
│   ├── Inbox.tsx                   (NEW - Phase 4)
│   ├── StatsDashboard.tsx          (NEW - Phase 5)
│   └── CommentsModal.tsx            (UPDATE - Phase 2)
│   └── UploadFlow.tsx               (UPDATE - Phase 4)
├── hooks/
│   ├── useVerticalSwipe.ts         (NEW - Phase 1)
│   ├── useHorizontalSwipe.ts       (NEW - Phase 1)
│   └── useFeedNavigation.ts         (NEW - Phase 1)
├── services/
│   ├── savedFeedService.ts          (NEW - Phase 2)
│   ├── searchService.ts             (NEW - Phase 3)
│   └── notificationWebSocket.ts     (NEW - Phase 5)
└── App.tsx                          (MAJOR UPDATE - All Phases)
```

### API Endpoints Needed

#### Backend (api/src/server.ts)
- `GET /api/search` - Semantic search with filters
- `GET /api/creator/:did/stats` - Creator statistics
- `POST /api/feeds/saved` - Create/update saved feed
- `GET /api/feeds/saved` - Get user's saved feed
- `POST /api/messages` - Send DM
- `GET /api/messages` - Get DMs
- `POST /api/messages/:id/accept` - Accept message request
- `GET /api/discovery` - Discovery page content
- `GET /api/creator/:did/feed` - Creator feed page

### Database Schema Updates

#### New Tables (if needed)
- `saved_feeds` - User's saved content (private feeds)
- `message_requests` - Pending message requests
- `creator_stats` - Cached creator statistics

---

## Key Design Decisions

1. **Feed Loading Strategy**
   - Load current feed + 1 feed ahead for smooth transitions
   - Preload thumbnails for discovery/search
   - Lazy load full media on scroll

2. **State Management**
   - Use React Context for feed state
   - Local state for UI interactions
   - Cache feed data in localStorage

3. **Performance**
   - Virtual scrolling for long feeds
   - Image/video lazy loading
   - Debounce search queries
   - Throttle scroll events

4. **Accessibility**
   - ARIA labels for all interactive elements
   - Screen reader announcements for feed changes
   - Caption support for videos

---

## Testing Checklist

### Phase 1
- [ ] Full-screen feed displays correctly
- [ ] Vertical swipe navigation works smoothly
- [ ] Horizontal feed switching works
- [ ] Top menu bar slides correctly
- [ ] Bottom nav shows correct items based on auth/tier

### Phase 2
- [ ] Engagement overlay slides up correctly
- [ ] Comments modal works
- [ ] Playback controls function properly
- [ ] Save creates private feed

### Phase 3
- [ ] Discovery page displays correctly
- [ ] Search returns accurate results
- [ ] Creator profiles show correct data
- [ ] Statistics are accurate

### Phase 4
- [ ] Upload flow works with Drive
- [ ] Messages send/receive correctly
- [ ] Notifications display properly

### Phase 5
- [ ] WebSocket notifications work
- [ ] Pull-to-refresh works
- [ ] Infinite scroll works
- [ ] Error handling is robust

---

## Progress Tracking

**Current Phase**: Phase 2 Complete ✅

**Completed**:
- ✅ Phase 1: Core Feed Experience
  - Created useVerticalSwipe hook with snap behavior
  - Created useHorizontalSwipe hook for feed switching
  - Created FeedNavBar component with sliding menu
  - Created BottomNav component with conditional items
  - Created FullScreenFeed component for TikTok-style feed
  - Updated feed hierarchy logic (Curated → Public → Subscribed → Discovery)
- ✅ Phase 2: Content Interaction
  - Created EngagementOverlay component with slide-up animation
  - Updated CommentsModal to slide-up modal
  - Created PlaybackControls component (pause, volume, 2x speed, captions)
  - Created savedFeedService for private curated feeds
  - Integrated EngagementOverlay into FullScreenFeed
  - Integrated PlaybackControls into FullScreenFeed

**Next Steps**:
1. Begin Phase 3: Discovery & Search
2. Create DiscoveryPage component (YouTube-style grid)
3. Implement SearchResults component (3-column grid)
4. Create CreatorFeedPage component
5. Add statistics dashboard

**Last Updated**: Phase 2 Implementation Complete
**Status**: Ready for Phase 3

---

## Notes

- All unlocked users can upload (not just paid)
- Only paid users can curate feeds
- Curated feeds cannot be empty (validation needed)
- Same layout across all devices (mobile-first)
- No keyboard navigation (touch-based only)
- WebSocket for notifications (with polling fallback)


