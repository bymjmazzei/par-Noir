# Aggregator Browser - Task List & Action Plan

**Prioritized by quickest fixes and criticality**

---

## Phase 1: Quick UI Fixes ✅ COMPLETED

**Status:** All tasks completed

### Completed Tasks:
- [x] Discover page — visual updates
  - [x] Top Feed railway styling (remove backgrounds, text only, active bold and centered)
  - [x] Niche Feed railway styling (remove backgrounds, text only, active centered and underlined, moved to own railway)
  - [x] Added "All" button to niche railway
  - [x] Fixed text overlap on small screens
- [x] Discover tiles — display fixes
  - [x] Replace DID with user platform name under image title
  - [x] Replace likes counter with full engagement bar (Heart, Comment, Share, Save icons with counts)
- [x] New creators tile updates
  - [x] Replace DID with platform name as title
  - [x] Show total views in last 7 days
  - [x] Replace "New Creator" with niche identifier
- [x] API integration
  - [x] Updated API to handle DIDs and look up pnIdentifier
  - [x] Profile fetching and caching of display names

**Note:** Edit metadata popup updates (category/genre reordering, remove fields, rights/licensing dropdown) - **NOT YET COMPLETED**

---

## Phase 2: Core Functionality (3-5 days) 🚧 IN PROGRESS

**Medium complexity, high user impact**

### Tasks:
- [ ] Discover page — feed logic
  - [ ] Add "All" feed option (public index)
  - [ ] Feed filtering logic
    - [ ] Railways sort the public index
    - [ ] Niche feed toggles between different niche feeds
    - [ ] Top feed displays content specific to active niche feed
    - [ ] Example: "Classics" + "All" → shows all classics
    - [ ] Example: "Sports & Fitness" + "Classics" → shows only sports & fitness classics
- [ ] Name persistence
  - [ ] Platform name persistence
  - [ ] Ensure platform name changes persist across the app
  - [ ] Update all references from DID to platform name where appropriate

---

## Phase 3: Content Preferences (2-3 days)

**Medium complexity**

### Tasks:
- [ ] Upload section settings
  - [ ] Content preferences UI
  - [ ] Add settings button in top left of upload section
  - [ ] Allow user to select:
    - [ ] Niche feeds they want to see
    - [ ] Content rating requirements
  - [ ] This filters the user's curated feed
- [ ] Public index content rating filter
  - [ ] When public index is unlocked, only show content within user's content rating preference

---

## Phase 4: Me Page Enhancements (1-2 days)

**Quick addition**

### Tasks:
- [ ] Add thoughts to me page railway
  - [ ] Add thoughts/comments section to the me page railway

---

## Phase 5: Paid Feed System (7-10 days)

**High complexity, new feature**

### Tasks:
- [ ] Payment infrastructure
  - [ ] Paywall setup
  - [ ] Create paywall modal requesting AML/KYC data points
  - [ ] Payment options: $5/month per feed (autopay) or $50/year
- [ ] Feed ownership and delegation
  - [ ] Register feed makes user owner
  - [ ] Owner can delegate access to other pN users
- [ ] Feed display and subscription
  - [ ] Feed on me page
  - [ ] Paid feeds appear as feeds on user's me page
  - [ ] Other pN users can subscribe to feeds
- [ ] Feed page for subscribers
  - [ ] Subscribers get dedicated feed page (like me page but for feed)
  - [ ] "Top post" section with profile controls:
    - [ ] Profile image
    - [ ] Links
    - [ ] Description
  - [ ] Feed content displayed below profile section

---

## Phase 6: API and Licensing Overhaul (5-7 days)

**High complexity, infrastructure changes**

### Tasks:
- [ ] Commercial license modal rework
  - [ ] Automatic API key assignment
  - [ ] Everyone gets API key automatically (inactive by default)
  - [ ] Activate by registering and sharing identity information
  - [ ] Remove specific license types, just "open source"
- [ ] API infrastructure updates
  - [ ] OAuth authentication API for third parties
  - [ ] API for requesting persistent identity data points
  - [ ] API for transactional access to other data points
  - [ ] Ensure APIs handle new licensing model
- [ ] Portability APIs
  - [ ] Public index portability API
  - [ ] Create API for user's public index to be portable
  - [ ] Use existing framework from share settings for granular content availability
  - [ ] Paid feed portability
  - [ ] Create API and HTML widget for paid feed portability
  - [ ] Owner can paste widget code on their website
  - [ ] Feed displays in container or on subdomain

---

## Phase 7: GitHub Releases (1 day)

**Documentation**

### Tasks:
- [ ] Set up GitHub releases
  - [ ] Create release process/documentation
  - [ ] Tag versions appropriately

---

## Summary by Priority

### Critical Path (Do First)
1. ✅ Discover page visual fixes (Phase 1 - COMPLETED)
2. ⏳ Edit metadata popup updates (Phase 1 - PARTIAL)
3. 🚧 Platform name persistence (Phase 2)
4. 🚧 Feed filtering logic (Phase 2)

### High Priority (Next)
5. Content preferences (Phase 3)
6. Thoughts on me page (Phase 4)

### Medium Priority (After Core Features)
7. Paid feed system (Phase 5)

### Lower Priority (Infrastructure)
8. API/licensing overhaul (Phase 6)
9. GitHub releases (Phase 7)

---

## Notes

- All changes are committed to GitHub
- Frontend deployed to Firebase: https://browse-parnoir.web.app
- API changes need to be deployed to Railway/server
- Last updated: Phase 2 started
