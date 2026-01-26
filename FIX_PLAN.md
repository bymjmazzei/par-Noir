# TypeScript Compilation Error Fix Plan

## Status: In Progress
Last updated: After user fixes to `engagementDriveService.ts` and `connectionsService.ts`

## Remaining Errors by File

### 1. `api/src/server/modules/engagementDriveService.ts` (22 errors)
**Issue**: Methods calling `EngagementSheetsService` need to pass token objects and additional parameters (`userPnIdentifier`, `accountId`)

**Methods to fix**:
- `getEngagementSheet()` calls (lines 83, 134, 173, 206, 224, 244)
- `toggleLike()` - multiple calls (lines 99, 106, 144, 146, 148, 153, 155, 157, 183, 187, 189, 191, 254)
- `toggleDislike()` - multiple calls (lines 139, 178, 211, 229)
- `addComment()` - needs token object
- `removeComment()` - needs token object
- `toggleShare()` - needs token object
- `toggleSave()` - needs token object

**Action**: Update all `EngagementSheetsService` method calls to:
1. Accept `token: GoogleDriveToken | string` (convert string to token object)
2. Pass `userPnIdentifier` and `accountId` parameters
3. Ensure `userPnIdentifier` is available in all methods

### 2. `api/src/server/modules/googleDriveProxy.ts` (3 errors)
**Issue**: Method calls need token objects and additional parameters

**Lines to fix**:
- Line 922: `EngagementSheetsService` call needs token object + params
- Line 1103: `EngagementSheetsService` call needs token object + params
- Line 1110: `EngagementSheetsService` call needs token object + params

**Action**: Update calls to pass full token objects and required parameters

### 3. `api/src/server/modules/googleDriveSyncService.ts` (1 error)
**Issue**: Method call needs token object and additional parameters

**Line to fix**:
- Line 320: `EngagementSheetsService` call needs token object + params

**Action**: Update call to pass full token object and required parameters

### 4. `api/src/server/modules/googleOAuth2Helper.ts` (1 error)
**Issue**: Missing import for `google` namespace

**Line to fix**:
- Line 30: `Cannot find namespace 'google'`

**Action**: Add `import { google } from 'googleapis';` at the top of the file

### 5. `api/src/server/modules/messageSheetsService.ts` (2 errors)
**Issue**: Method call needs token object and additional parameters, plus undefined variable

**Lines to fix**:
- Line 1026: Two errors - method call needs token object + params, and `userAccessToken` is undefined

**Action**: 
1. Update method call to pass token object and required parameters
2. Fix undefined `userAccessToken` variable (likely needs to be extracted from token object)

## Execution Order

1. **Fix `googleOAuth2Helper.ts`** (quick fix - add import)
2. **Fix `engagementDriveService.ts`** (largest file, most errors)
3. **Fix `googleDriveProxy.ts`** (3 errors)
4. **Fix `googleDriveSyncService.ts`** (1 error)
5. **Fix `messageSheetsService.ts`** (2 errors)
6. **Run `npx tsc --noEmit`** to verify all errors are resolved

## Notes

- All `EngagementSheetsService` methods now require:
  - `token: GoogleDriveToken` (not just `accessToken: string`)
  - `userPnIdentifier: string`
  - `accountId: string | undefined`
- Pattern to follow: Convert `accessToken: string` to `token: GoogleDriveToken` using `{ access_token: accessToken }`
- Ensure `userPnIdentifier` is available in all method contexts (may need to add as parameter)

## Progress Tracking

- [x] User fixed `engagementDriveService.ts` - `getEngagementFile()` method
- [x] User fixed `connectionsService.ts` - `acceptConnectionRequestJSON()` method
- [ ] Fix `googleOAuth2Helper.ts` import (already has import - may be false positive, check line 30)
- [x] Fix `engagementDriveService.ts` - `updateEngagementFile()` method (lines 75-122)
- [x] Fix `engagementDriveService.ts` - `toggleLike()` method (lines 127-161)
- [x] Fix `engagementDriveService.ts` - `toggleDislike()` method (lines 166+)
- [x] Fix `engagementDriveService.ts` - `addComment()` method
- [x] Fix `engagementDriveService.ts` - `isLiked()` and `isDisliked()` methods
- [x] Fix `engagementDriveService.ts` - `getUserEngagement()` method
- [x] Fix `server.ts` (1 error - line 6029) - DONE
- [x] Fix `googleDriveProxy.ts` (3 errors - lines 922, 1103, 1110) - USER FIXED
- [ ] Fix `googleOAuth2Helper.ts` (1 error - namespace issue, line 30)
- [ ] Fix `googleDriveSyncService.ts` (1 error - line 320)
- [ ] Fix `messageSheetsService.ts` (2 errors - line 1026)
- [ ] Fix `messagingLedgerService.ts` (8 errors)
- [ ] Fix `notificationService.ts` (15 errors)
- [ ] Verify all errors resolved

## Pattern for Fixes

All methods in `engagementDriveService.ts` need to:
1. Accept `accountId?: string` parameter (add where missing)
2. Convert `accessToken: string` to `token: GoogleDriveToken` using `{ access_token: accessToken }`
3. Pass `token`, `userPnIdentifier`, and `accountId` to all `EngagementSheetsService` calls
