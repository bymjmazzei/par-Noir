# Prompt to Continue TypeScript Compilation Error Fixes

## Current Status
- **37 errors remaining** across 5 files
- **Progress**: Phase 1 partially done, Phase 2 complete, Phase 3 in progress

## What to Do

Continue fixing TypeScript compilation errors following the plan at:
`/Users/gamit/.cursor/plans/fix_typescript_compilation_errors_-_incremental_a457615e.plan.md`

## Immediate Next Steps

### 1. Fix googleOAuth2Helper.ts (1 error)
**File**: `api/src/server/modules/googleOAuth2Helper.ts`
- **Line 30**: Error `Cannot find namespace 'google'`
- **Fix**: Change return type to use type import:
  ```typescript
  import type { OAuth2Client } from 'googleapis';
  // Then return type: OAuth2Client
  ```

### 2. Fix notificationService.ts (12 errors)
**File**: `api/src/server/modules/notificationService.ts`
- **Line 11-12**: Remove duplicate `import { GoogleDriveToken }` (keep only one)
- **updateNotificationsFile()** (lines 110-132): Add `userPnIdentifier` and `accountId` parameters, convert token, update all calls
- **getUserNotifications()** (lines 220-244): Add `userPnIdentifier` and `accountId` parameters, convert token, update calls
- **getUnreadCount()** (lines 365-382): Add `userPnIdentifier` and `accountId` parameters, convert token, update calls
- **getNotificationPreferences()** (line 402): Pass `userPnIdentifier` and `accountId` to `getNotificationsFile()`
- **updateNotificationPreferences()** (line 420): Pass `userPnIdentifier` and `accountId` to `getNotificationsFile()`

### 3. Continue with remaining files
- preferencesService.ts (12 errors)
- thirdPartyPermissionsService.ts (4 errors)
- zkpDataPointsService.ts (6 errors)

## Pattern to Follow

For each method:
1. Add `userPnIdentifier: string` and `accountId?: string` parameters
2. Convert `accessToken: string` to `token: GoogleDriveToken = { access_token: accessToken }`
3. Update all Sheets service calls to pass `token`, `userPnIdentifier`, `accountId`

## Verification
After each file, run: `cd api && npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l`

## Important
- Work one file at a time
- Verify after each file
- Don't edit the plan file itself
- Follow the exact pattern shown in the plan
