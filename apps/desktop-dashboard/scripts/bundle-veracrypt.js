#!/usr/bin/env node

/**
 * Download and bundle VeraCrypt binaries for cross-platform support
 * This script runs before electron-builder packaging
 * 
 * Note: This is optional - if VeraCrypt isn't bundled, users can install it manually
 * The app will detect VeraCrypt whether it's bundled or system-installed
 */

const fs = require('fs');
const path = require('path');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'veracrypt');

console.log('[veracrypt-bundle] VeraCrypt bundling is optional.');
console.log('[veracrypt-bundle] The app will automatically detect VeraCrypt whether bundled or system-installed.');
console.log('[veracrypt-bundle] To bundle VeraCrypt, manually download and place it in:', RESOURCES_DIR);
console.log('[veracrypt-bundle] See VERACRYPT_SETUP.md for details.');

// Create resources directory structure
fs.mkdirSync(path.join(RESOURCES_DIR, 'darwin', 'extracted'), { recursive: true });
fs.mkdirSync(path.join(RESOURCES_DIR, 'win32', 'extracted'), { recursive: true });
fs.mkdirSync(path.join(RESOURCES_DIR, 'linux', 'extracted'), { recursive: true });

console.log('[veracrypt-bundle] Resources directory structure created.');
