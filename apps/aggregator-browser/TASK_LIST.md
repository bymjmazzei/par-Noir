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

**Note:** Edit metadata popup updates (category/genre reordering, rights/licensing dropdown) — **COMPLETED** (`EditMetadataModal.tsx`, `EditFileModal.tsx`)

---

## Phase 2: Core Functionality (3-5 days) ✅ COMPLETED

**Medium complexity, high user impact**

### Tasks:
- [x] Discover page — feed logic
  - [x] Add "All" feed option (public index)
  - [x] Feed filtering logic (niche + top rails in `DiscoveryPage.tsx`)
- [x] Name persistence — platform name via profile API + display name cache

---

## Phase 3: Content Preferences (2-3 days) ✅ COMPLETED

### Tasks:
- [x] Upload section settings — `ContentPreferencesPanel` in upload modal
- [x] Public index content rating filter — NSFW gating + preferences in feed filtering

---

## Phase 4: Me Page Enhancements (1-2 days) ✅ COMPLETED

### Tasks:
- [x] Add thoughts to me page railway — `MePageTabsRail` includes `thoughts` tab

---

## Phase 5: Paid Feed System (7-10 days) ⏸ DEFERRED

**Platform billing deferred (410). Target creator-connected payment gateways per business docs.**

---

## Phase 6: API and Licensing Overhaul (5-7 days) 🚧 PARTIAL

### Tasks:
- [x] Music registry post attach (phases C/D) — `musicRegistryApi.ts`, `EditFileModal.tsx`
- [ ] Commercial license modal rework — developer-portal scope
- [ ] Full API licensing infrastructure — ongoing L5 work

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
