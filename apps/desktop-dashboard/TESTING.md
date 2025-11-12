# Testing the Portable Desktop App

## Quick Test (Local Build)

1. **Build the app:**
```bash
cd apps/desktop-dashboard
npm run build
```

This will:
- Build the renderer, main, and preload processes
- Download and bundle VeraCrypt (first time only, ~100MB download)
- Prepare everything for packaging

2. **Package for testing (macOS):**
```bash
npm run dist:dir
```

This creates an unpacked app bundle in `dist/mac/` without creating a DMG.

3. **Run the packaged app:**
```bash
open dist/mac/par\ Noir\ Desktop.app
```

4. **Check the console logs:**
Look for this line in the console:
```
[desktop] userData path set to /path/to/dist/mac/data
```

This confirms the portable data root is working.

## Portable Test (USB Drive Simulation)

1. **Create a test directory (simulating USB drive):**
```bash
mkdir -p ~/Desktop/test-portable-app
```

2. **Copy the built app:**
```bash
cp -R dist/mac/par\ Noir\ Desktop.app ~/Desktop/test-portable-app/
```

3. **Run from the test location:**
```bash
open ~/Desktop/test-portable-app/par\ Noir\ Desktop.app
```

4. **Verify portable data:**
After running, check that a `data/` folder was created next to the app:
```bash
ls -la ~/Desktop/test-portable-app/
```

You should see:
- `par Noir Desktop.app/`
- `data/` (created automatically)

5. **Check data contents:**
```bash
ls -la ~/Desktop/test-portable-app/data/
```

You should see:
- `secure-volumes/` (for encrypted volumes)
- `secure-volume-tokens.json` (for auth tokens)

## Verify Zero Host Footprint

1. **Check that nothing was written to system directories:**
```bash
# macOS - check Library directories
ls ~/Library/Application\ Support/ | grep -i "par\|noir"
ls ~/Library/Preferences/ | grep -i "par\|noir"
ls ~/Library/Keychains/ | grep -i "par\|noir"
```

Should return nothing (or only old entries if you had a previous version).

2. **Check that all data is in the portable location:**
```bash
# Everything should be here:
ls -R ~/Desktop/test-portable-app/data/
```

## Test Secure Folder Functionality

1. **Unlock your pN in the app**
2. **Go to Storage tab**
3. **Click "Open Secure Folder"**
4. **Verify:**
   - VeraCrypt is detected (check console for `[veracrypt-bundle]` messages)
   - Secure volume is created in `data/secure-volumes/`
   - Volume mounts successfully
   - Finder window opens to the mounted volume

## Test Portability Across Machines

1. **Copy the entire folder to another location:**
```bash
cp -R ~/Desktop/test-portable-app ~/Desktop/test-portable-app-copy
```

2. **Run from the new location:**
```bash
open ~/Desktop/test-portable-app-copy/par\ Noir\ Desktop.app
```

3. **Verify:**
   - App runs without issues
   - Data is stored in the new location's `data/` folder
   - Secure folder still works (if you had one created)

## Troubleshooting

**If VeraCrypt bundling fails:**
- Check `resources/veracrypt/<platform>/extracted/` exists
- Look for `[veracrypt-bundle]` messages in build output
- First build downloads VeraCrypt (~100MB), subsequent builds use cache

**If data folder isn't created:**
- Check console logs for `[desktop] userData path set to...`
- Verify app is running in packaged mode (not dev mode)
- Check file permissions on the directory

**If secure folder doesn't mount:**
- Check console for VeraCrypt errors
- Verify VeraCrypt was bundled: `ls -R resources/veracrypt/`
- Check that VeraCrypt binary exists in bundled location

## Full Production Build (DMG)

For a distributable DMG:
```bash
npm run dist
```

This creates `dist/par Noir Desktop-1.0.0.dmg` which you can distribute.

