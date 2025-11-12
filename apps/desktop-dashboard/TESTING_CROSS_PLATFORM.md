# Testing Windows and Linux Builds from macOS

Since you only have a Mac, here are several ways to test the Windows and Linux versions:

## Option 1: Build and Test in Virtual Machines (Recommended)

### Prerequisites:
- **VMware Fusion** (paid) or **Parallels Desktop** (paid) or **UTM** (free, open-source)
- Windows 10/11 ISO (free from Microsoft)
- Linux ISO (Ubuntu recommended, free)

### Steps:

1. **Build for Windows/Linux on your Mac:**
   ```bash
   cd apps/desktop-dashboard
   
   # Build Windows version
   npm run dist:win
   # Output: dist/win-unpacked/par Noir Desktop.exe
   
   # Build Linux version
   npm run dist:linux
   # Output: dist/linux-unpacked/par-noir-desktop
   ```

2. **Set up VMs:**
   - Install Windows VM (VMware/Parallels/UTM)
   - Install Linux VM (Ubuntu recommended)

3. **Transfer builds to VMs:**
   - Copy the `dist/win-unpacked/` folder to Windows VM
   - Copy the `dist/linux-unpacked/` folder to Linux VM
   - Or use shared folders if your VM software supports it

4. **Test in VMs:**
   - Windows: Run `par Noir Desktop.exe` from the unpacked folder
   - Linux: Run `./par-noir-desktop` (may need `chmod +x` first)

## Option 2: Use GitHub Actions (CI/CD)

Set up automated builds that test on real Windows/Linux machines:

1. **Create `.github/workflows/build-test.yml`:**
   ```yaml
   name: Build and Test
   on: [push, pull_request]
   jobs:
     build-windows:
       runs-on: windows-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: cd apps/desktop-dashboard && npm install && npm run dist:win
     
     build-linux:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: cd apps/desktop-dashboard && npm install && npm run dist:linux
   ```

2. **Push to GitHub** - builds will run automatically on Windows/Linux runners

## Option 3: Cloud VMs (Free/Paid)

### AWS EC2 / Google Cloud / Azure:
- Spin up Windows Server or Linux instances
- Transfer your build files
- Test remotely via RDP/SSH

### GitHub Codespaces / GitPod:
- Free cloud development environments
- Can run Linux builds directly

## Option 4: Share with Testers

1. Build the executables on your Mac
2. Upload to cloud storage (Dropbox, Google Drive, etc.)
3. Share with someone who has Windows/Linux
4. Have them test and report back

## Option 5: Use Docker (Linux only)

Test Linux builds using Docker on your Mac:

```bash
# Build Linux version
npm run dist:linux

# Test in Docker container
docker run -it --rm \
  -v "$(pwd)/dist/linux-unpacked:/app" \
  ubuntu:latest \
  /app/par-noir-desktop
```

## What to Test

For each platform, verify:

1. **App launches** without errors
2. **Secure folder creation** works
3. **Volume mounts** correctly (Windows: drive letter, Linux: mount point)
4. **Files can be copied** in/out of the mounted volume
5. **Volume unmounts** when pN session locks
6. **Portable data** is stored in `data/` folder next to executable
7. **VeraCrypt detection** works (checks bundled resources first)

## Build Output Locations

After running `npm run dist:win` or `npm run dist:linux`:

- **Windows:** `dist/win-unpacked/par Noir Desktop.exe`
- **Linux:** `dist/linux-unpacked/par-noir-desktop`

Both will have a `data/` folder created next to the executable when first run.

## Troubleshooting

### Windows Build Issues:
- May need Wine installed for some build tools: `brew install wine-stable`
- Icon file needed: `build/icons/icon.ico`

### Linux Build Issues:
- May need additional dependencies: `sudo apt-get install icnsutils`
- Icon file needed: `build/icons/icon.png`

### VeraCrypt Not Found:
- Check that `bundle:veracrypt` script ran successfully
- Verify `resources/veracrypt/` contains platform-specific binaries
- App will fall back to system-installed VeraCrypt if bundled version missing

