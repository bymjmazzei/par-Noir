# Quick Start: Modal Refactoring

## 🚀 Let's Extract the First Modal (Export Authentication Modal)

Follow these exact steps to extract your first modal safely:

### Step 1: Create Backup

```bash
cd apps/id-dashboard
./scripts/backup-before-refactor.sh export-auth
```

### Step 2: Create Component Directory

```bash
mkdir -p src/components/modals
```

### Step 3: Create the Component File

Create `src/components/modals/ExportAuthModal.tsx`:

```typescript
import React from 'react';

interface ExportAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportAuthData: { key1: string; key2: string };
  setExportAuthData: (data: { key1: string; key2: string }) => void;
  showExportKey1: boolean;
  setShowExportKey1: (show: boolean) => void;
  showExportKey2: boolean;
  setShowExportKey2: (show: boolean) => void;
  onAuth: () => void;
}

export function ExportAuthModal({
  isOpen,
  onClose,
  exportAuthData,
  setExportAuthData,
  showExportKey1,
  setShowExportKey1,
  showExportKey2,
  setShowExportKey2,
  onAuth
}: ExportAuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Verify Identity</h2>
          <button 
            onClick={() => {
              onClose();
              setExportAuthData({ key1: '', key2: '' });
              setShowExportKey1(false);
              setShowExportKey2(false);
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">pN Name</label>
            <div className="relative">
              <input
                type={showExportKey1 ? "text" : "password"}
                value={exportAuthData.key1}
                onChange={(e) => setExportAuthData(prev => ({ ...prev, key1: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-input-bg text-text-primary"
                placeholder="Enter your pN name"
              />
              <button
                type="button"
                onClick={() => setShowExportKey1(!showExportKey1)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showExportKey1 ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Key2</label>
            <div className="relative">
              <input
                type={showExportKey2 ? "text" : "password"}
                value={exportAuthData.key2}
                onChange={(e) => setExportAuthData(prev => ({ ...prev, key2: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-input-bg text-text-primary"
                placeholder="Enter your key2"
              />
              <button
                type="button"
                onClick={() => setShowExportKey2(!showExportKey2)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showExportKey2 ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>
          
          <div className="flex space-x-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-md text-text-primary hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onAuth}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
            >
              Verify
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Update App.tsx

1. **Add the import** at the top of `App.tsx`:
```typescript
import { ExportAuthModal } from './components/modals/ExportAuthModal';
```

2. **Find the modal code** (around lines 7022-7104) and **replace it** with:
```typescript
<ExportAuthModal
  isOpen={showExportAuthModal}
  onClose={() => {
    setShowExportAuthModal(false);
    setExportAuthData({ key1: '', key2: '' });
    setShowExportKey1(false);
    setShowExportKey2(false);
  }}
  exportAuthData={exportAuthData}
  setExportAuthData={setExportAuthData}
  showExportKey1={showExportKey1}
  setShowExportKey1={setShowExportKey1}
  showExportKey2={showExportKey2}
  setShowExportKey2={setShowExportKey2}
  onAuth={handleExportAuth}
/>
```

3. **Remove the original modal JSX** (lines 7022-7104)

### Step 5: Test the Extraction

```bash
./scripts/test-modal-extraction.sh export-auth
```

### Step 6: Manual Testing

1. Start the dev server: `npm run dev`
2. Navigate to the export functionality
3. Click the export button
4. Verify the modal opens correctly
5. Test the form inputs
6. Test the verify button
7. Test the cancel button
8. Check browser console for errors

### Step 7: Commit or Rollback

**If everything works:**
```bash
git add .
git commit -m "Extract ExportAuthModal component"
```

**If something breaks:**
```bash
cp src/App.tsx.backup-export-auth src/App.tsx
# Debug and try again
```

## 🎯 Success Criteria

- ✅ Modal opens when triggered
- ✅ All form inputs work
- ✅ Verify button triggers the correct function
- ✅ Cancel button closes the modal
- ✅ No console errors
- ✅ App.tsx line count reduced by ~80 lines

## 🚀 Next Steps

Once this first modal is successfully extracted:

1. **Mark it complete** in the progress tracking
2. **Move to the next modal** (Export Options Modal)
3. **Follow the same process** for each subsequent modal

## 📞 Need Help?

If you encounter issues:
1. Check the browser console for errors
2. Verify all props are correctly passed
3. Use the backup file to restore if needed
4. Debug one issue at a time

Remember: **This is just moving working code around** - the functionality should remain exactly the same!
