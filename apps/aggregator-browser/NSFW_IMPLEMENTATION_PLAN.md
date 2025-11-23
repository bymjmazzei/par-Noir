# NSFW Content System Implementation Plan

## Overview
This document outlines the comprehensive plan to implement a simplified NSFW content system with dashboard-controlled age ZKP sharing. The system will replace the current multi-tier rating system (GA, 18+, NSFW, X) with a simple binary: Public or NSFW.

## Architecture

### Core Principles
1. **Simple Binary System**: Content is either Public (default) or NSFW
2. **Two Separate Indexes**: Public index and NSFW index maintained separately
3. **Dashboard Control**: Age ZKP sharing controlled via third-party permissions UI
4. **Conditional Access**: NSFW content only visible if user has age ZKP AND is over 18
5. **User Preference**: NSFW toggle in settings (only available if eligible)

---

## Phase 1: Clean Up Content Rating System

### Goal
Remove all rating constants/types, simplify to `isNSFW: boolean`

### Tasks

#### 1.1 Update Type Definitions
- **File**: `apps/aggregator-browser/src/types/aggregator.ts`
- Remove `ContentRating` type (`'GA' | '18+' | 'NSFW' | 'X'`)
- Remove `ContentRatingInfo` interface
- Remove `maxRating` from `UserPreferences`
- Add `isNSFW: boolean` to file metadata interfaces

#### 1.2 Remove Rating Constants
- **File**: `apps/aggregator-browser/src/constants/contentRatings.ts`
- Delete entire file or replace with simple `isNSFW` helper functions

#### 1.3 Update Upload/Edit UI
- **Files**: 
  - `apps/aggregator-browser/src/components/FileStorageAggregator.tsx`
  - `apps/aggregator-browser/src/components/EditFileModal.tsx`
  - `apps/aggregator-browser/src/components/TextPostEditor.tsx`
- Replace rating dropdown with simple toggle: "Public" (default) or "NSFW"
- Update form handling to use `isNSFW: boolean`

#### 1.4 Clean Up Browser Filtering
- **File**: `apps/aggregator-browser/src/App.tsx`
- Remove all rating filtering logic
- Remove `maxRating` from user state context
- Simplify feed filtering to just check `isNSFW`

#### 1.5 Remove Content Preferences Component
- **File**: `apps/aggregator-browser/src/components/ContentPreferences.tsx`
- Either delete or simplify to only show niche feed subscriptions
- Remove rating selection logic

### Testing Checklist
- [ ] Upload flow shows Public/NSFW toggle instead of rating dropdown
- [ ] Edit flow shows Public/NSFW toggle
- [ ] No rating constants/types remain in codebase
- [ ] No compilation errors

### Deployment Instructions
After completing Phase 1:
```bash
# Commit changes
git add .
git commit -m "Phase 1: Remove rating system, add isNSFW boolean"

# Push to GitHub
git push origin main

# Deploy to Firebase
cd apps/aggregator-browser
npm run build
firebase deploy --only hosting
```

---

## Phase 2: Dashboard - Age ZKP Availability Check

### Goal
Check if user has `age_attestation` ZKP before showing it in permissions

### Tasks

#### 2.1 Create Age ZKP Check Service
- **File**: `apps/id-dashboard/src/services/ageZKPCheckService.ts` (NEW)
- Function: `checkAgeZKPExists(identityId: string): Promise<boolean>`
- Query user's `_metadata` folder for `age_attestation` ZKP data point
- Check if ZKP exists and is valid (not expired)
- Return boolean

#### 2.2 Update Dashboard App.tsx
- **File**: `apps/id-dashboard/src/App.tsx`
- Load age ZKP status when user unlocks identity
- Store in state: `hasAgeZKP: boolean`
- Pass to permissions UI components

#### 2.3 Update State Management
- **File**: `apps/id-dashboard/src/types/privacy.ts` or similar
- Add `hasAgeZKP: boolean` to relevant state interfaces

### Testing Checklist
- [ ] Dashboard correctly detects if user has age ZKP
- [ ] State updates correctly when user sets up age ZKP
- [ ] State persists across sessions

### Deployment Instructions
After completing Phase 2:
```bash
# Commit changes
git add .
git commit -m "Phase 2: Add age ZKP availability check in dashboard"

# Push to GitHub
git push origin main

# Deploy dashboard (if needed)
cd apps/id-dashboard
npm run build
# Deploy via your dashboard deployment process
```

---

## Phase 3: Dashboard - Third-Party Permissions UI Enhancement

### Goal
Show optional data points with conditional toggle in permissions UI

### Tasks

#### 3.1 Update ToolSettingsModal
- **File**: `apps/id-dashboard/src/components/ToolSettingsModal.tsx`
- For `browser-app` tool:
  - Show `age_attestation` in optional data points section
  - Toggle should only be visible if `hasAgeZKP === true`
  - Toggle should only be enabled if `hasAgeZKP === true`
  - Show message: "Set up age attestation in Data Points to enable sharing" if no ZKP

#### 3.2 Update EnhancedPrivacyPanel
- **File**: `apps/id-dashboard/src/components/EnhancedPrivacyPanel.tsx`
- Same conditional logic for optional data points
- Check `hasAgeZKP` before showing age ZKP toggle

#### 3.3 Update Permissions Display Logic
- Separate required vs optional data points visually
- For optional data points: check if user has the ZKP before showing toggle
- If user doesn't have ZKP: show disabled toggle with explanation

### Testing Checklist
- [ ] Dashboard shows age ZKP toggle only if user has age ZKP set up
- [ ] Toggle is disabled if user doesn't have age ZKP
- [ ] Clear message shown when age ZKP not available
- [ ] Toggle state persists correctly

### Deployment Instructions
After completing Phase 3:
```bash
# Commit changes
git add .
git commit -m "Phase 3: Add conditional age ZKP toggle in dashboard permissions"

# Push to GitHub
git push origin main

# Deploy dashboard
cd apps/id-dashboard
npm run build
# Deploy via your dashboard deployment process
```

---

## Phase 4: OAuth Flow - Conditional Age ZKP Request

### Goal
Only show age ZKP permission line if user has it set up

### Tasks

#### 4.1 Update OAuth Auth Endpoint
- **File**: `api/src/server.ts` (around line 5183)
- In `/oauth/auth` endpoint:
  - Check if user has `age_attestation` ZKP
  - If yes: include `age_attestation` in `optionalDataPoints`
  - If no: exclude `age_attestation` from `optionalDataPoints`
  - Return `optionalDataPoints` array in response

#### 4.2 Update Browser OAuth Consent Screen
- **Files**: 
  - `apps/aggregator-browser/src/services/pnOAuthService.ts`
  - OAuth consent HTML file (if exists)
- Only show age ZKP permission line if it's in `optionalDataPoints`
- If not present, don't show the line at all

#### 4.3 Update OAuth Callback Handler
- **File**: `apps/aggregator-browser/src/App.tsx`
- Handle age sharing preference from OAuth flow
- Only show age sharing option if age ZKP is available

### Testing Checklist
- [ ] OAuth flow without age ZKP: No age permission line shown
- [ ] OAuth flow with age ZKP: Age permission line shown
- [ ] Age sharing preference saved correctly
- [ ] Browser receives correct permissions

### Deployment Instructions
After completing Phase 4:
```bash
# Commit changes
git add .
git commit -m "Phase 4: Conditional age ZKP in OAuth flow"

# Push to GitHub
git push origin main

# Deploy API
cd api
npm run build
# Deploy via Railway or your API deployment process

# Deploy browser
cd apps/aggregator-browser
npm run build
firebase deploy --only hosting
```

---

## Phase 5: API - NSFW Index System

### Goal
Create parallel NSFW index alongside public index

### Tasks

#### 5.1 Create NSFW Index Service
- **File**: `api/src/server.ts` (add new methods)
- Create `updateNSFWFileIndex()` function (similar to `updatePublicFileIndex`)
- Create `getNSFWFileIndex()` function
- Create `removeFromNSFWIndex()` function
- File name: `nsfw-file-index.json`
- Same structure as public index

#### 5.2 Update Metadata Submission
- **File**: `api/src/server.ts` (metadata index PUT endpoint around line 1718)
- When `isNSFW: false` (or missing): 
  - Add to public index
  - Remove from NSFW index
- When `isNSFW: true`: 
  - Add to NSFW index
  - Remove from public index
- Update `/api/aggregator/metadata-index` PUT endpoint

#### 5.3 Create NSFW Index Endpoint
- **File**: `api/src/server.ts` (add new endpoint)
- Create `/api/aggregator/nsfw-index` endpoint
- Returns NSFW content only
- Same query parameters as public index (`authorDid`, `tags`, etc.)
- Similar structure to `/api/aggregator/metadata-index`

#### 5.4 Update Database Schema
- **File**: `api/src/server/modules/aggregatorMetadataServiceDB.ts`
- Add `isNSFW` field to metadata schema
- Update index queries to filter by `isNSFW`

### Testing Checklist
- [ ] Content with `isNSFW: false` goes to public index
- [ ] Content with `isNSFW: true` goes to NSFW index
- [ ] NSFW index endpoint returns correct content
- [ ] Public index endpoint excludes NSFW content
- [ ] Index updates work correctly when toggling isNSFW

### Deployment Instructions
After completing Phase 5:
```bash
# Commit changes
git add .
git commit -m "Phase 5: Create NSFW index system in API"

# Push to GitHub
git push origin main

# Deploy API
cd api
npm run build
# Deploy via Railway or your API deployment process

# Test API endpoints manually before proceeding
```

---

## Phase 6: Browser - Load Both Indexes

### Goal
Load NSFW index when user has age ZKP and is over 18

### Tasks

#### 6.1 Update UserStateContext
- **File**: `apps/aggregator-browser/src/contexts/UserStateContext.tsx`
- Remove old age verification logic (around line 156)
- Add new logic:
  - Check if age ZKP is shared via `/oauth/zkp-data-points`
  - Verify age >= 18 via `/api/users/:pnIdentifier/zkp-data-points/verify`
  - Store: `hasAgeZKP: boolean`, `isOver18: boolean`
- Remove `ageVerified` and `verifiedAge` from preferences
- Add `showNSFW: boolean` to preferences (default: false)

#### 6.2 Update Index Loading
- **File**: `apps/aggregator-browser/src/App.tsx`
- Always load public index from `/api/aggregator/metadata-index`
- If `hasAgeZKP && isOver18`: Also load NSFW index from `/api/aggregator/nsfw-index`
- Merge both indexes inline (no separate feed)
- Deduplicate files

#### 6.3 Update Central Metadata Aggregator
- **File**: `apps/aggregator-browser/src/services/storage/CentralMetadataAggregator.ts`
- Add method to fetch NSFW index
- `fetchNSFWIndex(filters?)` method

### Testing Checklist
- [ ] Public index loads for all users
- [ ] NSFW index loads only if user has age ZKP and is over 18
- [ ] Both indexes merge correctly
- [ ] No duplicate files in feed
- [ ] State updates correctly when age ZKP is shared

### Deployment Instructions
After completing Phase 6:
```bash
# Commit changes
git add .
git commit -m "Phase 6: Load NSFW index when user eligible"

# Push to GitHub
git push origin main

# Deploy browser
cd apps/aggregator-browser
npm run build
firebase deploy --only hosting
```

---

## Phase 7: Browser - NSFW Toggle in Settings

### Goal
Add toggle to show/hide NSFW content (only if eligible)

### Tasks

#### 7.1 Update Settings Panel
- **File**: `apps/aggregator-browser/src/components/SettingsPanel.tsx`
- Add "NSFW Content" section
- Only show if `hasAgeZKP && isOver18`
- Toggle: "Show NSFW content"
- Save to user preferences via API

#### 7.2 Update User Preferences API
- **File**: `api/src/server.ts` (preferences endpoint)
- Add `showNSFW: boolean` to preferences schema
- Update GET/PUT endpoints

#### 7.3 Update Feed Filtering
- **File**: `apps/aggregator-browser/src/App.tsx`
- Filter out NSFW content if `showNSFW === false`
- If `showNSFW === true`: Show both public and NSFW inline
- Update `filteredFilesByFeed` useMemo

### Testing Checklist
- [ ] NSFW toggle only visible if user eligible
- [ ] Toggle state persists correctly
- [ ] NSFW content hidden when toggle is off
- [ ] NSFW content shown when toggle is on
- [ ] Preference saved to Google Drive via API

### Deployment Instructions
After completing Phase 7:
```bash
# Commit changes
git add .
git commit -m "Phase 7: Add NSFW toggle in browser settings"

# Push to GitHub
git push origin main

# Deploy API
cd api
npm run build
# Deploy via Railway

# Deploy browser
cd apps/aggregator-browser
npm run build
firebase deploy --only hosting
```

---

## Phase 8: Clean Up Old Preferences System

### Goal
Remove rating-related preferences, clean up code

### Tasks

#### 8.1 Remove Rating Fields from Preferences
- **Files**:
  - `apps/aggregator-browser/src/contexts/UserStateContext.tsx`
  - `api/src/server.ts` (preferences endpoints)
- Remove `maxRating` from user preferences
- Remove `ageVerified` (keep `hasAgeZKP` and `isOver18`)
- Remove `verifiedAge`
- Remove all rating-related constants and helpers

#### 8.2 Clean Up Unused Code
- Search for all references to `ContentRating`, `maxRating`, `rating`, etc.
- Remove unused imports
- Remove unused helper functions
- Clean up any remaining rating-related UI components

#### 8.3 Update API Preferences Endpoint
- **File**: `api/src/server.ts`
- Remove rating fields from preferences schema
- Ensure `showNSFW` is included
- Update validation logic

### Testing Checklist
- [ ] No rating-related code remains
- [ ] No compilation errors
- [ ] Preferences work correctly with new schema
- [ ] No console errors related to ratings

### Deployment Instructions
After completing Phase 8:
```bash
# Commit changes
git add .
git commit -m "Phase 8: Clean up old rating preferences system"

# Push to GitHub
git push origin main

# Deploy API
cd api
npm run build
# Deploy via Railway

# Deploy browser
cd apps/aggregator-browser
npm run build
firebase deploy --only hosting
```

---

## Complete Testing Checklist

### Dashboard Testing
- [ ] User without age ZKP: Should not see age toggle in dashboard
- [ ] User with age ZKP: Should see age toggle in dashboard
- [ ] Toggle state persists correctly
- [ ] OAuth permissions reflect dashboard settings

### OAuth Testing
- [ ] OAuth without age ZKP: Should not show age permission line
- [ ] OAuth with age ZKP: Should show age permission line
- [ ] Age sharing preference saved correctly
- [ ] Browser receives correct permissions after OAuth

### Content Upload Testing
- [ ] Upload shows Public/NSFW toggle
- [ ] Public content goes to public index
- [ ] NSFW content goes to NSFW index
- [ ] Edit flow allows changing isNSFW status
- [ ] Content moves between indexes correctly

### Browser Testing
- [ ] Public index loads for all users
- [ ] NSFW index loads only if user eligible (age ZKP + over 18)
- [ ] NSFW toggle only visible if eligible
- [ ] NSFW content hidden when toggle off
- [ ] NSFW content shown when toggle on
- [ ] Both indexes merge inline correctly
- [ ] No duplicate content

### API Testing
- [ ] NSFW index endpoint returns correct content
- [ ] Public index excludes NSFW content
- [ ] Metadata submission routes to correct index
- [ ] Preferences API handles showNSFW correctly

---

## Deployment Process

### After Each Testable Phase

1. **Commit Changes**
   ```bash
   git add .
   git commit -m "Phase X: [Description]"
   ```

2. **Push to GitHub**
   ```bash
   git push origin main
   ```

3. **Deploy API (if API changes made)**
   ```bash
   cd api
   npm run build
   # Deploy via Railway or your API deployment process
   ```

4. **Deploy Browser (if browser changes made)**
   ```bash
   cd apps/aggregator-browser
   npm run build
   firebase deploy --only hosting
   ```

5. **Deploy Dashboard (if dashboard changes made)**
   ```bash
   cd apps/id-dashboard
   npm run build
   # Deploy via your dashboard deployment process
   ```

### Testing After Deployment
1. Test the specific functionality added in that phase
2. Verify no regressions in existing functionality
3. Check browser console for errors
4. Check API logs for errors
5. Test across different user states (with/without age ZKP, etc.)

---

## Rollback Plan

If issues are discovered after deployment:

1. **Revert Git Commit**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Redeploy Previous Version**
   - API: Redeploy previous version via Railway
   - Browser: Redeploy previous build via Firebase
   - Dashboard: Redeploy previous build

3. **Fix Issues Locally**
   - Make necessary corrections
   - Test thoroughly
   - Follow deployment process again

---

## Notes

- Test each phase thoroughly before proceeding to the next
- Keep this document updated as implementation progresses
- Mark completed phases with checkboxes
- Note any deviations from the plan
- Document any issues encountered and solutions

---

## Current Status

- [🟡] Phase 1: Clean Up Content Rating System (IN PROGRESS)
  - [✅] Phase 1.1: Update type definitions - remove ContentRating, add isNSFW boolean
  - [✅] Phase 1.2: Simplify contentRatings.ts constants file
  - [ ] Phase 1.3: Update upload/edit UI to use Public/NSFW toggle
  - [ ] Phase 1.4: Remove rating filtering logic from App.tsx
  - [ ] Phase 1.5: Remove ContentPreferences rating logic
  - [ ] Phase 1.6: Update UserStateContext to remove maxRating and ageVerified
- [ ] Phase 2: Dashboard - Age ZKP Availability Check
- [ ] Phase 3: Dashboard - Third-Party Permissions UI Enhancement
- [ ] Phase 4: OAuth Flow - Conditional Age ZKP Request
- [ ] Phase 5: API - NSFW Index System
- [ ] Phase 6: Browser - Load Both Indexes
- [ ] Phase 7: Browser - NSFW Toggle in Settings
- [ ] Phase 8: Clean Up Old Preferences System

**Last Updated**: 2025-01-27
**Current Phase**: Phase 1 - Clean Up Content Rating System (Partially Complete)

### Phase 1 Progress Notes:
- ✅ Updated type definitions in `aggregator.ts` - removed ContentRating type, ContentRatingInfo interface, WarningTag type
- ✅ Added `isNSFW: boolean` to PublicMetadata and TextPostData interfaces
- ✅ Updated MetadataFilters to use `includeNSFW: boolean` instead of rating filters
- ✅ Simplified `contentRatings.ts` to basic helper functions
- ✅ Started updating UserStateContext interfaces but need to complete implementation

### Remaining Work for Phase 1:
- Need to update UserStateContext methods (remove updateMaxRating, setAgeVerified, replace with new methods)
- Need to update all files that import ContentRating or contentRatings constants (9 files identified)
- Need to update App.tsx filtering logic
- Need to update upload/edit UI components

**Note**: Current changes will cause compilation errors until all files are updated. This is expected during refactoring.
