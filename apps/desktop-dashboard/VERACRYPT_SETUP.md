# VeraCrypt Setup for par Noir Desktop

The par Noir Desktop app uses VeraCrypt for cross-platform encrypted volume management. **VeraCrypt is automatically detected** - you don't need to download it separately if it's already installed on your system.

## How It Works

The app automatically detects VeraCrypt in this order:
1. **Bundled VeraCrypt** (if included in the app package)
2. **System-installed VeraCrypt** (if installed on your system)
3. **Portable VeraCrypt** (if placed next to the app)

## For End Users

If VeraCrypt isn't detected, you'll see a helpful error message. You can then:

**Option 1: Install VeraCrypt system-wide** (Recommended)
- **macOS**: `brew install veracrypt` or download from [veracrypt.fr](https://www.veracrypt.fr/en/Downloads.html)
- **Windows**: Download and install from [veracrypt.fr](https://www.veracrypt.fr/en/Downloads.html)
- **Linux**: `sudo apt install veracrypt` or `sudo yum install veracrypt`

**Option 2: Place portable VeraCrypt next to the app**
- Extract VeraCrypt portable version next to the app executable
- The app will automatically detect it

## Portable USB Drive Setup

1. Copy the par Noir Desktop app to your USB drive
2. Optionally place VeraCrypt portable next to the app (or install on each system)
3. All app data (including encrypted volumes) will be stored in a `data/` folder next to the app

This ensures complete portability with zero host footprint - everything runs from the USB drive.

## For Developers

To include VeraCrypt in the app bundle:
1. Download VeraCrypt for your target platform(s)
2. Extract it to `resources/veracrypt/<platform>/extracted/`
3. Run `npm run dist` - electron-builder will include it automatically

The app will work either way - bundled VeraCrypt is optional and the app gracefully falls back to system installations.
