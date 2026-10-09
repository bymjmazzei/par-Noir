# Comprehensive Modal Refactoring Plan

## 🎯 Overview

This plan provides a step-by-step approach to refactor the monolithic `App.tsx` file by extracting modals into separate components. Each step includes backup procedures and testing to ensure no functionality is lost.

## 📋 Identified Modals to Extract

Based on analysis of `App.tsx`, here are the modals that need to be extracted:

### High Priority (Simple, Self-Contained)
1. **Export Authentication Modal** (lines ~7022-7104)
2. **Export Options Modal** (lines ~7107-7163)
3. **Transfer Setup Modal** (lines ~7167-7300)
4. **Device Info Modal** (lines ~6940-6937)

### Medium Priority (Recovery-Related)
5. **Recovery Modal** (lines ~4912-5113)
6. **Add Custodian Modal** (lines ~5116-5261)
7. **Recovery Key Generation Modal** (lines ~5264-5332)
8. **Recovery Key Input Modal** (lines ~5335-6338)
9. **Recovery Completion Modal** (lines ~6794-6867)

### Lower Priority (Complex Recovery Flow)
10. **Custodian Invitation Modal** (lines ~6341-6418)
11. **Send Invitation Modal** (lines ~6421-6574)
12. **Custodian Acceptance Modal** (lines ~6577-6697)
13. **Custodian Approval Modal** (lines ~6700-6791)

## 🛡️ Backup Strategy

### Before Starting Any Refactoring

1. **Create a backup branch:**
   ```bash
   git checkout -b refactoring-backup
   git add .
   git commit -m "Backup before modal refactoring"
   ```

2. **Create a working branch:**
   ```bash
   git checkout -b modal-refactoring
   ```

3. **Create component directory structure:**
   ```bash
   mkdir -p src/components/modals
   ```

## 📝 Step-by-Step Migration Process

### Phase 1: Simple Modals (Start Here)

#### Step 1: Export Authentication Modal

**Backup Step:**
```bash
# Before starting
cp src/App.tsx src/App.tsx.backup-export-auth
```

**Migration Steps:**

1. **Create the component file:**
   ```bash
   touch src/components/modals/ExportAuthModal.tsx
   ```

2. **Extract the modal code** (lines ~7022-7104 from App.tsx)
3. **Test the extraction**
4. **Update App.tsx to import and use the new component**
5. **Test functionality**
6. **Commit the change**

**Detailed Process:**

1. **Create `src/components/modals/ExportAuthModal.tsx`:**
   ```typescript
   import React from 'react';

   interface ExportAuthModalProps {
     isOpen: boolean;
     onClose: () => void;
     exportAuthData: { pnName: string; passcode: string };
     setExportAuthData: (data: { pnName: string; passcode: string }) => void;
     showExportPnName: boolean;
     setShowExportPnName: (show: boolean) => void;
     showExportPasscode: boolean;
     setShowExportPasscode: (show: boolean) => void;
     onAuth: () => void;
   }

   export function ExportAuthModal({
     isOpen,
     onClose,
     exportAuthData,
     setExportAuthData,
     showExportPnName,
     setShowExportPnName,
     showExportPasscode,
     setShowExportPasscode,
     onAuth
   }: ExportAuthModalProps) {
     if (!isOpen) return null;

     return (
       <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
         {/* Copy the entire modal JSX from App.tsx lines 7022-7104 */}
       </div>
     );
   }
   ```

2. **Update App.tsx:**
   - Add import: `import { ExportAuthModal } from './components/modals/ExportAuthModal';`
   - Replace the modal JSX with: `<ExportAuthModal {...props} />`
   - Remove the original modal code

3. **Test:**
   - Start the dev server
   - Navigate to export functionality
   - Verify the modal opens and works correctly
   - Test all interactions

4. **Commit:**
   ```bash
   git add .
   git commit -m "Extract ExportAuthModal component"
   ```

#### Step 2: Export Options Modal

**Repeat the same process for lines ~7107-7163**

#### Step 3: Transfer Setup Modal

**Repeat the same process for lines ~7167-7300**

#### Step 4: Device Info Modal

**Repeat the same process for lines ~6940-6937**

### Phase 2: Recovery Modals

After successfully extracting the simple modals, proceed with recovery-related modals using the same process.

## 🧪 Testing Protocol

### After Each Modal Extraction:

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Test the specific modal:**
   - Navigate to the functionality that triggers the modal
   - Verify the modal opens correctly
   - Test all form inputs and interactions
   - Verify the modal closes properly
   - Test any submit/action buttons

3. **Test related functionality:**
   - Ensure no other parts of the app are broken
   - Check that state management still works
   - Verify no console errors

4. **If anything breaks:**
   ```bash
   # Restore from backup
   cp src/App.tsx.backup-[modal-name] src/App.tsx
   # Debug and try again
   ```

## 📊 Progress Tracking

### Checklist Template (Use for each modal):

- [ ] **Backup created**
- [ ] **Component file created**
- [ ] **Modal code extracted**
- [ ] **Props interface defined**
- [ ] **App.tsx updated with import**
- [ ] **Original modal code removed from App.tsx**
- [ ] **Functionality tested**
- [ ] **No console errors**
- [ ] **Related functionality verified**
- [ ] **Changes committed**

### Progress Log:

| Modal | Status | Lines Extracted | Date | Notes |
|-------|--------|----------------|------|-------|
| ExportAuthModal | ✅ Complete | 7022-7104 | [Date] | [Notes] |
| ExportOptionsModal | ⏳ Pending | 7107-7163 | | |
| TransferSetupModal | ⏳ Pending | 7167-7300 | | |
| DeviceInfoModal | ⏳ Pending | 6940-6937 | | |
| RecoveryModal | ⏳ Pending | 4912-5113 | | |
| AddCustodianModal | ⏳ Pending | 5116-5261 | | |
| RecoveryKeyModal | ⏳ Pending | 5264-5332 | | |
| RecoveryKeyInputModal | ⏳ Pending | 5335-6338 | | |
| RecoveryCompletionModal | ⏳ Pending | 6794-6867 | | |
| CustodianInvitationModal | ⏳ Pending | 6341-6418 | | |
| SendInvitationModal | ⏳ Pending | 6421-6574 | | |
| CustodianAcceptanceModal | ⏳ Pending | 6577-6697 | | |
| CustodianApprovalModal | ⏳ Pending | 6700-6791 | | |

## 🚨 Rollback Procedures

### If a Modal Extraction Fails:

1. **Immediate rollback:**
   ```bash
   # Restore the specific backup
   cp src/App.tsx.backup-[modal-name] src/App.tsx
   ```

2. **Clean up failed component:**
   ```bash
   # Remove the failed component file
   rm src/components/modals/[ModalName].tsx
   ```

3. **Debug the issue:**
   - Check console for errors
   - Verify prop types match
   - Ensure all dependencies are imported
   - Check for missing state variables

4. **Try again with fixes**

### If Multiple Modals Have Issues:

```bash
# Complete rollback to backup branch
git checkout refactoring-backup
git checkout -b modal-refactoring-fixed
# Start over with lessons learned
```

## 📈 Success Metrics

### After Each Phase:

- [ ] **App.tsx line count reduced by ~200-400 lines**
- [ ] **All functionality preserved**
- [ ] **No new console errors**
- [ ] **Development server starts without issues**
- [ ] **All modals open and close correctly**

### Final Success Criteria:

- [ ] **App.tsx under 1000 lines**
- [ ] **All modals extracted to separate components**
- [ ] **Clean component structure**
- [ ] **No functionality lost**
- [ ] **Improved maintainability**

## 🎯 Next Steps After Modal Extraction

Once all modals are extracted:

1. **Extract Forms** (CreateIdentityForm, UnlockForm, etc.)
2. **Extract Main Dashboard Component**
3. **Implement State Management** (Context API or Zustand)
4. **Add Component Tests**
5. **Optimize Performance**

## 📞 Support

If you encounter issues during refactoring:

1. Check this plan for the specific modal you're working on
2. Verify all props are correctly passed
3. Check console for TypeScript or runtime errors
4. Use the backup files to restore if needed
5. Debug incrementally - don't try to fix multiple issues at once

Remember: **Each modal extraction is independent**. If one fails, the others can still proceed successfully.
