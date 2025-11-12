# VeraCrypt Setup for par Noir Desktop

**VeraCrypt is automatically bundled with the app** - users don't need to download or install anything separately!

## Automatic Bundling

When you build the app, VeraCrypt binaries are automatically downloaded and included in the package. The build process:

1. Downloads VeraCrypt for the target platform
2. Extracts it to `resources/veracrypt/<platform>/extracted/`
3. Bundles it with the app via electron-builder
4. The app automatically detects and uses the bundled VeraCrypt

## How It Works

The app checks for VeraCrypt in this order:
1. **Bundled VeraCrypt** (automatically included during build)
2. **System-installed VeraCrypt** (fallback if bundled version isn't found)
3. **Portable VeraCrypt** (if manually placed next to the app)

## For Developers

The bundling happens automatically during `npm run build`. To build without bundling (for testing), you can skip the bundle step:

```bash
npm run build:renderer && npm run build:main && npm run build:preload && node scripts/post-build.js
```

## Portable USB Drive Setup

1. Build the app - VeraCrypt is automatically included
2. Copy the built app to your USB drive
3. All app data (including encrypted volumes) will be stored in a `data/` folder next to the app

This ensures complete portability with zero host footprint - everything runs from the USB drive, including VeraCrypt!

## Troubleshooting

If VeraCrypt isn't detected:
- Check that the build completed successfully (look for `[veracrypt-bundle]` messages)
- Verify `resources/veracrypt/<platform>/extracted/` contains VeraCrypt files
- The app will show a helpful error message with instructions if VeraCrypt isn't found
