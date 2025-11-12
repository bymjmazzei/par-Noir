# VeraCrypt Setup for Portable par Noir Desktop

The par Noir Desktop app uses VeraCrypt for cross-platform encrypted volume management. To use the secure folder feature, VeraCrypt must be available on your system.

## Portable Installation (Recommended)

For a zero-host-footprint setup, place VeraCrypt next to the app executable:

### macOS
```
par Noir Desktop.app/
veracrypt/
  └── VeraCrypt.app/
      └── Contents/
          └── MacOS/
              └── VeraCrypt
```

Or simply:
```
par Noir Desktop.app/
VeraCrypt.app/
```

### Windows
```
par Noir Desktop.exe
veracrypt/
  └── VeraCrypt.exe
```

Or:
```
par Noir Desktop.exe
VeraCrypt.exe
```

### Linux
```
par-noir-desktop
veracrypt/
  └── veracrypt
```

Or:
```
par-noir-desktop
veracrypt
```

## System Installation

If you prefer a system-wide installation:

- **macOS**: Install via Homebrew (`brew install veracrypt`) or download from [veracrypt.fr](https://www.veracrypt.fr/en/Downloads.html)
- **Windows**: Download and install from [veracrypt.fr](https://www.veracrypt.fr/en/Downloads.html)
- **Linux**: Install via your package manager (`sudo apt install veracrypt` or `sudo yum install veracrypt`)

## Verification

The app will automatically detect VeraCrypt on startup. If VeraCrypt is not found, you'll see a helpful error message with instructions.

## Portable USB Drive Setup

1. Copy the par Noir Desktop app to your USB drive
2. Download the portable version of VeraCrypt for your platform
3. Extract VeraCrypt next to the app (see structure above)
4. All app data (including encrypted volumes) will be stored in a `data/` folder next to the app

This ensures complete portability with zero host footprint.

