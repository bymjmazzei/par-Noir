#!/usr/bin/env node

/**
 * Download and bundle VeraCrypt binaries for cross-platform support
 * This script runs before electron-builder packaging
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const VERACRYPT_VERSION = '1.26.7';
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'veracrypt');
const PLATFORMS = {
  darwin: {
    url: `https://launchpad.net/veracrypt/trunk/${VERACRYPT_VERSION}/+download/VeraCrypt_${VERACRYPT_VERSION}.dmg`,
    extract: async (dmgPath, targetDir) => {
      // On macOS, we need to mount the DMG and extract the app
      const mountPoint = path.join(targetDir, 'mount');
      try {
        execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -quiet`, { stdio: 'ignore' });
        const appPath = path.join(mountPoint, 'VeraCrypt.app');
        if (fs.existsSync(appPath)) {
          execSync(`cp -R "${appPath}" "${targetDir}/VeraCrypt.app"`, { stdio: 'ignore' });
        }
      } finally {
        try {
          execSync(`hdiutil detach "${mountPoint}" -quiet`, { stdio: 'ignore' });
        } catch {}
      }
    }
  },
  win32: {
    url: `https://sourceforge.net/projects/veracrypt/files/VeraCrypt%20${VERACRYPT_VERSION}/Windows/VeraCrypt%20Portable%20${VERACRYPT_VERSION}.exe/download`,
    extract: async (exePath, targetDir) => {
      // Windows portable is a self-extracting archive
      // We'll just copy it and let the app extract it on first run if needed
      const targetPath = path.join(targetDir, 'VeraCrypt.exe');
      fs.copyFileSync(exePath, targetPath);
    }
  },
  linux: {
    url: `https://sourceforge.net/projects/veracrypt/files/VeraCrypt%20${VERACRYPT_VERSION}/Linux/veracrypt-${VERACRYPT_VERSION}-console-x64.tar.bz2/download`,
    extract: async (tarPath, targetDir) => {
      execSync(`tar -xjf "${tarPath}" -C "${targetDir}"`, { stdio: 'ignore' });
    }
  }
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
};

const ensureVeraCrypt = async () => {
  const platform = process.platform;
  const platformConfig = PLATFORMS[platform];
  
  if (!platformConfig) {
    console.log(`[veracrypt-bundle] Skipping VeraCrypt download for unsupported platform: ${platform}`);
    return;
  }

  const platformDir = path.join(RESOURCES_DIR, platform);
  const downloadDir = path.join(platformDir, 'download');
  
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(platformDir, { recursive: true });

  const url = platformConfig.url;
  const filename = path.basename(url.split('?')[0]);
  const downloadPath = path.join(downloadDir, filename);
  const extractPath = path.join(platformDir, 'extracted');

  // Check if already downloaded
  if (fs.existsSync(downloadPath)) {
    console.log(`[veracrypt-bundle] VeraCrypt already downloaded for ${platform}`);
  } else {
    console.log(`[veracrypt-bundle] Downloading VeraCrypt for ${platform}...`);
    try {
      await downloadFile(url, downloadPath);
      console.log(`[veracrypt-bundle] Downloaded VeraCrypt for ${platform}`);
    } catch (error) {
      console.warn(`[veracrypt-bundle] Failed to download VeraCrypt for ${platform}:`, error.message);
      console.warn(`[veracrypt-bundle] Users will need to install VeraCrypt manually`);
      return;
    }
  }

  // Extract if needed
  if (!fs.existsSync(extractPath) || fs.readdirSync(extractPath).length === 0) {
    console.log(`[veracrypt-bundle] Extracting VeraCrypt for ${platform}...`);
    try {
      fs.mkdirSync(extractPath, { recursive: true });
      await platformConfig.extract(downloadPath, extractPath);
      console.log(`[veracrypt-bundle] Extracted VeraCrypt for ${platform}`);
    } catch (error) {
      console.warn(`[veracrypt-bundle] Failed to extract VeraCrypt for ${platform}:`, error.message);
      console.warn(`[veracrypt-bundle] Users will need to install VeraCrypt manually`);
    }
  }
};

if (require.main === module) {
  ensureVeraCrypt().catch((error) => {
    console.error('[veracrypt-bundle] Error:', error);
    process.exit(1);
  });
}

module.exports = { ensureVeraCrypt };

