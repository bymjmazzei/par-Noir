#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript files
const files = glob.sync('./**/*.{ts,tsx}', {
  ignore: ['./node_modules/**', './dist/**', './build/**', './.git/**', './**/crypto.worker.ts']
});

let totalFixed = 0;

// Crypto operations to migrate
const cryptoOperations = [
  'generateKey',
  'generateKeyPair', 
  'encrypt',
  'decrypt',
  'sign',
  'verify',
  'hash',
  'digest',
  'deriveKey',
  'deriveBits',
  'importKey',
  'exportKey'
];

files.forEach(file => {
  try {
    let content = fs.readFileSync(file, 'utf8');
    let fileFixed = false;
    
    // Check if file contains crypto.subtle calls
    if (content.includes('crypto.subtle.') || content.includes('window.crypto.subtle.')) {
      
      // Add import for crypto worker manager
      if (!content.includes('cryptoWorkerManager') && !content.includes('CryptoWorkerManager')) {
        const importStatement = "import { cryptoWorkerManager } from '../utils/crypto/cryptoWorkerManager';";
        const lastImportIndex = content.lastIndexOf('import');
        if (lastImportIndex !== -1) {
          const nextLineIndex = content.indexOf('\n', lastImportIndex) + 1;
          content = content.slice(0, nextLineIndex) + importStatement + '\n' + content.slice(nextLineIndex);
        }
        fileFixed = true;
      }
      
      // Replace crypto.subtle calls with crypto worker calls
      cryptoOperations.forEach(operation => {
        const patterns = [
          new RegExp(`crypto\\.subtle\\.${operation}\\(`, 'g'),
          new RegExp(`window\\.crypto\\.subtle\\.${operation}\\(`, 'g')
        ];
        
        patterns.forEach(pattern => {
          if (pattern.test(content)) {
            content = content.replace(pattern, `await cryptoWorkerManager.${operation}(`);
            fileFixed = true;
          }
        });
      });
      
      if (fileFixed) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Migrated: ${file}`);
        totalFixed++;
      }
    }
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log(`\nTotal files migrated to crypto worker: ${totalFixed}`);
console.log('Crypto worker migration completed!');
