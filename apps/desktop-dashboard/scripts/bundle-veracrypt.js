#!/usr/bin/env node

/**
 * Automatically download and bundle VeraCrypt binaries for cross-platform support
 * This script runs during the build process to ensure VeraCrypt is included
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

const VERACRYPT_VERSION = '1.26.7';
const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'veracrypt');

const PLATFORMS = {
  darwin: {
    url: `https://launchpad.net/veracrypt/trunk/${VERACRYPT_VERSION}/+download/VeraCrypt_${VERACRYPT_VERSION}.dmg`,
    extract: async (dmgPath, targetDir) => {
      console.log('[veracrypt-bundle] Extracting macOS DMG...');
      const mountPoint = path.join(targetDir, 'mount');
      try {
        // Mount the DMG
        execSync(`hdiutil attach "${dmgPath}" -mountpoint "${mountPoint}" -quiet -nobrowse`, { stdio: 'inherit' });
        
        // Copy VeraCrypt.app
        const appPath = path.join(mountPoint, 'VeraCrypt.app');
        if (fs.existsSync(appPath)) {
          execSync(`cp -R "${appPath}" "${targetDir}/VeraCrypt.app"`, { stdio: 'inherit' });
          console.log('[veracrypt-bundle] Extracted VeraCrypt.app');
        } else {
          throw new Error('VeraCrypt.app not found in DMG');
        }
      } finally {
        // Unmount the DMG
        try {
          execSync(`hdiutil detach "${mountPoint}" -quiet`, { stdio: 'ignore' });
        } catch {}
      }
    }
  },
  win32: {
    url: `https://sourceforge.net/projects/veracrypt/files/VeraCrypt%20${VERACRYPT_VERSION}/Windows/VeraCrypt%20Portable%20${VERACRYPT_VERSION}.exe/download`,
    extract: async (exePath, targetDir) => {
      console.log('[veracrypt-bundle] Windows portable exe - copying directly...');
      // Windows portable is self-contained, just copy it
      const targetPath = path.join(targetDir, 'VeraCrypt.exe');
      fs.copyFileSync(exePath, targetPath);
      console.log('[veracrypt-bundle] Copied VeraCrypt.exe');
    }
  },
  linux: {
    url: `https://sourceforge.net/projects/veracrypt/files/VeraCrypt%20${VERACRYPT_VERSION}/Linux/veracrypt-${VERACRYPT_VERSION}-console-x64.tar.bz2/download`,
    extract: async (tarPath, targetDir) => {
      console.log('[veracrypt-bundle] Extracting Linux tar.bz2...');
      execSync(`tar -xjf "${tarPath}" -C "${targetDir}"`, { stdio: 'inherit' });
      console.log('[veracrypt-bundle] Extracted VeraCrypt');
    }
  }
};

const downloadFile = async (url, dest) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);
    
    console.log(`[veracrypt-bundle] Downloading from ${url}...`);
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r[veracrypt-bundle] Progress: ${percent}%`);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n[veracrypt-bundle] Download complete');
        resolve();
      });
      
      file.on('error', (err) => {
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
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
  const extractPath = path.join(platformDir, 'extracted');
  
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(extractPath, { recursive: true });

  const url = platformConfig.url;
  const filename = path.basename(url.split('?')[0]);
  const downloadPath = path.join(downloadDir, filename);

  // Check if already extracted
  const extractedExists = platform === 'darwin' 
    ? fs.existsSync(path.join(extractPath, 'VeraCrypt.app'))
    : platform === 'win32'
    ? fs.existsSync(path.join(extractPath, 'VeraCrypt.exe'))
    : fs.existsSync(path.join(extractPath, 'veracrypt')) || fs.existsSync(path.join(extractPath, 'usr', 'bin', 'veracrypt'));

  if (extractedExists) {
    console.log(`[veracrypt-bundle] VeraCrypt already extracted for ${platform}`);
    return;
  }

  // Download if needed
  if (!fs.existsSync(downloadPath)) {
    try {
      await downloadFile(url, downloadPath);
    } catch (error) {
      console.error(`[veracrypt-bundle] Failed to download VeraCrypt for ${platform}:`, error.message);
      console.error(`[veracrypt-bundle] Please download manually from https://www.veracrypt.fr/en/Downloads.html`);
      process.exit(1);
    }
  } else {
    console.log(`[veracrypt-bundle] Using cached download for ${platform}`);
  }

  // Extract
  try {
    await platformConfig.extract(downloadPath, extractPath);
    console.log(`[veracrypt-bundle] Successfully bundled VeraCrypt for ${platform}`);
  } catch (error) {
    console.error(`[veracrypt-bundle] Failed to extract VeraCrypt for ${platform}:`, error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  ensureVeraCrypt().catch((error) => {
    console.error('[veracrypt-bundle] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { ensureVeraCrypt };
